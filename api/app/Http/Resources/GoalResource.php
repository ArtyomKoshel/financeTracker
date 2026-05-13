<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class GoalResource extends JsonResource
{
    public function toArray($request): array
    {
        $target = (float) $this->target_amount;
        $current = (float) $this->current_amount;
        $percent = $target > 0 ? round(($current / $target) * 100) : 0;

        $data = [
            'id' => $this->id,
            'name' => $this->name,
            'target_amount' => $target,
            'currency' => $this->currency ?? 'BYN',
            'target_date' => $this->target_date?->format('Y-m-d'),
            'current_amount' => $current,
            'percent' => $percent,
            'is_active' => (bool) $this->is_active,
        ];
        if (! $this->is_active && $this->updated_at) {
            $data['completed_at'] = $this->updated_at->format('Y-m-d');
        }

        return $data;
    }
}
