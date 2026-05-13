<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class BankReceiptIncomeMapping extends Model
{
    protected $fillable = [
        'client_id',
        'bank_merchant_name',
        'bank_merchant_normalized',
        'income_type',
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
}
