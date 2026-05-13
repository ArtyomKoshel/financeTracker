<?php

namespace App\Console\Commands;

use App\Services\Notifications\PushService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SendPushCampaigns extends Command
{
    protected $signature = 'push:campaigns';

    protected $description = 'Send scheduled push campaigns';

    public function handle(): int
    {
        $rows = DB::table('push_campaigns')
            ->whereNull('sent_at')
            ->whereNotNull('scheduled_at')
            ->where('scheduled_at', '<=', now())
            ->get();

        if ($rows->isEmpty()) {
            return 0;
        }

        try {
            $pushService = PushService::fromConfig();
        } catch (\Throwable $e) {
            $this->warn('Push not configured: '.$e->getMessage());

            return 1;
        }

        foreach ($rows as $row) {
            $sent = 0;
            if ($row->target === 'user' && $row->target_user_id) {
                $sent = $pushService->sendToUser((int) $row->target_user_id, $row->title, $row->body, ['type' => 'admin_campaign']);
            } else {
                $userIds = DB::table('push_subscriptions')->distinct()->pluck('user_id');
                foreach ($userIds as $uid) {
                    $sent += $pushService->sendToUser((int) $uid, $row->title, $row->body, ['type' => 'admin_campaign']);
                }
            }

            DB::table('push_campaigns')->where('id', $row->id)->update([
                'sent_at' => now(),
                'sent_count' => $sent,
                'updated_at' => now(),
            ]);

            $this->info("Campaign #{$row->id} sent to {$sent} recipients.");
        }

        return 0;
    }
}
