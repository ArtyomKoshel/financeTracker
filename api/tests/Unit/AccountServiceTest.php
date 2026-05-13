<?php

namespace Tests\Unit;

use App\Models\Account;
use App\Models\User;
use App\Services\Accounts\AccountService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccountServiceTest extends TestCase
{
    use RefreshDatabase;

    private AccountService $service;

    private int $clientId;

    protected function setUp(): void
    {
        parent::setUp();
        $user = User::factory()->create();
        $this->clientId = $user->id;
        app()->instance('client_id', $this->clientId);
        $this->service = new AccountService;
    }

    public function test_update_balance_increments_account(): void
    {
        Account::withoutGlobalScope('client')->create([
            'name' => 'Main',
            'balance' => 1000,
            'client_id' => $this->clientId,
        ]);

        $this->service->updateBalance($this->clientId, 250);

        $account = Account::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)->first();
        $this->assertSame(1250.0, (float) $account->balance);
    }

    public function test_update_balance_decrements_account(): void
    {
        Account::withoutGlobalScope('client')->create([
            'name' => 'Main',
            'balance' => 1000,
            'client_id' => $this->clientId,
        ]);

        $this->service->updateBalance($this->clientId, -300);

        $account = Account::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)->first();
        $this->assertSame(700.0, (float) $account->balance);
    }

    public function test_update_balance_by_account_targets_specific_account(): void
    {
        $a1 = Account::withoutGlobalScope('client')->create([
            'name' => 'Account A',
            'balance' => 500,
            'client_id' => $this->clientId,
        ]);
        $a2 = Account::withoutGlobalScope('client')->create([
            'name' => 'Account B',
            'balance' => 200,
            'client_id' => $this->clientId,
        ]);

        $this->service->updateBalanceByAccount($a2->id, $this->clientId, 100);

        $this->assertSame(500.0, (float) Account::withoutGlobalScope('client')->find($a1->id)->balance);
        $this->assertSame(300.0, (float) Account::withoutGlobalScope('client')->find($a2->id)->balance);
    }

    public function test_get_or_create_default_creates_when_none_exists(): void
    {
        $account = $this->service->getOrCreateDefault($this->clientId);

        $this->assertInstanceOf(Account::class, $account);
        $this->assertSame(0.0, (float) $account->balance);
        $this->assertSame($this->clientId, $account->client_id);
    }

    public function test_get_or_create_default_returns_existing(): void
    {
        $existing = Account::withoutGlobalScope('client')->create([
            'name' => 'Existing',
            'balance' => 777,
            'client_id' => $this->clientId,
        ]);

        $account = $this->service->getOrCreateDefault($this->clientId);

        $this->assertSame($existing->id, $account->id);
        $this->assertSame(777.0, (float) $account->balance);
    }

    public function test_get_all_for_client_returns_only_client_accounts(): void
    {
        Account::withoutGlobalScope('client')->create([
            'name' => 'Mine',
            'balance' => 100,
            'client_id' => $this->clientId,
        ]);
        $other = User::factory()->create();
        Account::withoutGlobalScope('client')->create([
            'name' => 'Other',
            'balance' => 999,
            'client_id' => $other->id,
        ]);

        $accounts = $this->service->getAllForClient($this->clientId);

        $this->assertCount(1, $accounts);
        $this->assertSame('Mine', $accounts->first()->name);
    }

    public function test_get_total_balance_sums_all_accounts(): void
    {
        Account::withoutGlobalScope('client')->create([
            'name' => 'A',
            'balance' => 300,
            'client_id' => $this->clientId,
        ]);
        Account::withoutGlobalScope('client')->create([
            'name' => 'B',
            'balance' => 700,
            'client_id' => $this->clientId,
        ]);

        $total = $this->service->getTotalBalance($this->clientId);

        $this->assertSame(1000.0, $total);
    }

    public function test_get_total_balance_returns_zero_when_no_accounts(): void
    {
        $total = $this->service->getTotalBalance($this->clientId);

        $this->assertSame(0.0, $total);
    }
}
