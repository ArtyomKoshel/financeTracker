<?php

namespace App\Http\Resources;

use App\Models\Note;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Note */
class NoteResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray($request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'content' => $this->content,
            'summary' => $this->summary ?? '',
            'action_items' => $this->action_items ?? [],
            'suggested_labels' => $this->suggested_labels ?? [],
            'analyzed_at' => $this->analyzed_at?->toISOString(),
            'folder_id' => $this->folder_id,
            'folder' => $this->whenLoaded('folder', fn () => $this->folder ? [
                'id' => $this->folder->id,
                'name' => $this->folder->name,
                'color' => $this->folder->color,
            ] : null),
            'is_pinned' => $this->is_pinned ?? false,
            'color' => $this->color,
            'sort_order' => $this->sort_order ?? 0,
            'labels' => $this->whenLoaded('labels', function () {
                return $this->labels->map(fn ($label) => [
                    'id' => $label->id,
                    'name' => $label->name,
                    'color' => $label->color ?? '#6366f1',
                ]);
            }),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
