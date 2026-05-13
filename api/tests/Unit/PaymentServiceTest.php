<?php

namespace Tests\Unit;

use App\Models\Account;
use App\Models\RecurringPayment;
use App\Models\Transaction;
use App\Models\User;
use App\Services\PaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PaymentServiceTest extends TestCase
{
    use RefreshDatabase;

    private PaymentService $service;

    private int $clientId;

    private int $accountId;

    protected function setUp(): void
    {
        parent::setUp();
        $user = User::factory()->create();
        $this->clientId = $user->id;
        app()->instance('client_id', $this->clientId);
        $this->service = new PaymentService;

        $account = Account::withoutGlobalScope('client')->create([
            'name' => 'Main',
            'balance' => 5000,
            'client_id' => $this->clientId,
        ]);
        $this->accountId = $account->id;
    }

    public function test_get_reminders_returns_active_payments(): void
    {
        RecurringPayment::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Rent',
            'amount' => 500,
            'day_of_month' => 25,
            'is_active' => true,
            'is_income' => false,
        ]);

        $result = $this->service->getReminders($this->clientId);

        $this->assertNotEmpty($result);
        $this->assertSame('Rent', $result[0]['payment']['name']);
        $this->assertArrayHasKey('due_date', $result[0]);
        $this->assertArrayHasKey('is_paid', $result[0]);
        $this->assertArrayHasKey('is_overdue', $result[0]);
        $this->assertArrayHasKey('days_until', $result[0]);
    }

    public function test_get_reminders_excludes_income_payments(): void
    {
        RecurringPayment::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Salary',
            'amount' => 5000,
            'day_of_month' => 10,
            'is_active' => true,
            'is_income' => true,
        ]);

        $result = $this->service->getReminders($this->clientId);

        $this->assertEmpty($result);
    }

    public function test_get_reminders_excludes_inactive_payments(): void
    {
        RecurringPayment::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Old Payment',
            'amount' => 100,
            'day_of_month' => 15,
            'is_active' => false,
            'is_income' => false,
        ]);

        $result = $this->service->getReminders($this->clientId);

        $this->assertEmpty($result);
    }

    public function test_get_reminders_marks_paid_payment(): void
    {
        $payment = RecurringPayment::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Internet',
            'amount' => 30,
            'day_of_month' => 5,
            'is_active' => true,
            'is_income' => false,
        ]);

        $month = now()->format('Y-m');
        Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'account_id' => $this->accountId,
            'recurring_payment_id' => $payment->id,
            'date' => $month.'-05',
            'month' => $month,
            'amount' => -30,
            'type' => 'expense',
        ]);

        $result = $this->service->getReminders($this->clientId);

        $paid = collect($result)->firstWhere('payment.name', 'Internet');
        $this->assertNotNull($paid);
        $this->assertTrue($paid['is_paid']);
    }

    public function test_get_calendar_returns_grouped_by_date(): void
    {
        RecurringPayment::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Rent',
            'amount' => 500,
            'day_of_month' => 15,
            'is_active' => true,
            'is_income' => false,
        ]);

        $result = $this->service->getCalendar($this->clientId, 60);

        $this->assertIsArray($result);
        foreach ($result as $date => $payments) {
            $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}$/', $date);
            $this->assertNotEmpty($payments);
            $this->assertArrayHasKey('payment', $payments[0]);
            $this->assertArrayHasKey('is_paid', $payments[0]);
        }
    }

    public function test_get_subscription_cancel_reminders_returns_upcoming(): void
    {
        RecurringPayment::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Netflix',
            'amount' => 15,
            'day_of_month' => 1,
            'is_active' => true,
            'is_income' => false,
            'is_subscription' => true,
            'cancel_by_date' => now()->addDays(10)->format('Y-m-d'),
        ]);

        $result = $this->service->getSubscriptionCancelReminders($this->clientId);

        $this->assertNotEmpty($result);
        $this->assertSame('Netflix', $result[0]['payment']['name']);
        $this->assertArrayHasKey('cancel_by_date', $result[0]);
        $this->assertArrayHasKey('days_until', $result[0]);
    }

    public function test_get_subscription_cancel_reminders_excludes_past_dates(): void
    {
        RecurringPayment::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'name' => 'Expired Sub',
            'amount' => 10,
            'day_of_month' => 1,
            'is_active' => true,
            'is_income' => false,
            'is_subscription' => true,
            'cancel_by_date' => now()->subDays(5)->format('Y-m-d'),
        ]);

        $result = $this->service->getSubscriptionCancelReminders($this->clientId);

        $this->assertEmpty($result);
    }
}
