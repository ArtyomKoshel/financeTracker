<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property int $id
 * @property int $client_id
 * @property int|null $folder_id
 * @property string $title
 * @property string $content
 * @property string|null $summary
 * @property array<int, string>|null $action_items
 * @property array<int, string>|null $suggested_labels
 * @property \Illuminate\Support\Carbon|null $analyzed_at
 * @property bool $is_pinned
 * @property string|null $color
 * @property int $sort_order
 * @property \Illuminate\Support\Carbon $created_at
 * @property \Illuminate\Support\Carbon $updated_at
 * @property \Illuminate\Support\Carbon|null $deleted_at
 */
class Note extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'client_id',
        'folder_id',
        'title',
        'content',
        'summary',
        'action_items',
        'suggested_labels',
        'analyzed_at',
        'is_pinned',
        'color',
        'sort_order',
    ];

    protected $casts = [
        'is_pinned' => 'boolean',
        'sort_order' => 'integer',
        'action_items' => 'array',
        'suggested_labels' => 'array',
        'analyzed_at' => 'datetime',
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

    public function folder(): BelongsTo
    {
        return $this->belongsTo(NoteFolder::class, 'folder_id');
    }

    public function labels(): BelongsToMany
    {
        return $this->belongsToMany(NoteLabel::class, 'note_label', 'note_id', 'label_id');
    }

    /** @param Builder<Note> $query */
    public function scopeSearch(Builder $query, string $term): void
    {
        $query->whereRaw(
            "search_vector @@ plainto_tsquery('russian', ?)",
            [$term]
        )->orderByRaw(
            "ts_rank(search_vector, plainto_tsquery('russian', ?)) DESC",
            [$term]
        );
    }
}
