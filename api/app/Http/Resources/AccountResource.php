<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AccountResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'balance' => (float) $this->balance,
            'currency' => $this->currency ?? 'BYN',
            'sort_order' => (int) ($this->sort_order ?? 0),
            'last_sync_date' => $this->last_sync_date?->format('Y-m-d'),
            'last_sync_amount' => $this->last_sync_amount ? (float) $this->last_sync_amount : 0,
        ];
    }
}
