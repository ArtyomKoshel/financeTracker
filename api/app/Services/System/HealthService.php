<?php

namespace App\Services\System;

use App\DTOs\HealthData;
use App\Models\CategoryBudget;
use App\Models\Goal;
use App\Models\Transaction;
use App\Repositories\TransactionRepositoryInterface;
use App\Services\Accounts\AccountService;
use Illuminate\Support\Facades\DB;

class HealthService
{
    public function __construct(
        protected TransactionRepositoryInterface $transactionRepository,
        protected AccountService $accountService
    ) {}

    public function calculateHealth(int $clientId): HealthData
    {
        $currentMonth = now()->format('Y-m');
        $prevMonth = now()->subMonth()->format('Y-m');
        $prevPrevMonth = now()->subMonths(2)->format('Y-m');

        $balance = $this->accountService->getTotalBalance($clientId);

        $current = $this->getMonthTotals($clientId, $currentMonth);
        $prev = $this->getMonthTotals($clientId, $prevMonth);
        $prevPrev = $this->getMonthTotals($clientId, $prevPrevMonth);

        $usdRate = $this->getUsdRate($clientId);

        $health = new HealthData(predicted_end_of_month: $balance);

        $refIncome = $current['income'] > 0 ? $current['income'] : $prev['income'];
        $refExpenses = $current['expenses'] > 0 ? $current['expenses'] : $prev['expenses'];
        $refSavings = $current['savings'] > 0 ? $current['savings'] : $prev['savings'];

        if ($refIncome > 0) {
            $health->savings_rate = ($refSavings / $refIncome) * 100;
            $health->expense_to_income = ($refExpenses / $refIncome) * 100;
        }

        $totalHistoricalExpenses = $prev['expenses'] + $prevPrev['expenses'];
        $avgDailyExpenses = $totalHistoricalExpenses / 60;
        $health->burn_rate = $avgDailyExpenses;
        $health->daily_spending_avg = $avgDailyExpenses;

        if ($avgDailyExpenses > 0) {
            $health->emergency_fund_days = (int) ($balance / $avgDailyExpenses);
            $health->days_until_zero = $health->emergency_fund_days;
        }

        if ($prevPrev['expenses'] > 0) {
            $health->expense_growth = (($prev['expenses'] - $prevPrev['expenses']) / $prevPrev['expenses']) * 100;
        }
        if ($prev['income'] > 0 && $current['income'] > 0) {
            $health->income_growth = (($current['income'] - $prev['income']) / $prev['income']) * 100;
        }
        if ($prev['savings'] > 0 && $refSavings > 0) {
            $health->savings_growth = (($refSavings - $prev['savings']) / $prev['savings']) * 100;
        }

        $goals = Goal::withoutGlobalScope('client')->where('client_id', $clientId)->where('is_active', true)->get();
        $activeGoalIds = $goals->pluck('id')->all();
        $totalSavings = $this->transactionRepository->getTotalSavings($clientId);
        $cushionSavings = $this->transactionRepository->getTotalSavingsActiveGoalsOnly($clientId, $activeGoalIds);

        $health->total_savings = $totalSavings;
        $health->total_savings_usd = $usdRate > 0 ? $totalSavings / $usdRate : 0;
        if ($avgDailyExpenses > 0) {
            $health->savings_days = (int) ($cushionSavings / $avgDailyExpenses);
        }

        if ($goals->isNotEmpty()) {
            $rates = $this->getRates($clientId);
            $totalTargetBYN = 0;
            foreach ($goals as $g) {
                $target = (float) $g->target_amount;
                $currency = $g->currency ?? 'BYN';
                $targetBYN = $this->convertToBYN($target, $currency, $rates);
                $totalTargetBYN += $targetBYN;
            }
            $health->goal_name = $goals->count() > 1
                ? $goals->pluck('name')->implode(', ')
                : $goals->first()->name;
            if ($totalTargetBYN > 0) {
                $health->goal_progress = ($health->total_savings / $totalTargetBYN) * 100;
            }
            if ($goals->count() === 1) {
                $firstGoal = $goals->first();
                $savedForGoal = $this->transactionRepository->getTotalSavingsForGoal($clientId, $firstGoal->id);
                $currency = $firstGoal->currency ?? 'BYN';
                $savedInGoalCurrency = $currency === 'BYN'
                    ? $savedForGoal
                    : round($savedForGoal / ($rates[$currency] ?? 1), 2);
                $target = (float) $firstGoal->target_amount;
                $health->first_goal_savings = $savedForGoal;
                $health->first_goal_savings_usd = $usdRate > 0 ? $savedForGoal / $usdRate : 0;
                $health->first_goal_progress = $target > 0 ? ($savedInGoalCurrency / $target) * 100 : 0;
            }
        }

        $overBudget = $this->getOverBudgetCategories($clientId, $currentMonth);
        $health->over_budget_count = count($overBudget);
        $health->over_budget_list = $overBudget;

        $daysLeft = (int) now()->diffInDays(now()->copy()->endOfMonth(), false) + 1;
        $health->predicted_end_of_month = $balance - ($avgDailyExpenses * $daysLeft);

        $totalDebt = (float) DB::table('debts')
            ->where('client_id', $clientId)
            ->sum(DB::raw('total_amount - paid_amount'));
        $health->total_debt = $totalDebt;

        if ($refIncome > 0) {
            $health->debt_to_income = ($totalDebt / $refIncome) * 100;
        }

        $health->net_worth = $balance + $health->total_savings - $totalDebt;

        [$health->health_score, $health->status, $health->message] = $this->calculateScore($health);

        return $health;
    }

    protected function getMonthTotals(int $clientId, string $month): array
    {
        $income = $this->transactionRepository->getIncomeForMonth($clientId, $month);
        $expenses = $this->transactionRepository->getExpensesForMonth($clientId, $month);
        $savings = $this->transactionRepository->getSavingsForMonth($clientId, $month);

        return ['income' => $income, 'expenses' => $expenses, 'savings' => $savings];
    }

    protected function getUsdRate(int $clientId): float
    {
        return $this->getRates($clientId)['USD'];
    }

    protected function getRates(int $clientId): array
    {
        $rows = DB::table('settings')
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

    protected function convertToBYN(float $amount, string $currency, array $rates): float
    {
        if ($currency === 'BYN') {
            return $amount;
        }
        $rate = $rates[$currency] ?? 1;

        return $rate > 0 ? $amount * $rate : 0;
    }

    protected function getOverBudgetCategories(int $clientId, string $month): array
    {
        $budgets = CategoryBudget::withoutGlobalScope('client')
            ->with('category')
            ->where('client_id', $clientId)
            ->where('month', $month)
            ->get();

        $result = [];
        foreach ($budgets as $b) {
            $spent = (float) Transaction::withoutGlobalScope('client')
                ->where('client_id', $clientId)
                ->where('month', $month)
                ->where('category_id', $b->category_id)
                ->where('type', 'expense')
                ->sum(DB::raw('ABS(amount)'));
            if ($b->limit_amount > 0 && $spent > $b->limit_amount) {
                $overAmount = $spent - $b->limit_amount;
                $overPercent = ($overAmount / $b->limit_amount) * 100;
                $result[] = [
                    'category_name' => $b->category->name ?? 'Категория',
                    'budget_amount' => (float) $b->limit_amount,
                    'spent_amount' => $spent,
                    'over_amount' => $overAmount,
                    'over_percent' => $overPercent,
                ];
            }
        }

        return $result;
    }

    protected function calculateScore(HealthData $h): array
    {
        $score = 50;
        if ($h->savings_rate >= 20) {
            $score += 15;
        } elseif ($h->savings_rate >= 10) {
            $score += 5;
        } elseif ($h->savings_rate >= 0) {
            $score -= 5;
        } else {
            $score -= 15;
        }

        if ($h->expense_to_income <= 70) {
            $score += 10;
        } elseif ($h->expense_to_income <= 85) {
            $score += 5;
        } elseif ($h->expense_to_income <= 95) {
            $score -= 5;
        } else {
            $score -= 15;
        }

        if ($h->emergency_fund_days >= 90) {
            $score += 15;
        } elseif ($h->emergency_fund_days >= 30) {
            $score += 5;
        } elseif ($h->emergency_fund_days >= 14) {
            $score -= 5;
        } else {
            $score -= 15;
        }

        if ($h->expense_growth <= 0) {
            $score += 5;
        } elseif ($h->expense_growth <= 15) {
            $score += 0;
        } else {
            $score -= 10;
        }

        if ($h->goal_progress >= 100) {
            $score += 10;
        }

        if ($h->debt_to_income >= 50) {
            $score -= 20;
        } elseif ($h->debt_to_income >= 30) {
            $score -= 10;
        }

        if ($h->net_worth > 0) {
            $score += 5;
        }

        $score = max(0, min(100, $score));

        $message = $h->goal_progress >= 100 ? ' Цель накоплений достигнута!' : '';

        if ($score >= 80) {
            return [$score, 'excellent', 'Финансовое здоровье отличное.'.$message];
        }
        if ($score >= 60) {
            return [$score, 'good', 'Финансовое здоровье хорошее.'.$message];
        }
        if ($score >= 40) {
            return [$score, 'warning', 'Есть возможности для улучшения.'.$message];
        }

        return [$score, 'critical', 'Требуется внимание к финансам.'.$message];
    }
}
