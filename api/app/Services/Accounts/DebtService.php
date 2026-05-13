<?php

namespace App\Services\Accounts;

use App\Events\DataUpdated;
use App\Http\Resources\DebtResource;
use App\Models\Debt;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class DebtService
{
    public function list(int $clientId): Collection
    {
        return Debt::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->orderBy('due_date')
            ->get()
            ->map(fn ($d) => (new DebtResource($d))->resolve());
    }

    public function create(int $clientId, array $data): array
    {
        $debt = Debt::create([
            'client_id' => $clientId,
            'name' => $data['name'],
            'total_amount' => $data['total_amount'],
            'paid_amount' => 0,
            'currency' => $data['currency'] ?? 'BYN',
            'due_date' => $data['due_date'] ?? null,
            'monthly_payment' => $data['monthly_payment'] ?? null,
            'type' => $data['type'] ?? 'loan',
        ]);

        event(new DataUpdated('budgets'));

        return (new DebtResource($debt))->resolve();
    }

    public function update(int $clientId, int $id, Request $request): array
    {
        $debt = Debt::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->findOrFail($id);

        if ($request->has('paid_amount')) {
            $debt->paid_amount = $request->input('paid_amount');
        }
        if ($request->has('monthly_payment')) {
            $debt->monthly_payment = $request->input('monthly_payment');
        }
        if ($request->has('is_active')) {
            $debt->is_active = $request->boolean('is_active');
        }
        $debt->save();

        event(new DataUpdated('budgets'));

        return [
            'id' => $debt->id,
            'remaining' => $debt->remaining,
        ];
    }

    public function softDelete(int $clientId, int $id): bool
    {
        $debt = Debt::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->findOrFail($id);
        $debt->update(['is_active' => false]);

        event(new DataUpdated('budgets'));

        return true;
    }
}
