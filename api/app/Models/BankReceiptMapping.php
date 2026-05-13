<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class BankReceiptMapping extends Model
{
    protected $fillable = [
        'client_id',
        'bank_merchant_name',
        'bank_merchant_normalized',
        'category_id',
        'confidence',
        'source_transaction_id',
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

    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function sourceTransaction()
    {
        return $this->belongsTo(Transaction::class, 'source_transaction_id');
    }
}
