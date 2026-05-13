<?php

namespace App\Http\Controllers\Api\Shared;

use App\Http\Controllers\Api\Controller;
use App\Services\Tax\TaxService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaxController extends Controller
{
    public function __construct(protected TaxService $taxService) {}

    public function summary(Request $request): JsonResponse
    {
        $request->validate([
            'date_from' => ['nullable', 'regex:/^\d{4}-\d{2}$/'],
            'date_to' => ['nullable', 'regex:/^\d{4}-\d{2}$/'],
        ]);

        $clientId = $this->clientId();
        $dateFrom = $request->query('date_from') ?: now()->startOfYear()->format('Y-m');
        $dateTo = $request->query('date_to') ?: now()->format('Y-m');

        return $this->success($this->taxService->getSummary($clientId, $dateFrom, $dateTo));
    }
}
