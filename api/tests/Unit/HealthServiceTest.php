<?php

namespace Tests\Unit;

use App\Models\Account;
use App\Models\Transaction;
use App\Models\User;
use App\Services\System\HealthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HealthServiceTest extends TestCase
{
    use RefreshDatabase;

    private HealthService $service;

    private int $clientId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(HealthService::class);
        $user = User::factory()->create();
        $this->clientId = $user->id;
        $this->seedMinimalData();
    }

    private function seedMinimalData(): void
    {
        $accountId = Account::withoutGlobalScope('client')->create([
            'name' => 'Main',
            'balance' => 3000,
            'client_id' => $this->clientId,
        ])->id;
        $prevMonth = now()->subMonth()->format('Y-m');
        $prevPrevMonth = now()->subMonths(2)->format('Y-m');
        Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'date' => now()->subMonth(),
            'amount' => 4000,
            'type' => 'salary',
            'account_id' => $accountId,
            'month' => $prevMonth,
        ]);
        Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'date' => now()->subMonth(),
            'amount' => -2500,
            'type' => 'expense',
            'account_id' => $accountId,
            'month' => $prevMonth,
        ]);
        Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'date' => now()->subMonths(2),
            'amount' => -2400,
            'type' => 'expense',
            'account_id' => $accountId,
            'month' => $prevPrevMonth,
        ]);
        \DB::table('settings')->insert([
            ['client_id' => $this->clientId, 'key' => 'usd_rate', 'value' => '3.25'],
        ]);
    }

    public function test_calculate_health_returns_expected_structure(): void
    {
        $result = $this->service->calculateHealth($this->clientId);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('health_score', $result);
        $this->assertArrayHasKey('status', $result);
        $this->assertArrayHasKey('savings_rate', $result);
        $this->assertArrayHasKey('expense_to_income', $result);
        $this->assertArrayHasKey('emergency_fund_days', $result);
        $this->assertArrayHasKey('burn_rate', $result);
        $this->assertArrayHasKey('net_worth', $result);
        $this->assertContains($result['status'], ['excellent', 'good', 'fair', 'poor']);
        $this->assertGreaterThanOrEqual(0, $result['health_score']);
        $this->assertLessThanOrEqual(100, $result['health_score']);
    }

    public function test_calculate_health_net_worth_equals_balance_with_no_goals(): void
    {
        $result = $this->service->calculateHealth($this->clientId);

        $balance = (float) Account::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)
            ->sum('balance');
        $this->assertSame(round($balance, 2), round($result['net_worth'], 2));
    }
}
