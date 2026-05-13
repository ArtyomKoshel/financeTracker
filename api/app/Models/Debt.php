<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Debt extends Model
{
    protected $fillable = [
        'client_id', 'name', 'total_amount', 'paid_amount', 'currency',
        'due_date', 'monthly_payment', 'type', 'is_active', 'notes',
    ];

    protected $casts = [
        'total_amount' => 'decimal:2',
        'paid_amount' => 'decimal:2',
        'monthly_payment' => 'decimal:2',
        'due_date' => 'date',
        'is_active' => 'boolean',
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

    public function getRemainingAttribute(): float
    {
        return (float) $this->total_amount - (float) $this->paid_amount;
    }
}
