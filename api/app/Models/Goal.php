<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Goal extends Model
{
    protected $fillable = ['client_id', 'name', 'target_amount', 'currency', 'target_date', 'current_amount', 'is_active'];

    protected $casts = [
        'target_date' => 'date',
        'target_amount' => 'decimal:2',
        'current_amount' => 'decimal:2',
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

    public function user()
    {
        return $this->belongsTo(User::class, 'client_id');
    }
}
