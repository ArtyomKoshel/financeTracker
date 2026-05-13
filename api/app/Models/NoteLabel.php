<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class NoteLabel extends Model
{
    protected $fillable = [
        'client_id',
        'name',
        'color',
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

    public function notes(): BelongsToMany
    {
        return $this->belongsToMany(Note::class, 'note_label', 'label_id', 'note_id');
    }
}
