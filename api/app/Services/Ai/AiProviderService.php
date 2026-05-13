<?php

namespace App\Services\Ai;

use App\Models\UserExperimentalFeature;

class AiProviderService
{
    public static function getProviderForUser(int $userId): string
    {
        $features = UserExperimentalFeature::getFeaturesForUser($userId);
        $supported = array_keys(config('ai.providers', []));

        foreach ($features as $code) {
            if (str_starts_with($code, 'ai_provider:')) {
                $candidate = substr($code, strlen('ai_provider:'));
                if (in_array($candidate, $supported, true)) {
                    return $candidate;
                }
            }
        }

        return config('ai.default_provider', 'groq');
    }

    /** @return array{base_url: string, api_key: string|null, model: string, verify_ssl?: bool} */
    public static function getProviderConfig(string $provider): array
    {
        /** @var array{base_url: string, api_key: string|null, model: string, verify_ssl?: bool} */
        return config("ai.providers.{$provider}");
    }
}
