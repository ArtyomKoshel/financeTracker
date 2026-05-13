<?php

namespace App\Http\Controllers\Api\Ai;

use App\Http\Controllers\Api\Controller;
use App\Services\Ai\AiProviderService;
use App\Services\Ai\AiUsageService;
use Illuminate\Http\JsonResponse;

class AiUsageController extends Controller
{
    public function __construct(
        private readonly AiUsageService $usageService,
    ) {}

    public function index(): JsonResponse
    {
        $usage = $this->usageService->get($this->clientId());
        $provider = AiProviderService::getProviderForUser($this->clientId());
        $fallback = ['provider' => $provider, 'limit_requests' => null, 'remaining_requests' => null, 'limit_tokens' => null, 'remaining_tokens' => null, 'reset_requests' => null, 'reset_tokens' => null, 'updated_at' => null];

        return $this->success($usage ?? $fallback);
    }

    public function refresh(): JsonResponse
    {
        $usage = $this->usageService->refresh($this->clientId());

        if (! $usage) {
            return $this->error('Не удалось обновить данные. Проверьте GROQ_API_KEY.', 503);
        }

        return $this->success($usage);
    }
}
