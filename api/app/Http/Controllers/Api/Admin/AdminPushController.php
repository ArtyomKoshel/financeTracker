<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\Controller;
use App\Models\ActivityLog;
use App\Services\Notifications\PushService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminPushController extends Controller
{
    public function send(Request $request): JsonResponse
    {
        $title = trim((string) ($request->input('title') ?? ''));
        $body = trim((string) ($request->input('body') ?? ''));
        $target = $request->input('target', 'all');
        $userId = $request->input('user_id');

        if ($title === '' || $body === '') {
            return $this->error('Заголовок и текст обязательны', 400);
        }

        try {
            $pushService = PushService::fromConfig();
        } catch (\Throwable $e) {
            return $this->error('Push не настроен: '.$e->getMessage(), 500);
        }

        $sent = 0;
        if ($target === 'user' && $userId) {
            $sent = $pushService->sendToUser((int) $userId, $title, $body, ['type' => 'admin_message']);
        } else {
            $userIds = DB::table('push_subscriptions')->distinct()->pluck('user_id');
            foreach ($userIds as $uid) {
                $sent += $pushService->sendToUser((int) $uid, $title, $body, ['type' => 'admin_message']);
            }
        }
        ActivityLog::create([
            'user_id' => $this->clientId(),
            'action' => 'admin_push_send',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['title' => $title, 'target' => $target, 'target_user_id' => $userId, 'sent' => $sent],
            'created_at' => now(),
        ]);

        return $this->success(['sent' => $sent]);
    }

    public function campaigns(Request $request): JsonResponse
    {
        $rows = DB::table('push_campaigns')
            ->orderByDesc('created_at')
            ->limit(50)
            ->get();

        $list = $rows->map(fn ($r) => [
            'id' => $r->id,
            'title' => $r->title,
            'body' => $r->body,
            'target' => $r->target,
            'target_user_id' => $r->target_user_id,
            'scheduled_at' => $r->scheduled_at,
            'sent_at' => $r->sent_at,
            'sent_count' => (int) $r->sent_count,
            'created_at' => $r->created_at,
        ]);

        return $this->success(['campaigns' => $list]);
    }

    public function createCampaign(Request $request): JsonResponse
    {
        $title = trim((string) ($request->input('title') ?? ''));
        $body = trim((string) ($request->input('body') ?? ''));
        $target = $request->input('target', 'all');
        $userId = $request->input('user_id');
        $scheduledAt = $request->input('scheduled_at');

        if ($title === '' || $body === '') {
            return $this->error('Заголовок и текст обязательны', 400);
        }

        $adminId = $this->clientId();
        $targetUserId = ($target === 'user' && $userId) ? (int) $userId : null;
        $scheduled = $scheduledAt ? now()->parse($scheduledAt) : null;

        $id = DB::table('push_campaigns')->insertGetId([
            'title' => $title,
            'body' => $body,
            'target' => $target,
            'target_user_id' => $targetUserId,
            'scheduled_at' => $scheduled,
            'sent_at' => null,
            'sent_count' => 0,
            'created_by' => $adminId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        ActivityLog::create([
            'user_id' => $adminId,
            'action' => 'admin_push_campaign',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['campaign_id' => $id, 'title' => $title, 'target' => $target, 'scheduled_at' => $scheduled?->toIso8601String()],
            'created_at' => now(),
        ]);

        return $this->success(['id' => $id, 'scheduled_at' => $scheduled?->toIso8601String()]);
    }
}
