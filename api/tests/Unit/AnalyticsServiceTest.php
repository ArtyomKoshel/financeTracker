<?php

namespace Tests\Unit;

use App\Models\Account;
use App\Models\Category;
use App\Models\Transaction;
use App\Models\User;
use App\Services\AnalyticsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AnalyticsServiceTest extends TestCase
{
    use RefreshDatabase;

    private AnalyticsService $service;

    private int $clientId;

    private int $accountId;

    private int $categoryId;

    protected function setUp(): void
    {
        parent::setUp();
        $user = User::factory()->create();
        $this->clientId = $user->id;
        app()->instance('client_id', $this->clientId);
        $this->service = app(AnalyticsService::class);

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

    public function test_get_analytics_returns_expected_structure(): void
    {
        $month = now()->format('Y-m');
        $this->createTransaction('expense', -100, $month);
        $this->createTransaction('salary', 3000, $month);

        $result = $this->service->getAnalytics($this->clientId, $month);

        $this->assertArrayHasKey('total_income', $result);
        $this->assertArrayHasKey('total_expenses', $result);
        $this->assertArrayHasKey('total_savings', $result);
        $this->assertArrayHasKey('by_category', $result);
        $this->assertArrayHasKey('monthly_trend', $result);
        $this->assertArrayHasKey('anomalies', $result);
        $this->assertArrayHasKey('insights', $result);
    }

    public function test_get_analytics_calculates_totals_correctly(): void
    {
        $month = now()->format('Y-m');
        $this->createTransaction('expense', -200, $month);
        $this->createTransaction('expense', -150, $month);
        $this->createTransaction('salary', 5000, $month);

        $result = $this->service->getAnalytics($this->clientId, $month);

        $this->assertSame(5000.0, $result['total_income']);
        $this->assertSame(350.0, $result['total_expenses']);
    }

    public function test_get_expenses_by_category_returns_correct_data(): void
    {
        $month = now()->format('Y-m');
        $this->createTransaction('expense', -300, $month);

        $result = $this->service->getExpensesByCategory($this->clientId, $month);

        $this->assertNotEmpty($result);
        $this->assertSame('Продукты', $result[0]['category_name']);
        $this->assertSame(300.0, $result[0]['amount']);
        $this->assertSame(100.0, $result[0]['percent']);
    }

    public function test_get_yearly_analytics_returns_expected_structure(): void
    {
        $year = (int) now()->format('Y');
        $month = now()->format('Y-m');
        $this->createTransaction('expense', -500, $month);
        $this->createTransaction('salary', 3000, $month);

        $result = $this->service->getYearlyAnalytics($this->clientId, $year);

        $this->assertSame($year, $result['year']);
        $this->assertArrayHasKey('total_income', $result);
        $this->assertArrayHasKey('total_expenses', $result);
        $this->assertArrayHasKey('total_savings', $result);
        $this->assertArrayHasKey('avg_monthly_income', $result);
        $this->assertArrayHasKey('avg_monthly_expenses', $result);
        $this->assertArrayHasKey('by_category', $result);
        $this->assertArrayHasKey('monthly_data', $result);
    }

    public function test_compare_months_returns_differences(): void
    {
        $month1 = now()->subMonth()->format('Y-m');
        $month2 = now()->format('Y-m');
        $this->createTransaction('expense', -200, $month1);
        $this->createTransaction('expense', -400, $month2);

        $result = $this->service->compareMonths($this->clientId, $month1, $month2);

        $this->assertSame($month1, $result['month1']);
        $this->assertSame($month2, $result['month2']);
        $this->assertArrayHasKey('income_diff', $result);
        $this->assertArrayHasKey('expenses_diff', $result);
        $this->assertArrayHasKey('categories', $result);
    }

    public function test_get_category_trend_returns_monthly_data(): void
    {
        $month = now()->format('Y-m');
        $this->createTransaction('expense', -100, $month);

        $result = $this->service->getCategoryTrend($this->clientId, $this->categoryId, 6);

        $this->assertSame($this->categoryId, $result['category_id']);
        $this->assertSame('Продукты', $result['category_name']);
        $this->assertArrayHasKey('monthly_data', $result);
        $this->assertArrayHasKey('average', $result);
        $this->assertArrayHasKey('min', $result);
        $this->assertArrayHasKey('max', $result);
    }

    public function test_get_year_over_year_returns_comparison(): void
    {
        $month = now()->format('Y-m');

        $result = $this->service->getYearOverYear($this->clientId, $month);

        $this->assertSame($month, $result['current_month']);
        $this->assertArrayHasKey('previous_year_month', $result);
        $this->assertArrayHasKey('income', $result);
        $this->assertArrayHasKey('expenses', $result);
        $this->assertArrayHasKey('savings', $result);
        $this->assertArrayHasKey('change_percent', $result['income']);
    }

    public function test_get_spending_velocity_returns_expected_keys(): void
    {
        $this->createTransaction('expense', -50, now()->format('Y-m'), now()->subDays(2)->format('Y-m-d'));

        $result = $this->service->getSpendingVelocity($this->clientId);

        $this->assertArrayHasKey('last_7_days', $result);
        $this->assertArrayHasKey('daily_average_7d', $result);
        $this->assertArrayHasKey('projected_monthly', $result);
        $this->assertArrayHasKey('velocity_ratio', $result);
        $this->assertArrayHasKey('on_track', $result);
    }

    public function test_get_top_growing_categories_returns_limited_results(): void
    {
        $month = now()->format('Y-m');
        $lastMonth = now()->subMonth()->format('Y-m');
        $this->createTransaction('expense', -100, $lastMonth);
        $this->createTransaction('expense', -300, $month);

        $result = $this->service->getTopGrowingCategories($this->clientId, 3);

        $this->assertIsArray($result);
        $this->assertLessThanOrEqual(3, count($result));
    }

    private function createTransaction(string $type, float $amount, string $month, ?string $date = null): Transaction
    {
        return Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'account_id' => $this->accountId,
            'category_id' => $type === 'expense' ? $this->categoryId : null,
            'date' => $date ?? $month.'-15',
            'month' => $month,
            'amount' => $amount,
            'type' => $type,
            'description' => 'Test '.$type,
        ]);
    }
}
