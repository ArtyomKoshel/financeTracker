<?php

namespace Tests\Unit;

use App\Models\Debt;
use App\Models\User;
use App\Services\Accounts\DebtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DebtServiceTest extends TestCase
{
    use RefreshDatabase;

    private DebtService $service;

    private int $clientId;

    protected function setUp(): void
    {
        parent::setUp();
        $user = User::factory()->create();
        $this->clientId = $user->id;
        app()->instance('client_id', $this->clientId);
        $this->service = new DebtService;
    }

    public function test_list_returns_debts_for_client(): void
    {
        Debt::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Car Loan',
            'total_amount' => 20000,
            'paid_amount' => 5000,
            'type' => 'loan',
            'is_active' => true,
        ]);

        $result = $this->service->list($this->clientId);

        $this->assertCount(1, $result);
    }

    public function test_create_debt_returns_resource_data(): void
    {
        $data = [
            'name' => 'Student Loan',
            'total_amount' => 15000,
            'currency' => 'BYN',
            'due_date' => now()->addYear()->format('Y-m-d'),
            'monthly_payment' => 500,
            'type' => 'loan',
        ];

        $result = $this->service->create($this->clientId, $data);

        $this->assertArrayHasKey('id', $result);
        $this->assertSame('Student Loan', $result['name']);
        $this->assertSame(15000.0, (float) $result['total_amount']);
    }

    public function test_create_debt_sets_paid_amount_to_zero(): void
    {
        $data = [
            'name' => 'New Debt',
            'total_amount' => 5000,
        ];

        $this->service->create($this->clientId, $data);

        $debt = Debt::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)->first();
        $this->assertSame(0.0, (float) $debt->paid_amount);
    }

    public function test_update_debt_changes_paid_amount(): void
    {
        $debt = Debt::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Loan',
            'total_amount' => 10000,
            'paid_amount' => 1000,
            'type' => 'loan',
            'is_active' => true,
        ]);

        $request = new \Illuminate\Http\Request([
            'id' => $debt->id,
            'paid_amount' => 3000,
        ]);

        $result = $this->service->update($this->clientId, $request);

        $this->assertSame($debt->id, $result['id']);
        $this->assertSame(7000.0, $result['remaining']);
    }

    public function test_soft_delete_deactivates_debt(): void
    {
        $debt = Debt::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Loan',
            'total_amount' => 5000,
            'paid_amount' => 0,
            'type' => 'loan',
            'is_active' => true,
        ]);

        $result = $this->service->softDelete($this->clientId, $debt->id);

        $this->assertTrue($result);
        $debt->refresh();
        $this->assertFalse($debt->is_active);
    }

    public function test_remaining_attribute_calculates_correctly(): void
    {
        $debt = Debt::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Test',
            'total_amount' => 8000,
            'paid_amount' => 3500,
            'type' => 'loan',
            'is_active' => true,
        ]);

        $this->assertSame(4500.0, $debt->remaining);
    }
}
