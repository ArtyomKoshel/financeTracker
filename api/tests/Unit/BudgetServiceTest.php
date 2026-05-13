<?php

namespace Tests\Unit;

use App\Models\Account;
use App\Models\Category;
use App\Models\CategoryBudget;
use App\Models\User;
use App\Services\Budget\BudgetService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

class BudgetServiceTest extends TestCase
{
    use RefreshDatabase;

    private BudgetService $service;

    private int $clientId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(BudgetService::class);
        $user = User::factory()->create();
        $this->clientId = $user->id;
        $this->seedMinimalData();
    }

    private function seedMinimalData(): void
    {
        Account::withoutGlobalScope('client')->create([
            'name' => 'Main',
            'balance' => 5000,
            'client_id' => $this->clientId,
        ]);
        $cat = Category::withoutGlobalScope('client')->create([
            'name' => 'Продукты',
            'client_id' => $this->clientId,
            'is_active' => true,
        ]);
        $month = now()->format('Y-m');
        CategoryBudget::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'category_id' => $cat->id,
            'month' => $month,
            'limit_amount' => 600,
            'is_essential' => true,
            'alert_percent' => 80,
        ]);
        \DB::table('settings')->insert([
            ['client_id' => $this->clientId, 'key' => 'salary_day', 'value' => '15'],
            ['client_id' => $this->clientId, 'key' => 'advance_day', 'value' => '30'],
            ['client_id' => $this->clientId, 'key' => 'min_living_budget', 'value' => '500'],
            ['client_id' => $this->clientId, 'key' => 'savings_percent', 'value' => '20'],
        ]);
    }

    public function test_calculate_cashflow_returns_expected_structure(): void
    {
        app()->instance('client_id', $this->clientId);
        $request = new Request;

        $result = $this->service->calculateCashflow($request);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('balance', $result);
        $this->assertArrayHasKey('living_budget', $result);
        $this->assertArrayHasKey('free_funds', $result);
        $this->assertArrayHasKey('days_until_income', $result);
        $this->assertArrayHasKey('suggested_savings', $result);
        $this->assertArrayHasKey('status', $result);
        $this->assertArrayHasKey('message', $result);
        $this->assertArrayHasKey('payments_list', $result);
        $this->assertContains($result['status'], ['success', 'info', 'warning']);
        $this->assertIsFloat($result['balance']);
        $this->assertIsInt($result['days_until_income']);
    }

    public function test_calculate_cashflow_balance_matches_account(): void
    {
        app()->instance('client_id', $this->clientId);
        $request = new Request;

        $result = $this->service->calculateCashflow($request);

        $expectedBalance = (float) Account::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)
            ->sum('balance');
        $this->assertSame(round($expectedBalance, 2), round($result['balance'], 2));
    }
}
