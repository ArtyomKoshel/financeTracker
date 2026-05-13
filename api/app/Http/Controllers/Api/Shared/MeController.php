<?php

namespace App\Http\Controllers\Api\Shared;

use App\Enums\ExperimentalFeature;
use App\Http\Controllers\Api\Controller;
use App\Models\UserExperimentalFeature;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Schema;

class MeController extends Controller
{
    public function index(): JsonResponse
    {
        $user = auth()->user();
        if (! $user) {
            return $this->error('Unauthorized', 401);
        }

        $experimentalFeatures = [];
        if (Schema::hasTable('user_experimental_features')) {
            $experimentalFeatures = UserExperimentalFeature::getFeaturesForUser($user->id);
        }

        $defaults = [ExperimentalFeature::ADVANCED_ANALYTICS, ExperimentalFeature::AI_ANALYSIS];
        $experimentalFeatures = array_values(array_unique(array_merge($defaults, $experimentalFeatures)));

        return $this->success([
            'id' => $user->id,
            'email' => $user->email,
            'name' => $user->name,
            'experimental_features' => $experimentalFeatures,
        ]);
    }
}
