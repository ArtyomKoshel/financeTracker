<?php

namespace App\Services\System;

use App\Models\Goal;
use App\Repositories\TransactionRepositoryInterface;
use App\Services\Accounts\AccountService;

class DashboardService
{
    public function __construct(
        protected TransactionRepositoryInterface $transactionRepository,
        protected AccountService $accountService
    ) {}

    public function getDashboardData(int $clientId, string $currentMonth): array
    {
        $balance = $this->accountService->getTotalBalance($clientId);
        $accounts = $this->accountService->getAllForClient($clientId);

        $transactions = $this->transactionRepository->getByMonth($clientId, $currentMonth, 10);

        $income = $this->transactionRepository->getIncomeForMonth($clientId, $currentMonth);
        $expenses = $this->transactionRepository->getExpensesForMonth($clientId, $currentMonth);
        $savings = $this->transactionRepository->getSavingsForMonth($clientId, $currentMonth);

        // Comparison with previous month
        $prevMonth = date('Y-m', strtotime($currentMonth.'-01 -1 month'));
        $prevIncome = $this->transactionRepository->getIncomeForMonth($clientId, $prevMonth);
        $prevExpenses = $this->transactionRepository->getExpensesForMonth($clientId, $prevMonth);
        $prevSavings = $this->transactionRepository->getSavingsForMonth($clientId, $prevMonth);

        $rates = $this->getRates($clientId);
        $usdRate = $rates['USD'];
        $goals = Goal::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('is_active', true)
            ->orderBy('created_at')
            ->get();
        $totalSavedBYN = $this->transactionRepository->getTotalSavings($clientId);

        $progressPercent = 0;
        $daysRemaining = 0;
        $monthlyTarget = 0;
        $firstGoal = $goals->first();

        $goalsData = $goals->map(function ($goal) use ($clientId, $rates) {
            $savedForGoalBYN = $this->transactionRepository->getTotalSavingsForGoal($clientId, $goal->id);
            $currency = $goal->currency ?? 'BYN';
            $currentInGoalCurrency = $this->convertToCurrency($savedForGoalBYN, 'BYN', $currency, $rates);
            $target = (float) $goal->target_amount;
            $progress = $target > 0 ? ($currentInGoalCurrency / $target) * 100 : 0;
            $days = max(0, (int) now()->diffInDays($goal->target_date, false));
            $monthly = 0;
            if ($days > 0) {
                $monthsRemaining = $days / 30.0;
                $monthly = $monthsRemaining > 0 ? ($target - $currentInGoalCurrency) / $monthsRemaining : 0;
            }

            return [
                'id' => $goal->id,
                'name' => $goal->name,
                'target_amount' => $target,
                'currency' => $currency,
                'target_date' => $goal->target_date->format('Y-m-d'),
                'current_amount' => $currentInGoalCurrency,
                'is_active' => true,
                'progress_percent' => $progress,
                'days_remaining' => $days,
                'monthly_target' => $monthly,
            ];
        })->values()->all();

        if ($firstGoal) {
            $savedForFirstGoalBYN = $this->transactionRepository->getTotalSavingsForGoal($clientId, $firstGoal->id);
            $currency = $firstGoal->currency ?? 'BYN';
            $currentInGoalCurrency = $this->convertToCurrency($savedForFirstGoalBYN, 'BYN', $currency, $rates);
            $target = (float) $firstGoal->target_amount;
            $progressPercent = $target > 0 ? ($currentInGoalCurrency / $target) * 100 : 0;
            $daysRemaining = max(0, (int) now()->diffInDays($firstGoal->target_date, false));
            if ($daysRemaining > 0) {
                $monthsRemaining = $daysRemaining / 30.0;
                $monthlyTarget = $monthsRemaining > 0 ? ($target - $currentInGoalCurrency) / $monthsRemaining : 0;
            }
        }

        return [
            'balance' => $balance,
            'accounts' => $accounts->map(fn ($a) => [
                'id' => $a->id,
                'name' => $a->name,
                'balance' => (float) $a->balance,
                'currency' => $a->currency ?? 'BYN',
            ])->values()->all(),
            'month' => $currentMonth,
            'current_month' => [
                'month' => $currentMonth,
                'total_income' => $income,
                'total_bonus' => 0,
                'total_saved' => $savings,
                'expenses' => $expenses,
            ],
            'previous_month' => [
                'month' => $prevMonth,
                'total_income' => $prevIncome,
                'total_saved' => $prevSavings,
                'expenses' => $prevExpenses,
            ],
            'comparison' => [
                'income_diff' => $income - $prevIncome,
                'income_pct' => $prevIncome > 0 ? round((($income - $prevIncome) / $prevIncome) * 100, 1) : 0,
                'expenses_diff' => $expenses - $prevExpenses,
                'expenses_pct' => $prevExpenses > 0 ? round((($expenses - $prevExpenses) / $prevExpenses) * 100, 1) : 0,
                'savings_diff' => $savings - $prevSavings,
                'savings_pct' => $prevSavings > 0 ? round((($savings - $prevSavings) / $prevSavings) * 100, 1) : 0,
            ],
            'recent_transactions' => $transactions->map(function ($t) {
                return $this->formatTransaction($t);
            }),
            'usd_rate' => $usdRate,
            'total_saved_rub' => $totalSavedBYN,
            'total_saved_usd' => $usdRate > 0 ? $totalSavedBYN / $usdRate : 0,
            'goals' => $goalsData,
            'goal' => $firstGoal ? [
                'id' => $firstGoal->id,
                'name' => $firstGoal->name,
                'target_amount' => (float) $firstGoal->target_amount,
                'currency' => $firstGoal->currency ?? 'BYN',
                'target_date' => $firstGoal->target_date->format('Y-m-d'),
                'current_amount' => $goalsData[0]['current_amount'] ?? 0,
                'is_active' => true,
            ] : null,
            'progress_percent' => $progressPercent,
            'days_remaining' => $daysRemaining,
            'monthly_target' => $monthlyTarget,
        ];
    }

    protected function getUsdRate(int $clientId): float
    {
        return $this->getRates($clientId)['USD'];
    }

    protected function getRates(int $clientId): array
    {
        $rows = \Illuminate\Support\Facades\DB::table('settings')
            ->where('client_id', $clientId)
            ->whereIn('key', ['usd_rate', 'eur_rate', 'rub_rate'])
            ->get()
            ->keyBy('key');

        return [
            'BYN' => 1,
            'USD' => $rows->get('usd_rate') ? (float) $rows->get('usd_rate')->value : 3.25,
            'EUR' => $rows->get('eur_rate') ? (float) $rows->get('eur_rate')->value : 3.55,
            'RUB' => $rows->get('rub_rate') ? (float) $rows->get('rub_rate')->value : 0.034,
        ];
    }

    protected function convertToCurrency(float $amount, string $from, string $to, array $rates): float
    {
        if ($from === $to) {
            return $amount;
        }
        $fromRate = $rates[$from] ?? 1;
        $toRate = $rates[$to] ?? 1;
        if ($fromRate <= 0 || $toRate <= 0) {
            return $amount;
        }

        return round(($amount * $fromRate) / $toRate, 2);
    }

    protected function formatTransaction($t): array
    {
        return [
            'id' => $t->id,
            'date' => $t->date->format('Y-m-d'),
            'amount' => (float) $t->amount,
            'type' => $t->type,
            'description' => $t->description ?? '',
            'category_name' => $t->category ? $t->category->name : '',
            'category_icon' => $t->category ? ($t->category->icon ?? '📦') : '',
            'created_at' => $t->created_at ? $t->created_at->format('Y-m-d H:i:s') : null,
        ];
    }
}
