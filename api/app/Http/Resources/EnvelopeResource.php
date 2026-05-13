<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EnvelopeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'allocated' => (float) $this->allocated,
            'spent' => (float) $this->spent,
            'remaining' => (float) $this->remaining,
            'month' => $this->month,
            'category_id' => $this->category_id,
        ];
    }
}
