<?php

namespace App\Services\Plans;

use App\Models\Goal;
use App\Repositories\TransactionRepositoryInterface;
use App\Services\Settings\SettingsService;

class GoalService
{
    public function __construct(
        protected TransactionRepositoryInterface $transactionRepository,
        protected SettingsService $settingsService,
    ) {}

    public function getSavingsPlan(int $clientId): array
    {
        $goals = Goal::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('is_active', true)
            ->get();

        $plan = [];
        $totalMonthly = 0;

        foreach ($goals as $goal) {
            $savedBYN = $this->transactionRepository->getTotalSavingsForGoal($clientId, $goal->id);
            $currentInCurrency = $this->convertToGoalCurrency($clientId, $savedBYN, $goal->currency ?? 'BYN');

            $remaining = max(0, (float) $goal->target_amount - $currentInCurrency);
            $daysLeft = max(1, now()->diffInDays($goal->target_date, false));
            $monthsLeft = max(1, $daysLeft / 30);
            $monthlyAmount = round($remaining / $monthsLeft, 2);
            $progress = (float) $goal->target_amount > 0
                ? round(($currentInCurrency / (float) $goal->target_amount) * 100, 1)
                : 0;

            $totalElapsedDays = max(1, now()->diffInDays($goal->created_at ?? now()->subYear(), false));
            $isOnTrack = $progress >= ((1 - ($daysLeft / $totalElapsedDays)) * 100 * 0.8);

            $plan[] = [
                'goal_id' => $goal->id,
                'goal_name' => $goal->name,
                'target_amount' => (float) $goal->target_amount,
                'current_amount' => round($currentInCurrency, 2),
                'currency' => $goal->currency ?? 'BYN',
                'remaining' => $remaining,
                'target_date' => $goal->target_date->format('Y-m-d'),
                'months_left' => round($monthsLeft, 1),
                'monthly_amount' => $monthlyAmount,
                'progress' => $progress,
                'is_on_track' => $isOnTrack,
            ];

            $totalMonthly += $monthlyAmount;
        }

        return [
            'goals' => $plan,
            'total_monthly' => round($totalMonthly, 2),
        ];
    }

    public function convertToGoalCurrency(int $clientId, float $amountBYN, string $currency): float
    {
        if ($currency === 'BYN') {
            return $amountBYN;
        }
        $rate = $this->settingsService->getRate($clientId, $currency);

        return $rate > 0 ? round($amountBYN / $rate, 2) : 0;
    }
}
