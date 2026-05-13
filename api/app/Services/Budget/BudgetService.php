<?php

namespace App\Services\Budget;

use App\Models\CategoryBudget;
use App\Models\RecurringPayment;
use App\Models\Transaction;
use App\Services\Accounts\AccountService;
use App\Services\Settings\SettingsService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class BudgetService
{
    public function __construct(
        protected AccountService $accountService,
        protected SettingsService $settingsService,
    ) {}

    public function calculateCashflow(int $clientId): array
    {
        $now = Carbon::now();
        $currentDay = (int) $now->day;
        $currentMonth = $now->format('Y-m');
        $daysInMonth = (int) $now->copy()->endOfMonth()->day;

        $balance = $this->accountService->getTotalBalance($clientId);

        $settings = $this->getSettings($clientId);
        $minLiving = (float) ($settings['min_living_budget'] ?? 1500);
        $advanceDay = (int) ($settings['advance_day'] ?? 30);
        $salaryDay = (int) ($settings['salary_day'] ?? 15);

        if ($advanceDay === 0) {
            $advanceDay = 30;
        }
        if ($salaryDay === 0) {
            $salaryDay = 15;
        }

        $daysUntilIncome = $this->calcDaysUntilIncome($currentDay, $advanceDay, $salaryDay, $daysInMonth);
        $savingsPercent = (float) ($settings['savings_percent'] ?? 20);
        if ($savingsPercent <= 0) {
            $savingsPercent = 20;
        }

        [$nextIncomeDate, $nextIncomeType] = $this->getNextIncomeInfo($currentDay, $advanceDay, $salaryDay, $daysInMonth);

        $essentialTotal = $this->getEssentialBudgetsTotal($clientId, $currentMonth);
        if ($essentialTotal <= 0) {
            $essentialTotal = $minLiving;
        }

        $daysInCurrentMonth = (int) $now->copy()->endOfMonth()->day;
        $livingBudget = ($essentialTotal / $daysInCurrentMonth) * max(1, $daysUntilIncome);
        $lastIncomeDate = $this->getLastIncomeDate($now, $currentDay, $advanceDay, $salaryDay, $daysInMonth);
        $essentialSpent = $this->getEssentialSpentSinceDate($clientId, $currentMonth, $lastIncomeDate);
        $essentialRemaining = $livingBudget - $essentialSpent;
        $dailyBudget = $daysUntilIncome > 0 ? $essentialRemaining / $daysUntilIncome : 0;

        [$totalPayments, $paymentsList] = $this->getPaymentsUntilNextIncomeWithList($clientId, $now, $advanceDay, $salaryDay, $daysInMonth, $currentDay);
        [$totalDebtPayments, $debtPaymentsList] = $this->getUpcomingDebtPayments($clientId, $now, $daysUntilIncome);

        $freeFunds = $balance - $livingBudget - $totalPayments - $totalDebtPayments;
        $suggestedSavings = $freeFunds > 0 ? $freeFunds * ($savingsPercent / 100) : 0;

        $status = $freeFunds < 0 ? 'warning' : ($freeFunds > $livingBudget ? 'success' : 'info');
        $message = $freeFunds < 0
            ? 'Недостаточно средств до следующего дохода'
            : ($freeFunds > 0 ? 'Свободно '.round($freeFunds, 2).' Br' : 'Баланс в норме');

        return [
            'balance' => $balance,
            'living_budget' => $livingBudget,
            'total_payments' => $totalPayments,
            'total_debt_payments' => $totalDebtPayments,
            'free_funds' => $freeFunds,
            'cashflow_free' => $freeFunds,
            'cashflow_deficit' => $freeFunds < 0,
            'days_until_income' => $daysUntilIncome,
            'suggested_savings' => $suggestedSavings,
            'savings_percent' => $savingsPercent,
            'next_income_date' => $nextIncomeDate,
            'next_income_type' => $nextIncomeType,
            'payments_list' => $paymentsList,
            'debt_payments_list' => $debtPaymentsList,
            'essential_spent' => $essentialSpent,
            'essential_remaining' => $essentialRemaining,
            'daily_budget' => $dailyBudget,
            'essential_total' => $essentialTotal,
            'message' => $message,
            'status' => $status,
        ];
    }

    protected function getNextIncomeInfo(int $currentDay, int $advanceDay, int $salaryDay, int $daysInMonth): array
    {
        $nextIncomeDay = $this->getNextIncomeDay($currentDay, $advanceDay, $salaryDay, $daysInMonth);
        $now = Carbon::now();
        $nextDate = $now->copy()->day(min($nextIncomeDay, $daysInMonth));
        if ($nextIncomeDay <= $currentDay) {
            $nextDate->addMonth();
        }
        $nextIncomeType = ($salaryDay < $advanceDay)
            ? ($currentDay < $salaryDay ? 'ЗП' : ($currentDay < $advanceDay ? 'аванс' : 'ЗП'))
            : ($currentDay < $advanceDay ? 'аванс' : ($currentDay < $salaryDay ? 'ЗП' : 'аванс'));

        return [$nextDate->format('d.m'), $nextIncomeType];
    }

    protected function getPaymentsUntilNextIncomeWithList(int $clientId, Carbon $now, int $advanceDay, int $salaryDay, int $daysInMonth, int $currentDay): array
    {
        $nextIncomeDay = $this->getNextIncomeDay($currentDay, $advanceDay, $salaryDay, $daysInMonth);
        $nextDate = $now->copy()->day(min($nextIncomeDay, $daysInMonth));
        if ($nextIncomeDay <= $currentDay) {
            $nextDate->addMonth();
        }

        $total = 0;
        $paymentsList = [];
        $payments = RecurringPayment::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('is_active', true)
            ->where('is_income', false)
            ->get();

        $rates = $this->getRates($clientId);
        foreach ($payments as $p) {
            $due = $now->copy()->day(min((int) $p->day_of_month, $daysInMonth));
            if ($p->day_of_month > $daysInMonth) {
                $due->day($daysInMonth);
            }
            if ($due->between($now, $nextDate) || $due->eq($nextDate)) {
                $dueMonth = $due->format('Y-m');
                if ($this->isPaymentPaid($clientId, (int) $p->id, $dueMonth)) {
                    continue;
                }
                $amountOriginal = (float) $p->amount;
                $currency = $p->currency ?? 'BYN';
                $amountBYN = $this->convertToBYN($amountOriginal, $currency, $rates);
                $total += $amountBYN;
                $paymentsList[] = [
                    'name' => $p->name,
                    'amount' => $amountBYN,
                    'currency' => 'BYN',
                    'due_date' => $due->format('Y-m-d'),
                    'days_until' => (int) $now->diffInDays($due, false),
                    'is_next_month' => $due->month !== $now->month,
                ];
            }
        }

        return [$total, $paymentsList];
    }

    protected function isPaymentPaid(int $clientId, int $paymentId, string $month): bool
    {
        return Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('recurring_payment_id', $paymentId)
            ->where('month', $month)
            ->exists();
    }

    protected function getUpcomingDebtPayments(int $clientId, Carbon $now, int $daysUntilIncome): array
    {
        $debts = DB::table('debts')
            ->where('client_id', $clientId)
            ->whereColumn('paid_amount', '<', 'total_amount')
            ->get();

        $total = 0;
        $debtPaymentsList = [];

        foreach ($debts as $debt) {
            $remaining = (float) $debt->total_amount - (float) $debt->paid_amount;
            if ($remaining <= 0) {
                continue;
            }

            // Рассчитываем минимальный платёж на период до следующего дохода
            // Если указан due_date, учитываем срочность
            $dueDate = $debt->due_date ? Carbon::parse($debt->due_date) : null;
            $monthlyPayment = (float) ($debt->monthly_payment ?? 0);

            if ($monthlyPayment > 0) {
                // Есть фиксированный месячный платёж
                $daysInMonth = (int) $now->copy()->endOfMonth()->day;
                $dailyPayment = $monthlyPayment / $daysInMonth;
                $paymentDue = $dailyPayment * $daysUntilIncome;
                $paymentDue = min($paymentDue, $remaining);
            } elseif ($dueDate && $dueDate->lte($now->copy()->addDays($daysUntilIncome))) {
                // Долг нужно погасить до следующего дохода
                $paymentDue = $remaining;
            } else {
                // Нет срочных платежей — пропускаем
                continue;
            }

            if ($paymentDue > 0) {
                $total += $paymentDue;
                $debtPaymentsList[] = [
                    'name' => $debt->name ?? 'Долг',
                    'amount' => $paymentDue,
                    'remaining' => $remaining,
                    'due_date' => $dueDate ? $dueDate->format('Y-m-d') : null,
                    'is_urgent' => $dueDate && $dueDate->lte($now->copy()->addDays($daysUntilIncome)),
                ];
            }
        }

        return [$total, $debtPaymentsList];
    }

    protected function getSettings(int $clientId): array
    {
        return [
            'min_living_budget' => $this->settingsService->getSetting($clientId, 'min_living_budget', 1500),
            'advance_day' => $this->settingsService->getSetting($clientId, 'advance_day', 30),
            'salary_day' => $this->settingsService->getSetting($clientId, 'salary_day', 15),
            'savings_percent' => $this->settingsService->getSetting($clientId, 'savings_percent', 20),
        ];
    }

    protected function calcDaysUntilIncome(int $currentDay, int $advanceDay, int $salaryDay, int $daysInMonth): int
    {
        if ($salaryDay < $advanceDay) {
            if ($currentDay < $salaryDay) {
                return $salaryDay - $currentDay;
            }
            if ($currentDay < $advanceDay) {
                return $advanceDay - $currentDay;
            }

            return ($daysInMonth - $currentDay) + $salaryDay;
        }
        if ($currentDay < $advanceDay) {
            return $advanceDay - $currentDay;
        }
        if ($currentDay < $salaryDay) {
            return $salaryDay - $currentDay;
        }

        return ($daysInMonth - $currentDay) + $advanceDay;
    }

    protected function getEssentialBudgetsTotal(int $clientId, string $month): float
    {
        return (float) CategoryBudget::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('month', $month)
            ->where('is_essential', true)
            ->sum('limit_amount');
    }

    /** Дата последнего дохода (для расчёта трат в текущем периоде) */
    protected function getLastIncomeDate(Carbon $now, int $currentDay, int $advanceDay, int $salaryDay, int $daysInMonth): Carbon
    {
        if ($salaryDay < $advanceDay) {
            if ($currentDay >= $advanceDay) {
                return $now->copy()->day(min($advanceDay, $daysInMonth));
            }
            if ($currentDay >= $salaryDay) {
                return $now->copy()->day(min($salaryDay, $daysInMonth));
            }

            return $now->copy()->subMonth()->day(min($advanceDay, $daysInMonth));
        }
        if ($currentDay >= $salaryDay) {
            return $now->copy()->day(min($salaryDay, $daysInMonth));
        }
        if ($currentDay >= $advanceDay) {
            return $now->copy()->day(min($advanceDay, $daysInMonth));
        }

        return $now->copy()->subMonth()->day(min($salaryDay, $daysInMonth));
    }

    /** Сумма трат по базовым категориям с даты последнего дохода (без плановых платежей) */
    protected function getEssentialSpentSinceDate(int $clientId, string $month, Carbon $sinceDate): float
    {
        $essentialCategoryIds = CategoryBudget::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('month', $month)
            ->where('is_essential', true)
            ->pluck('category_id')
            ->toArray();

        if (empty($essentialCategoryIds)) {
            return 0;
        }

        return (float) Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('type', 'expense')
            ->whereNull('recurring_payment_id')
            ->whereIn('category_id', $essentialCategoryIds)
            ->whereDate('date', '>=', $sinceDate->format('Y-m-d'))
            ->sum(DB::raw('ABS(amount)'));
    }

    protected function getRates(int $clientId): array
    {
        return [
            'BYN' => 1,
            'USD' => (float) ($this->settingsService->getSetting($clientId, 'usd_rate') ?? 3.25),
            'EUR' => (float) ($this->settingsService->getSetting($clientId, 'eur_rate') ?? 3.55),
            'RUB' => (float) ($this->settingsService->getSetting($clientId, 'rub_rate') ?? 0.034),
        ];
    }

    protected function convertToBYN(float $amount, string $currency, array $rates): float
    {
        if ($currency === 'BYN') {
            return $amount;
        }
        $rate = $rates[$currency] ?? 1;

        return $rate > 0 ? round($amount * $rate, 2) : 0;
    }

    protected function getNextIncomeDay(int $currentDay, int $advanceDay, int $salaryDay, int $daysInMonth): int
    {
        if ($salaryDay < $advanceDay) {
            if ($currentDay < $salaryDay) {
                return $salaryDay;
            }
            if ($currentDay < $advanceDay) {
                return $advanceDay;
            }

            return $salaryDay;
        }
        if ($currentDay < $advanceDay) {
            return $advanceDay;
        }
        if ($currentDay < $salaryDay) {
            return $salaryDay;
        }

        return $advanceDay;
    }
}
