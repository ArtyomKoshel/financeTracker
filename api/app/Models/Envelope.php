<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Envelope extends Model
{
    protected $fillable = [
        'client_id', 'name', 'allocated', 'spent', 'month', 'category_id', 'is_active',
    ];

    protected $casts = [
        'allocated' => 'decimal:2',
        'spent' => 'decimal:2',
        'is_active' => 'boolean',
    ];

    protected static function booted()
    {
        static::addGlobalScope('client', function (Builder $builder) {
            $clientId = app('client_id') ?? auth()->id();
            if ($clientId) {
                $builder->where('client_id', $clientId);
            }
        });
    }

    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function getRemainingAttribute(): float
    {
        return max(0, (float) $this->allocated - (float) $this->spent);
    }
}
