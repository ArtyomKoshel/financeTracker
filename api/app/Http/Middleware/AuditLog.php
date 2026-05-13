<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware для аудита критичных операций
 *
 * Логирует:
 * - POST/PUT/DELETE запросы (кроме GET)
 * - User ID, IP, endpoint, payload
 * - Response status
 */
class AuditLog
{
    /**
     * Эндпоинты, которые НЕ логируются (слишком частые/нечувствительные)
     */
    private const SKIP_ENDPOINTS = [
        'api/ping',
        'api/bootstrap',
        'api/me',
        'api/dashboard',
        'api/balance',
        'api/transactions', // GET только (логируем POST/DELETE)
        'api/categories', // GET только
        'api/payments', // GET только
    ];

    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $startTime = microtime(true);

        $response = $next($request);

        // Логируем только мутирующие операции (POST, PUT, DELETE, PATCH)
        if (! in_array($request->method(), ['POST', 'PUT', 'DELETE', 'PATCH'])) {
            return $response;
        }

        // Проверяем, не в списке исключений ли эндпоинт
        $path = $request->path();
        foreach (self::SKIP_ENDPOINTS as $skip) {
            if (str_starts_with($path, $skip)) {
                return $response;
            }
        }

        $duration = round((microtime(true) - $startTime) * 1000, 2);

        try {
            $userId = auth()->id();
            $statusCode = $response->getStatusCode();

            // Получаем payload (исключаем чувствительные поля)
            $payload = $request->except(['password', 'password_hash', 'token', 'api_key']);
            $payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE);

            // Ограничиваем размер payload до 5000 символов
            if (strlen($payloadJson) > 5000) {
                $payloadJson = substr($payloadJson, 0, 5000).'... (truncated)';
            }

            DB::table('audit_logs')->insert([
                'user_id' => $userId,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'method' => $request->method(),
                'endpoint' => $path,
                'payload' => $payloadJson,
                'status_code' => $statusCode,
                'duration_ms' => $duration,
                'created_at' => now(),
            ]);
        } catch (\Exception $e) {
            // Не падаем, если логирование не удалось
            Log::warning('Audit log failed: '.$e->getMessage());
        }

        return $response;
    }
}
