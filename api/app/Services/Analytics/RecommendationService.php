<?php

namespace App\Services\Analytics;

use App\Repositories\TransactionRepositoryInterface;
use Illuminate\Support\Facades\DB;

class RecommendationService
{
    public function __construct(
        protected TransactionRepositoryInterface $txRepo
    ) {}

    public function getRecommendations(int $clientId): array
    {
        $month = now()->format('Y-m');
        $lastMonth = now()->subMonth()->format('Y-m');
        $twoMonthsAgo = now()->subMonths(2)->format('Y-m');

        $thisMonthExpenses = $this->txRepo->getExpensesForMonth($clientId, $month);
        $lastMonthExpenses = $this->txRepo->getExpensesForMonth($clientId, $lastMonth);

        $recommendations = [];

        if ($lastMonthExpenses > 0 && $thisMonthExpenses > $lastMonthExpenses * 1.2) {
            $recommendations[] = [
                'type' => 'spending_increase',
                'message' => 'Расходы в этом месяце выросли более чем на 20% по сравнению с прошлым.',
                'suggestion' => 'Проверьте категории с наибольшим ростом.',
            ];
        }

        $byCategory = $this->getSpendingByCategory($clientId, $month);
        $topCategory = $byCategory->first();
        if ($topCategory && (float) $topCategory->total > $thisMonthExpenses * 0.5) {
            $recommendations[] = [
                'type' => 'category_concentration',
                'message' => "Более 50% расходов — в категории «{$topCategory->name}».",
                'suggestion' => 'Рассмотрите оптимизацию расходов в этой категории.',
            ];
        }

        $savings = $this->txRepo->getSavingsForMonth($clientId, $month);
        $income = $this->txRepo->getIncomeForMonth($clientId, $month);
        if ($income > 0 && ($savings / $income) < 0.1) {
            $recommendations[] = [
                'type' => 'low_savings',
                'message' => 'Менее 10% дохода откладывается.',
                'suggestion' => 'Попробуйте откладывать хотя бы 10% дохода.',
            ];
        }

        // Новые проверки
        $this->checkGoalProgress($clientId, $recommendations);
        $this->checkBudgetTrend($clientId, $month, $lastMonth, $twoMonthsAgo, $recommendations);
        $this->checkUnusedSubscriptions($clientId, $recommendations);
        $this->checkDebtToIncome($clientId, $income, $recommendations);
        $this->checkDebtPayoffStrategy($clientId, $recommendations);

        return $recommendations;
    }

    protected function checkGoalProgress(int $clientId, array &$recommendations): void
    {
        $goals = DB::table('goals')
            ->where('client_id', $clientId)
            ->where('is_active', true)
            ->where('target_date', '>', now())
            ->get();

        foreach ($goals as $goal) {
            $daysLeft = now()->diffInDays($goal->target_date, false);
            if ($daysLeft <= 0) {
                continue;
            }

            $current = (float) $goal->current_amount;
            $target = (float) $goal->target_amount;
            $progress = $target > 0 ? ($current / $target) : 0;

            $expectedProgress = 1 - ($daysLeft / now()->diffInDays($goal->created_at ?? now()->subYear(), false));

            if ($progress < $expectedProgress * 0.7) {
                $monthsLeft = max(1, $daysLeft / 30);
                $needed = ($target - $current) / $monthsLeft;
                $recommendations[] = [
                    'type' => 'goal_behind_schedule',
                    'message' => "Цель «{$goal->name}» отстаёт от графика.",
                    'suggestion' => sprintf('Откладывайте %.2f Br/мес для достижения цели.', $needed),
                ];
            }
        }
    }

    protected function checkBudgetTrend(int $clientId, string $month, string $lastMonth, string $twoMonthsAgo, array &$recommendations): void
    {
        $budgets = DB::table('category_budgets')
            ->where('client_id', $clientId)
            ->whereIn('month', [$month, $lastMonth, $twoMonthsAgo])
            ->get()
            ->groupBy('category_id');

        foreach ($budgets as $categoryId => $categoryBudgets) {
            $exceededCount = 0;
            foreach ($categoryBudgets as $b) {
                $spent = (float) DB::table('transactions')
                    ->where('client_id', $clientId)
                    ->where('category_id', $categoryId)
                    ->where('month', $b->month)
                    ->where('type', 'expense')
                    ->sum(DB::raw('ABS(amount)'));

                if ($spent > (float) $b->limit_amount) {
                    $exceededCount++;
                }
            }

            if ($exceededCount >= 2) {
                $categoryName = DB::table('categories')->where('id', $categoryId)->value('name') ?? 'Категория';
                $recommendations[] = [
                    'type' => 'budget_consistently_exceeded',
                    'message' => "Лимит по «{$categoryName}» превышается регулярно.",
                    'suggestion' => 'Пересмотрите бюджет или сократите расходы в этой категории.',
                ];
            }
        }
    }

    protected function checkUnusedSubscriptions(int $clientId, array &$recommendations): void
    {
        $subscriptions = DB::table('recurring_payments')
            ->where('client_id', $clientId)
            ->where('is_active', true)
            ->where('is_subscription', true)
            ->get();

        foreach ($subscriptions as $sub) {
            $lastUsed = DB::table('transactions')
                ->where('client_id', $clientId)
                ->where('recurring_payment_id', $sub->id)
                ->max('date');

            if ($lastUsed && now()->diffInMonths($lastUsed) >= 3) {
                $recommendations[] = [
                    'type' => 'unused_subscription',
                    'message' => "Подписка «{$sub->name}» не использовалась 3+ месяца.",
                    'suggestion' => 'Рассмотрите возможность отмены.',
                ];
            }
        }
    }

    protected function checkDebtToIncome(int $clientId, float $income, array &$recommendations): void
    {
        if ($income <= 0) {
            return;
        }

        $totalMonthlyDebt = (float) DB::table('debts')
            ->where('client_id', $clientId)
            ->where('is_active', true)
            ->sum('monthly_payment');

        $ratio = $totalMonthlyDebt / $income;

        if ($ratio > 0.5) {
            $recommendations[] = [
                'type' => 'debt_critical',
                'message' => sprintf('Долговая нагрузка критична: %.0f%% дохода уходит на долги.', $ratio * 100),
                'suggestion' => 'Рассмотрите рефинансирование или досрочное погашение самых дорогих долгов.',
            ];
        } elseif ($ratio > 0.3) {
            $recommendations[] = [
                'type' => 'debt_high',
                'message' => sprintf('Высокая долговая нагрузка: %.0f%% дохода уходит на долги.', $ratio * 100),
                'suggestion' => 'Старайтесь не превышать 30% дохода на обслуживание долгов.',
            ];
        }
    }

    protected function checkDebtPayoffStrategy(int $clientId, array &$recommendations): void
    {
        $debts = DB::table('debts')
            ->where('client_id', $clientId)
            ->where('is_active', true)
            ->whereRaw('total_amount > paid_amount')
            ->orderBy(DB::raw('total_amount - paid_amount'))
            ->get();

        if ($debts->count() < 2) {
            return;
        }

        // Snowball strategy: suggest paying off smallest debt first
        $smallest = $debts->first();
        $remaining = (float) $smallest->total_amount - (float) $smallest->paid_amount;

        if ($remaining <= 500) {
            $recommendations[] = [
                'type' => 'debt_snowball',
                'message' => "Долг «{$smallest->name}» почти погашен (осталось ".number_format($remaining, 2, '.', ' ').' Br).',
                'suggestion' => 'Погасите его полностью — это ускорит выплату остальных долгов (метод снежного кома).',
            ];
        }

        // Warn about debts nearing due date
        foreach ($debts as $debt) {
            if ($debt->due_date && now()->diffInDays($debt->due_date, false) <= 30 && now()->diffInDays($debt->due_date, false) > 0) {
                $rem = (float) $debt->total_amount - (float) $debt->paid_amount;
                $recommendations[] = [
                    'type' => 'debt_due_soon',
                    'message' => "Срок по долгу «{$debt->name}» истекает через ".now()->diffInDays($debt->due_date).' дней.',
                    'suggestion' => sprintf('Осталось погасить %.2f Br.', $rem),
                ];
            }
        }
    }

    protected function getSpendingByCategory(int $clientId, string $month)
    {
        return DB::table('transactions')
            ->join('categories', 'transactions.category_id', '=', 'categories.id')
            ->where('transactions.client_id', $clientId)
            ->where('transactions.month', $month)
            ->where('transactions.type', 'expense')
            ->select('categories.name', DB::raw('SUM(ABS(transactions.amount)) as total'))
            ->groupBy('categories.id', 'categories.name')
            ->orderByDesc('total')
            ->limit(5)
            ->get();
    }
}
