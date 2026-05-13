<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class CategoryBudget extends Model
{
    protected $fillable = ['client_id', 'category_id', 'month', 'limit_amount', 'alert_percent', 'is_recurring', 'is_essential'];

    protected $casts = [
        'limit_amount' => 'decimal:2',
        'alert_percent' => 'decimal:2',
        'is_recurring' => 'boolean',
        'is_essential' => 'boolean',
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

    public function user()
    {
        return $this->belongsTo(User::class, 'client_id');
    }
}
