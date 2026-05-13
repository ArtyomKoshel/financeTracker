<?php

namespace App\DTOs;

class HealthData implements \JsonSerializable
{
    public function __construct(
        public float $savings_rate = 0,
        public float $expense_to_income = 0,
        public int $emergency_fund_days = 0,
        public float $total_savings = 0,
        public float $total_savings_usd = 0,
        public int $savings_days = 0,
        public string $goal_name = '',
        public float $goal_progress = 0,
        public float $income_growth = 0,
        public float $expense_growth = 0,
        public float $savings_growth = 0,
        public int $over_budget_count = 0,
        public array $over_budget_list = [],
        public int $upcoming_payments = 0,
        public float $payment_coverage = 100,
        public float $daily_spending_avg = 0,
        public float $burn_rate = 0,
        public int $days_until_zero = 0,
        public float $predicted_end_of_month = 0,
        public float $cashflow_free = 0,
        public bool $cashflow_deficit = false,
        public float $debt_to_income = 0,
        public float $total_debt = 0,
        public float $net_worth = 0,
        public int $health_score = 50,
        public string $status = 'good',
        public string $message = 'Нет достаточных данных для анализа',
        public ?float $first_goal_savings = null,
        public ?float $first_goal_savings_usd = null,
        public ?float $first_goal_progress = null,
    ) {}

    public function jsonSerialize(): array
    {
        return array_filter([
            'savings_rate' => $this->savings_rate,
            'expense_to_income' => $this->expense_to_income,
            'emergency_fund_days' => $this->emergency_fund_days,
            'total_savings' => $this->total_savings,
            'total_savings_usd' => $this->total_savings_usd,
            'savings_days' => $this->savings_days,
            'goal_name' => $this->goal_name,
            'goal_progress' => $this->goal_progress,
            'income_growth' => $this->income_growth,
            'expense_growth' => $this->expense_growth,
            'savings_growth' => $this->savings_growth,
            'over_budget_count' => $this->over_budget_count,
            'over_budget_list' => $this->over_budget_list,
            'upcoming_payments' => $this->upcoming_payments,
            'payment_coverage' => $this->payment_coverage,
            'daily_spending_avg' => $this->daily_spending_avg,
            'burn_rate' => $this->burn_rate,
            'days_until_zero' => $this->days_until_zero,
            'predicted_end_of_month' => $this->predicted_end_of_month,
            'cashflow_free' => $this->cashflow_free,
            'cashflow_deficit' => $this->cashflow_deficit,
            'debt_to_income' => $this->debt_to_income,
            'total_debt' => $this->total_debt,
            'net_worth' => $this->net_worth,
            'health_score' => $this->health_score,
            'status' => $this->status,
            'message' => $this->message,
            'first_goal_savings' => $this->first_goal_savings,
            'first_goal_savings_usd' => $this->first_goal_savings_usd,
            'first_goal_progress' => $this->first_goal_progress,
        ], fn ($v) => $v !== null);
    }

    public function toArray(): array
    {
        return $this->jsonSerialize();
    }
}
