<?php

namespace Tests\Unit;

use App\Models\Account;
use App\Models\Goal;
use App\Models\Transaction;
use App\Models\User;
use App\Services\System\DashboardService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DashboardServiceTest extends TestCase
{
    use RefreshDatabase;

    private DashboardService $service;

    private int $clientId;

    private int $accountId;

    protected function setUp(): void
    {
        parent::setUp();
        $user = User::factory()->create();
        $this->clientId = $user->id;
        app()->instance('client_id', $this->clientId);
        $this->service = app(DashboardService::class);

        $account = Account::withoutGlobalScope('client')->create([
            'name' => 'Main',
            'balance' => 5000,
            'client_id' => $this->clientId,
        ]);
        $this->accountId = $account->id;

        DB::table('settings')->insert([
            ['client_id' => $this->clientId, 'key' => 'usd_rate', 'value' => '3.25'],
            ['client_id' => $this->clientId, 'key' => 'eur_rate', 'value' => '3.55'],
        ]);
    }

    public function test_get_dashboard_data_returns_expected_structure(): void
    {
        $month = now()->format('Y-m');

        $result = $this->service->getDashboardData($this->clientId, $month);

        $this->assertArrayHasKey('balance', $result);
        $this->assertArrayHasKey('accounts', $result);
        $this->assertArrayHasKey('month', $result);
        $this->assertArrayHasKey('current_month', $result);
        $this->assertArrayHasKey('previous_month', $result);
        $this->assertArrayHasKey('comparison', $result);
        $this->assertArrayHasKey('recent_transactions', $result);
        $this->assertArrayHasKey('usd_rate', $result);
        $this->assertArrayHasKey('goals', $result);
    }

    public function test_get_dashboard_data_returns_correct_balance(): void
    {
        $month = now()->format('Y-m');

        $result = $this->service->getDashboardData($this->clientId, $month);

        $this->assertSame(5000.0, $result['balance']);
    }

    public function test_get_dashboard_data_includes_monthly_totals(): void
    {
        $month = now()->format('Y-m');
        Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'account_id' => $this->accountId,
            'date' => $month.'-10',
            'month' => $month,
            'amount' => 3000,
            'type' => 'salary',
            'description' => 'Зарплата',
        ]);
        Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'account_id' => $this->accountId,
            'date' => $month.'-15',
            'month' => $month,
            'amount' => -500,
            'type' => 'expense',
            'description' => 'Расход',
        ]);

        $result = $this->service->getDashboardData($this->clientId, $month);

        $this->assertSame(3000.0, $result['current_month']['total_income']);
        $this->assertSame(500.0, $result['current_month']['expenses']);
    }

    public function test_get_dashboard_data_includes_goals(): void
    {
        $month = now()->format('Y-m');
        Goal::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Test Goal',
            'target_amount' => 10000,
            'current_amount' => 2000,
            'target_date' => now()->addMonths(6)->format('Y-m-d'),
            'is_active' => true,
        ]);

        $result = $this->service->getDashboardData($this->clientId, $month);

        $this->assertNotEmpty($result['goals']);
        $this->assertSame('Test Goal', $result['goals'][0]['name']);
    }

    public function test_get_dashboard_data_comparison_with_previous_month(): void
    {
        $month = now()->format('Y-m');
        $prevMonth = now()->subMonth()->format('Y-m');

        Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'account_id' => $this->accountId,
            'date' => $prevMonth.'-10',
            'month' => $prevMonth,
            'amount' => 2000,
            'type' => 'salary',
        ]);
        Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'account_id' => $this->accountId,
            'date' => $month.'-10',
            'month' => $month,
            'amount' => 3000,
            'type' => 'salary',
        ]);

        $result = $this->service->getDashboardData($this->clientId, $month);

        $this->assertSame(1000.0, $result['comparison']['income_diff']);
        $this->assertSame(50.0, $result['comparison']['income_pct']);
    }
}
