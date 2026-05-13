<?php

namespace App\Services\Analytics;

use App\Models\Account;
use App\Models\RecurringPayment;
use App\Repositories\TransactionRepositoryInterface;
use App\Services\Settings\SettingsService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class ForecastService
{
    public function __construct(
        protected TransactionRepositoryInterface $txRepo,
        protected SettingsService $settingsService
    ) {}

    public function getForecastWithScenarios(int $clientId, int $months = 3): array
    {
        $base = $this->getForecast($clientId, $months);
        $best = $this->getScenarioForecast($clientId, $months, 'best');
        $worst = $this->getScenarioForecast($clientId, $months, 'worst');

        return [
            'base' => $base,
            'best' => $best,
            'worst' => $worst,
        ];
    }

    protected function getScenarioForecast(int $clientId, int $months, string $scenario): array
    {
        $account = Account::withoutGlobalScope('client')->where('client_id', $clientId)->first();
        $balance = $account ? (float) $account->balance : 0;

        $settings = $this->getSettings($clientId);
        $avgIncome = $this->calculateAvgIncome($clientId, $settings);

        $payments = RecurringPayment::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('is_active', true)
            ->where('is_income', false)
            ->get();

        // Scenario multipliers
        $incomeMultiplier = $scenario === 'best' ? 1.10 : 0.85;
        $expenseMultiplier = $scenario === 'best' ? 0.85 : 1.20;

        $result = [];
        $start = Carbon::now()->startOfMonth();
        $runningBalance = $balance;

        for ($i = 0; $i < $months; $i++) {
            $month = $start->copy()->addMonths($i)->format('Y-m');
            $monthNum = (int) $start->copy()->addMonths($i)->format('m');

            $income = $i === 0
                ? $this->txRepo->getIncomeForMonth($clientId, $month)
                : $this->applySeasonalAdjustment($avgIncome * $incomeMultiplier, $monthNum, 'income');
            $expenses = $i === 0
                ? $this->txRepo->getExpensesForMonth($clientId, $month)
                : $this->predictExpenses($clientId, $monthNum) * $expenseMultiplier;

            $plannedPayments = $this->calculatePlannedPayments($payments, $month, $clientId);

            $monthEndBalance = $runningBalance + $income - ($i > 0 ? $plannedPayments : $expenses);
            $runningBalance = $monthEndBalance;

            $result[] = [
                'month' => $month,
                'income' => round($income, 2),
                'expenses' => round($expenses, 2),
                'planned_payments' => round($plannedPayments, 2),
                'balance_end' => round($monthEndBalance, 2),
            ];
            $balance = $monthEndBalance;
        }

        return $result;
    }

    protected function calculateAvgIncome(int $clientId, array $settings): float
    {
        $avgIncome = (float) ($settings['avg_income'] ?? 0);
        if ($avgIncome <= 0) {
            $lastMonths = [];
            for ($i = 1; $i <= 3; $i++) {
                $m = Carbon::now()->subMonths($i)->format('Y-m');
                $lastMonths[] = $this->txRepo->getIncomeForMonth($clientId, $m);
            }
            $avgIncome = count($lastMonths) > 0 ? array_sum($lastMonths) / count($lastMonths) : 0;
        }
        if ($avgIncome <= 0) {
            $grossSalary = (float) ($settings['gross_salary'] ?? 0);
            $expectedAdvance = (float) ($settings['expected_advance'] ?? 0);
            $avgIncome = $grossSalary + $expectedAdvance;
        }

        return $avgIncome;
    }

    protected function calculatePlannedPayments($payments, string $month, int $clientId): float
    {
        $plannedPayments = 0;
        foreach ($payments as $p) {
            $amount = (float) $p->amount;
            $currency = $p->currency ?? 'BYN';
            if ($currency !== 'BYN') {
                $rate = $this->settingsService->getRate($clientId, $currency);
                $amount = $amount * $rate;
            }

            if ($p->is_one_time && $p->due_date) {
                if ($p->due_date->format('Y-m') === $month) {
                    $plannedPayments += $amount;
                }
            } else {
                $plannedPayments += $amount;
            }
        }

        return $plannedPayments;
    }

    public function getForecast(int $clientId, int $months = 3): array
    {
        $account = Account::withoutGlobalScope('client')->where('client_id', $clientId)->first();
        $balance = $account ? (float) $account->balance : 0;

        $settings = $this->getSettings($clientId);
        $avgIncome = (float) ($settings['avg_income'] ?? 0);
        if ($avgIncome <= 0) {
            $lastMonths = [];
            for ($i = 1; $i <= 3; $i++) {
                $m = Carbon::now()->subMonths($i)->format('Y-m');
                $lastMonths[] = $this->txRepo->getIncomeForMonth($clientId, $m);
            }
            $avgIncome = count($lastMonths) > 0 ? array_sum($lastMonths) / count($lastMonths) : 0;
        }
        if ($avgIncome <= 0) {
            $grossSalary = (float) ($settings['gross_salary'] ?? 0);
            $expectedAdvance = (float) ($settings['expected_advance'] ?? 0);
            $avgIncome = $grossSalary + $expectedAdvance;
        }

        $payments = RecurringPayment::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('is_active', true)
            ->where('is_income', false)
            ->get();

        $result = [];
        $start = Carbon::now()->startOfMonth();
        $runningBalance = $balance;

        for ($i = 0; $i < $months; $i++) {
            $month = $start->copy()->addMonths($i)->format('Y-m');
            $monthNum = (int) $start->copy()->addMonths($i)->format('m');

            $income = $i === 0
                ? $this->txRepo->getIncomeForMonth($clientId, $month)
                : $this->applySeasonalAdjustment($avgIncome, $monthNum, 'income');
            $expenses = $i === 0
                ? $this->txRepo->getExpensesForMonth($clientId, $month)
                : $this->predictExpenses($clientId, $monthNum);
            $savings = $i === 0
                ? $this->txRepo->getSavingsForMonth($clientId, $month)
                : 0;
            $savingsOut = $i === 0
                ? $this->txRepo->getSavingsWithdrawalForMonth($clientId, $month)
                : 0;

            $plannedPayments = 0;
            foreach ($payments as $p) {
                $amount = (float) $p->amount;
                $currency = $p->currency ?? 'BYN';
                if ($currency !== 'BYN') {
                    $rate = $this->settingsService->getRate($clientId, $currency);
                    $amount = $amount * $rate;
                }

                if ($p->is_one_time && $p->due_date) {
                    if ($p->due_date->format('Y-m') === $month) {
                        $plannedPayments += $amount;
                    }
                } else {
                    $plannedPayments += $amount;
                }
            }

            $monthEndBalance = $runningBalance + $income - ($i > 0 ? $plannedPayments : $expenses) - $savings + $savingsOut;
            $runningBalance = $monthEndBalance;

            $result[] = [
                'month' => $month,
                'income' => $income,
                'expenses' => $expenses,
                'planned_payments' => $plannedPayments,
                'savings' => $savings - $savingsOut,
                'balance_start' => $balance,
                'balance_end' => $monthEndBalance,
            ];
            $balance = $monthEndBalance;
        }

        return $result;
    }

    protected function getSettings(int $clientId): array
    {
        $rows = DB::table('settings')->where('client_id', $clientId)->get();
        $result = [];
        foreach ($rows as $row) {
            $result[$row->key] = $row->value;
        }

        return $result;
    }

    /**
     * Применяет сезонные корректировки к прогнозу
     *
     * @param  float  $baseAmount  Базовая сумма
     * @param  int  $monthNum  Номер месяца (1-12)
     * @param  string  $type  'income' или 'expenses'
     * @return float Скорректированная сумма
     */
    protected function applySeasonalAdjustment(float $baseAmount, int $monthNum, string $type): float
    {
        if ($type === 'income') {
            // Доход обычно стабилен, небольшие корректировки на премии
            $multipliers = [
                1 => 1.0,  // Январь
                2 => 1.0,  // Февраль
                3 => 1.05, // Март (весенние премии)
                4 => 1.0,  // Апрель
                5 => 1.0,  // Май
                6 => 1.0,  // Июнь
                7 => 1.0,  // Июль
                8 => 1.0,  // Август
                9 => 1.0,  // Сентябрь
                10 => 1.0, // Октябрь
                11 => 1.0, // Ноябрь
                12 => 1.15, // Декабрь (новогодние премии)
            ];

            return $baseAmount * ($multipliers[$monthNum] ?? 1.0);
        }

        // Для расходов сезонность не применяется, т.к. используется predictExpenses
        return $baseAmount;
    }

    /**
     * Прогнозирует расходы на основе исторических данных с учётом сезонности
     *
     * @param  int  $monthNum  Номер месяца (1-12)
     * @return float Прогнозируемые расходы
     */
    protected function predictExpenses(int $clientId, int $monthNum): float
    {
        // Берём расходы за последние 6 месяцев
        $historicalExpenses = [];
        for ($i = 1; $i <= 6; $i++) {
            $m = Carbon::now()->subMonths($i)->format('Y-m');
            $historicalExpenses[] = $this->txRepo->getExpensesForMonth($clientId, $m);
        }

        if (empty($historicalExpenses)) {
            return 0;
        }

        $avgExpenses = array_sum($historicalExpenses) / count($historicalExpenses);

        // Сезонные множители для расходов
        $multipliers = [
            1 => 1.15,  // Январь (постновогодние расходы)
            2 => 1.0,   // Февраль
            3 => 1.05,  // Март (весенние обновления)
            4 => 1.0,   // Апрель
            5 => 1.0,   // Май
            6 => 1.1,   // Июнь (подготовка к отпуску)
            7 => 1.15,  // Июль (отпуск)
            8 => 1.1,   // Август (отпуск)
            9 => 1.05,  // Сентябрь (школа, подготовка к зиме)
            10 => 1.0,  // Октябрь
            11 => 1.0,  // Ноябрь
            12 => 1.2,  // Декабрь (новогодние покупки)
        ];

        return $avgExpenses * ($multipliers[$monthNum] ?? 1.0);
    }
}
