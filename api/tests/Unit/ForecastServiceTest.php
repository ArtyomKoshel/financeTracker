<?php

namespace Tests\Unit;

use App\Models\Account;
use App\Models\RecurringPayment;
use App\Models\Transaction;
use App\Models\User;
use App\Services\Analytics\ForecastService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ForecastServiceTest extends TestCase
{
    use RefreshDatabase;

    private ForecastService $service;

    private int $clientId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(ForecastService::class);
        $user = User::factory()->create();
        $this->clientId = $user->id;
        $this->seedMinimalData();
    }

    private function seedMinimalData(): void
    {
        $accountId = Account::withoutGlobalScope('client')->create([
            'name' => 'Main',
            'balance' => 5000,
            'client_id' => $this->clientId,
        ])->id;
        $month = now()->format('Y-m');
        Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'date' => now(),
            'amount' => 4000,
            'type' => 'salary',
            'account_id' => $accountId,
            'month' => $month,
        ]);
        RecurringPayment::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Аренда',
            'amount' => 500,
            'day_of_month' => 5,
            'is_active' => true,
            'is_income' => false,
        ]);
    }

    public function test_get_forecast_with_scenarios_returns_three_scenarios(): void
    {
        $result = $this->service->getForecastWithScenarios($this->clientId, 3);

        $this->assertArrayHasKey('base', $result);
        $this->assertArrayHasKey('best', $result);
        $this->assertArrayHasKey('worst', $result);
        $this->assertCount(3, $result['base']);
        $this->assertCount(3, $result['best']);
        $this->assertCount(3, $result['worst']);
    }

    public function test_forecast_month_has_expected_keys(): void
    {
        $result = $this->service->getForecastWithScenarios($this->clientId, 1);

        $month = $result['base'][0];
        $this->assertArrayHasKey('month', $month);
        $this->assertArrayHasKey('income', $month);
        $this->assertArrayHasKey('expenses', $month);
        $this->assertArrayHasKey('balance_end', $month);
    }

    public function test_best_scenario_balance_greater_or_equal_than_worst(): void
    {
        $result = $this->service->getForecastWithScenarios($this->clientId, 3);

        $lastBest = end($result['best']);
        $lastWorst = end($result['worst']);
        $this->assertGreaterThanOrEqual(
            $lastWorst['balance_end'],
            $lastBest['balance_end']
        );
    }
}
