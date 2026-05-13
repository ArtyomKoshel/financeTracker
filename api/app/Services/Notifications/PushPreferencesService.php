<?php

namespace App\Services\Notifications;

use Illuminate\Support\Facades\DB;

class PushPreferencesService
{
    public const KEY_OVERDUE = 'push_overdue';

    public const KEY_UPCOMING = 'push_upcoming';

    public const KEY_UPCOMING_DAYS = 'push_upcoming_days';

    public function get(int $clientId): array
    {
        $rows = DB::table('settings')
            ->where('client_id', $clientId)
            ->whereIn('key', [self::KEY_OVERDUE, self::KEY_UPCOMING, self::KEY_UPCOMING_DAYS])
            ->get()
            ->keyBy('key');

        return [
            'push_overdue' => ($rows->get(self::KEY_OVERDUE)?->value ?? '1') === '1',
            'push_upcoming' => ($rows->get(self::KEY_UPCOMING)?->value ?? '1') === '1',
            'push_upcoming_days' => (int) ($rows->get(self::KEY_UPCOMING_DAYS)?->value ?? 1),
        ];
    }

    public function update(int $clientId, array $data): void
    {
        foreach ([self::KEY_OVERDUE, self::KEY_UPCOMING, self::KEY_UPCOMING_DAYS] as $key) {
            if (array_key_exists($key, $data)) {
                $value = $key === self::KEY_UPCOMING_DAYS
                    ? (string) max(0, min(7, (int) $data[$key]))
                    : ($data[$key] ? '1' : '0');
                DB::table('settings')->updateOrInsert(
                    ['client_id' => $clientId, 'key' => $key],
                    ['value' => $value]
                );
            }
        }
    }

    public function wantsOverdue(int $clientId): bool
    {
        $row = DB::table('settings')->where('client_id', $clientId)->where('key', self::KEY_OVERDUE)->first();

        return ! $row || $row->value === '1';
    }

    public function wantsUpcoming(int $clientId, int $daysUntil): bool
    {
        $row = DB::table('settings')->where('client_id', $clientId)->where('key', self::KEY_UPCOMING)->first();
        if ($row && $row->value === '0') {
            return false;
        }
        $daysRow = DB::table('settings')->where('client_id', $clientId)->where('key', self::KEY_UPCOMING_DAYS)->first();
        $maxDays = $daysRow ? (int) $daysRow->value : 1;

        return $daysUntil <= $maxDays && $daysUntil >= 0;
    }
}
