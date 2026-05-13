<?php

namespace App\Http\Controllers\Api\Accounts;

use App\Http\Controllers\Api\Controller;
use App\Models\ActivityLog;
use App\Services\Accounts\DebtService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DebtController extends Controller
{
    public function __construct(protected DebtService $debtService) {}

    public function index(): JsonResponse
    {
        $data = $this->debtService->list($this->clientId());

        return $this->success($data->values()->all());
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'total_amount' => 'required|numeric|min:0',
            'currency' => 'nullable|string|in:BYN,RUB,EUR,USD',
            'due_date' => 'nullable|date',
            'monthly_payment' => 'nullable|numeric|min:0',
            'type' => 'nullable|string|in:loan,credit',
        ]);

        $clientId = $this->clientId();
        $data = $this->debtService->create($clientId, $request->only([
            'name', 'total_amount', 'currency', 'due_date', 'monthly_payment', 'type',
        ]));
        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'debt_create',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['name' => $data['name'] ?? '', 'total_amount' => $data['total_amount'] ?? 0],
            'created_at' => now(),
        ]);

        return $this->success($data);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'paid_amount' => 'nullable|numeric|min:0',
            'monthly_payment' => 'nullable|numeric|min:0',
            'is_active' => 'nullable|boolean',
        ]);

        $clientId = $this->clientId();
        $data = $this->debtService->update($clientId, $id, $request);
        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'debt_update',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['id' => $id],
            'created_at' => now(),
        ]);

        return $this->success($data);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $clientId = $this->clientId();
        $this->debtService->softDelete($clientId, $id);
        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'debt_delete',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['id' => $id],
            'created_at' => now(),
        ]);

        return $this->success(['deleted' => true]);
    }
}
