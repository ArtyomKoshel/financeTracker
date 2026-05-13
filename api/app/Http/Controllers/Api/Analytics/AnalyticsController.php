<?php

namespace App\Http\Controllers\Api\Analytics;

use App\Http\Controllers\Api\Controller;
use App\Services\Analytics\AnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AnalyticsController extends Controller
{
    protected AnalyticsService $analyticsService;

    public function __construct(AnalyticsService $analyticsService)
    {
        $this->analyticsService = $analyticsService;
    }

    public function index(Request $request): JsonResponse
    {
        $month = $request->query('month', now()->format('Y-m'));
        $data = $this->analyticsService->getAnalytics($this->clientId(), $month);

        return $this->success($data);
    }

    public function getByCategory(Request $request): JsonResponse
    {
        $month = $request->query('month', now()->format('Y-m'));
        $data = $this->analyticsService->getExpensesByCategory($this->clientId(), $month);

        return $this->success($data);
    }

    public function getYearly(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', now()->year);
        $data = $this->analyticsService->getYearlyAnalytics($this->clientId(), $year);

        return $this->success($data);
    }

    public function compareMonths(Request $request): JsonResponse
    {
        $month1 = $request->query('month1');
        $month2 = $request->query('month2');
        if (! $month1 || ! $month2) {
            return $this->error('month1 and month2 required', 400);
        }
        $data = $this->analyticsService->compareMonths($this->clientId(), $month1, $month2);

        return $this->success($data);
    }

    public function getCategoryTrend(Request $request): JsonResponse
    {
        $categoryId = $request->query('category_id');
        if ($categoryId === null || $categoryId === '') {
            return $this->error('category_id required', 400);
        }
        $categoryId = (int) $categoryId;
        $months = (int) $request->query('months', 6);
        $data = $this->analyticsService->getCategoryTrend($this->clientId(), $categoryId, $months);

        return $this->success($data);
    }

    /**
     * Year-over-year comparison.
     * GET /api/analytics/yoy?month=2026-02
     */
    public function yearOverYear(Request $request): JsonResponse
    {
        $month = $request->query('month', now()->format('Y-m'));
        $data = $this->analyticsService->getYearOverYear($this->clientId(), $month);

        return $this->success($data);
    }

    /**
     * Spending velocity (7-day annualized vs budget).
     * GET /api/analytics/velocity
     */
    public function spendingVelocity(): JsonResponse
    {
        $data = $this->analyticsService->getSpendingVelocity($this->clientId());

        return $this->success($data);
    }

    /**
     * Top growing categories (month-over-month).
     * GET /api/analytics/top-growth?limit=5
     */
    public function topGrowth(Request $request): JsonResponse
    {
        $limit = min(10, max(3, (int) $request->query('limit', 5)));
        $data = $this->analyticsService->getTopGrowingCategories($this->clientId(), $limit);

        return $this->success($data);
    }
}
