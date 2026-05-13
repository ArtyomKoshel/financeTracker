<?php

namespace App\Services\Notifications;

use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

class PushService
{
    public function __construct(
        protected string $vapidPublic,
        protected string $vapidPrivate
    ) {}

    public static function fromConfig(): self
    {
        if (! extension_loaded('bcmath') && ! extension_loaded('gmp')) {
            throw new \RuntimeException(
                'Для отправки push требуется PHP-расширение BCMath или GMP. '
                .'В php.ini раскомментируйте: extension=bcmath (или extension=gmp). '
                .'После изменения перезапустите PHP/веб-сервер.'
            );
        }
        $public = config('services.webpush.vapid_public');
        $private = config('services.webpush.vapid_private');
        if (! $public || ! $private) {
            throw new \RuntimeException('VAPID keys not configured. Run: php artisan webpush:vapid');
        }

        return new self($public, $private);
    }

    /**
     * Send push notification to a user's subscriptions
     */
    public function sendToUser(int $userId, string $title, string $body, array $data = []): int
    {
        $subs = \Illuminate\Support\Facades\DB::table('push_subscriptions')
            ->where('user_id', $userId)
            ->get();

        $sent = 0;
        $auth = [
            'VAPID' => [
                'subject' => config('app.url'),
                'publicKey' => $this->vapidPublic,
                'privateKey' => $this->vapidPrivate,
            ],
        ];

        $webPush = new WebPush($auth);

        foreach ($subs as $sub) {
            $subscription = Subscription::create([
                'endpoint' => $sub->endpoint,
                'keys' => [
                    'p256dh' => $sub->p256dh,
                    'auth' => $sub->auth,
                ],
            ]);

            $payload = json_encode([
                'title' => $title,
                'body' => $body,
                'data' => $data,
            ]);

            $report = $webPush->sendOneNotification($subscription, $payload);

            if ($report->isSuccess()) {
                $sent++;
            } else {
                if ($report->isSubscriptionExpired()) {
                    \Illuminate\Support\Facades\DB::table('push_subscriptions')
                        ->where('id', $sub->id)
                        ->delete();
                }
            }
        }

        return $sent;
    }

    /**
     * Send overdue payment reminder
     */
    public function sendOverdueReminder(int $userId, string $paymentName, float $amount): int
    {
        return $this->sendToUser(
            $userId,
            '⚠️ Просроченный платёж',
            "{$paymentName}: ".number_format($amount, 2).' Br',
            ['type' => 'overdue_payment', 'tab' => 'plans']
        );
    }

    /**
     * Send upcoming payment reminder (e.g. tomorrow)
     */
    public function sendUpcomingReminder(int $userId, string $paymentName, float $amount, string $dueDate): int
    {
        return $this->sendToUser(
            $userId,
            '📅 Напоминание о платеже',
            "{$paymentName}: ".number_format($amount, 2)." Br — {$dueDate}",
            ['type' => 'upcoming_payment', 'tab' => 'plans']
        );
    }
}
