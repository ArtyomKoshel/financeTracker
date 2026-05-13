<?php

namespace App\Http\Controllers\Api\Analytics;

use App\Http\Controllers\Api\Controller;
use App\Models\NetWorthSnapshot;
use App\Services\Budget\BudgetService;
use App\Services\System\HealthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HealthController extends Controller
{
    protected BudgetService $budgetService;

    protected HealthService $healthService;

    public function __construct(BudgetService $budgetService, HealthService $healthService)
    {
        $this->budgetService = $budgetService;
        $this->healthService = $healthService;
    }

    public function index(Request $request): JsonResponse
    {
        $clientId = $this->clientId();
        $health = $this->healthService->calculateHealth($clientId);

        $cashflow = $this->budgetService->calculateCashflow($clientId);
        $health->cashflow_free = $cashflow['free_funds'] ?? 0;
        $health->cashflow_deficit = $cashflow['cashflow_deficit'] ?? false;

        return $this->success($health);
    }

    /**
     * Get net worth history snapshots.
     * GET /api/health/net-worth-history?months=12
     */
    public function netWorthHistory(Request $request): JsonResponse
    {
        $clientId = $this->clientId();
        $months = min(36, max(3, (int) $request->query('months', 12)));

        $snapshots = NetWorthSnapshot::where('client_id', $clientId)
            ->where('month', '>=', now()->subMonths($months)->format('Y-m'))
            ->orderBy('month')
            ->get()
            ->map(fn ($s) => [
                'month' => $s->month,
                'total_balance' => (float) $s->total_balance,
                'total_savings' => (float) $s->total_savings,
                'total_debt' => (float) $s->total_debt,
                'net_worth' => (float) $s->net_worth,
            ]);

        return $this->success($snapshots);
    }
}
