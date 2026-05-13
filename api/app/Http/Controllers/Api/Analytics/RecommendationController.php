<?php

namespace App\Http\Controllers\Api\Analytics;

use App\Http\Controllers\Api\Controller;
use App\Services\Analytics\RecommendationService;
use Illuminate\Http\JsonResponse;

class RecommendationController extends Controller
{
    public function __construct(protected RecommendationService $recommendationService) {}

    public function index(): JsonResponse
    {
        $clientId = $this->clientId();
        $recommendations = $this->recommendationService->getRecommendations($clientId);

        return $this->success($recommendations);
    }
}
