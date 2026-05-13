<?php

namespace App\Services\Plans;

use App\Models\RecurringPayment;
use Illuminate\Support\Facades\DB;

class SubscriptionDetectionService
{
    /**
     * Detect potential recurring transactions that look like subscriptions
     * but aren't yet tracked as RecurringPayments.
     *
     * Logic: find expenses with same amount + similar description that occur
     * at least 2 times in the last 3 months.
     */
    public function detectSubscriptions(int $clientId): array
    {
        $threeMonthsAgo = now()->subMonths(3)->format('Y-m-d');

        // Find repeating amount+description pairs
        $candidates = DB::table('transactions')
            ->where('client_id', $clientId)
            ->where('type', 'expense')
            ->whereNull('recurring_payment_id')
            ->where('date', '>=', $threeMonthsAgo)
            ->where('description', '!=', '')
            ->select(
                DB::raw('LOWER(TRIM(description)) as normalized_desc'),
                DB::raw('ABS(amount) as abs_amount'),
                'currency',
                DB::raw('COUNT(*) as occurrence_count'),
                DB::raw('MIN(date) as first_seen'),
                DB::raw('MAX(date) as last_seen'),
                DB::raw('ARRAY_AGG(DISTINCT EXTRACT(DAY FROM date)::int ORDER BY EXTRACT(DAY FROM date)::int) as day_list')
            )
            ->groupBy(DB::raw('LOWER(TRIM(description))'), DB::raw('ABS(amount)'), 'currency')
            ->having(DB::raw('COUNT(*)'), '>=', 2)
            ->orderByDesc('occurrence_count')
            ->limit(20)
            ->get();

        // Filter out already tracked payments
        $existingPayments = RecurringPayment::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('is_active', true)
            ->pluck('name')
            ->map(fn ($n) => mb_strtolower(trim($n)))
            ->toArray();

        $detected = [];
        foreach ($candidates as $c) {
            // Skip if already a recurring payment
            $isTracked = false;
            foreach ($existingPayments as $ep) {
                if (str_contains($c->normalized_desc, $ep) || str_contains($ep, $c->normalized_desc)) {
                    $isTracked = true;
                    break;
                }
            }
            if ($isTracked) {
                continue;
            }

            // Parse day_list from PostgreSQL array format
            $dayList = $this->parsePgArray($c->day_list);
            $avgDay = ! empty($dayList) ? (int) round(array_sum($dayList) / count($dayList)) : null;

            $detected[] = [
                'description' => $c->normalized_desc,
                'amount' => (float) $c->abs_amount,
                'currency' => $c->currency ?? 'BYN',
                'occurrences' => (int) $c->occurrence_count,
                'first_seen' => $c->first_seen,
                'last_seen' => $c->last_seen,
                'estimated_day' => $avgDay,
                'confidence' => min(100, (int) $c->occurrence_count * 30),
            ];
        }

        return $detected;
    }

    protected function parsePgArray(?string $pgArray): array
    {
        if (! $pgArray) {
            return [];
        }
        $pgArray = trim($pgArray, '{}');
        if ($pgArray === '') {
            return [];
        }

        return array_map('intval', explode(',', $pgArray));
    }
}
