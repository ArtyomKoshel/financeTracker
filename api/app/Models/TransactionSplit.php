<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TransactionSplit extends Model
{
    protected $fillable = [
        'transaction_id',
        'category_id',
        'amount',
        'description',
    ];

    protected $casts = [
        'amount' => 'float',
    ];

    public function transaction(): BelongsTo
    {
        return $this->belongsTo(Transaction::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }
}
