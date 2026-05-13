<?php

namespace App\Console\Commands;

use App\Models\Account;
use App\Models\RecurringPayment;
use App\Models\Transaction;
use App\Services\Accounts\AccountService;
use App\Services\Settings\SettingsService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class AutoDebitSubscriptions extends Command
{
    protected $signature = 'finance:auto-debit';

    protected $description = 'Auto-create transactions for subscription payments on their billing day';

    public function handle(AccountService $accountService, SettingsService $settingsService): int
    {
        $today = now();
        $dayOfMonth = (int) $today->format('j');
        $currentMonth = $today->format('Y-m');
        $currentDate = $today->format('Y-m-d');

        // Find all active subscriptions that have is_auto_debit=true
        // and their day_of_month matches today
        $subscriptions = RecurringPayment::withoutGlobalScope('client')
            ->where('is_active', true)
            ->where('is_auto_debit', true)
            ->where('is_income', false)
            ->where('day_of_month', $dayOfMonth)
            ->get();

        $created = 0;

        foreach ($subscriptions as $sub) {
            // Check if transaction for this subscription already exists this month
            $existing = Transaction::withoutGlobalScope('client')
                ->where('client_id', $sub->client_id)
                ->where('recurring_payment_id', $sub->id)
                ->where('month', $currentMonth)
                ->exists();

            if ($existing) {
                continue;
            }

            // Check cancel_by_date
            if ($sub->cancel_by_date && $sub->cancel_by_date->lte($today)) {
                continue;
            }

            // Calculate amount in BYN
            $amount = (float) $sub->amount;
            $currency = $sub->currency ?? 'BYN';
            $amountBYN = $amount;
            $exchangeRate = null;

            if ($currency !== 'BYN') {
                $rate = $settingsService->getRate($sub->client_id, $currency);
                $amountBYN = $amount * $rate;
                $exchangeRate = $rate;
            }

            $accountId = Account::withoutGlobalScope('client')
                ->where('client_id', $sub->client_id)
                ->value('id');

            if (! $accountId) {
                continue;
            }

            DB::transaction(function () use ($sub, $currentDate, $currentMonth, $amountBYN, $amount, $currency, $exchangeRate, $accountId, $accountService) {
                Transaction::create([
                    'client_id' => $sub->client_id,
                    'date' => $currentDate,
                    'amount' => -abs($amountBYN),
                    'original_amount' => $amount,
                    'currency' => $currency,
                    'exchange_rate' => $exchangeRate,
                    'type' => 'expense',
                    'category_id' => $sub->category_id,
                    'account_id' => $accountId,
                    'recurring_payment_id' => $sub->id,
                    'description' => "Авто: {$sub->name}",
                    'month' => $currentMonth,
                ]);

                $accountService->updateBalanceByAccount($accountId, $sub->client_id, -abs($amountBYN));
            });

            $created++;
        }

        $this->info("Auto-debit: {$created} subscription transactions created.");

        return self::SUCCESS;
    }
}
