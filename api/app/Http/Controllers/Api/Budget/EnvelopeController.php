<?php

namespace App\Http\Controllers\Api\Budget;

use App\Http\Controllers\Api\Controller;
use App\Models\ActivityLog;
use App\Services\Budget\EnvelopeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EnvelopeController extends Controller
{
    public function __construct(protected EnvelopeService $envelopeService) {}

    public function index(Request $request): JsonResponse
    {
        $month = $request->query('month', now()->format('Y-m'));
        $data = $this->envelopeService->list($this->clientId(), $month);

        return $this->success($data->values()->all());
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'allocated' => 'required|numeric|min:0',
            'month' => 'required|string|regex:/^\d{4}-\d{2}$/',
            'category_id' => 'nullable|integer',
        ]);

        $clientId = $this->clientId();
        $data = $this->envelopeService->create($clientId, $request->only([
            'name', 'allocated', 'month', 'category_id',
        ]));
        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'envelope_create',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['name' => $data['name'] ?? $request->input('name'), 'month' => $data['month'] ?? $request->input('month')],
            'created_at' => now(),
        ]);

        return $this->success($data);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'allocated' => 'nullable|numeric|min:0',
            'spent' => 'nullable|numeric|min:0',
        ]);

        $request->merge(['id' => $id]);
        $clientId = $this->clientId();
        $data = $this->envelopeService->update($clientId, $request);
        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'envelope_update',
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
        $this->envelopeService->softDelete($clientId, $id);
        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'envelope_delete',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['id' => $id],
            'created_at' => now(),
        ]);

        return $this->success(['deleted' => true]);
    }
}
