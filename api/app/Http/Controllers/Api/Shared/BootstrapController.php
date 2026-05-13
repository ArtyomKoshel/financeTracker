<?php

namespace App\Http\Controllers\Api\Shared;

use App\Http\Controllers\Api\Controller;
use App\Services\System\BootstrapService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BootstrapController extends Controller
{
    public function __construct(protected BootstrapService $bootstrapService) {}

    /**
     * Агрегированный эндпоинт: me, balance, categories, income-types, rates, reminders.
     */
    public function index(Request $request): JsonResponse
    {
        $clientId = $this->clientId();
        $user = auth()->user();

        $data = $this->bootstrapService->getBootstrapData($clientId, $user);

        return $this->success($data);
    }
}
