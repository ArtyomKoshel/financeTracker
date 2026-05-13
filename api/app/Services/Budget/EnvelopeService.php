<?php

namespace App\Services\Budget;

use App\Events\DataUpdated;
use App\Http\Resources\EnvelopeResource;
use App\Models\Envelope;
use App\Models\Transaction;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class EnvelopeService
{
    public function list(int $clientId, string $month): Collection
    {
        return Envelope::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('month', $month)
            ->where('is_active', true)
            ->orderBy('name')
            ->get()
            ->map(fn ($e) => (new EnvelopeResource($e))->resolve());
    }

    public function create(int $clientId, array $data): array
    {
        $envelope = Envelope::create([
            'client_id' => $clientId,
            'name' => $data['name'],
            'allocated' => $data['allocated'],
            'spent' => 0,
            'month' => $data['month'],
            'category_id' => $data['category_id'] ?? null,
        ]);

        event(new DataUpdated('budgets'));

        return (new EnvelopeResource($envelope))->resolve();
    }

    public function update(int $clientId, Request $request): array
    {
        $envelope = Envelope::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->findOrFail($request->input('id'));

        if ($request->has('allocated')) {
            $envelope->allocated = $request->input('allocated');
        }
        if ($request->has('spent')) {
            $envelope->spent = $request->input('spent');
        }
        $envelope->save();

        event(new DataUpdated('budgets'));

        return [
            'id' => $envelope->id,
            'remaining' => $envelope->remaining,
        ];
    }

    public function softDelete(int $clientId, int $id): bool
    {
        $envelope = Envelope::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->findOrFail($id);
        $envelope->update(['is_active' => false]);

        event(new DataUpdated('budgets'));

        return true;
    }

    public function syncSpentFromTransactions(int $clientId, string $month): void
    {
        $envelopes = Envelope::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('month', $month)
            ->where('is_active', true)
            ->whereNotNull('category_id')
            ->get();

        foreach ($envelopes as $envelope) {
            $spent = (float) Transaction::withoutGlobalScope('client')
                ->where('client_id', $clientId)
                ->where('month', $month)
                ->where('category_id', $envelope->category_id)
                ->where('type', 'expense')
                ->sum(DB::raw('ABS(amount)'));

            $envelope->update(['spent' => $spent]);
        }
    }
}
