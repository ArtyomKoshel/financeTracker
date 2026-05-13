<?php

namespace App\Services\Tax;

use App\Enums\TransactionType;
use App\Models\Transaction;

class TaxService
{
    public const RATES = [
        'usn' => 0.06,
        'self_employed' => 0.04,
    ];

    public function getSummary(int $clientId, string $dateFrom, string $dateTo): array
    {
        $transactions = Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->whereNotIn('type', array_merge(TransactionType::NON_INCOME_TYPES, ['transfer']))
            ->whereBetween('month', [$dateFrom, $dateTo])
            ->get();

        $totalIncome = $transactions->sum(fn ($t) => abs((float) $t->amount));

        $byMonth = $transactions
            ->groupBy('month')
            ->map(fn ($group, $month) => [
                'month' => $month,
                'income' => $group->sum(fn ($t) => abs((float) $t->amount)),
                'count' => $group->count(),
            ])
            ->sortKeys()
            ->values();

        return [
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'total_income' => round($totalIncome, 2),
            'tax_usn' => round($totalIncome * self::RATES['usn'], 2),
            'tax_self_employed' => round($totalIncome * self::RATES['self_employed'], 2),
            'rate_usn' => self::RATES['usn'],
            'rate_self_employed' => self::RATES['self_employed'],
            'by_month' => $byMonth,
        ];
    }
}
