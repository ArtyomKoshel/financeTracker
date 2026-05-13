<?php

namespace App\Console\Commands;

use App\Services\Notifications\PushPreferencesService;
use App\Services\Notifications\PushService;
use App\Services\Plans\PaymentService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SendPaymentReminderPush extends Command
{
    public function __construct(
        protected PaymentService $paymentService,
        protected PushPreferencesService $prefs
    ) {
        parent::__construct();
    }

    protected $signature = 'push:payment-reminders';

    protected $description = 'Send push notifications for overdue and upcoming payments';

    public function handle(): int
    {
        try {
            $pushService = PushService::fromConfig();
        } catch (\Throwable $e) {
            $this->warn('Push not configured: '.$e->getMessage());

            return 0;
        }

        $userIds = DB::table('push_subscriptions')->distinct()->pluck('user_id');
        $sent = 0;

        foreach ($userIds as $userId) {
            app()->instance('client_id', $userId);

            $reminders = $this->paymentService->getReminders($userId);
            foreach ($reminders as $r) {
                if ($r['is_paid']) {
                    continue;
                }
                $payment = $r['payment'];
                $amount = (float) ($payment['original_amount'] ?? $payment['amount']);
                $name = $payment['name'] ?? 'Платёж';
                $daysUntil = $r['days_until'] ?? 999;

                if ($r['is_overdue'] && $this->prefs->wantsOverdue($userId)) {
                    $n = $pushService->sendOverdueReminder($userId, $name, $amount);
                    $sent += $n;
                } elseif ($this->prefs->wantsUpcoming($userId, $daysUntil)) {
                    $dueDate = $r['due_date'] ?? '';
                    $n = $pushService->sendUpcomingReminder($userId, $name, $amount, $dueDate);
                    $sent += $n;
                }
            }
        }

        $this->info("Sent {$sent} push notifications.");

        return 0;
    }
}
