<?php

namespace App\Services\Ai;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;

class AiUsageService
{
    private const CACHE_KEY_PREFIX = 'ai_usage_';

    private const CACHE_TTL = 3600;

    /** @return array{provider: string, limit_requests: int|null, remaining_requests: int|null, limit_tokens: int|null, remaining_tokens: int|null, reset_requests: string|null, reset_tokens: string|null, updated_at: string|null}|null */
    public function get(int $userId): ?array
    {
        $provider = AiProviderService::getProviderForUser($userId);
        if ($provider !== 'groq') {
            return ['provider' => $provider, 'limit_requests' => null, 'remaining_requests' => null, 'limit_tokens' => null, 'remaining_tokens' => null, 'reset_requests' => null, 'reset_tokens' => null, 'updated_at' => null];
        }

        $data = Cache::get(self::CACHE_KEY_PREFIX.$userId);

        return $data ? array_merge(['provider' => $provider], $data) : null;
    }

    public function storeFromResponse(int $userId, Response $response): void
    {
        $data = [
            'limit_requests' => $this->parseInt($response->header('x-ratelimit-limit-requests')),
            'remaining_requests' => $this->parseInt($response->header('x-ratelimit-remaining-requests')),
            'limit_tokens' => $this->parseInt($response->header('x-ratelimit-limit-tokens')),
            'remaining_tokens' => $this->parseInt($response->header('x-ratelimit-remaining-tokens')),
            'reset_requests' => $response->header('x-ratelimit-reset-requests'),
            'reset_tokens' => $response->header('x-ratelimit-reset-tokens'),
            'updated_at' => now()->toIso8601String(),
        ];

        Cache::put(self::CACHE_KEY_PREFIX.$userId, $data, self::CACHE_TTL);
    }

    /** @return array{provider: string, limit_requests: int|null, remaining_requests: int|null, limit_tokens: int|null, remaining_tokens: int|null, reset_requests: string|null, reset_tokens: string|null}|null */
    public function refresh(int $userId): ?array
    {
        $provider = AiProviderService::getProviderForUser($userId);
        if ($provider !== 'groq') {
            return ['provider' => $provider, 'limit_requests' => null, 'remaining_requests' => null, 'limit_tokens' => null, 'remaining_tokens' => null, 'reset_requests' => null, 'reset_tokens' => null, 'updated_at' => null];
        }

        $config = AiProviderService::getProviderConfig($provider);
        $apiKey = $config['api_key'] ?? null;
        if (! $apiKey) {
            return null;
        }

        $http = \Illuminate\Support\Facades\Http::withToken((string) $apiKey)
            ->withHeaders(['Content-Type' => 'application/json']);

        if (isset($config['verify_ssl']) && $config['verify_ssl'] === false) {
            $http = $http->withoutVerifying();
        }

        $response = $http->post("{$config['base_url']}/chat/completions", [
            'model' => $config['model'],
            'messages' => [['role' => 'user', 'content' => '.']],
            'max_tokens' => 1,
        ]);

        if ($response->successful()) {
            $this->storeFromResponse($userId, $response);
        }

        return $this->get($userId);
    }

    private function parseInt(mixed $value): ?int
    {
        if ($value === null) {
            return null;
        }
        $arr = is_array($value) ? $value : [$value];
        $first = $arr[0] ?? null;

        return $first !== null && is_numeric($first) ? (int) $first : null;
    }

    private function first(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $arr = is_array($value) ? $value : [$value];
        $first = $arr[0] ?? null;

        return $first !== null ? (string) $first : null;
    }
}
