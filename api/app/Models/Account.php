<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Account extends Model
{
    protected $fillable = ['name', 'balance', 'currency', 'client_id', 'last_sync_date', 'last_sync_amount', 'sort_order'];

    protected $casts = [
        'balance' => 'decimal:2',
        'last_sync_amount' => 'decimal:2',
        'last_sync_date' => 'date',
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
        return $this->hasMany(Transaction::class, 'account_id');
    }

    /**
     * Get default account ID for client. Creates account if none exists.
     */
    public static function defaultIdForClient(int $clientId): int
    {
        $account = static::withoutGlobalScope('client')->where('client_id', $clientId)->first();
        if ($account) {
            return (int) $account->id;
        }
        $account = static::withoutGlobalScope('client')->create([
            'client_id' => $clientId,
            'name' => 'Основной',
            'balance' => 0,
        ]);

        return (int) $account->id;
    }
}
