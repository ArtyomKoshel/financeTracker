<?php

namespace App\Http\Controllers\Api\Analytics;

use App\Http\Controllers\Api\Controller;
use App\Services\Analytics\ForecastService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ForecastController extends Controller
{
    public function __construct(protected ForecastService $forecastService) {}

    public function index(Request $request): JsonResponse
    {
        $clientId = $this->clientId();
        $months = min(6, max(1, (int) $request->query('months', 3)));
        $withScenarios = $request->boolean('scenarios', false);

        if ($withScenarios) {
            $data = $this->forecastService->getForecastWithScenarios($clientId, $months);
        } else {
            $data = $this->forecastService->getForecast($clientId, $months);
        }

        return $this->success($data);
    }
}
