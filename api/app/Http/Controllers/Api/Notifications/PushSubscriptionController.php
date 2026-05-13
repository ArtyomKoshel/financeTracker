<?php

namespace App\Http\Controllers\Api\Notifications;

use App\Http\Controllers\Api\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PushSubscriptionController extends Controller
{
    /**
     * Get public VAPID key for client subscription
     */
    public function vapidPublic(): JsonResponse
    {
        $key = config('services.webpush.vapid_public');
        if (! $key) {
            return $this->error('Push notifications not configured', 503);
        }

        return $this->success(['publicKey' => $key]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'endpoint' => 'required|string|max:500',
            'keys' => 'required|array',
            'keys.p256dh' => 'required|string|max:255',
            'keys.auth' => 'required|string|max:255',
        ]);

        $userId = $this->clientId();
        $endpoint = $request->input('endpoint');
        $p256dh = $request->input('keys.p256dh');
        $auth = $request->input('keys.auth');

        $now = now();
        DB::table('push_subscriptions')->updateOrInsert(
            ['user_id' => $userId, 'endpoint' => $endpoint],
            [
                'p256dh' => $p256dh,
                'auth' => $auth,
                'user_agent' => $request->userAgent(),
                'created_at' => $now,
                'updated_at' => $now,
            ]
        );
        ActivityLog::create([
            'user_id' => $userId,
            'action' => 'push_subscribe',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => [],
            'created_at' => $now,
        ]);

        return $this->success(['subscribed' => true]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $endpoint = $request->input('endpoint');
        if (! $endpoint) {
            return $this->error('endpoint required', 400);
        }

        $userId = $this->clientId();
        $deleted = DB::table('push_subscriptions')
            ->where('user_id', $userId)
            ->where('endpoint', $endpoint)
            ->delete();
        if ($deleted > 0) {
            ActivityLog::create([
                'user_id' => $userId,
                'action' => 'push_unsubscribe',
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'details' => [],
                'created_at' => now(),
            ]);
        }

        return $this->success(['deleted' => $deleted > 0]);
    }
}
