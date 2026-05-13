<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CategorizationRule extends Model
{
    protected $fillable = [
        'client_id',
        'name',
        'merchant_pattern',
        'conditions',
        'category_id',
        'category_name',
        'result_income_type',
        'is_auto',
        'is_global',
        'priority',
        'confidence',
        'times_applied',
        'last_used_at',
    ];

    protected $casts = [
        'conditions' => 'array',
        'confidence' => 'integer',
        'is_auto' => 'boolean',
        'is_global' => 'boolean',
        'priority' => 'integer',
        'times_applied' => 'integer',
        'last_used_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::addGlobalScope('client', function (Builder $builder) {
            $clientId = app('client_id') ?? auth()->id();
            if ($clientId) {
                $builder->where('client_id', $clientId);
            }
        });
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }
}
