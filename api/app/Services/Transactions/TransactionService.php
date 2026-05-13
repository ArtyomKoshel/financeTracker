<?php

namespace App\Services\Transactions;

use App\Enums\TransactionType;
use App\Events\DataUpdated;
use App\Models\Account;
use App\Models\ActivityLog;
use App\Models\CategoryBudget;
use App\Models\Transaction;
use App\Models\TransactionSplit;
use App\Repositories\TransactionRepository;
use App\Services\Accounts\AccountService;
use App\Services\Budget\EnvelopeService;
use App\Services\Settings\SettingsService;
use Illuminate\Support\Facades\DB;

class TransactionService
{
    public function __construct(
        protected TransactionRepository $transactionRepo,
        protected AccountService $accountService,
        protected SettingsService $settingsService,
        protected EnvelopeService $envelopeService
    ) {}

    public function create(array $data, bool $isAutoSavings = false): Transaction
    {
        $clientId = $data['client_id'];
        $currency = $data['currency'] ?? 'BYN';
        $amount = (float) $data['amount'];
        $type = $data['type'];
        $accountId = isset($data['account_id']) ? (int) $data['account_id'] : Account::defaultIdForClient($clientId);

        if ($type === 'transfer') {
            return $this->createTransfer($data, $clientId, $accountId, $amount);
        }

        $amountBYN = $amount;
        $exchangeRate = null;
        if ($currency !== 'BYN') {
            $rate = $this->settingsService->getRate($clientId, $currency);
            $amountBYN = $amount * $rate;
            $exchangeRate = $rate;
        }

        if (TransactionType::isExpenseType($type) && $amountBYN > 0) {
            $amountBYN = -$amountBYN;
        }
        if ($type === 'savings_withdrawal') {
            $amountBYN = abs($amountBYN);
        }

        $month = $data['month'] ?? substr($data['date'], 0, 7);

        $tx = DB::transaction(function () use ($clientId, $accountId, $amountBYN, $amount, $currency, $exchangeRate, $type, $data, $month) {
            $tx = Transaction::create([
                'client_id' => $clientId,
                'date' => $data['date'],
                'amount' => $amountBYN,
                'original_amount' => $amount,
                'currency' => $currency,
                'exchange_rate' => $exchangeRate,
                'type' => $type,
                'category_id' => $data['category_id'] ?? null,
                'account_id' => $accountId,
                'recurring_payment_id' => $data['recurring_payment_id'] ?? null,
                'goal_id' => in_array($type, ['savings', 'savings_withdrawal']) ? ($data['goal_id'] ?? null) : null,
                'description' => $data['description'] ?? null,
                'month' => $month,
                'source' => $data['source'] ?? 'web',
            ]);

            $this->accountService->updateBalanceByAccount($accountId, $clientId, $amountBYN);

            if (! empty($data['splits']) && is_array($data['splits'])) {
                $splitsTotal = 0;
                foreach ($data['splits'] as $split) {
                    $splitAmount = abs((float) ($split['amount'] ?? 0));
                    if ($splitAmount <= 0) {
                        continue;
                    }
                    TransactionSplit::create([
                        'transaction_id' => $tx->id,
                        'category_id' => $split['category_id'] ?? null,
                        'amount' => $splitAmount,
                        'description' => $split['description'] ?? null,
                    ]);
                    $splitsTotal += $splitAmount;
                }
                if ($splitsTotal > 0) {
                    $tx->update(['category_id' => null]);
                }
            }

            return $tx;
        });

        if ($type === 'expense' && ($data['category_id'] ?? null)) {
            $this->envelopeService->syncSpentFromTransactions($clientId, $month);
        }

        if (! $isAutoSavings && TransactionType::isIncomeType($type) && $amountBYN > 0) {
            $this->maybeCreateAutoSavings($clientId, $amountBYN, $data['date'], $month, $accountId);
        }

        event(new DataUpdated('transactions', $clientId));
        event(new DataUpdated('balance', $clientId));
        event(new DataUpdated('dashboard', $clientId));

        if (! $isAutoSavings) {
            ActivityLog::create([
                'user_id' => $clientId,
                'action' => 'transaction_create',
                'ip' => request()->ip(),
                'user_agent' => request()->userAgent(),
                'details' => ['type' => $type, 'amount' => $tx->amount, 'date' => $tx->date?->format('Y-m-d')],
                'created_at' => now(),
            ]);
        }

        return $tx->load(['category', 'splits.category']);
    }

    public function createBalanceCorrection(int $clientId, int $accountId, float $difference, string $date): void
    {
        DB::transaction(function () use ($clientId, $accountId, $difference, $date) {
            Transaction::create([
                'client_id' => $clientId,
                'date' => $date,
                'amount' => $difference,
                'type' => 'correction',
                'description' => 'Синхронизация баланса',
                'month' => substr($date, 0, 7),
                'account_id' => $accountId,
            ]);
        });

        event(new DataUpdated('transactions', $clientId));
        event(new DataUpdated('balance', $clientId));
        event(new DataUpdated('dashboard', $clientId));
    }

    protected function createTransfer(array $data, int $clientId, int $fromAccountId, float $amount): Transaction
    {
        $toAccountId = (int) $data['transfer_to_account_id'];
        if ($fromAccountId === $toAccountId) {
            throw new \InvalidArgumentException('Счёт источника и назначения должны отличаться');
        }

        $month = $data['month'] ?? substr($data['date'], 0, 7);
        $desc = $data['description'] ?? 'Перевод между счетами';

        $tx = DB::transaction(function () use ($data, $clientId, $fromAccountId, $toAccountId, $amount, $month, $desc) {
            $tx = Transaction::create([
                'client_id' => $clientId,
                'date' => $data['date'],
                'amount' => -$amount,
                'original_amount' => $amount,
                'currency' => 'BYN',
                'type' => 'transfer',
                'account_id' => $fromAccountId,
                'transfer_to_account_id' => $toAccountId,
                'description' => $desc,
                'month' => $month,
            ]);

            $this->accountService->updateBalanceByAccount($fromAccountId, $clientId, -$amount);
            $this->accountService->updateBalanceByAccount($toAccountId, $clientId, $amount);

            return $tx;
        });

        event(new DataUpdated('transactions', $clientId));
        event(new DataUpdated('balance', $clientId));
        event(new DataUpdated('dashboard', $clientId));

        return $tx->load('category');
    }

    public function delete(int $id, int $clientId): bool
    {
        $tx = $this->transactionRepo->findForClient($id, $clientId);
        if (! $tx) {
            return false;
        }

        $amount = (float) $tx->amount;
        $accountId = (int) $tx->account_id;
        $transferToId = $tx->transfer_to_account_id ? (int) $tx->transfer_to_account_id : null;
        $isTransfer = $tx->type === 'transfer';

        $month = $tx->month;
        $categoryId = $tx->category_id;

        DB::transaction(function () use ($tx, $isTransfer, $transferToId, $accountId, $clientId, $amount) {
            $tx->delete();

            if ($isTransfer && $transferToId) {
                $this->accountService->updateBalanceByAccount($accountId, $clientId, -$amount);
                $this->accountService->updateBalanceByAccount($transferToId, $clientId, $amount);
            } else {
                $this->accountService->updateBalanceByAccount($accountId, $clientId, -$amount);
            }
        });

        if ($tx->type === 'expense' && $categoryId && $month) {
            $this->envelopeService->syncSpentFromTransactions($clientId, $month);
        }

        event(new DataUpdated('transactions', $clientId));
        event(new DataUpdated('balance', $clientId));
        event(new DataUpdated('dashboard', $clientId));

        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'transaction_delete',
            'ip' => request()->ip(),
            'user_agent' => request()->userAgent(),
            'details' => ['transaction_id' => $id],
            'created_at' => now(),
        ]);

        return true;
    }

    public function bulkUpdateCategory(array $ids, int $categoryId, int $clientId): int
    {
        $updated = Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->whereIn('id', $ids)
            ->update(['category_id' => $categoryId]);

        if ($updated > 0) {
            event(new DataUpdated('transactions', $clientId));
            event(new DataUpdated('dashboard', $clientId));
        }

        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'transaction_bulk_update',
            'ip' => request()->ip(),
            'user_agent' => request()->userAgent(),
            'details' => ['count' => $updated, 'category_id' => $categoryId],
            'created_at' => now(),
        ]);

        return $updated;
    }

    public function checkBudgetWarning(int $clientId, string $month, ?int $categoryId, float $newAmount): ?array
    {
        if (! $categoryId) {
            return null;
        }

        $budget = CategoryBudget::withoutGlobalScope('client')
            ->with('category')
            ->where('client_id', $clientId)
            ->where('category_id', $categoryId)
            ->where('month', $month)
            ->first();

        if (! $budget || (float) $budget->limit_amount <= 0) {
            return null;
        }

        $spentAfter = $this->transactionRepo->getSpentByCategory($clientId, $month, $categoryId) + $newAmount;
        $limit = (float) $budget->limit_amount;
        $alertPercent = (float) ($budget->alert_percent ?? 80);
        $percentUsed = $limit > 0 ? ($spentAfter / $limit) * 100 : 0;

        if ($percentUsed < $alertPercent) {
            return null;
        }

        $category = $budget->category;
        $icon = $category ? ($category->icon ?? '📦') : '📦';
        $name = $category ? $category->name : 'Категория';

        if ($percentUsed >= 100) {
            $over = $spentAfter - $limit;
            $message = "Лимит по «{$name}» превышен на ".number_format($over, 2, '.', ' ').' Br';
        } else {
            $message = "Лимит по «{$name}»: использовано ".round($percentUsed).'%';
        }

        return [
            'category_icon' => $icon,
            'message' => $message,
            'percent' => round($percentUsed),
        ];
    }

    protected function maybeCreateAutoSavings(int $clientId, float $incomeAmountBYN, string $date, string $month, int $accountId): void
    {
        $percent = (float) $this->settingsService->getSetting($clientId, 'auto_savings_percent', 0);
        $goalId = (int) $this->settingsService->getSetting($clientId, 'auto_savings_goal_id', 0);

        if ($percent <= 0 || $percent > 100) {
            return;
        }

        $savingsAmount = round($incomeAmountBYN * $percent / 100, 2);
        if ($savingsAmount <= 0) {
            return;
        }

        $this->create([
            'client_id' => $clientId,
            'type' => 'savings',
            'amount' => $savingsAmount,
            'date' => $date,
            'month' => $month,
            'account_id' => $accountId,
            'goal_id' => $goalId ?: null,
            'description' => 'Авто-накопление '.$percent.'%',
            'source' => 'auto',
        ], true);
    }
}
