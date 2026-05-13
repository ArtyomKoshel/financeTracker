<?php

namespace App\Http\Controllers\Api\Ai;

use App\Http\Controllers\Api\Controller;
use App\Services\Banking\EmailParseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmailParseController extends Controller
{
    public function __construct(private readonly EmailParseService $emailParseService) {}

    public function parse(Request $request): JsonResponse
    {
        $request->validate(['text' => 'required|string|max:20000']);

        $clientId = $this->clientId();

        if (! $this->emailParseService->isAvailable()) {
            return $this->error('AI-провайдер не настроен', 503);
        }

        $transactions = $this->emailParseService->parseEmailText($request->input('text'), $clientId);

        return $this->success([
            'transactions' => $transactions,
            'count' => count($transactions),
        ]);
    }
}
