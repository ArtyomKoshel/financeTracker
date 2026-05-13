<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DebtResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'total_amount' => (float) $this->total_amount,
            'paid_amount' => (float) $this->paid_amount,
            'remaining' => (float) $this->remaining,
            'currency' => $this->currency ?? 'BYN',
            'due_date' => $this->due_date?->format('Y-m-d'),
            'monthly_payment' => $this->monthly_payment ? (float) $this->monthly_payment : null,
            'type' => $this->type ?? 'loan',
            'is_active' => (bool) $this->is_active,
        ];
    }
}
