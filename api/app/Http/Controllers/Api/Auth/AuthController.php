<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Api\Controller;
use App\Http\Requests\Shared\LoginRequest;
use App\Models\ActivityLog;
use App\Services\Auth\AuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;

class AuthController extends Controller
{
    protected AuthService $authService;

    public function __construct(AuthService $authService)
    {
        $this->authService = $authService;
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $result = $this->authService->login(
            $request->input('email'),
            $request->input('password')
        );

        if (! $result) {
            Log::warning('Login failed', [
                'email' => $request->input('email'),
                'ip' => $request->ip(),
            ]);

            return $this->error('Invalid credentials', 401);
        }

        ActivityLog::create([
            'user_id' => $result['user']['id'],
            'action' => 'login',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
        ]);

        Log::info('Login success', ['email' => $request->input('email')]);

        return $this->success($result);
    }
}
