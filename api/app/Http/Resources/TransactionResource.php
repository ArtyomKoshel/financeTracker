<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class TransactionResource extends JsonResource
{
    public function toArray($request): array
    {
        $category = $this->relationLoaded('category') && $this->category ? $this->category : null;
        $account = $this->relationLoaded('account') && $this->account ? $this->account : null;
        $transferTo = $this->relationLoaded('transferToAccount') && $this->transferToAccount ? $this->transferToAccount : null;

        return [
            'id' => $this->id,
            'date' => $this->date->format('Y-m-d'),
            'amount' => (float) $this->amount,
            'original_amount' => $this->original_amount ? (float) $this->original_amount : null,
            'currency' => $this->currency ?? 'BYN',
            'exchange_rate' => $this->exchange_rate ? (float) $this->exchange_rate : null,
            'type' => $this->type,
            'category_id' => $this->category_id,
            'category_name' => $category ? $category->name : '',
            'category_icon' => $category ? ($category->icon ?? '📦') : '',
            'category' => $category ? [
                'id' => $category->id,
                'name' => $category->name,
                'icon' => $category->icon,
            ] : null,
            'account_id' => $this->account_id,
            'account_name' => $account ? $account->name : '',
            'transfer_to_account_id' => $this->transfer_to_account_id,
            'transfer_to_account_name' => $transferTo ? $transferTo->name : '',
            'description' => $this->description ?? '',
            'month' => $this->month,
            'goal_id' => $this->goal_id,
            'source' => $this->source ?? 'web',
            'import_id' => $this->import_id,
            'splits' => $this->whenLoaded('splits', function () {
                return $this->splits->map(fn ($s) => [
                    'id' => $s->id,
                    'category_id' => $s->category_id,
                    'category_name' => $s->category?->name ?? '',
                    'category_icon' => $s->category?->icon ?? '📦',
                    'amount' => abs((float) $s->amount),
                    'description' => $s->description ?? '',
                ]);
            }),
            'tags' => $this->whenLoaded('tags', function () {
                return $this->tags->map(fn ($t) => [
                    'id' => $t->id,
                    'name' => $t->name,
                    'color' => $t->color,
                ]);
            }, []),
        ];
    }
}
