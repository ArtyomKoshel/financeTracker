<?php

namespace App\Services\Plans;

use App\Models\RecurringPayment;
use App\Models\Transaction;
use Carbon\Carbon;

class PaymentService
{
    public function getReminders(int $clientId): array
    {
        $currentMonth = now()->format('Y-m');
        $nextMonth = now()->addMonth()->format('Y-m');
        $today = (int) now()->day;
        $payments = RecurringPayment::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('is_active', true)
            ->where('is_income', false)
            ->orderBy('day_of_month')
            ->get();

        $paidSet = $this->batchLoadPaidStatus($payments, [$currentMonth, $nextMonth]);

        $result = [];
        foreach ($payments as $p) {
            if ($p->is_one_time && $p->due_date) {
                $dueDate = $p->due_date->format('Y-m-d');
                $month = $p->due_date->format('Y-m');
                $isPaid = isset($paidSet[$p->id.':'.$month]);
                if ($p->due_date->isPast() && ! $p->due_date->isToday() && $isPaid) {
                    continue;
                }
                $daysUntil = max(0, (int) now()->startOfDay()->diffInDays($p->due_date->copy()->startOfDay(), false));
                $isOverdue = ! $isPaid && $p->due_date->isPast();
                $isNextMonth = $p->due_date->format('Y-m') !== $currentMonth;
            } else {
                $day = min($p->day_of_month, (int) now()->endOfMonth()->day);
                $dueDate = $currentMonth.'-'.str_pad((string) $day, 2, '0', STR_PAD_LEFT);
                $dueCarbon = Carbon::parse($dueDate);
                $isPaid = isset($paidSet[$p->id.':'.$currentMonth]);
                $isOverdue = ! $isPaid && now()->isAfter($dueCarbon->endOfDay());
                $isNextMonth = $p->day_of_month <= $today;
                if ($isNextMonth) {
                    $nextDue = now()->addMonth()->format('Y-m').'-'.str_pad((string) min($p->day_of_month, (int) now()->addMonth()->endOfMonth()->day), 2, '0', STR_PAD_LEFT);
                    $daysUntil = max(0, (int) now()->diffInDays($nextDue, false));
                    $month = $nextMonth;
                    $dueDate = $nextDue;
                } else {
                    $daysUntil = max(0, $p->day_of_month - $today);
                    $month = $currentMonth;
                }
            }

            $result[] = [
                'payment' => $this->formatPayment($p),
                'due_date' => $dueDate,
                'month' => $month,
                'days_until' => $daysUntil,
                'is_paid' => $isPaid,
                'is_overdue' => $isOverdue,
                'is_next_month' => $isNextMonth,
            ];
        }

        return $result;
    }

    /**
     * @param  \Illuminate\Database\Eloquent\Collection  $payments
     * @param  string[]  $baseMonths
     * @return array<string, true> Keys are "paymentId:month"
     */
    protected function batchLoadPaidStatus($payments, array $baseMonths): array
    {
        if ($payments->isEmpty()) {
            return [];
        }

        $relevantMonths = $baseMonths;
        foreach ($payments as $p) {
            if ($p->is_one_time && $p->due_date) {
                $relevantMonths[] = $p->due_date->format('Y-m');
            }
        }
        $relevantMonths = array_unique($relevantMonths);

        $rows = Transaction::withoutGlobalScope('client')
            ->whereIn('recurring_payment_id', $payments->pluck('id'))
            ->whereIn('month', $relevantMonths)
            ->get(['recurring_payment_id', 'month']);

        $set = [];
        foreach ($rows as $row) {
            $set[$row->recurring_payment_id.':'.$row->month] = true;
        }

        return $set;
    }

    protected function isPaymentPaid(int $paymentId, string $month): bool
    {
        return Transaction::withoutGlobalScope('client')
            ->where('recurring_payment_id', $paymentId)
            ->where('month', $month)
            ->exists();
    }

    /**
     * Календарь платежей за период (from..to).
     *
     * @return array<string, array<int, array{payment: array, due_date: string, is_paid: bool}>>
     */
    public function getCalendarByRange(int $clientId, string $from, string $to): array
    {
        $start = Carbon::parse($from)->startOfDay();
        $end = Carbon::parse($to)->endOfDay();

        return $this->getCalendarInRange($clientId, $start, $end);
    }

    /**
     * Календарь предстоящих платежей на N дней вперёд.
     * Возвращает платежи сгруппированные по дате.
     *
     * @return array<string, array<int, array{payment: array, due_date: string, is_paid: bool}>>
     */
    public function getCalendar(int $clientId, int $days = 60): array
    {
        $start = Carbon::today();
        $end = $start->copy()->addDays($days);

        return $this->getCalendarInRange($clientId, $start, $end);
    }

    /**
     * @return array<string, array<int, array{payment: array, due_date: string, is_paid: bool}>>
     */
    protected function getCalendarInRange(int $clientId, Carbon $start, Carbon $end): array
    {
        $payments = RecurringPayment::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('is_active', true)
            ->where('is_income', false)
            ->get();

        $months = [];
        $cur = $start->copy()->startOfMonth();
        while ($cur <= $end->copy()->endOfMonth()) {
            $months[] = $cur->format('Y-m');
            $cur->addMonth();
        }

        $paidSet = $this->batchLoadPaidStatus($payments, $months);

        $result = [];
        foreach ($payments as $p) {
            $dates = $this->getPaymentDates($p, $start, $end);
            foreach ($dates as $dateStr) {
                if (! isset($result[$dateStr])) {
                    $result[$dateStr] = [];
                }
                $month = substr($dateStr, 0, 7);
                $isPaid = isset($paidSet[$p->id.':'.$month]);
                $result[$dateStr][] = [
                    'payment' => $this->formatPayment($p),
                    'due_date' => $dateStr,
                    'is_paid' => $isPaid,
                ];
            }
        }

        ksort($result);

        return $result;
    }

    /**
     * @return string[]
     */
    protected function getPaymentDates(RecurringPayment $p, Carbon $start, Carbon $end): array
    {
        $dates = [];
        if ($p->is_one_time && $p->due_date) {
            $d = $p->due_date->format('Y-m-d');
            if ($d >= $start->format('Y-m-d') && $d <= $end->format('Y-m-d')) {
                $dates[] = $d;
            }

            return $dates;
        }

        $cur = $start->copy()->startOfMonth();
        while ($cur <= $end) {
            $day = min($p->day_of_month, (int) $cur->copy()->endOfMonth()->day);
            $dateStr = $cur->format('Y-m').'-'.str_pad((string) $day, 2, '0', STR_PAD_LEFT);
            if ($dateStr >= $start->format('Y-m-d') && $dateStr <= $end->format('Y-m-d')) {
                $dates[] = $dateStr;
            }
            $cur->addMonth();
        }

        return $dates;
    }

    public function getSubscriptionCancelReminders(int $clientId): array
    {
        $payments = RecurringPayment::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('is_active', true)
            ->where('is_subscription', true)
            ->whereNotNull('cancel_by_date')
            ->where('cancel_by_date', '>=', now()->toDateString())
            ->orderBy('cancel_by_date')
            ->get();

        return $payments->map(fn ($p) => [
            'payment' => $this->formatPayment($p),
            'cancel_by_date' => $p->cancel_by_date->format('Y-m-d'),
            'days_until' => max(0, (int) now()->diffInDays($p->cancel_by_date, false)),
        ])->values()->all();
    }

    protected function formatPayment($p): array
    {
        return [
            'id' => $p->id,
            'name' => $p->name,
            'amount' => (float) $p->amount,
            'original_amount' => (float) ($p->original_amount ?? $p->amount),
            'currency' => $p->currency ?? 'BYN',
            'day_of_month' => $p->day_of_month,
            'due_date' => ($p->due_date instanceof \DateTimeInterface) ? $p->due_date->format('Y-m-d') : '',
            'category' => $p->category ?? 'essential',
            'category_id' => $p->category_id,
            'is_variable' => (bool) $p->is_variable,
            'is_one_time' => (bool) $p->is_one_time,
            'is_subscription' => (bool) ($p->is_subscription ?? false),
            'cancel_by_date' => ($p->cancel_by_date instanceof \DateTimeInterface) ? $p->cancel_by_date->format('Y-m-d') : null,
            'is_active' => (bool) $p->is_active,
            'is_income' => (bool) ($p->is_income ?? false),
            'description' => $p->description ?? '',
        ];
    }
}
