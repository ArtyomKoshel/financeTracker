<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TransactionTemplate extends Model
{
    protected $fillable = [
        'client_id',
        'name',
        'type',
        'amount',
        'currency',
        'category_id',
        'description',
        'sort_order',
    ];

    protected $casts = [
        'amount' => 'float',
        'sort_order' => 'integer',
    ];

    protected static function booted(): void
    {
        static::addGlobalScope('client', function ($query) {
            $clientId = app('client_id') ?? auth()->id();
            if ($clientId) {
                $query->where('client_id', $clientId);
            }
        });
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'client_id');
    }
}
