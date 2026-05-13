<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NetWorthSnapshot extends Model
{
    protected $fillable = [
        'client_id',
        'month',
        'total_balance',
        'total_savings',
        'total_debt',
        'net_worth',
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

    protected $casts = [
        'total_balance' => 'decimal:2',
        'total_savings' => 'decimal:2',
        'total_debt' => 'decimal:2',
        'net_worth' => 'decimal:2',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'client_id');
    }
}
