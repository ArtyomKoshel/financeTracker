<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class AdminOnly
{
    public function handle(Request $request, Closure $next)
    {
        if (! (app()->bound('is_admin') ? app('is_admin') : false)) {
            return response()->json(['success' => false, 'error' => 'Forbidden: admin access required'], 403);
        }

        return $next($request);
    }
}
