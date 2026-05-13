<?php

namespace App\Http\Middleware;

use App\Models\UserExperimentalFeature;
use Closure;
use Illuminate\Http\Request;

class ExperimentalFeature
{
    public function handle(Request $request, Closure $next, string $featureCode)
    {
        $user = auth()->user();
        if (! $user) {
            return response()->json(['success' => false, 'error' => 'Unauthorized'], 401);
        }

        if (! \Schema::hasTable('user_experimental_features')) {
            return response()->json(['success' => false, 'error' => 'Feature not available'], 403);
        }

        if (! UserExperimentalFeature::hasFeature($user->id, $featureCode)) {
            return response()->json(['success' => false, 'error' => 'Feature not available'], 403);
        }

        return $next($request);
    }
}
