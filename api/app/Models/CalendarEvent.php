<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $client_id
 * @property string $title
 * @property string|null $description
 * @property \Illuminate\Support\Carbon $start_at
 * @property \Illuminate\Support\Carbon|null $end_at
 * @property bool $is_all_day
 * @property string|null $color
 * @property string|null $recurrence_rule
 * @property string $source
 * @property \Illuminate\Support\Carbon $created_at
 * @property \Illuminate\Support\Carbon $updated_at
 */
class CalendarEvent extends Model
{
    protected $fillable = [
        'client_id',
        'title',
        'description',
        'start_at',
        'end_at',
        'is_all_day',
        'color',
        'recurrence_rule',
        'source',
    ];

    protected $casts = [
        'start_at' => 'datetime',
        'end_at' => 'datetime',
        'is_all_day' => 'boolean',
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
}
