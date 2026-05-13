<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class RecurringPayment extends Model
{
    protected $fillable = [
        'client_id', 'name', 'amount', 'original_amount', 'currency', 'day_of_month',
        'due_date', 'category', 'category_id', 'is_variable', 'is_one_time',
        'is_subscription', 'is_auto_debit', 'cancel_by_date', 'description', 'is_active', 'is_income',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'original_amount' => 'decimal:2',
        'due_date' => 'date',
        'cancel_by_date' => 'date',
        'is_variable' => 'boolean',
        'is_one_time' => 'boolean',
        'is_subscription' => 'boolean',
        'is_auto_debit' => 'boolean',
        'is_active' => 'boolean',
        'is_income' => 'boolean',
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

    public function transactions()
    {
        return $this->hasMany(Transaction::class, 'recurring_payment_id');
    }
}
