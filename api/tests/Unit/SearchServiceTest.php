<?php

namespace Tests\Unit;

use App\Models\Account;
use App\Models\Category;
use App\Models\Transaction;
use App\Models\User;
use App\Services\System\SearchService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SearchServiceTest extends TestCase
{
    use RefreshDatabase;

    private SearchService $service;

    private int $clientId;

    private int $accountId;

    private int $categoryId;

    protected function setUp(): void
    {
        parent::setUp();
        $user = User::factory()->create();
        $this->clientId = $user->id;
        app()->instance('client_id', $this->clientId);
        $this->service = new SearchService;

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

    public function test_search_returns_expected_structure(): void
    {
        $result = $this->service->search($this->clientId, 'test');

        $this->assertArrayHasKey('transactions', $result);
        $this->assertArrayHasKey('categories', $result);
        $this->assertArrayHasKey('notes', $result);
    }

    public function test_search_finds_transactions_by_description(): void
    {
        Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'account_id' => $this->accountId,
            'category_id' => $this->categoryId,
            'date' => now()->format('Y-m-d'),
            'month' => now()->format('Y-m'),
            'amount' => -50,
            'type' => 'expense',
            'description' => 'Магнит супермаркет',
        ]);
        Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'account_id' => $this->accountId,
            'date' => now()->format('Y-m-d'),
            'month' => now()->format('Y-m'),
            'amount' => 3000,
            'type' => 'salary',
            'description' => 'Зарплата',
        ]);

        $result = $this->service->search($this->clientId, 'Магнит');

        $this->assertCount(1, $result['transactions']);
        $this->assertSame('Магнит супермаркет', $result['transactions'][0]['description']);
    }

    public function test_search_finds_categories_by_name(): void
    {
        $result = $this->service->search($this->clientId, 'Продукт');

        $this->assertNotEmpty($result['categories']);
        $this->assertSame('Продукты', $result['categories'][0]['name']);
    }

    public function test_search_returns_empty_for_no_matches(): void
    {
        $result = $this->service->search($this->clientId, 'xyznonexistent');

        $this->assertEmpty($result['transactions']);
        $this->assertEmpty($result['categories']);
    }

    public function test_search_respects_limit(): void
    {
        for ($i = 0; $i < 5; $i++) {
            Transaction::withoutGlobalScope('client')->create([
                'client_id' => $this->clientId,
                'account_id' => $this->accountId,
                'date' => now()->format('Y-m-d'),
                'month' => now()->format('Y-m'),
                'amount' => -10,
                'type' => 'expense',
                'description' => "Кофе порция $i",
            ]);
        }

        $result = $this->service->search($this->clientId, 'Кофе', 3);

        $this->assertLessThanOrEqual(3, count($result['transactions']));
    }

    public function test_search_transaction_includes_category_info(): void
    {
        Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'account_id' => $this->accountId,
            'category_id' => $this->categoryId,
            'date' => now()->format('Y-m-d'),
            'month' => now()->format('Y-m'),
            'amount' => -100,
            'type' => 'expense',
            'description' => 'Тестовая покупка',
        ]);

        $result = $this->service->search($this->clientId, 'Тестовая');

        $this->assertNotEmpty($result['transactions']);
        $this->assertSame('Продукты', $result['transactions'][0]['category_name']);
    }
}
