<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Transaction extends Model
{
    protected $fillable = [
        'client_id', 'date', 'amount', 'original_amount', 'currency', 'exchange_rate',
        'type', 'category_id', 'account_id', 'recurring_payment_id', 'goal_id', 'transfer_to_account_id',
        'description', 'month', 'is_validated', 'source', 'import_id',
    ];

    protected $casts = [
        'date' => 'date',
        'amount' => 'decimal:2',
        'original_amount' => 'decimal:2',
        'exchange_rate' => 'decimal:6',
        'is_validated' => 'boolean',
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

    public function account()
    {
        return $this->belongsTo(Account::class);
    }

    public function recurringPayment()
    {
        return $this->belongsTo(RecurringPayment::class);
    }

    public function goal()
    {
        return $this->belongsTo(Goal::class);
    }

    public function transferToAccount()
    {
        return $this->belongsTo(Account::class, 'transfer_to_account_id');
    }

    public function import()
    {
        return $this->belongsTo(BankReceiptImport::class, 'import_id');
    }

    public function splits()
    {
        return $this->hasMany(TransactionSplit::class);
    }

    public function tags()
    {
        return $this->belongsToMany(Tag::class, 'transaction_tag');
    }

    public function hasSplits(): bool
    {
        return $this->splits()->exists();
    }
}
