<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\Auth\AuthService;
use Closure;
use Illuminate\Http\Request;

class JwtAuth
{
    protected AuthService $authService;

    public function __construct(AuthService $authService)
    {
        $this->authService = $authService;
    }

    public function handle(Request $request, Closure $next)
    {
        $authHeader = $request->header('Authorization');
        if (! $authHeader || strpos($authHeader, 'Bearer ') !== 0) {
            return response()->json(['success' => false, 'error' => 'Unauthorized'], 401);
        }

        $token = substr($authHeader, 7);
        $payload = $this->authService->verifyToken($token);
        if (! $payload) {
            return response()->json(['success' => false, 'error' => 'Invalid token'], 401);
        }

        $user = User::find($payload['user_id']);
        if (! $user || ! $user->is_active) {
            return response()->json(['success' => false, 'error' => 'Invalid token'], 401);
        }

        auth()->login($user);
        app()->instance('client_id', $user->id);
        app()->instance('is_admin', $payload['is_admin']);

        return $next($request);
    }
}
