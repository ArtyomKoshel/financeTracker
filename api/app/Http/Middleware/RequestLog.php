<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

class RequestLog
{
    public function handle(Request $request, Closure $next): Response
    {
        $start = microtime(true);

        $response = $next($request);

        $duration = round((microtime(true) - $start) * 1000);
        Log::info('Request', [
            'method' => $request->method(),
            'uri' => $request->path(),
            'status' => $response->getStatusCode(),
            'duration_ms' => $duration,
            'ip' => $request->ip(),
        ]);

        return $response;
    }
}
