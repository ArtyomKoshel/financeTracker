<?php

namespace App\Services\Banking;

class ExchangeRateService
{
    /** @return array<string, float> */
    public function fetchNBRBRates(): array
    {
        $rates = [];
        $codes = ['USD', 'EUR', 'RUB'];

        foreach ($codes as $code) {
            $url = "https://api.nbrb.by/exrates/rates/{$code}?parammode=2";
            $ctx = stream_context_create(['http' => ['timeout' => 5]]);
            $json = @file_get_contents($url, false, $ctx);
            if ($json) {
                $data = json_decode($json, true);
                if (! empty($data['Cur_OfficialRate'])) {
                    $rates[$code] = $data['Cur_OfficialRate'] / ($data['Cur_Scale'] ?? 1);
                }
            }
        }

        return $rates;
    }
}
