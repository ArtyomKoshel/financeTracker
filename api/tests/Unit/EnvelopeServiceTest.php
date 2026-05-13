<?php

namespace Tests\Unit;

use App\Models\Account;
use App\Models\Category;
use App\Models\Envelope;
use App\Models\Transaction;
use App\Models\User;
use App\Services\EnvelopeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EnvelopeServiceTest extends TestCase
{
    use RefreshDatabase;

    private EnvelopeService $service;

    private int $clientId;

    private int $categoryId;

    private int $accountId;

    protected function setUp(): void
    {
        parent::setUp();
        $user = User::factory()->create();
        $this->clientId = $user->id;
        app()->instance('client_id', $this->clientId);
        $this->service = new EnvelopeService;

        $cat = Category::withoutGlobalScope('client')->create([
            'name' => 'Продукты',
            'client_id' => $this->clientId,
            'is_active' => true,
        ]);
        $this->categoryId = $cat->id;

        $account = Account::withoutGlobalScope('client')->create([
            'name' => 'Main',
            'balance' => 5000,
            'client_id' => $this->clientId,
        ]);
        $this->accountId = $account->id;
    }

    public function test_list_returns_active_envelopes_for_month(): void
    {
        $month = now()->format('Y-m');
        Envelope::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Food',
            'allocated' => 500,
            'spent' => 100,
            'month' => $month,
            'is_active' => true,
        ]);
        Envelope::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Old',
            'allocated' => 200,
            'spent' => 0,
            'month' => now()->subMonth()->format('Y-m'),
            'is_active' => true,
        ]);

        $result = $this->service->list($this->clientId, $month);

        $this->assertCount(1, $result);
    }

    public function test_list_excludes_inactive_envelopes(): void
    {
        $month = now()->format('Y-m');
        Envelope::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Inactive',
            'allocated' => 300,
            'spent' => 0,
            'month' => $month,
            'is_active' => false,
        ]);

        $result = $this->service->list($this->clientId, $month);

        $this->assertCount(0, $result);
    }

    public function test_create_envelope_returns_resource_data(): void
    {
        $data = [
            'name' => 'Entertainment',
            'allocated' => 300,
            'month' => now()->format('Y-m'),
        ];

        $result = $this->service->create($this->clientId, $data);

        $this->assertArrayHasKey('id', $result);
        $this->assertSame('Entertainment', $result['name']);
    }

    public function test_create_envelope_sets_spent_to_zero(): void
    {
        $data = [
            'name' => 'Transport',
            'allocated' => 200,
            'month' => now()->format('Y-m'),
        ];

        $this->service->create($this->clientId, $data);

        $envelope = Envelope::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)->first();
        $this->assertSame(0.0, (float) $envelope->spent);
    }

    public function test_update_envelope_changes_allocated(): void
    {
        $envelope = Envelope::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Food',
            'allocated' => 500,
            'spent' => 100,
            'month' => now()->format('Y-m'),
            'is_active' => true,
        ]);

        $request = new \Illuminate\Http\Request([
            'id' => $envelope->id,
            'allocated' => 700,
        ]);

        $result = $this->service->update($this->clientId, $request);

        $this->assertSame($envelope->id, $result['id']);
        $this->assertSame(600.0, $result['remaining']);
    }

    public function test_soft_delete_deactivates_envelope(): void
    {
        $envelope = Envelope::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Food',
            'allocated' => 500,
            'spent' => 0,
            'month' => now()->format('Y-m'),
            'is_active' => true,
        ]);

        $result = $this->service->softDelete($this->clientId, $envelope->id);

        $this->assertTrue($result);
        $envelope->refresh();
        $this->assertFalse($envelope->is_active);
    }

    public function test_remaining_attribute_calculates_correctly(): void
    {
        $envelope = Envelope::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Test',
            'allocated' => 500,
            'spent' => 350,
            'month' => now()->format('Y-m'),
            'is_active' => true,
        ]);

        $this->assertSame(150.0, $envelope->remaining);
    }

    public function test_remaining_attribute_does_not_go_negative(): void
    {
        $envelope = Envelope::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Overspent',
            'allocated' => 100,
            'spent' => 200,
            'month' => now()->format('Y-m'),
            'is_active' => true,
        ]);

        $this->assertSame(0.0, $envelope->remaining);
    }

    public function test_sync_spent_from_transactions(): void
    {
        $month = now()->format('Y-m');
        $envelope = Envelope::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Food',
            'allocated' => 500,
            'spent' => 0,
            'month' => $month,
            'category_id' => $this->categoryId,
            'is_active' => true,
        ]);

        Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'account_id' => $this->accountId,
            'category_id' => $this->categoryId,
            'date' => $month.'-10',
            'month' => $month,
            'amount' => -150,
            'type' => 'expense',
        ]);
        Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'account_id' => $this->accountId,
            'category_id' => $this->categoryId,
            'date' => $month.'-20',
            'month' => $month,
            'amount' => -80,
            'type' => 'expense',
        ]);

        $this->service->syncSpentFromTransactions($this->clientId, $month);

        $envelope->refresh();
        $this->assertSame(230.0, (float) $envelope->spent);
    }
}
