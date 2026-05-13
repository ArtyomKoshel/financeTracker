<?php

namespace Tests\Unit;

use App\Models\Account;
use App\Models\Category;
use App\Models\Transaction;
use App\Models\User;
use App\Services\RecommendationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RecommendationServiceTest extends TestCase
{
    use RefreshDatabase;

    private RecommendationService $service;

    private int $clientId;

    private int $accountId;

    private int $categoryId;

    protected function setUp(): void
    {
        parent::setUp();
        $user = User::factory()->create();
        $this->clientId = $user->id;
        app()->instance('client_id', $this->clientId);
        $this->service = app(RecommendationService::class);

        $account = Account::withoutGlobalScope('client')->create([
            'name' => 'Main',
            'balance' => 5000,
            'client_id' => $this->clientId,
        ]);
        $this->accountId = $account->id;

        $cat = Category::withoutGlobalScope('client')->create([
            'name' => 'Продукты',
            'client_id' => $this->clientId,
            'is_active' => true,
        ]);
        $this->categoryId = $cat->id;
    }

    public function test_get_recommendations_returns_array(): void
    {
        $result = $this->service->getRecommendations($this->clientId);

        $this->assertIsArray($result);
    }

    public function test_spending_increase_recommendation(): void
    {
        $lastMonth = now()->subMonth()->format('Y-m');
        $thisMonth = now()->format('Y-m');

        $this->createExpense(100, $lastMonth);
        $this->createIncome(5000, $thisMonth);
        $this->createExpense(200, $thisMonth);

        $result = $this->service->getRecommendations($this->clientId);

        $types = array_column($result, 'type');
        $this->assertContains('spending_increase', $types);
    }

    public function test_low_savings_recommendation(): void
    {
        $month = now()->format('Y-m');
        $this->createIncome(5000, $month);

        $result = $this->service->getRecommendations($this->clientId);

        $types = array_column($result, 'type');
        $this->assertContains('low_savings', $types);
    }

    public function test_category_concentration_recommendation(): void
    {
        $month = now()->format('Y-m');
        $this->createIncome(5000, $month);
        $this->createExpense(400, $month);

        $result = $this->service->getRecommendations($this->clientId);

        $types = array_column($result, 'type');
        $this->assertContains('category_concentration', $types);
    }

    public function test_debt_critical_recommendation(): void
    {
        $month = now()->format('Y-m');
        $this->createIncome(3000, $month);

        DB::table('debts')->insert([
            'client_id' => $this->clientId,
            'name' => 'Big Loan',
            'total_amount' => 50000,
            'paid_amount' => 0,
            'monthly_payment' => 2000,
            'is_active' => true,
            'type' => 'loan',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $result = $this->service->getRecommendations($this->clientId);

        $types = array_column($result, 'type');
        $this->assertContains('debt_critical', $types);
    }

    public function test_no_recommendations_for_healthy_finances(): void
    {
        $lastMonth = now()->subMonth()->format('Y-m');
        $month = now()->format('Y-m');

        $this->createIncome(5000, $lastMonth);
        $this->createExpense(2000, $lastMonth);

        $this->createIncome(5000, $month);
        $this->createExpense(2000, $month);

        Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'account_id' => $this->accountId,
            'date' => $month.'-15',
            'month' => $month,
            'amount' => -1000,
            'type' => 'savings',
            'description' => 'Savings',
        ]);

        $result = $this->service->getRecommendations($this->clientId);

        $types = array_column($result, 'type');
        $this->assertNotContains('spending_increase', $types);
        $this->assertNotContains('low_savings', $types);
    }

    private function createExpense(float $amount, string $month): void
    {
        Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'account_id' => $this->accountId,
            'category_id' => $this->categoryId,
            'date' => $month.'-15',
            'month' => $month,
            'amount' => -$amount,
            'type' => 'expense',
            'description' => 'Test expense',
        ]);
    }

    private function createIncome(float $amount, string $month): void
    {
        Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'account_id' => $this->accountId,
            'date' => $month.'-05',
            'month' => $month,
            'amount' => $amount,
            'type' => 'salary',
            'description' => 'Salary',
        ]);
    }
}
