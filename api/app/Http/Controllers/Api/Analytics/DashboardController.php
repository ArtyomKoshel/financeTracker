<?php

namespace App\Http\Controllers\Api\Analytics;

use App\Http\Controllers\Api\Controller;
use App\Services\Budget\BudgetService;
use App\Services\System\DashboardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    protected BudgetService $budgetService;

    protected DashboardService $dashboardService;

    public function __construct(BudgetService $budgetService, DashboardService $dashboardService)
    {
        $this->budgetService = $budgetService;
        $this->dashboardService = $dashboardService;
    }

    public function index(Request $request): JsonResponse
    {
        $clientId = $this->clientId();
        $currentMonth = now()->format('Y-m');

        $data = $this->dashboardService->getDashboardData($clientId, $currentMonth);
        $data['cashflow'] = $this->budgetService->calculateCashflow($clientId);

        return $this->success($data);
    }
}
