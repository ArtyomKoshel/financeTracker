<?php

namespace App\Services\Experimental;

use App\Models\BankReceiptIncomeMapping;
use App\Models\BankReceiptMapping;
use App\Models\Category;
use App\Models\RecurringPayment;
use App\Models\Transaction;

/**
 * Сопоставление строк из чека (AI) с существующими транзакциями и маппингами.
 *
 * Порядок проверок (matchOne):
 * 0. Rules engine → create, rule (highest priority, before all other checks)
 * 1. amount <= 0 → skip
 * 2. findExistingTransaction → exists (learned, только batchLearned, не сохраняем в БД)
 * 3. batchLearned (тот же merchant в документе) → create, batch_learned
 * 4. ERIP (erip в названии) → create, manual, без маппинга
 * 5. findMapping (expense, exact + fuzzy) → create, confidence из bank_receipt_mappings
 * 6. findIncomeMapping (income, exact + fuzzy) → create, mapped
 * 7. findCategoryByMerchantName (merchant в description за 12 мес) → create, similar
 * 8. findIncomeTypeFromSimilarTransaction (income) → create, similar
 * 9. findCategoryFromSimilarTransaction (expense) → create, similar
 * 10. AI suggested_category → create, ai_suggested
 * 11. guessCategory / default → create
 *
 * Маппинги сохраняются только при Apply (контроллер), не при exists.
 */
class ReceiptMatchingService
{
    private const MATCH_SIMILARITY_THRESHOLD = 0.25;

    private const DUPLICATE_AMOUNT_TOLERANCE_PERCENT = 0.01;

    private const SIMILAR_MONTHS_AGO = 12;

    private const FUZZY_MAPPING_THRESHOLD = 0.7;

    /** @var string[] Доступны для использования в Apply (BankReceiptController) */
    public const INCOME_TYPES = ['salary', 'advance', 'bonus', 'early_pay', 'year_bonus', 'vacation', 'casino', 'other'];

    private int $clientId;

    private bool $hasMappingsTable;

    private bool $hasIncomeMappingsTable;

    /** @var \Illuminate\Database\Eloquent\Collection<int, BankReceiptMapping>|null */
    private ?\Illuminate\Database\Eloquent\Collection $allMappingsCache = null;

    /** @var \Illuminate\Database\Eloquent\Collection<int, BankReceiptIncomeMapping>|null */
    private ?\Illuminate\Database\Eloquent\Collection $allIncomeMappingsCache = null;

    private ?ImportRuleService $ruleService = null;

    /** @var \Illuminate\Database\Eloquent\Collection<int, RecurringPayment>|null */
    private ?\Illuminate\Database\Eloquent\Collection $recurringPaymentsCache = null;

    public function __construct(int $clientId)
    {
        $this->clientId = $clientId;
        $this->hasMappingsTable = \Schema::hasTable('bank_receipt_mappings');
        $this->hasIncomeMappingsTable = \Schema::hasTable('bank_receipt_income_mappings');

        if (\Schema::hasTable('categorization_rules')) {
            $this->ruleService = new ImportRuleService($clientId);
        }
    }

    /**
     * @param  array  $receiptTransactions  array of {bank_merchant_name, amount, date, time?, currency?}
     * @return array array of preview rows for frontend
     */
    public function match(array $receiptTransactions): array
    {
        $rows = [];
        $batchLearned = [];
        foreach ($receiptTransactions as $idx => $item) {
            $row = $this->matchOne($item, (string) $idx, $batchLearned);

            if (($row['action'] ?? '') === 'create' && empty($row['from_rule'])) {
                $row = $this->attachRecurringPayment(
                    $row,
                    (float) ($row['amount'] ?? 0),
                    $row['date'] ?? '',
                    $row['bank_merchant_name'] ?? ''
                );
            }

            $rows[] = $row;
        }

        return $rows;
    }

    private function matchOne(array $item, string $tempId, array &$batchLearned): array
    {
        $bankName = $item['bank_merchant_name'] ?? '';
        $rawDescription = $item['raw_description'] ?? $bankName;
        $amount = abs((float) ($item['amount'] ?? 0));
        $type = ($item['type'] ?? 'expense') === 'income' ? 'income' : 'expense';
        $date = $this->normalizeDate($item['date'] ?? null);
        $time = $item['time'] ?? null;
        $suggestedCategory = $item['suggested_category'] ?? null;

        $currency = strtoupper(trim($item['currency'] ?? 'BYN'));
        $currency = in_array($currency, ['BYN', 'RUB', 'EUR', 'USD', 'GBP', 'PLN'], true) ? $currency : 'BYN';

        $base = [
            'id' => $tempId,
            'bank_merchant_name' => $bankName,
            'raw_description' => $rawDescription,
            'amount' => $amount,
            'currency' => $currency,
            'type' => $type,
            'date' => $date,
            'time' => $time,
        ];

        if ($amount <= 0) {
            return array_merge($base, [
                'category_id' => null,
                'category_name' => null,
                'action' => 'skip',
                'confidence' => null,
            ]);
        }

        // Rules engine — highest priority, before all other checks
        if ($this->ruleService) {
            $ruleMatch = $this->ruleService->evaluateRules($item);
            if ($ruleMatch) {
                $result = array_merge($base, [
                    'category_id' => $ruleMatch['category_id'],
                    'category_name' => $ruleMatch['category_name'],
                    'income_type' => $ruleMatch['income_type'],
                    'action' => 'create',
                    'confidence' => 'rule',
                    'from_rule' => true,
                    'rule_id' => $ruleMatch['rule_id'],
                    'is_auto' => $ruleMatch['is_auto'],
                ]);

                return $this->attachRecurringPayment($result, $amount, $date, $bankName);
            }
        }

        $norm = $this->normalize($bankName);
        $existing = $this->findExistingTransaction($amount, $date, $type, $bankName);
        if ($existing) {
            $category = $existing->category;
            if ($norm !== '' && ! $this->isUndeterminedMerchant($bankName)) {
                $batchLearned[$norm] = [
                    'category_id' => $existing->category_id,
                    'category_name' => $category ? $category->name : null,
                    'type' => $type,
                    'income_type' => $type === 'income' ? ($existing->type ?? 'other') : null,
                ];
            }

            return array_merge($base, [
                'category_id' => $existing->category_id,
                'category_name' => $category ? $category->name : null,
                'action' => 'exists',
                'existing_transaction_id' => $existing->id,
                'existing_transaction_description' => $existing->description ?? '',
                'existing_transaction_type' => $existing->type ?? null,
                'confidence' => 'learned',
            ]);
        }

        if ($norm !== '' && isset($batchLearned[$norm]) && $batchLearned[$norm]['type'] === $type) {
            $learned = $batchLearned[$norm];

            return array_merge($base, [
                'category_id' => $learned['category_id'],
                'category_name' => $learned['category_name'],
                'income_type' => $learned['income_type'] ?? null,
                'action' => 'create',
                'confidence' => 'batch_learned',
            ]);
        }

        if ($this->isUndeterminedMerchant($bankName)) {
            $guessed = $type === 'income'
                ? ['id' => null, 'name' => '—', 'confidence' => 'manual']
                : $this->getDefaultCategory();

            return array_merge($base, [
                'category_id' => $guessed['id'],
                'category_name' => $guessed['name'],
                'action' => 'create',
                'confidence' => 'manual',
            ]);
        }

        $mapping = $this->findMapping($bankName);
        if ($mapping && $type === 'expense') {
            $category = $mapping->category;

            if ($norm !== '') {
                $batchLearned[$norm] = [
                    'category_id' => $mapping->category_id,
                    'category_name' => $category ? $category->name : null,
                    'type' => 'expense',
                    'income_type' => null,
                ];
            }

            return array_merge($base, [
                'category_id' => $mapping->category_id,
                'category_name' => $category ? $category->name : null,
                'action' => 'create',
                'confidence' => $mapping->confidence,
                'from_mapping' => $mapping->confidence === 'manual',
            ]);
        }

        if ($type === 'income') {
            $incomeMapping = $this->findIncomeMapping($bankName);
            if ($incomeMapping) {
                if ($norm !== '') {
                    $batchLearned[$norm] = [
                        'category_id' => null,
                        'category_name' => null,
                        'type' => 'income',
                        'income_type' => $incomeMapping->income_type,
                    ];
                }

                return array_merge($base, [
                    'category_id' => null,
                    'category_name' => null,
                    'income_type' => $incomeMapping->income_type,
                    'action' => 'create',
                    'confidence' => 'mapped',
                    'from_mapping' => true,
                ]);
            }
        }

        // Поиск категории по merchant name в description существующих транзакций (без фильтра по сумме)
        $merchantCat = $this->findCategoryByMerchantName($bankName, $type);
        if ($merchantCat) {
            if ($norm !== '') {
                $batchLearned[$norm] = [
                    'category_id' => $merchantCat['id'],
                    'category_name' => $merchantCat['name'],
                    'type' => $type,
                    'income_type' => $merchantCat['income_type'] ?? null,
                ];
            }
            $result = array_merge($base, [
                'category_id' => $merchantCat['id'],
                'category_name' => $merchantCat['name'],
                'action' => 'create',
                'confidence' => 'similar',
            ]);
            if ($type === 'income' && ! empty($merchantCat['income_type'])) {
                $result['income_type'] = $merchantCat['income_type'];
            }

            return $result;
        }

        if ($type === 'income') {
            $similarIncomeType = $this->findIncomeTypeFromSimilarTransaction($bankName, $amount);
            if ($similarIncomeType) {
                if ($norm !== '') {
                    $batchLearned[$norm] = [
                        'category_id' => null,
                        'category_name' => null,
                        'type' => 'income',
                        'income_type' => $similarIncomeType,
                    ];
                }

                return array_merge($base, [
                    'category_id' => null,
                    'category_name' => null,
                    'income_type' => $similarIncomeType,
                    'action' => 'create',
                    'confidence' => 'similar',
                ]);
            }
        }

        $similarCat = $this->findCategoryFromSimilarTransaction($bankName, $amount, $type);
        if ($similarCat) {
            return array_merge($base, [
                'category_id' => $similarCat['id'],
                'category_name' => $similarCat['name'],
                'action' => 'create',
                'confidence' => 'similar',
            ]);
        }

        // AI suggested_category fallback
        if ($suggestedCategory && $type === 'expense') {
            $aiCat = $this->findCategoryByName($suggestedCategory);
            if ($aiCat) {
                return array_merge($base, [
                    'category_id' => $aiCat['id'],
                    'category_name' => $aiCat['name'],
                    'action' => 'create',
                    'confidence' => 'ai_suggested',
                ]);
            }
        }

        $guessed = $type === 'income'
            ? ['id' => null, 'name' => '—', 'confidence' => 'manual']
            : $this->guessCategory($bankName);

        return array_merge($base, [
            'category_id' => $guessed['id'],
            'category_name' => $guessed['name'],
            'action' => 'create',
            'confidence' => $guessed['confidence'],
        ]);
    }

    private function findExistingTransaction(float $amount, string $date, string $type, string $bankName = ''): ?Transaction
    {
        $amountAbs = abs($amount);
        $tolerance = max(0.01, $amountAbs * self::DUPLICATE_AMOUNT_TOLERANCE_PERCENT);
        $searchAmount = $type === 'income' ? $amountAbs : -$amountAbs;

        $query = Transaction::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)
            ->where(function ($q) use ($searchAmount, $tolerance) {
                $q->whereRaw('ABS(amount - ?) <= ?', [$searchAmount, $tolerance])
                    ->orWhereRaw('ABS(amount - ?) <= ?', [-$searchAmount, $tolerance]);
            })
            ->whereDate('date', $date);

        $candidates = $query->get();
        if ($candidates->isEmpty()) {
            return null;
        }

        $norm = $this->normalize($bankName);
        if (strlen($norm) < 3) {
            return $candidates->first();
        }

        $best = null;
        $bestScore = -1.0;
        foreach ($candidates as $tx) {
            $descNorm = $this->normalize($tx->description ?? '');
            $score = $descNorm !== '' ? $this->similarityScore($norm, $descNorm) : 0;
            if ($score > $bestScore) {
                $bestScore = $score;
                $best = $tx;
            }
        }

        if ($best === null) {
            return $candidates->first();
        }
        if ($candidates->count() === 1 && $bestScore < self::MATCH_SIMILARITY_THRESHOLD) {
            return $candidates->first();
        }
        if ($bestScore < self::MATCH_SIMILARITY_THRESHOLD) {
            return null;
        }

        return $best;
    }

    /**
     * Для доходов: ищем похожие и берём тип (salary, bonus, advance и т.д.).
     */
    private function findIncomeTypeFromSimilarTransaction(string $bankName, float $amount): ?string
    {
        $norm = $this->normalize($bankName);
        if (strlen($norm) < 3) {
            return null;
        }

        $lookbackDate = now()->subMonths(self::SIMILAR_MONTHS_AGO)->format('Y-m-d');
        $similar = Transaction::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)
            ->where('date', '>=', $lookbackDate)
            ->whereIn('type', self::INCOME_TYPES)
            ->orderByDesc('date')
            ->limit(50)
            ->get();

        $best = null;
        $bestScore = 0;
        foreach ($similar as $tx) {
            $descNorm = $this->normalize($tx->description ?? '');
            $score = $descNorm !== '' ? $this->similarityScore($norm, $descNorm) : 0;
            if ($score > $bestScore && $score >= 0.4) {
                $bestScore = $score;
                $best = $tx;
            }
        }

        return $best ? $best->type : null;
    }

    private const SIMILAR_AMOUNT_TOLERANCE_PERCENT = 0.05;

    /**
     * Ищем категорию по похожим транзакциям (описание ~ bank_merchant_name).
     * Если пользователь уже вносил такую операцию вручную — подставляем её категорию.
     * Fallback: при отсутствии совпадения по description — ищем по сумме (±5%).
     */
    private function findCategoryFromSimilarTransaction(string $bankName, float $amount, string $type): ?array
    {
        $norm = $this->normalize($bankName);
        $lookbackDate = now()->subMonths(self::SIMILAR_MONTHS_AGO)->format('Y-m-d');
        $query = Transaction::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)
            ->where('date', '>=', $lookbackDate)
            ->whereNotNull('category_id');
        if ($type === 'income') {
            $query->whereNotIn('type', ['expense', 'savings', 'savings_withdrawal', 'correction']);
        } else {
            $query->where('type', 'expense');
        }
        $similar = $query->orderByDesc('date')->limit(50)->get();

        $best = null;
        $bestScore = 0;
        foreach ($similar as $tx) {
            $descNorm = $this->normalize($tx->description ?? '');
            $score = $descNorm !== '' ? $this->similarityScore($norm, $descNorm) : 0;
            if ($score > $bestScore && $score >= 0.4) {
                $bestScore = $score;
                $best = $tx;
            }
        }

        if ($best && $best->category) {
            return ['id' => $best->category_id, 'name' => $best->category->name];
        }

        $amountAbs = abs($amount);
        $tolerance = max(0.01, $amountAbs * self::SIMILAR_AMOUNT_TOLERANCE_PERCENT);
        $searchAmount = $type === 'income' ? $amountAbs : -$amountAbs;

        $amountMatch = Transaction::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)
            ->where('date', '>=', $lookbackDate)
            ->whereNotNull('category_id')
            ->where('type', 'expense')
            ->where(function ($q) use ($searchAmount, $tolerance) {
                $q->whereRaw('ABS(amount - ?) <= ?', [$searchAmount, $tolerance])
                    ->orWhereRaw('ABS(amount - ?) <= ?', [-$searchAmount, $tolerance]);
            })
            ->orderByDesc('date')
            ->limit(5)
            ->get();

        $bestByAmount = $amountMatch->first();
        if ($bestByAmount && $bestByAmount->category) {
            return ['id' => $bestByAmount->category_id, 'name' => $bestByAmount->category->name];
        }

        return null;
    }

    private function similarityScore(string $a, string $b): float
    {
        if ($a === $b) {
            return 1.0;
        }

        $aLat = $this->transliterate($a);
        $bLat = $this->transliterate($b);
        if ($aLat === $bLat && $aLat !== '') {
            return 0.95;
        }

        if (mb_strpos($a, $b) !== false || mb_strpos($b, $a) !== false) {
            $minLen = min(mb_strlen($a), mb_strlen($b));
            $maxLen = max(mb_strlen($a), mb_strlen($b));

            return $minLen / max(1, $maxLen);
        }

        if (mb_strpos($aLat, $bLat) !== false || mb_strpos($bLat, $aLat) !== false) {
            $minLen = min(mb_strlen($aLat), mb_strlen($bLat));
            $maxLen = max(mb_strlen($aLat), mb_strlen($bLat));

            return ($minLen / max(1, $maxLen)) * 0.9;
        }

        $wordsA = array_filter(preg_split('/\s+/u', $a) ?: []);
        $wordsB = array_filter(preg_split('/\s+/u', $b) ?: []);
        if (empty($wordsA) || empty($wordsB)) {
            return 0;
        }

        $intersect = count(array_intersect($wordsA, $wordsB));
        if ($intersect === 0) {
            $wordsALat = array_map([$this, 'transliterate'], $wordsA);
            $wordsBLat = array_map([$this, 'transliterate'], $wordsB);
            $intersect = count(array_intersect($wordsALat, $wordsBLat));
        }
        if ($intersect > 0) {
            return $intersect / max(count($wordsA), count($wordsB));
        }

        $aJoined = preg_replace('/\s+/u', '', $a) ?: $a;
        $bJoined = preg_replace('/\s+/u', '', $b) ?: $b;
        if (mb_strpos($aJoined, $bJoined) !== false || mb_strpos($bJoined, $aJoined) !== false) {
            $minLen = min(mb_strlen($aJoined), mb_strlen($bJoined));
            $maxLen = max(mb_strlen($aJoined), mb_strlen($bJoined));

            return $minLen / max(1, $maxLen);
        }

        $aLatJoined = preg_replace('/\s+/u', '', $aLat) ?: $aLat;
        $bLatJoined = preg_replace('/\s+/u', '', $bLat) ?: $bLat;
        if (mb_strpos($aLatJoined, $bLatJoined) !== false || mb_strpos($bLatJoined, $aLatJoined) !== false) {
            $minLen = min(mb_strlen($aLatJoined), mb_strlen($bLatJoined));
            $maxLen = max(mb_strlen($aLatJoined), mb_strlen($bLatJoined));

            return ($minLen / max(1, $maxLen)) * 0.85;
        }

        return 0;
    }

    private function transliterate(string $text): string
    {
        $map = [
            'а' => 'a', 'б' => 'b', 'в' => 'v', 'г' => 'g', 'д' => 'd', 'е' => 'e', 'ё' => 'e',
            'ж' => 'zh', 'з' => 'z', 'и' => 'i', 'й' => 'y', 'к' => 'k', 'л' => 'l', 'м' => 'm',
            'н' => 'n', 'о' => 'o', 'п' => 'p', 'р' => 'r', 'с' => 's', 'т' => 't', 'у' => 'u',
            'ф' => 'f', 'х' => 'kh', 'ц' => 'ts', 'ч' => 'ch', 'ш' => 'sh', 'щ' => 'shch',
            'ъ' => '', 'ы' => 'y', 'ь' => '', 'э' => 'e', 'ю' => 'yu', 'я' => 'ya',
        ];

        $result = '';
        $chars = preg_split('//u', mb_strtolower($text), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        foreach ($chars as $char) {
            $result .= $map[$char] ?? $char;
        }

        return $result;
    }

    /**
     * Поиск категории только по merchant name в description (без фильтра по сумме).
     * Наиболее частая категория для данного мерчанта за SIMILAR_MONTHS_AGO.
     */
    private function findCategoryByMerchantName(string $bankName, string $type): ?array
    {
        $norm = $this->normalize($bankName);
        if (strlen($norm) < 3) {
            return null;
        }

        $lookbackDate = now()->subMonths(self::SIMILAR_MONTHS_AGO)->format('Y-m-d');

        $words = array_filter(preg_split('/\s+/u', $norm) ?: []);
        $longestWord = '';
        foreach ($words as $w) {
            if (mb_strlen($w) > mb_strlen($longestWord)) {
                $longestWord = $w;
            }
        }
        if (mb_strlen($longestWord) < 3) {
            return null;
        }

        $query = Transaction::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)
            ->where('date', '>=', $lookbackDate)
            ->whereNotNull('category_id')
            ->whereRaw('LOWER(description) LIKE ?', ['%'.$longestWord.'%']);

        if ($type === 'income') {
            $query->whereNotIn('type', ['expense', 'savings', 'savings_withdrawal', 'correction']);
        } else {
            $query->where('type', 'expense');
        }

        $matches = $query->selectRaw('category_id, COUNT(*) as cnt')
            ->groupBy('category_id')
            ->orderByDesc('cnt')
            ->limit(3)
            ->get();

        if ($matches->isEmpty()) {
            return null;
        }

        $topCategoryId = $matches->first()->category_id;
        $category = Category::withoutGlobalScope('client')->find($topCategoryId);
        if (! $category) {
            return null;
        }

        $result = ['id' => $category->id, 'name' => $category->name];

        if ($type === 'income') {
            $incomeType = Transaction::withoutGlobalScope('client')
                ->where('client_id', $this->clientId)
                ->where('date', '>=', $lookbackDate)
                ->whereIn('type', self::INCOME_TYPES)
                ->whereRaw('LOWER(description) LIKE ?', ['%'.$longestWord.'%'])
                ->orderByDesc('date')
                ->value('type');
            if ($incomeType) {
                $result['income_type'] = $incomeType;
            }
        }

        return $result;
    }

    private function findMapping(string $bankName): ?BankReceiptMapping
    {
        if (! $this->hasMappingsTable) {
            return null;
        }
        $normalized = $this->normalize($bankName);
        if ($normalized === '') {
            return null;
        }

        $exact = BankReceiptMapping::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)
            ->where('bank_merchant_normalized', $normalized)
            ->first();
        if ($exact) {
            return $exact;
        }

        $allMappings = $this->getAllMappings();
        $best = null;
        $bestScore = 0.0;
        foreach ($allMappings as $m) {
            $score = $this->similarityScore($normalized, $m->bank_merchant_normalized);
            if ($score > $bestScore && $score >= self::FUZZY_MAPPING_THRESHOLD) {
                $bestScore = $score;
                $best = $m;
            }
        }

        return $best;
    }

    private function findIncomeMapping(string $bankName): ?BankReceiptIncomeMapping
    {
        if (! $this->hasIncomeMappingsTable) {
            return null;
        }
        $normalized = $this->normalize($bankName);
        if ($normalized === '') {
            return null;
        }

        $exact = BankReceiptIncomeMapping::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)
            ->where('bank_merchant_normalized', $normalized)
            ->first();
        if ($exact) {
            return $exact;
        }

        $allIncome = $this->getAllIncomeMappings();
        $best = null;
        $bestScore = 0.0;
        foreach ($allIncome as $m) {
            $score = $this->similarityScore($normalized, $m->bank_merchant_normalized);
            if ($score > $bestScore && $score >= self::FUZZY_MAPPING_THRESHOLD) {
                $bestScore = $score;
                $best = $m;
            }
        }

        return $best;
    }

    /** @return \Illuminate\Database\Eloquent\Collection<int, BankReceiptMapping> */
    private function getAllMappings(): \Illuminate\Database\Eloquent\Collection
    {
        if ($this->allMappingsCache === null) {
            $this->allMappingsCache = BankReceiptMapping::withoutGlobalScope('client')
                ->where('client_id', $this->clientId)
                ->get();
        }

        return $this->allMappingsCache;
    }

    /** @return \Illuminate\Database\Eloquent\Collection<int, BankReceiptIncomeMapping> */
    private function getAllIncomeMappings(): \Illuminate\Database\Eloquent\Collection
    {
        if ($this->allIncomeMappingsCache === null) {
            $this->allIncomeMappingsCache = BankReceiptIncomeMapping::withoutGlobalScope('client')
                ->where('client_id', $this->clientId)
                ->get();
        }

        return $this->allIncomeMappingsCache;
    }

    private function findCategoryByName(string $name): ?array
    {
        $lower = mb_strtolower(trim($name));
        if ($lower === '') {
            return null;
        }

        $cat = Category::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)
            ->where('is_active', true)
            ->whereRaw('LOWER(name) LIKE ?', ['%'.$lower.'%'])
            ->first();

        if ($cat) {
            return ['id' => $cat->id, 'name' => $cat->name];
        }

        $categories = Category::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)
            ->where('is_active', true)
            ->get();

        $best = null;
        $bestScore = 0.0;
        foreach ($categories as $c) {
            $score = $this->similarityScore($lower, mb_strtolower($c->name));
            if ($score > $bestScore && $score >= self::FUZZY_MAPPING_THRESHOLD) {
                $bestScore = $score;
                $best = $c;
            }
        }

        return $best ? ['id' => $best->id, 'name' => $best->name] : null;
    }

    /** Неопределённые получатели — не мапим, не учим (ERIP и т.п.) */
    public function isUndeterminedMerchant(string $bankName): bool
    {
        $lower = mb_strtolower($bankName);

        return mb_strpos($lower, 'erip') !== false;
    }

    private function getDefaultCategory(): array
    {
        $firstCategory = Category::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->first();

        return [
            'id' => $firstCategory ? $firstCategory->id : null,
            'name' => $firstCategory ? $firstCategory->name : null,
            'confidence' => 'manual',
        ];
    }

    private function guessCategory(string $bankName): array
    {
        $default = $this->getDefaultCategory();
        $id = $default['id'];
        $name = $default['name'];

        $lower = mb_strtolower($bankName);
        $keywordToCategory = [
            'европост' => 'Продукты', 'евроопт' => 'Продукты', 'грок' => 'Продукты', 'самсон' => 'Продукты',
            'мелмарт' => 'Продукты', 'продукт' => 'Продукты', 'магнит' => 'Продукты', 'маркет' => 'Продукты',
            'такси' => 'Транспорт', 'яндекс' => 'Транспорт', 'uber' => 'Транспорт', 'бензин' => 'Транспорт',
            'заправ' => 'Транспорт', 'автобус' => 'Транспорт', 'метро' => 'Транспорт',
            'жкх' => 'Жильё', 'коммунал' => 'Жильё', 'аренда' => 'Жильё', 'квартир' => 'Жильё', 'энерго' => 'Жильё',
        ];

        foreach ($keywordToCategory as $word => $catName) {
            if (mb_strpos($lower, $word) !== false) {
                $cat = Category::withoutGlobalScope('client')
                    ->where('client_id', $this->clientId)
                    ->where('is_active', true)
                    ->where('name', 'like', '%'.$catName.'%')
                    ->first();
                if ($cat) {
                    return ['id' => $cat->id, 'name' => $cat->name, 'confidence' => 'mapped'];
                }
            }
        }

        return ['id' => $id, 'name' => $name, 'confidence' => 'manual'];
    }

    private function normalizeDate(?string $date): string
    {
        if (empty($date) || ! is_string($date)) {
            return date('Y-m-d');
        }
        $dt = \DateTime::createFromFormat('Y-m-d', $date);
        if (! $dt) {
            return date('Y-m-d');
        }
        $twoYearsAgo = (new \DateTime)->modify('-2 years');
        $tomorrow = (new \DateTime)->modify('+1 day');
        if ($dt < $twoYearsAgo || $dt > $tomorrow) {
            return date('Y-m-d');
        }

        return $dt->format('Y-m-d');
    }

    public function normalize(string $name): string
    {
        $name = mb_strtolower(trim($name));
        $name = preg_replace('/\s+/', ' ', $name);
        $name = preg_replace('/[^\p{L}\p{N}\s]/u', '', $name) ?? $name;

        return $name;
    }

    private function attachRecurringPayment(array $row, float $amount, string $date, string $bankName): array
    {
        $payment = $this->findMatchingRecurringPayment($amount, $date, $bankName);
        if ($payment) {
            $row['suggested_recurring_payment_id'] = $payment->id;
            $row['suggested_recurring_payment_name'] = $payment->name;
            $row['suggested_recurring_payment_amount'] = (float) $payment->amount;
            $row['suggested_recurring_payment_day'] = $payment->day_of_month;
        }

        return $row;
    }

    private function findMatchingRecurringPayment(float $amount, string $date, string $bankName): ?RecurringPayment
    {
        if (empty($bankName) || $amount <= 0) {
            return null;
        }

        $payments = $this->getRecurringPayments();
        if ($payments->isEmpty()) {
            return null;
        }

        $norm = $this->normalize($bankName);
        if (strlen($norm) < 3) {
            return null;
        }

        $dayOfMonth = (int) date('j', strtotime($date));
        $best = null;
        $bestScore = 0.0;

        foreach ($payments as $payment) {
            $paymentNorm = $this->normalize($payment->name);
            if (strlen($paymentNorm) < 3) {
                continue;
            }

            $nameSim = $this->similarityScore($norm, $paymentNorm);
            if ($nameSim < 0.4) {
                continue;
            }

            $paymentAmount = abs((float) $payment->amount);
            if ($paymentAmount > 0) {
                $amountDiff = abs($amount - $paymentAmount) / $paymentAmount;
                if ($amountDiff > 0.3) {
                    continue;
                }
            }

            $dayDiff = abs($dayOfMonth - $payment->day_of_month);
            if ($dayDiff > 5) {
                continue;
            }

            $score = $nameSim * 0.5 + (1 - min($dayDiff / 5, 1)) * 0.3 + (1 - min(($paymentAmount > 0 ? abs($amount - $paymentAmount) / $paymentAmount : 0), 1)) * 0.2;
            if ($score > $bestScore) {
                $bestScore = $score;
                $best = $payment;
            }
        }

        return $bestScore >= 0.5 ? $best : null;
    }

    /** @return \Illuminate\Database\Eloquent\Collection<int, RecurringPayment> */
    private function getRecurringPayments(): \Illuminate\Database\Eloquent\Collection
    {
        if ($this->recurringPaymentsCache === null) {
            $this->recurringPaymentsCache = RecurringPayment::withoutGlobalScope('client')
                ->where('client_id', $this->clientId)
                ->where('is_active', true)
                ->get();
        }

        return $this->recurringPaymentsCache;
    }
}
