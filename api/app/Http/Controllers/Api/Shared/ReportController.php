<?php

namespace App\Http\Controllers\Api\Shared;

use App\Http\Controllers\Api\Controller;
use App\Services\Analytics\ReportService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ReportController extends Controller
{
    public function __construct(protected ReportService $reportService) {}

    public function monthly(Request $request): Response
    {
        $month = $request->query('month', now()->format('Y-m'));
        $clientId = $this->clientId();

        $html = $this->reportService->getMonthlyHtml($clientId, $month);

        return response($html, 200, [
            'Content-Type' => 'text/html; charset=UTF-8',
        ]);
    }
}
