<?php

namespace App\Services\Settings;

use Illuminate\Support\Facades\DB;

class SettingsService
{
    public function getRate(int $clientId, string $currency): float
    {
        $key = strtolower($currency).'_rate';
        $row = DB::table('settings')
            ->where('client_id', $clientId)
            ->where('key', $key)
            ->first();

        return $row ? (float) $row->value : 1.0;
    }

    public function getSetting(int $clientId, string $key, mixed $default = null): mixed
    {
        $row = DB::table('settings')
            ->where('client_id', $clientId)
            ->where('key', $key)
            ->first();

        return $row ? $row->value : $default;
    }
}
