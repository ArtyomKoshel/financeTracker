<?php

namespace App\Http\Controllers\Api\Shared;

use App\Events\DataUpdated;
use App\Http\Controllers\Api\Controller;
use App\Models\ActivityLog;
use App\Services\Banking\ExchangeRateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class SettingsController extends Controller
{
    public function __construct(protected ExchangeRateService $exchangeRateService) {}

    public function index(Request $request): JsonResponse
    {
        $clientId = $this->clientId();
        $rows = DB::table('settings')->where('client_id', $clientId)->get();

        $data = [
            'salary_config' => [],
            'rub_rate' => '',
            'eur_rate' => '',
            'usd_rate' => '',
            'advance_day' => '',
            'salary_day' => '',
            'savings_percent' => '',
            'min_living_budget' => '',
            'rates_updated' => '',
            'auto_savings_percent' => '',
            'auto_savings_goal_id' => '',
        ];

        foreach ($rows as $row) {
            $data[$row->key] = $row->value;
        }

        $data['salary_config'] = [
            'gross_salary' => (float) ($data['gross_salary'] ?? 0),
            'expected_advance' => (float) ($data['expected_advance'] ?? 0),
        ];

        return $this->success($data);
    }

    public function update(Request $request): JsonResponse
    {
        $clientId = $this->clientId();
        $data = $request->all();
        $allowed = ['gross_salary', 'expected_advance', 'advance_day', 'salary_day', 'savings_percent', 'min_living_budget', 'usd_rate', 'eur_rate', 'rub_rate', 'rates_updated', 'push_overdue', 'push_upcoming', 'push_upcoming_days', 'theme', 'auto_savings_percent', 'auto_savings_goal_id'];
        $changes = [];

        foreach ($allowed as $key) {
            if (! array_key_exists($key, $data)) {
                continue;
            }
            $val = $data[$key];
            if (in_array($key, ['push_overdue', 'push_upcoming'], true)) {
                $newVal = ($val === true || $val === '1' || $val === 1 || $val === 'true') ? '1' : '0';
            } elseif ($key === 'theme') {
                $newVal = in_array($val, ['dark', 'light'], true) ? $val : 'dark';
            } elseif ($key === 'push_upcoming_days') {
                $newVal = (string) max(0, min(7, (int) $val));
            } elseif ($val === null || $val === '') {
                continue;
            } else {
                $newVal = (string) $val;
            }
            $oldRow = DB::table('settings')->where('client_id', $clientId)->where('key', $key)->first();
            $oldVal = $oldRow?->value;

            DB::table('settings')->updateOrInsert(
                ['client_id' => $clientId, 'key' => $key],
                ['value' => $newVal]
            );
            if (in_array($key, ['usd_rate', 'eur_rate', 'rub_rate'])) {
                $this->saveRateToHistory($clientId, $key, $newVal, now()->format('Y-m-d'));
                Cache::forget("rates:{$clientId}");
            } elseif ($key === 'rates_updated') {
                Cache::forget("rates:{$clientId}");
            }

            if ($oldVal !== $newVal) {
                $changes[$key] = ['old' => $oldVal, 'new' => $newVal];
            }
        }

        if (! empty($changes)) {
            ActivityLog::create([
                'user_id' => $clientId,
                'action' => 'settings_update',
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'details' => ['changes' => $changes],
                'created_at' => now(),
            ]);
        }

        event(new DataUpdated('settings'));
        event(new DataUpdated('dashboard'));

        return $this->success(['updated' => true]);
    }

    public function getRates(Request $request): JsonResponse
    {
        $clientId = $this->clientId();
        $cacheKey = "rates:{$clientId}";
        $ttl = (int) config('services.nbrb.rates_cache_ttl', 3600);

        $result = Cache::remember($cacheKey, $ttl, function () use ($clientId) {
            $rows = DB::table('settings')
                ->where('client_id', $clientId)
                ->whereIn('key', ['usd_rate', 'eur_rate', 'rub_rate', 'rates_updated'])
                ->get();

            $data = ['RUB' => '', 'EUR' => '', 'USD' => '', 'updated' => ''];
            foreach ($rows as $row) {
                if ($row->key === 'rates_updated') {
                    $data['updated'] = $row->value;
                } else {
                    $data[strtoupper(str_replace('_rate', '', $row->key))] = $row->value;
                }
            }

            return $data;
        });

        return $this->success($result);
    }

    public function updateRates(Request $request): JsonResponse
    {
        $clientId = $this->clientId();
        $rates = $this->exchangeRateService->fetchNBRBRates();
        if (! empty($rates)) {
            ActivityLog::create([
                'user_id' => $clientId,
                'action' => 'settings_update',
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'details' => ['action' => 'rates_auto_update', 'rates' => $rates],
                'created_at' => now(),
            ]);

            $today = now()->format('Y-m-d');
            foreach ($rates as $currency => $rate) {
                $key = strtolower($currency).'_rate';
                DB::table('settings')->updateOrInsert(
                    ['client_id' => $clientId, 'key' => $key],
                    ['value' => (string) $rate]
                );
                $this->saveRateToHistory($clientId, $key, (string) $rate, $today);
            }
            DB::table('settings')->updateOrInsert(
                ['client_id' => $clientId, 'key' => 'rates_updated'],
                ['value' => now()->format('Y-m-d H:i')]
            );
            Cache::forget("rates:{$clientId}");
            event(new DataUpdated('settings'));
            event(new DataUpdated('dashboard'));
        }

        return $this->success([
            'rates' => $rates,
            'updated' => now()->format('Y-m-d H:i'),
        ]);
    }

    public function getRatesAtDate(Request $request): JsonResponse
    {
        $clientId = $this->clientId();
        $date = $request->query('date', now()->format('Y-m-d'));
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return $this->error('Invalid date format', 400);
        }
        $result = ['RUB' => '', 'EUR' => '', 'USD' => '', 'updated' => ''];
        foreach (['usd_rate', 'eur_rate', 'rub_rate'] as $key) {
            $row = DB::table('settings_history')
                ->where('client_id', $clientId)
                ->where('key', $key)
                ->where('valid_from', '<=', $date)
                ->where(function ($q) use ($date) {
                    $q->whereNull('valid_to')->orWhere('valid_to', '>=', $date);
                })
                ->orderByDesc('valid_from')
                ->first();
            if ($row) {
                $currency = strtoupper(str_replace('_rate', '', $key));
                $result[$currency] = $row->value;
            } else {
                $r = DB::table('settings')->where('client_id', $clientId)->where('key', $key)->first();
                if ($r) {
                    $currency = strtoupper(str_replace('_rate', '', $key));
                    $result[$currency] = $r->value;
                }
            }
        }
        $row = DB::table('settings')->where('client_id', $clientId)->where('key', 'rates_updated')->first();
        if ($row) {
            $result['updated'] = $row->value;
        }

        return $this->success($result);
    }

    protected function saveRateToHistory(int $clientId, string $key, string $value, string $validFrom): void
    {
        $prev = DB::table('settings_history')
            ->where('client_id', $clientId)
            ->where('key', $key)
            ->whereNull('valid_to')
            ->first();
        if ($prev) {
            $yesterday = date('Y-m-d', strtotime($validFrom.' -1 day'));
            DB::table('settings_history')->where('id', $prev->id)->update(['valid_to' => $yesterday]);
        }
        DB::table('settings_history')->insert([
            'client_id' => $clientId,
            'key' => $key,
            'value' => $value,
            'valid_from' => $validFrom,
            'valid_to' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function generateTelegramCode(Request $request): JsonResponse
    {
        $clientId = $this->clientId();
        /** @var \App\Models\User $user */
        $user = $request->user();

        if ($user->telegram_chat_id) {
            return $this->success(['already_linked' => true, 'message' => 'Telegram уже привязан']);
        }

        $code = strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
        $ttl = (int) config('telegram.link_code_ttl', 300);

        \Illuminate\Support\Facades\Redis::setex("telegram_link:{$code}", $ttl, (string) $clientId);

        return $this->success(['code' => $code, 'ttl' => $ttl]);
    }

    public function unlinkTelegram(Request $request): JsonResponse
    {
        /** @var \App\Models\User $user */
        $user = $request->user();

        if (! $user->telegram_chat_id) {
            return $this->error('Telegram не привязан', 400);
        }

        $user->update(['telegram_chat_id' => null]);

        return $this->success(['unlinked' => true]);
    }

    public function telegramStatus(Request $request): JsonResponse
    {
        /** @var \App\Models\User $user */
        $user = $request->user();

        return $this->success([
            'linked' => $user->telegram_chat_id !== null,
        ]);
    }
}
