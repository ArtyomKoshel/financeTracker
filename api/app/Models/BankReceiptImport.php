<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BankReceiptImport extends Model
{
    protected $fillable = [
        'client_id',
        'filename',
        'file_hash',
        'pages_count',
        'rows_found',
        'rows_created',
        'rows_skipped',
    ];

    protected $casts = [
        'pages_count' => 'integer',
        'rows_found' => 'integer',
        'rows_created' => 'integer',
        'rows_skipped' => 'integer',
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

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'client_id');
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class, 'import_id');
    }
}
