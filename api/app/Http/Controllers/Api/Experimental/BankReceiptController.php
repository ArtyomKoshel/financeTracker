<?php

namespace App\Http\Controllers\Api\Experimental;

use App\Events\DataUpdated;
use App\Http\Controllers\Api\Controller;
use App\Http\Requests\Experimental\BankReceiptPreviewRequest;
use App\Models\Account;
use App\Models\ActivityLog;
use App\Models\BankReceiptImport;
use App\Models\BankReceiptIncomeMapping;
use App\Models\BankReceiptMapping;
use App\Models\CategorizationRuleStat;
use App\Models\Transaction;
use App\Services\Accounts\AccountService;
use App\Services\Experimental\CsvReceiptParser;
use App\Services\Experimental\ImportRuleService;
use App\Services\Experimental\ReceiptAnalysisService;
use App\Services\Experimental\ReceiptMatchingService;
use App\Services\Settings\SettingsService;
use App\Services\Transactions\TransactionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BankReceiptController extends Controller
{
    public function __construct(
        protected readonly ReceiptAnalysisService $analysisService,
        protected readonly AccountService $accountService,
        protected readonly TransactionService $transactionService,
        protected readonly SettingsService $settingsService,
        protected readonly ReceiptMatchingService $matchingService,
        protected readonly ImportRuleService $ruleService,
    ) {}

    public function preview(BankReceiptPreviewRequest $request): JsonResponse
    {
        $pages = [];
        if ($request->has('pages') && is_array($request->input('pages'))) {
            foreach ($request->input('pages') as $p) {
                $base64 = $p['base64'] ?? null;
                if ($base64) {
                    $pages[] = ['base64' => $base64, 'mime' => $p['mime'] ?? 'image/png'];
                }
            }
        }
        if (empty($pages) && $request->has('image_base64')) {
            $pages = [['base64' => $request->input('image_base64'), 'mime' => $request->input('mime', 'image/jpeg')]];
        }

        if (empty($pages)) {
            return $this->error('Загрузите изображение или PDF документ.', 422);
        }

        if (! $this->analysisService->isAvailable()) {
            return $this->error('AI анализ недоступен. Укажите OPENAI_API_KEY или GROQ_API_KEY в .env.', 503);
        }

        $clientId = $this->clientId();

        $fileHash = null;
        $duplicateWarning = null;
        $filename = $request->input('filename');
        if (! empty($pages)) {
            $hashData = implode('', array_map(fn ($p) => $p['base64'], $pages));
            $fileHash = hash('sha256', $hashData);

            if (\Schema::hasTable('bank_receipt_imports')) {
                $existing = BankReceiptImport::withoutGlobalScope('client')
                    ->where('client_id', $clientId)
                    ->where('file_hash', $fileHash)
                    ->first();

                if ($existing) {
                    $date = $existing->created_at?->format('d.m.Y') ?? '';
                    $duplicateWarning = "Похоже, этот документ уже импортировался {$date} (создано {$existing->rows_created} транзакций).";
                }
            }
        }

        $allTransactions = [];
        $truncated = false;
        foreach ($pages as $page) {
            $result = $this->analysisService->analyzeFromBase64($page['base64'], $page['mime'], $clientId);
            $tx = $result['transactions'] ?? [];
            $allTransactions = array_merge($allTransactions, $tx);
            if (! empty($result['truncated'])) {
                $truncated = true;
            }
        }

        $rows = $this->matchingService->match($allTransactions);

        $stats = $this->calculateMatchStats($rows);

        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'experimental_use',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => [
                'feature' => 'bank_receipt_import',
                'action' => 'preview',
                'rows_count' => count($rows),
                'match_stats' => $stats,
            ],
            'created_at' => now(),
        ]);

        $response = [
            'rows' => $rows,
            'match_stats' => $stats,
            'file_hash' => $fileHash,
            'pages_count' => count($pages),
        ];

        $warnings = [];
        if ($truncated) {
            $warnings[] = 'Некоторые страницы содержат слишком много транзакций — часть данных могла быть обрезана. Попробуйте загружать по одной странице.';
        }
        if ($duplicateWarning) {
            $warnings[] = $duplicateWarning;
        }
        if (! empty($warnings)) {
            $response['warning'] = implode(' ', $warnings);
        }

        return $this->success($response);
    }

    public function previewCsv(Request $request): JsonResponse
    {
        $request->validate([
            'csv' => 'nullable|string|max:2097152',
            'csv_base64' => 'nullable|string|max:2796203',
            'filename' => 'nullable|string|max:255',
        ]);

        $content = $request->input('csv');
        if (empty($content) && $request->filled('csv_base64')) {
            $decoded = base64_decode($request->input('csv_base64'), true);
            $content = $decoded !== false ? $decoded : '';
        }
        if (empty($content) || ! is_string($content)) {
            return $this->error('Загрузите CSV файл.', 422);
        }

        $encoding = mb_detect_encoding($content, ['UTF-8', 'Windows-1251', 'ISO-8859-1'], true);
        if ($encoding && $encoding !== 'UTF-8') {
            $content = mb_convert_encoding($content, 'UTF-8', $encoding);
        }

        $parser = new CsvReceiptParser;
        $transactions = $parser->parse($content, $request->input('filename'));

        if (empty($transactions)) {
            return $this->error('Не удалось распознать данные. Убедитесь, что CSV содержит колонки: дата, сумма, описание.', 422);
        }

        $clientId = $this->clientId();
        $fileHash = hash('sha256', $content);
        $duplicateWarning = null;
        if (\Schema::hasTable('bank_receipt_imports')) {
            $existing = BankReceiptImport::withoutGlobalScope('client')
                ->where('client_id', $clientId)
                ->where('file_hash', $fileHash)
                ->first();
            if ($existing) {
                $date = $existing->created_at?->format('d.m.Y') ?? '';
                $duplicateWarning = "Похоже, этот документ уже импортировался {$date} (создано {$existing->rows_created} транзакций).";
            }
        }

        $rows = $this->matchingService->match($transactions);
        $stats = $this->calculateMatchStats($rows);

        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'experimental_use',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['feature' => 'bank_receipt_import', 'action' => 'preview_csv', 'rows_count' => count($rows)],
            'created_at' => now(),
        ]);

        $response = [
            'rows' => $rows,
            'match_stats' => $stats,
            'file_hash' => $fileHash,
            'pages_count' => 1,
        ];
        if ($duplicateWarning) {
            $response['warning'] = $duplicateWarning;
        }

        return $this->success($response);
    }

    public function apply(Request $request): JsonResponse
    {
        $request->validate([
            'rows' => 'required|array',
            'rows.*.id' => 'required|string',
            'rows.*.amount' => 'required|numeric|min:0.01',
            'rows.*.date' => 'required|date',
            'rows.*.type' => 'required|string|in:expense,income',
            'rows.*.category_id' => 'nullable|integer',
            'rows.*.income_type' => 'nullable|string',
            'rows.*.bank_merchant_name' => 'required|string',
            'rows.*.raw_description' => 'nullable|string',
            'rows.*.selected' => 'required|boolean',
            'rows.*.user_confirmed' => 'nullable|boolean',
            'rows.*.rule_id' => 'nullable|integer|exists:categorization_rules,id',
            'rows.*.suggested_category_id' => 'nullable|integer',
            'rows.*.suggested_income_type' => 'nullable|string|max:50',
            'rows.*.recurring_payment_id' => 'nullable|integer',
            'rows.*.splits' => 'nullable|array',
            'rows.*.splits.*.category_id' => 'required_with:rows.*.splits|integer',
            'rows.*.splits.*.amount' => 'required_with:rows.*.splits|numeric|min:0.01',
            'rows.*.splits.*.description' => 'nullable|string',
            'rows.*.currency' => 'nullable|string|in:BYN,RUB,EUR,USD,GBP,PLN',
            'account_id' => 'nullable|integer|exists:accounts,id',
            'filename' => 'nullable|string|max:255',
            'file_hash' => 'nullable|string|max:64',
            'pages_count' => 'nullable|integer|min:0',
        ]);

        $clientId = $this->clientId();
        $accountId = $request->input('account_id')
            ? (int) $request->input('account_id')
            : Account::defaultIdForClient($clientId);

        $matchingService = $this->matchingService;
        $hasMappingsTable = \Schema::hasTable('bank_receipt_mappings');
        $hasIncomeMappingsTable = \Schema::hasTable('bank_receipt_income_mappings');

        $minDate = now()->subYears(2)->startOfDay();
        $maxDate = now()->addDay()->endOfDay();

        $rowsToProcess = [];
        foreach ($request->input('rows') as $row) {
            if (empty($row['selected']) || ($row['action'] ?? '') !== 'create') {
                continue;
            }

            try {
                $parsedDate = \Carbon\Carbon::parse($row['date']);
                if ($parsedDate->lt($minDate) || $parsedDate->gt($maxDate)) {
                    continue;
                }
            } catch (\Throwable) {
                continue;
            }

            $rowType = $row['type'] ?? 'expense';
            $isIncome = $rowType === 'income';
            $categoryId = isset($row['category_id']) ? (int) $row['category_id'] : null;
            $hasSplits = ! empty($row['splits']) && is_array($row['splits']);

            if ($categoryId) {
                $category = \App\Models\Category::withoutGlobalScope('client')
                    ->where('client_id', $clientId)
                    ->where('id', $categoryId)
                    ->first();
                if (! $category) {
                    continue;
                }
            } elseif (! $isIncome && ! $hasSplits) {
                continue;
            }

            $rowsToProcess[] = $row;
        }

        if (empty($rowsToProcess)) {
            return $this->success(['created' => 0, 'mappings_saved' => 0, 'import_id' => null]);
        }

        $created = 0;
        $skipped = 0;
        $mappingsSaved = [];
        $importId = null;

        $hasImportsTable = \Schema::hasTable('bank_receipt_imports');
        $settingsService = $this->settingsService;

        DB::transaction(function () use ($rowsToProcess, $clientId, $accountId, $matchingService, $hasMappingsTable, $hasIncomeMappingsTable, $hasImportsTable, $request, $settingsService, &$created, &$skipped, &$mappingsSaved, &$importId) {
            $import = null;
            if ($hasImportsTable) {
                $import = BankReceiptImport::create([
                    'client_id' => $clientId,
                    'filename' => $request->input('filename'),
                    'file_hash' => $request->input('file_hash'),
                    'pages_count' => (int) $request->input('pages_count', 0),
                    'rows_found' => count($request->input('rows', [])),
                    'rows_created' => 0,
                    'rows_skipped' => 0,
                ]);
                $importId = $import->id;
            }

            foreach ($rowsToProcess as $row) {
                $rowType = $row['type'] ?? 'expense';
                $isIncome = $rowType === 'income';
                $categoryId = isset($row['category_id']) ? (int) $row['category_id'] : null;
                $hasSplits = ! empty($row['splits']) && is_array($row['splits']);

                $amount = (float) $row['amount'];
                $currency = strtoupper($row['currency'] ?? 'BYN');
                $currency = in_array($currency, ['BYN', 'RUB', 'EUR', 'USD', 'GBP', 'PLN'], true) ? $currency : 'BYN';
                $exchangeRate = null;
                if ($currency !== 'BYN') {
                    $exchangeRate = $settingsService->getRate($clientId, $currency);
                    $amount = $amount * $exchangeRate;
                }
                $amountBYN = $isIncome ? abs($amount) : -abs($amount);
                $date = $row['date'];
                $month = substr($date, 0, 7);
                $txType = $isIncome
                    ? (in_array($row['income_type'] ?? '', ReceiptMatchingService::INCOME_TYPES) ? $row['income_type'] : 'other')
                    : 'expense';

                $description = $this->getTransactionDescription($row);
                $recurringPaymentId = ! empty($row['recurring_payment_id']) ? (int) $row['recurring_payment_id'] : null;

                if ($hasSplits) {
                    $splits = $row['splits'];
                    if ($currency !== 'BYN' && $exchangeRate !== null) {
                        $splits = array_map(function ($s) use ($exchangeRate) {
                            $s['amount'] = ((float) ($s['amount'] ?? 0)) * $exchangeRate;

                            return $s;
                        }, $splits);
                    }
                    $tx = $this->transactionService->create([
                        'client_id' => $clientId,
                        'date' => $date,
                        'amount' => abs($amountBYN),
                        'currency' => 'BYN',
                        'type' => $txType,
                        'category_id' => $categoryId,
                        'account_id' => $accountId,
                        'recurring_payment_id' => $recurringPaymentId,
                        'description' => $description,
                        'month' => $month,
                        'source' => 'bank_receipt',
                        'splits' => $splits,
                    ]);
                    if ($importId) {
                        $tx->update(['import_id' => $importId]);
                    }
                } else {
                    $originalAmount = (float) $row['amount'];
                    $tx = Transaction::create([
                        'client_id' => $clientId,
                        'date' => $date,
                        'amount' => $amountBYN,
                        'original_amount' => $currency !== 'BYN' ? $originalAmount : $amountBYN,
                        'currency' => $currency,
                        'exchange_rate' => $exchangeRate,
                        'type' => $txType,
                        'category_id' => $categoryId,
                        'account_id' => $accountId,
                        'recurring_payment_id' => $recurringPaymentId,
                        'description' => $description,
                        'month' => $month,
                        'source' => 'bank_receipt',
                        'import_id' => $importId,
                    ]);
                    $this->accountService->updateBalanceByAccount($accountId, $clientId, $amountBYN);
                }

                $created++;

                $userConfirmed = ! empty($row['user_confirmed']);
                $bankMerchant = $row['bank_merchant_name'] ?? '';

                if ($hasMappingsTable && ! empty($bankMerchant) && $categoryId && ! $matchingService->isUndeterminedMerchant($bankMerchant)) {
                    $normalized = $matchingService->normalize($bankMerchant);
                    if ($normalized !== '' && $userConfirmed) {
                        BankReceiptMapping::withoutGlobalScope('client')->updateOrCreate(
                            ['client_id' => $clientId, 'bank_merchant_normalized' => $normalized],
                            ['bank_merchant_name' => $bankMerchant, 'category_id' => $categoryId, 'confidence' => 'manual']
                        );
                        $mappingsSaved[$bankMerchant] = $categoryId;
                    }
                }

                if ($isIncome && $hasIncomeMappingsTable && ! empty($bankMerchant) && ! empty($row['income_type']) && ! $matchingService->isUndeterminedMerchant($bankMerchant)) {
                    $normalized = $matchingService->normalize($bankMerchant);
                    if ($normalized !== '' && $userConfirmed) {
                        BankReceiptIncomeMapping::withoutGlobalScope('client')->updateOrCreate(
                            ['client_id' => $clientId, 'bank_merchant_normalized' => $normalized],
                            ['bank_merchant_name' => $bankMerchant, 'income_type' => $row['income_type']]
                        );
                        $mappingsSaved[$bankMerchant] = $row['income_type'];
                    }
                }

                $ruleId = ! empty($row['rule_id']) ? (int) $row['rule_id'] : null;
                if ($ruleId && \Schema::hasTable('categorization_rule_stats')) {
                    $suggestedCatId = isset($row['suggested_category_id']) ? (int) $row['suggested_category_id'] : null;
                    $finalCatId = $categoryId;
                    $suggestedIncomeType = $row['suggested_income_type'] ?? null;
                    $finalIncomeType = $isIncome ? ($row['income_type'] ?? null) : null;
                    $accepted = $isIncome
                        ? ($suggestedIncomeType === $finalIncomeType)
                        : ($suggestedCatId === $finalCatId);

                    CategorizationRuleStat::create([
                        'rule_id' => $ruleId,
                        'client_id' => $clientId,
                        'suggested_category_id' => $suggestedCatId,
                        'final_category_id' => $finalCatId,
                        'suggested_income_type' => $suggestedIncomeType,
                        'final_income_type' => $finalIncomeType,
                        'accepted' => $accepted,
                        'bank_merchant_name' => $bankMerchant ?: null,
                    ]);
                }
            }

            $skipped = count($request->input('rows', [])) - $created;
            if ($import) {
                $import->update([
                    'rows_created' => $created,
                    'rows_skipped' => $skipped,
                ]);
            }
        });

        event(new DataUpdated('transactions'));
        event(new DataUpdated('balance'));
        event(new DataUpdated('dashboard'));

        if ($created > 0) {
            ActivityLog::create([
                'user_id' => $clientId,
                'action' => 'experimental_use',
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'details' => ['feature' => 'bank_receipt_import', 'action' => 'apply', 'created' => $created, 'mappings_saved' => count($mappingsSaved), 'import_id' => $importId],
                'created_at' => now(),
            ]);
        }

        return $this->success([
            'created' => $created,
            'mappings_saved' => count($mappingsSaved),
            'import_id' => $importId,
        ]);
    }

    public function previewSummary(Request $request): JsonResponse
    {
        $request->validate([
            'rows' => 'required|array',
            'rows.*.amount' => 'required|numeric|min:0.01',
            'rows.*.date' => 'required|date',
            'rows.*.type' => 'required|string|in:expense,income',
            'rows.*.category_id' => 'nullable|integer',
            'rows.*.splits' => 'nullable|array',
            'rows.*.splits.*.category_id' => 'nullable|integer',
            'rows.*.splits.*.amount' => 'nullable|numeric|min:0.01',
        ]);

        $clientId = $this->clientId();
        $rows = $request->input('rows', []);

        $expenseTotal = 0;
        $incomeTotal = 0;
        $categoryAmounts = [];
        $uncategorizedCount = 0;

        foreach ($rows as $row) {
            $amount = (float) $row['amount'];
            $type = $row['type'] ?? 'expense';
            $categoryId = $row['category_id'] ?? null;
            $hasSplits = ! empty($row['splits']) && is_array($row['splits']);

            if ($type === 'income') {
                $incomeTotal += $amount;

                continue;
            }

            $expenseTotal += $amount;

            if ($hasSplits) {
                foreach ($row['splits'] as $split) {
                    $splitCatId = $split['category_id'] ?? null;
                    $splitAmount = (float) ($split['amount'] ?? 0);
                    if ($splitCatId) {
                        $categoryAmounts[$splitCatId] = ($categoryAmounts[$splitCatId] ?? 0) + $splitAmount;
                    } else {
                        $uncategorizedCount++;
                    }
                }
            } elseif ($categoryId) {
                $categoryAmounts[$categoryId] = ($categoryAmounts[$categoryId] ?? 0) + $amount;
            } else {
                $uncategorizedCount++;
            }
        }

        $categories = [];
        if (! empty($categoryAmounts)) {
            $cats = \App\Models\Category::withoutGlobalScope('client')
                ->where('client_id', $clientId)
                ->whereIn('id', array_keys($categoryAmounts))
                ->get()
                ->keyBy('id');

            foreach ($categoryAmounts as $catId => $catAmount) {
                $cat = $cats->get($catId);
                $categories[] = [
                    'id' => $catId,
                    'name' => $cat?->name ?? 'Неизвестная',
                    'icon' => $cat?->icon ?? '📦',
                    'color' => $cat?->color ?? '#999',
                    'amount' => round($catAmount, 2),
                    'percent' => $expenseTotal > 0 ? round(($catAmount / $expenseTotal) * 100, 1) : 0,
                ];
            }

            usort($categories, fn ($a, $b) => $b['amount'] <=> $a['amount']);
        }

        $budgetWarnings = [];
        foreach ($categoryAmounts as $catId => $catAmount) {
            $months = [];
            foreach ($rows as $row) {
                if (($row['type'] ?? 'expense') === 'expense') {
                    $month = substr($row['date'] ?? '', 0, 7);
                    if ($month) {
                        $months[$month] = true;
                    }
                }
            }

            foreach (array_keys($months) as $month) {
                $warning = $this->transactionService->checkBudgetWarning($clientId, $month, $catId, $catAmount);
                if ($warning) {
                    $budgetWarnings[] = $warning;
                }
            }
        }

        return $this->success([
            'expenses_total' => round($expenseTotal, 2),
            'income_total' => round($incomeTotal, 2),
            'net' => round($incomeTotal - $expenseTotal, 2),
            'categories' => $categories,
            'budget_warnings' => $budgetWarnings,
            'uncategorized_count' => $uncategorizedCount,
        ]);
    }

    public function getImports(Request $request): JsonResponse
    {
        $clientId = $this->clientId();

        if (! \Schema::hasTable('bank_receipt_imports')) {
            return $this->success([]);
        }

        $imports = BankReceiptImport::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn (BankReceiptImport $i) => [
                'id' => $i->id,
                'filename' => $i->filename,
                'file_hash' => $i->file_hash,
                'pages_count' => $i->pages_count,
                'rows_found' => $i->rows_found,
                'rows_created' => $i->rows_created,
                'rows_skipped' => $i->rows_skipped,
                'created_at' => $i->created_at?->toISOString(),
            ])
            ->toArray();

        return $this->success($imports);
    }

    public function deleteImport(int $id): JsonResponse
    {
        $clientId = $this->clientId();

        if (! \Schema::hasTable('bank_receipt_imports')) {
            return $this->error('Таблица импортов не найдена', 404);
        }

        $import = BankReceiptImport::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('id', $id)
            ->first();

        if (! $import) {
            return $this->error('Импорт не найден', 404);
        }

        $deletedCount = 0;

        DB::transaction(function () use ($import, $clientId, &$deletedCount) {
            $transactions = Transaction::withoutGlobalScope('client')
                ->where('client_id', $clientId)
                ->where('import_id', $import->id)
                ->get();

            foreach ($transactions as $tx) {
                $this->accountService->updateBalanceByAccount(
                    $tx->account_id,
                    $clientId,
                    -((float) $tx->amount)
                );
                $tx->delete();
                $deletedCount++;
            }

            $import->delete();
        });

        event(new DataUpdated('transactions'));
        event(new DataUpdated('balance'));
        event(new DataUpdated('dashboard'));

        return $this->success(['deleted' => $deletedCount]);
    }

    public function getRules(): JsonResponse
    {

        return $this->success($this->ruleService->listPersonal());
    }

    public function storeRule(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'nullable|string|max:255',
            'merchant_pattern' => 'nullable|string|max:255',
            'conditions' => 'nullable|array',
            'category_id' => 'nullable|integer|exists:categories,id',
            'category_name' => 'nullable|string|max:255',
            'result_income_type' => 'nullable|string|max:50',
            'is_auto' => 'nullable|boolean',
            'priority' => 'nullable|integer|min:0|max:100',
        ]);

        $this->ruleService->createPersonal($request->all());

        return $this->success($this->ruleService->listPersonal(), 201);
    }

    public function updateRule(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'name' => 'nullable|string|max:255',
            'merchant_pattern' => 'nullable|string|max:255',
            'conditions' => 'nullable|array',
            'category_id' => 'nullable|integer|exists:categories,id',
            'category_name' => 'nullable|string|max:255',
            'result_income_type' => 'nullable|string|max:50',
            'is_auto' => 'nullable|boolean',
            'priority' => 'nullable|integer|min:0|max:100',
        ]);

        $rule = $this->ruleService->updatePersonal($id, $request->all());

        if (! $rule) {
            return $this->error('Правило не найдено', 404);
        }

        return $this->success($this->ruleService->listPersonal());
    }

    public function deleteRule(int $id): JsonResponse
    {

        $deleted = $this->ruleService->deletePersonal($id);

        if (! $deleted) {
            return $this->error('Правило не найдено', 404);
        }

        return $this->success(['deleted' => true]);
    }

    public function getMappings(Request $request): JsonResponse
    {
        $clientId = $this->clientId();

        $expenseMappings = [];
        if (\Schema::hasTable('bank_receipt_mappings')) {
            $expenseMappings = BankReceiptMapping::withoutGlobalScope('client')
                ->where('client_id', $clientId)
                ->with('category')
                ->orderBy('bank_merchant_name')
                ->get()
                ->map(fn ($m) => [
                    'id' => $m->id,
                    'bank_merchant_name' => $m->bank_merchant_name,
                    'category_id' => $m->category_id,
                    'category_name' => $m->category ? $m->category->name : null,
                    'type' => 'expense',
                ])
                ->toArray();
        }

        $incomeMappings = [];
        if (\Schema::hasTable('bank_receipt_income_mappings')) {
            $incomeMappings = BankReceiptIncomeMapping::withoutGlobalScope('client')
                ->where('client_id', $clientId)
                ->orderBy('bank_merchant_name')
                ->get()
                ->map(fn ($m) => [
                    'id' => $m->id,
                    'bank_merchant_name' => $m->bank_merchant_name,
                    'income_type' => $m->income_type,
                    'type' => 'income',
                ])
                ->toArray();
        }

        return $this->success([
            'expense' => $expenseMappings,
            'income' => $incomeMappings,
        ]);
    }

    protected function getTransactionDescription(array $row): string
    {
        $raw = trim($row['raw_description'] ?? '');
        $bank = trim($row['bank_merchant_name'] ?? '');
        $date = $row['date'] ?? '';
        $amount = $row['amount'] ?? '';

        if ($raw !== '' && (mb_strlen($raw) > mb_strlen($bank) + 5 || $raw !== $bank)) {
            return $raw;
        }
        $parts = array_filter([$date, $bank, $amount]);

        return implode(' ', $parts) ?: 'Неизвестно';
    }

    /** @return array{exists: int, batch_learned: int, mapped: int, similar: int, ai_suggested: int, manual: int, rule: int} */
    private function calculateMatchStats(array $rows): array
    {
        $stats = ['exists' => 0, 'batch_learned' => 0, 'mapped' => 0, 'similar' => 0, 'ai_suggested' => 0, 'manual' => 0, 'rule' => 0];
        foreach ($rows as $row) {
            $confidence = $row['confidence'] ?? 'manual';
            $action = $row['action'] ?? 'skip';
            if ($action === 'exists') {
                $stats['exists']++;
            } elseif ($action === 'create') {
                if (isset($stats[$confidence])) {
                    $stats[$confidence]++;
                } else {
                    $stats['manual']++;
                }
            }
        }

        return $stats;
    }
}
