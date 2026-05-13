<?php

namespace App\Services\Analytics;

use App\Models\Category;
use App\Models\Transaction;
use App\Repositories\TransactionRepositoryInterface;
use Illuminate\Support\Facades\DB;

class AnalyticsService
{
    protected TransactionRepositoryInterface $transactionRepository;

    public function __construct(TransactionRepositoryInterface $transactionRepository)
    {
        $this->transactionRepository = $transactionRepository;
    }

    public function getAnalytics(int $clientId, string $month): array
    {
        $income = $this->transactionRepository->getIncomeForMonth($clientId, $month);
        $expenses = $this->transactionRepository->getExpensesForMonth($clientId, $month);
        $savings = $this->transactionRepository->getSavingsForMonth($clientId, $month);
        $byCategory = $this->getExpensesByCategory($clientId, $month);
        $monthlyTrend = $this->getMonthlyTrend($clientId, 6);
        $anomalies = $this->detectAnomalies($clientId, $month);
        $insights = $this->generateInsights($clientId, $month, $monthlyTrend);

        return [
            'total_income' => $income,
            'total_expenses' => $expenses,
            'total_savings' => $savings,
            'by_category' => $byCategory,
            'monthly_trend' => $monthlyTrend,
            'anomalies' => $anomalies,
            'insights' => $insights,
        ];
    }

    public function getExpensesByCategory(int $clientId, string $month): array
    {
        $rows = Transaction::withoutGlobalScope('client')
            ->leftJoin('categories', 'transactions.category_id', '=', 'categories.id')
            ->where('transactions.client_id', $clientId)
            ->where('transactions.month', $month)
            ->where('transactions.type', 'expense')
            ->selectRaw('
                COALESCE(categories.id, 0) as category_id,
                COALESCE(categories.name, ?) as category_name,
                COALESCE(categories.icon, ?) as icon,
                COALESCE(categories.color, ?) as color,
                SUM(ABS(transactions.amount)) as total
            ', ['Без категории', '📦', '#808080'])
            ->groupBy('categories.id', 'categories.name', 'categories.icon', 'categories.color')
            ->orderByDesc('total')
            ->get();

        $totalAll = $rows->sum('total');
        $result = [];
        foreach ($rows as $r) {
            $percent = $totalAll > 0 ? ($r->total / $totalAll) * 100 : 0;
            $result[] = [
                'category_id' => (int) $r->category_id,
                'category_name' => $r->category_name,
                'icon' => $r->icon,
                'color' => $r->color,
                'amount' => (float) $r->total,
                'percent' => (float) $percent,
            ];
        }

        return $result;
    }

    public function getYearlyAnalytics(int $clientId, int $year): array
    {
        $yearStr = (string) $year;
        $income = (float) Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('month', 'like', $yearStr.'-%')
            ->whereNotIn('type', ['expense', 'savings', 'correction'])
            ->sum('amount');
        $expenses = (float) Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('month', 'like', $yearStr.'-%')
            ->where('type', 'expense')
            ->sum(DB::raw('ABS(amount)'));
        $savings = (float) Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('month', 'like', $yearStr.'-%')
            ->where('type', 'savings')
            ->sum('amount');

        $byCategory = $this->getYearlyExpensesByCategory($clientId, $yearStr);
        $monthlyData = $this->getYearlyMonthlyData($clientId, $yearStr);

        $monthCount = count($monthlyData);
        $avgIncome = $monthCount > 0 ? $income / $monthCount : 0;
        $avgExpenses = $monthCount > 0 ? $expenses / $monthCount : 0;

        return [
            'year' => $year,
            'total_income' => $income,
            'total_expenses' => $expenses,
            'total_savings' => $savings,
            'avg_monthly_income' => $avgIncome,
            'avg_monthly_expenses' => $avgExpenses,
            'by_category' => $byCategory,
            'monthly_data' => $monthlyData,
        ];
    }

    protected function getYearlyExpensesByCategory(int $clientId, string $yearStr): array
    {
        $rows = Transaction::withoutGlobalScope('client')
            ->leftJoin('categories', 'transactions.category_id', '=', 'categories.id')
            ->where('transactions.client_id', $clientId)
            ->where('transactions.month', 'like', $yearStr.'-%')
            ->where('transactions.type', 'expense')
            ->selectRaw('
                COALESCE(categories.id, 0) as category_id,
                COALESCE(categories.name, ?) as category_name,
                COALESCE(categories.icon, ?) as icon,
                COALESCE(categories.color, ?) as color,
                SUM(ABS(transactions.amount)) as total
            ', ['Без категории', '📦', '#808080'])
            ->groupBy('categories.id', 'categories.name', 'categories.icon', 'categories.color')
            ->orderByDesc('total')
            ->get();

        $totalAll = $rows->sum('total');
        $result = [];
        foreach ($rows as $r) {
            $percent = $totalAll > 0 ? ($r->total / $totalAll) * 100 : 0;
            $result[] = [
                'category_id' => (int) $r->category_id,
                'category_name' => $r->category_name,
                'icon' => $r->icon,
                'color' => $r->color,
                'amount' => (float) $r->total,
                'percent' => (float) $percent,
            ];
        }

        return $result;
    }

    protected function getYearlyMonthlyData(int $clientId, string $yearStr): array
    {
        $rows = Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('month', 'like', $yearStr.'-%')
            ->selectRaw("
                month,
                COALESCE(SUM(CASE WHEN type NOT IN ('expense', 'savings', 'correction') THEN amount ELSE 0 END), 0) as total_income,
                COALESCE(SUM(CASE WHEN type IN ('bonus', 'year_bonus') THEN amount ELSE 0 END), 0) as total_bonus,
                COALESCE(SUM(CASE WHEN type = 'savings' THEN amount ELSE 0 END), 0) as total_saved,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0) as expenses
            ")
            ->groupBy('month')
            ->orderBy('month')
            ->get();

        return $rows->map(function ($r) {
            return [
                'month' => $r->month,
                'total_income' => (float) $r->total_income,
                'total_bonus' => (float) $r->total_bonus,
                'total_saved' => (float) $r->total_saved,
                'expenses' => (float) $r->expenses,
            ];
        })->values()->all();
    }

    public function compareMonths(int $clientId, string $month1, string $month2): array
    {
        $income1 = $this->transactionRepository->getIncomeForMonth($clientId, $month1);
        $income2 = $this->transactionRepository->getIncomeForMonth($clientId, $month2);
        $expenses1 = $this->transactionRepository->getExpensesForMonth($clientId, $month1);
        $expenses2 = $this->transactionRepository->getExpensesForMonth($clientId, $month2);

        $categories = $this->getCategoryComparison($clientId, $month1, $month2);

        $plannedMonth1 = 0;
        $plannedMonth2 = 0;
        $otherMonth1 = 0;
        $otherMonth2 = 0;
        foreach ($categories as $c) {
            if ($c['is_planned']) {
                $plannedMonth1 += $c['month1_amount'];
                $plannedMonth2 += $c['month2_amount'];
            } else {
                $otherMonth1 += $c['month1_amount'];
                $otherMonth2 += $c['month2_amount'];
            }
        }

        return [
            'month1' => $month1,
            'month2' => $month2,
            'income_diff' => $income2 - $income1,
            'expenses_diff' => $expenses2 - $expenses1,
            'categories' => $categories,
            'planned_month1' => $plannedMonth1,
            'planned_month2' => $plannedMonth2,
            'planned_diff' => $plannedMonth2 - $plannedMonth1,
            'other_month1' => $otherMonth1,
            'other_month2' => $otherMonth2,
            'other_diff' => $otherMonth2 - $otherMonth1,
        ];
    }

    protected function getCategoryComparison(int $clientId, string $month1, string $month2): array
    {
        $tx1 = Transaction::withoutGlobalScope('client')
            ->leftJoin('categories', 'transactions.category_id', '=', 'categories.id')
            ->where('transactions.client_id', $clientId)
            ->where('transactions.month', $month1)
            ->where('transactions.type', 'expense')
            ->selectRaw('
                COALESCE(categories.id, 0) as category_id,
                COALESCE(categories.name, ?) as category_name,
                COALESCE(categories.icon, ?) as category_icon,
                SUM(ABS(transactions.amount)) as total,
                MAX(CASE WHEN transactions.recurring_payment_id IS NOT NULL THEN 1 ELSE 0 END) as is_planned
            ', ['Без категории', '📦'])
            ->groupBy('categories.id', 'categories.name', 'categories.icon')
            ->get()
            ->keyBy('category_id');

        $tx2 = Transaction::withoutGlobalScope('client')
            ->leftJoin('categories', 'transactions.category_id', '=', 'categories.id')
            ->where('transactions.client_id', $clientId)
            ->where('transactions.month', $month2)
            ->where('transactions.type', 'expense')
            ->selectRaw('
                COALESCE(categories.id, 0) as category_id,
                COALESCE(categories.name, ?) as category_name,
                COALESCE(categories.icon, ?) as category_icon,
                SUM(ABS(transactions.amount)) as total,
                MAX(CASE WHEN transactions.recurring_payment_id IS NOT NULL THEN 1 ELSE 0 END) as is_planned
            ', ['Без категории', '📦'])
            ->groupBy('categories.id', 'categories.name', 'categories.icon')
            ->get()
            ->keyBy('category_id');

        $allIds = $tx1->keys()->merge($tx2->keys())->unique();
        $result = [];
        foreach ($allIds as $catId) {
            $m1 = $tx1->get($catId);
            $m2 = $tx2->get($catId);
            $amount1 = $m1 ? (float) $m1->total : 0;
            $amount2 = $m2 ? (float) $m2->total : 0;
            $name = $m1 ? $m1->category_name : ($m2 ? $m2->category_name : 'Без категории');
            $icon = $m1 ? $m1->category_icon : ($m2 ? $m2->category_icon : '📦');
            $isPlanned = ($m1 && $m1->is_planned) || ($m2 && $m2->is_planned);

            $diff = $amount2 - $amount1;
            $percentChange = $amount1 > 0 ? ($diff / $amount1) * 100 : ($amount2 > 0 ? 100 : 0);

            $result[] = [
                'category_id' => (int) $catId,
                'category_name' => $name,
                'category_icon' => $icon,
                'month1_amount' => $amount1,
                'month2_amount' => $amount2,
                'difference' => $diff,
                'percent_change' => (float) $percentChange,
                'is_planned' => (bool) $isPlanned,
            ];
        }

        usort($result, function ($a, $b) {
            $sumA = $a['month1_amount'] + $a['month2_amount'];
            $sumB = $b['month1_amount'] + $b['month2_amount'];

            return $sumB <=> $sumA;
        });

        return $result;
    }

    public function getCategoryTrend(int $clientId, int $categoryId, int $months): array
    {
        $category = $categoryId > 0
            ? Category::withoutGlobalScope('client')->where('client_id', $clientId)->find($categoryId)
            : null;
        $name = $category ? $category->name : 'Без категории';
        $icon = $category ? ($category->icon ?? '📦') : '📦';

        $cutoff = now()->subMonths($months)->format('Y-m');
        $rows = Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('category_id', $categoryId)
            ->where('type', 'expense')
            ->where('month', '>=', $cutoff)
            ->selectRaw('month, SUM(ABS(amount)) as total')
            ->groupBy('month')
            ->orderBy('month')
            ->get();

        $monthlyData = $rows->map(function ($r) {
            return ['month' => $r->month, 'amount' => (float) $r->total];
        })->values()->all();

        $amounts = $rows->pluck('total')->map(function ($v) {
            return (float) $v;
        })->all();
        $avg = count($amounts) > 0 ? array_sum($amounts) / count($amounts) : 0;
        $min = count($amounts) > 0 ? min($amounts) : 0;
        $max = count($amounts) > 0 ? max($amounts) : 0;

        return [
            'category_id' => $categoryId,
            'category_name' => $name,
            'category_icon' => $icon,
            'monthly_data' => $monthlyData,
            'average' => $avg,
            'min' => $min,
            'max' => $max,
        ];
    }

    protected function getMonthlyTrend(int $clientId, int $months): array
    {
        $cutoff = now()->subMonths($months)->format('Y-m');
        $rows = Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('month', '>=', $cutoff)
            ->selectRaw("
                month,
                COALESCE(SUM(CASE WHEN type NOT IN ('expense', 'savings', 'correction') THEN amount ELSE 0 END), 0) as total_income,
                COALESCE(SUM(CASE WHEN type IN ('bonus', 'year_bonus') THEN amount ELSE 0 END), 0) as total_bonus,
                COALESCE(SUM(CASE WHEN type = 'savings' THEN amount ELSE 0 END), 0) as total_saved,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0) as expenses
            ")
            ->groupBy('month')
            ->orderByDesc('month')
            ->limit($months)
            ->get();

        return $rows->map(function ($r) {
            return [
                'month' => $r->month,
                'total_income' => (float) $r->total_income,
                'total_bonus' => (float) $r->total_bonus,
                'total_saved' => (float) $r->total_saved,
                'expenses' => (float) $r->expenses,
            ];
        })->values()->all();
    }

    /**
     * Обнаружение аномалий в тратах за месяц
     */
    protected function detectAnomalies(int $clientId, string $month): array
    {
        $currentExpenses = $this->transactionRepository->getExpensesForMonth($clientId, $month);

        // Берём данные за последние 6 месяцев (исключая текущий)
        $historicalExpenses = [];
        for ($i = 1; $i <= 6; $i++) {
            $m = now()->subMonths($i)->format('Y-m');
            $historicalExpenses[] = $this->transactionRepository->getExpensesForMonth($clientId, $m);
        }

        if (empty($historicalExpenses)) {
            return [];
        }

        $avgExpenses = array_sum($historicalExpenses) / count($historicalExpenses);
        $stdDev = $this->calculateStdDev($historicalExpenses, $avgExpenses);

        $anomalies = [];

        // Детекция общего уровня трат
        if ($stdDev > 0 && abs($currentExpenses - $avgExpenses) > 2 * $stdDev) {
            $anomalies[] = [
                'type' => 'total_expenses',
                'severity' => 'high',
                'message' => $currentExpenses > $avgExpenses
                    ? 'Расходы значительно выше обычного (аномалия)'
                    : 'Расходы значительно ниже обычного',
                'current_value' => $currentExpenses,
                'expected_value' => $avgExpenses,
                'deviation_percent' => (($currentExpenses - $avgExpenses) / $avgExpenses) * 100,
            ];
        }

        // Детекция аномалий по категориям
        $byCategory = $this->getExpensesByCategory($clientId, $month);
        foreach ($byCategory as $cat) {
            if ($cat['category_id'] === 0) {
                continue;
            } // Пропускаем "Без категории"

            $categoryHistorical = [];
            for ($i = 1; $i <= 6; $i++) {
                $m = now()->subMonths($i)->format('Y-m');
                $catExpenses = $this->getCategoryExpenses($clientId, $cat['category_id'], $m);
                if ($catExpenses > 0) {
                    $categoryHistorical[] = $catExpenses;
                }
            }

            if (count($categoryHistorical) >= 3) {
                $catAvg = array_sum($categoryHistorical) / count($categoryHistorical);
                $catStdDev = $this->calculateStdDev($categoryHistorical, $catAvg);

                if ($catStdDev > 0 && abs($cat['amount'] - $catAvg) > 2 * $catStdDev) {
                    $anomalies[] = [
                        'type' => 'category_expense',
                        'category_name' => $cat['category_name'],
                        'category_icon' => $cat['icon'],
                        'severity' => 'medium',
                        'message' => sprintf(
                            'Траты по категории «%s» аномально %s',
                            $cat['category_name'],
                            $cat['amount'] > $catAvg ? 'высокие' : 'низкие'
                        ),
                        'current_value' => $cat['amount'],
                        'expected_value' => $catAvg,
                        'deviation_percent' => (($cat['amount'] - $catAvg) / $catAvg) * 100,
                    ];
                }
            }
        }

        return $anomalies;
    }

    /**
     * Генерация инсайтов на основе трендов
     */
    protected function generateInsights(int $clientId, string $month, array $monthlyTrend): array
    {
        $insights = [];

        if (count($monthlyTrend) < 3) {
            return $insights;
        }

        // Анализ тренда расходов
        $expensesTrend = array_map(fn ($m) => $m['expenses'], $monthlyTrend);
        $trend = $this->calculateTrend($expensesTrend);

        if ($trend === 'increasing') {
            $insights[] = [
                'type' => 'trend',
                'icon' => '📈',
                'message' => 'Расходы растут последние месяцы',
                'recommendation' => 'Проверьте категории с наибольшим ростом',
            ];
        } elseif ($trend === 'decreasing') {
            $insights[] = [
                'type' => 'trend',
                'icon' => '📉',
                'message' => 'Расходы снижаются — отличная динамика!',
                'recommendation' => 'Продолжайте оптимизировать траты',
            ];
        }

        // Анализ savings rate
        $savingsTrend = array_map(fn ($m) => $m['total_saved'], $monthlyTrend);
        $avgSavings = array_sum($savingsTrend) / count($savingsTrend);
        $currentSavings = $savingsTrend[0] ?? 0;

        if ($currentSavings > $avgSavings * 1.5) {
            $insights[] = [
                'type' => 'positive',
                'icon' => '💰',
                'message' => 'Накопления выше среднего — отличный результат!',
                'recommendation' => null,
            ];
        }

        // Анализ вариативности доходов
        $incomeTrend = array_map(fn ($m) => $m['total_income'], $monthlyTrend);
        $avgIncome = array_sum($incomeTrend) / count($incomeTrend);
        $incomeStdDev = $this->calculateStdDev($incomeTrend, $avgIncome);

        if ($avgIncome > 0 && ($incomeStdDev / $avgIncome) > 0.2) {
            $insights[] = [
                'type' => 'warning',
                'icon' => '⚠️',
                'message' => 'Доход сильно варьируется от месяца к месяцу',
                'recommendation' => 'Создайте финансовую подушку на 3-6 месяцев',
            ];
        }

        return $insights;
    }

    /**
     * Расчёт стандартного отклонения
     */
    protected function calculateStdDev(array $values, float $mean): float
    {
        if (count($values) < 2) {
            return 0;
        }

        $variance = 0;
        foreach ($values as $v) {
            $variance += pow($v - $mean, 2);
        }
        $variance /= count($values);

        return sqrt($variance);
    }

    /**
     * Определение тренда (возрастающий/убывающий/стабильный)
     */
    protected function calculateTrend(array $values): string
    {
        if (count($values) < 3) {
            return 'stable';
        }

        // Простой линейный тренд через сравнение первой и последней половины
        $midpoint = (int) floor(count($values) / 2);
        $firstHalf = array_slice($values, 0, $midpoint);
        $secondHalf = array_slice($values, $midpoint);

        $avgFirst = array_sum($firstHalf) / count($firstHalf);
        $avgSecond = array_sum($secondHalf) / count($secondHalf);

        $change = ($avgSecond - $avgFirst) / max($avgFirst, 1);

        if ($change > 0.1) {
            return 'increasing';
        } elseif ($change < -0.1) {
            return 'decreasing';
        }

        return 'stable';
    }

    /**
     * Year-over-Year comparison: this month vs same month last year
     */
    public function getYearOverYear(int $clientId, string $month): array
    {
        $parts = explode('-', $month);
        $lastYearMonth = ((int) $parts[0] - 1).'-'.$parts[1];

        $incomeThis = $this->transactionRepository->getIncomeForMonth($clientId, $month);
        $incomeLast = $this->transactionRepository->getIncomeForMonth($clientId, $lastYearMonth);
        $expensesThis = $this->transactionRepository->getExpensesForMonth($clientId, $month);
        $expensesLast = $this->transactionRepository->getExpensesForMonth($clientId, $lastYearMonth);
        $savingsThis = $this->transactionRepository->getSavingsForMonth($clientId, $month);
        $savingsLast = $this->transactionRepository->getSavingsForMonth($clientId, $lastYearMonth);

        $pctChange = fn (float $current, float $previous) => $previous > 0 ? round((($current - $previous) / $previous) * 100, 1) : ($current > 0 ? 100 : 0);

        return [
            'current_month' => $month,
            'previous_year_month' => $lastYearMonth,
            'income' => [
                'current' => $incomeThis,
                'previous' => $incomeLast,
                'change_percent' => $pctChange($incomeThis, $incomeLast),
            ],
            'expenses' => [
                'current' => $expensesThis,
                'previous' => $expensesLast,
                'change_percent' => $pctChange($expensesThis, $expensesLast),
            ],
            'savings' => [
                'current' => $savingsThis,
                'previous' => $savingsLast,
                'change_percent' => $pctChange($savingsThis, $savingsLast),
            ],
        ];
    }

    /**
     * Spending velocity: last 7 days annualized vs monthly budget
     */
    public function getSpendingVelocity(int $clientId): array
    {
        $sevenDaysAgo = now()->subDays(7)->format('Y-m-d');
        $today = now()->format('Y-m-d');
        $month = now()->format('Y-m');

        $last7DaysSpending = (float) Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('type', 'expense')
            ->whereBetween('date', [$sevenDaysAgo, $today])
            ->sum(DB::raw('ABS(amount)'));

        $projectedMonthly = ($last7DaysSpending / 7) * 30;

        $monthExpenses = $this->transactionRepository->getExpensesForMonth($clientId, $month);
        $monthIncome = $this->transactionRepository->getIncomeForMonth($clientId, $month);

        $dayOfMonth = (int) now()->format('j');
        $daysInMonth = (int) now()->format('t');
        $actualDailyRate = $dayOfMonth > 0 ? $monthExpenses / $dayOfMonth : 0;
        $budgetDailyRate = $daysInMonth > 0 && $monthIncome > 0 ? $monthIncome / $daysInMonth : 0;

        return [
            'last_7_days' => round($last7DaysSpending, 2),
            'daily_average_7d' => round($last7DaysSpending / 7, 2),
            'projected_monthly' => round($projectedMonthly, 2),
            'actual_daily_rate' => round($actualDailyRate, 2),
            'budget_daily_rate' => round($budgetDailyRate, 2),
            'velocity_ratio' => $budgetDailyRate > 0
                ? round($actualDailyRate / $budgetDailyRate, 2)
                : 0,
            'on_track' => $budgetDailyRate > 0 && $actualDailyRate <= $budgetDailyRate,
        ];
    }

    /**
     * Top categories by growth (month-over-month)
     */
    public function getTopGrowingCategories(int $clientId, int $limit = 5): array
    {
        $thisMonth = now()->format('Y-m');
        $lastMonth = now()->subMonth()->format('Y-m');

        $thisMonthCats = $this->getExpensesByCategory($clientId, $thisMonth);
        $lastMonthCats = $this->getExpensesByCategory($clientId, $lastMonth);

        $lastMonthMap = [];
        foreach ($lastMonthCats as $c) {
            $lastMonthMap[$c['category_id']] = $c['amount'];
        }

        $growth = [];
        foreach ($thisMonthCats as $c) {
            $prev = $lastMonthMap[$c['category_id']] ?? 0;
            $diff = $c['amount'] - $prev;
            $pctChange = $prev > 0 ? (($diff / $prev) * 100) : ($c['amount'] > 0 ? 100 : 0);

            $growth[] = [
                'category_id' => $c['category_id'],
                'category_name' => $c['category_name'],
                'icon' => $c['icon'],
                'current' => $c['amount'],
                'previous' => $prev,
                'difference' => round($diff, 2),
                'percent_change' => round($pctChange, 1),
            ];
        }

        // Sort by absolute growth descending
        usort($growth, fn ($a, $b) => abs($b['difference']) <=> abs($a['difference']));

        return array_slice($growth, 0, $limit);
    }

    /**
     * Получить расходы по конкретной категории за месяц
     */
    protected function getCategoryExpenses(int $clientId, int $categoryId, string $month): float
    {
        return (float) Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('category_id', $categoryId)
            ->where('month', $month)
            ->where('type', 'expense')
            ->sum(DB::raw('ABS(amount)'));
    }
}
