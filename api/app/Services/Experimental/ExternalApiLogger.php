<?php

namespace App\Services\Experimental;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Логирование запросов к внешним API (Groq, и т.д.).
 * Изолированный сервис — не влияет на основной функционал.
 */
class ExternalApiLogger
{
    public static function log(
        string $service,
        ?int $statusCode,
        ?int $durationMs,
        ?int $clientId = null,
        ?string $endpoint = null,
        ?string $method = 'POST',
        ?array $requestMeta = null,
        ?array $responseMeta = null,
        ?string $errorMessage = null
    ): void {
        if (! Schema::hasTable('external_api_logs')) {
            return;
        }

        try {
            DB::table('external_api_logs')->insert([
                'client_id' => $clientId,
                'service' => $service,
                'endpoint' => $endpoint,
                'method' => $method,
                'status_code' => $statusCode,
                'duration_ms' => $durationMs,
                'request_meta' => $requestMeta ? json_encode($requestMeta, JSON_UNESCAPED_UNICODE) : null,
                'response_meta' => $responseMeta ? json_encode($responseMeta, JSON_UNESCAPED_UNICODE) : null,
                'error_message' => $errorMessage,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (\Throwable $e) {
            \Log::warning('ExternalApiLogger failed', ['error' => $e->getMessage()]);
        }
    }
}
