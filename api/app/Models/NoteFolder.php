<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class NoteFolder extends Model
{
    protected $fillable = [
        'client_id',
        'parent_id',
        'name',
        'color',
        'sort_order',
    ];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(NoteFolder::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(NoteFolder::class, 'parent_id');
    }

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

    public function notes(): HasMany
    {
        return $this->hasMany(Note::class, 'folder_id');
    }
}
