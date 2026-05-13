<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class PaymentResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'amount' => (float) $this->amount,
            'original_amount' => (float) ($this->original_amount ?? $this->amount),
            'currency' => $this->currency ?? 'BYN',
            'day_of_month' => $this->day_of_month,
            'due_date' => $this->due_date?->format('Y-m-d'),
            'category' => $this->category ?? 'essential',
            'category_id' => $this->category_id,
            'is_variable' => (bool) $this->is_variable,
            'is_one_time' => (bool) $this->is_one_time,
            'is_subscription' => (bool) ($this->is_subscription ?? false),
            'is_auto_debit' => (bool) ($this->is_auto_debit ?? false),
            'cancel_by_date' => $this->cancel_by_date?->format('Y-m-d'),
            'is_active' => (bool) $this->is_active,
            'is_income' => (bool) ($this->is_income ?? false),
            'description' => $this->description ?? '',
        ];
    }
}
