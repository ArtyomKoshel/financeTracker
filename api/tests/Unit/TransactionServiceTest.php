<?php

namespace Tests\Unit;

use App\Models\Account;
use App\Models\Category;
use App\Models\Transaction;
use App\Models\User;
use App\Services\TransactionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TransactionServiceTest extends TestCase
{
    use RefreshDatabase;

    private TransactionService $service;

    private int $clientId;

    private int $accountId;

    private int $categoryId;

    protected function setUp(): void
    {
        parent::setUp();
        $user = User::factory()->create();
        $this->clientId = $user->id;
        app()->instance('client_id', $this->clientId);
        $this->service = app(TransactionService::class);
        $account = Account::withoutGlobalScope('client')->create([
            'name' => 'Main',
            'balance' => 1000,
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

    public function test_create_expense_decreases_balance(): void
    {
        $data = [
            'client_id' => $this->clientId,
            'date' => now()->format('Y-m-d'),
            'amount' => 100,
            'type' => 'expense',
            'category_id' => $this->categoryId,
            'account_id' => $this->accountId,
            'description' => 'Продукты',
        ];

        $tx = $this->service->create($data);

        $this->assertInstanceOf(Transaction::class, $tx);
        $this->assertLessThan(0, $tx->amount);
        $account = Account::withoutGlobalScope('client')->find($this->accountId);
        $this->assertSame(900.0, (float) $account->balance);
    }

    public function test_create_income_increases_balance(): void
    {
        $data = [
            'client_id' => $this->clientId,
            'date' => now()->format('Y-m-d'),
            'amount' => 500,
            'type' => 'salary',
            'account_id' => $this->accountId,
            'description' => 'Зарплата',
        ];

        $tx = $this->service->create($data);

        $this->assertGreaterThan(0, $tx->amount);
        $account = Account::withoutGlobalScope('client')->find($this->accountId);
        $this->assertSame(1500.0, (float) $account->balance);
    }

    public function test_create_savings_increases_balance_negative_amount(): void
    {
        $data = [
            'client_id' => $this->clientId,
            'date' => now()->format('Y-m-d'),
            'amount' => 200,
            'type' => 'savings',
            'account_id' => $this->accountId,
            'description' => 'В копилку',
        ];

        $tx = $this->service->create($data);

        $this->assertLessThan(0, $tx->amount);
        $account = Account::withoutGlobalScope('client')->find($this->accountId);
        $this->assertSame(800.0, (float) $account->balance);
    }

    public function test_delete_reverses_balance(): void
    {
        $data = [
            'client_id' => $this->clientId,
            'date' => now()->format('Y-m-d'),
            'amount' => 50,
            'type' => 'expense',
            'category_id' => $this->categoryId,
            'account_id' => $this->accountId,
            'description' => 'Кофе',
        ];
        $tx = $this->service->create($data);
        $this->assertSame(950.0, (float) Account::withoutGlobalScope('client')->find($this->accountId)->balance);

        $result = $this->service->delete($tx->id, $this->clientId);

        $this->assertTrue($result);
        $account = Account::withoutGlobalScope('client')->find($this->accountId);
        $this->assertSame(1000.0, (float) $account->balance);
    }

    public function test_delete_returns_false_for_wrong_client(): void
    {
        $data = [
            'client_id' => $this->clientId,
            'date' => now()->format('Y-m-d'),
            'amount' => 50,
            'type' => 'expense',
            'account_id' => $this->accountId,
        ];
        $tx = $this->service->create($data);

        $result = $this->service->delete($tx->id, 99999);

        $this->assertFalse($result);
    }
}
