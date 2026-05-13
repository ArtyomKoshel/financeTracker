<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CategoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'parent_id' => $this->parent_id,
            'icon' => $this->icon ?? "\u{1F4E6}",
            'color' => $this->color,
            'sort_order' => $this->sort_order,
            'is_active' => (bool) $this->is_active,
            'subcategories' => $this->when(
                $this->relationLoaded('subcategories'),
                fn () => CategoryResource::collection($this->subcategories)
            ),
        ];
    }
}
