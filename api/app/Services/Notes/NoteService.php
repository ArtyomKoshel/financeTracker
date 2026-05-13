<?php

namespace App\Services\Notes;

use App\Events\DataUpdated;
use App\Models\Note;
use App\Models\NoteLabel;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class NoteService
{
    public function __construct(
        private readonly NoteAnalysisService $analysisService,
        private readonly NoteFolderService $folderService,
    ) {}

    /** @return array{data: Collection<int, Note>, meta: array{total: int, page: int, per_page: int, last_page: int}} */
    public function list(int $clientId, int $perPage = 20, int $page = 1, ?string $search = null, ?int $labelId = null, ?int $folderId = null): array
    {
        $query = Note::withoutGlobalScope('client')
            ->with(['labels', 'folder'])
            ->where('client_id', $clientId);

        if ($folderId !== null) {
            if ($folderId === 0) {
                $query->whereNull('folder_id');
            } else {
                $folderIds = $this->folderService->getFolderIdsWithDescendants($clientId, $folderId);
                $query->whereIn('folder_id', $folderIds);
            }
        }

        if ($search !== null && $search !== '') {
            $escaped = str_replace(['%', '_', '\\'], ['\\%', '\\_', '\\\\'], $search);
            $pattern = '%'.$escaped.'%';
            $query->where(function ($q) use ($search, $pattern) {
                $q->whereRaw(
                    "search_vector @@ plainto_tsquery('russian', ?)",
                    [$search]
                )->orWhere(function ($q2) use ($pattern) {
                    $q2->where('title', 'ilike', $pattern)
                        ->orWhere('content', 'ilike', $pattern);
                });
            })->orderByRaw(
                "COALESCE(ts_rank(search_vector, plainto_tsquery('russian', ?)), 0) DESC, updated_at DESC",
                [$search]
            );
        } else {
            $query->orderByDesc('is_pinned')
                ->orderBy('sort_order')
                ->orderByDesc('updated_at');
        }

        if ($labelId !== null) {
            $query->whereHas('labels', fn ($q) => $q->where('note_labels.id', $labelId));
        }

        $total = $query->count();
        $lastPage = max(1, (int) ceil($total / $perPage));
        $data = $query->skip(($page - 1) * $perPage)->take($perPage)->get();

        return [
            'data' => $data,
            'meta' => [
                'total' => $total,
                'page' => $page,
                'per_page' => $perPage,
                'last_page' => $lastPage,
            ],
        ];
    }

    public function find(int $clientId, int $id): ?Note
    {
        return Note::withoutGlobalScope('client')
            ->with(['labels', 'folder'])
            ->where('client_id', $clientId)
            ->find($id);
    }

    /** @param array<string, mixed> $data */
    public function create(int $clientId, array $data): Note
    {
        return DB::transaction(function () use ($clientId, $data) {
            $note = Note::create([
                'client_id' => $clientId,
                'title' => $data['title'],
                'content' => $data['content'],
                'summary' => $this->analysisService->generateSummary($data['content']),
                'folder_id' => $data['folder_id'] ?? null,
                'is_pinned' => $data['is_pinned'] ?? false,
                'color' => $data['color'] ?? null,
                'sort_order' => 0,
            ]);

            if (! empty($data['label_ids'])) {
                $validLabelIds = NoteLabel::withoutGlobalScope('client')
                    ->where('client_id', $clientId)
                    ->whereIn('id', $data['label_ids'])
                    ->pluck('id')
                    ->all();
                $note->labels()->sync($validLabelIds);
            }

            event(new DataUpdated('notes'));

            return $note->load(['labels', 'folder']);
        });
    }

    /** @param array<string, mixed> $data */
    public function update(int $clientId, int $id, array $data): ?Note
    {
        $note = Note::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->find($id);

        if (! $note) {
            return null;
        }

        return DB::transaction(function () use ($note, $clientId, $data) {
            $fields = array_intersect_key($data, array_flip(['title', 'content', 'folder_id', 'is_pinned', 'color', 'action_items', 'suggested_labels', 'analyzed_at']));

            if (isset($fields['content'])) {
                $fields['summary'] = $this->analysisService->generateSummary($fields['content']);
                $fields['action_items'] = null;
                $fields['suggested_labels'] = null;
                $fields['analyzed_at'] = null;
            }

            if (! empty($fields)) {
                $note->update($fields);
            }

            if (array_key_exists('label_ids', $data)) {
                $labelIds = $data['label_ids'] ?? [];
                $validLabelIds = NoteLabel::withoutGlobalScope('client')
                    ->where('client_id', $clientId)
                    ->whereIn('id', $labelIds)
                    ->pluck('id')
                    ->all();
                $note->labels()->sync($validLabelIds);
            }

            event(new DataUpdated('notes'));

            return $note->fresh(['labels', 'folder']);
        });
    }

    public function togglePin(int $clientId, int $id): ?Note
    {
        $note = Note::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->find($id);

        if (! $note) {
            return null;
        }

        $note->update(['is_pinned' => ! $note->is_pinned]);
        event(new DataUpdated('notes'));

        return $note->fresh(['labels', 'folder']);
    }

    public function reorder(int $clientId, array $orderedIds): void
    {
        $notes = Note::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->whereIn('id', $orderedIds)
            ->get()
            ->keyBy('id');

        foreach ($orderedIds as $index => $id) {
            $note = $notes->get((int) $id);
            if ($note) {
                $note->update(['sort_order' => $index]);
            }
        }

        event(new DataUpdated('notes'));
    }

    public function delete(int $clientId, int $id): bool
    {
        $note = Note::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->find($id);

        if (! $note) {
            return false;
        }

        $note->delete();

        event(new DataUpdated('notes'));

        return true;
    }

    /** @return array{suggestions: array<int, array{note_id: int, note_title: string, relevance: float, preview: string}>, suggested_label: string|null} */
    public function suggest(int $clientId, string $content): array
    {
        $ftsResults = $this->searchByFts($clientId, $content);

        $aiSuggestedLabel = null;

        if (count($ftsResults) === 0) {
            $existingNotes = Note::withoutGlobalScope('client')
                ->where('client_id', $clientId)
                ->select(['id', 'title', 'summary'])
                ->orderByDesc('updated_at')
                ->limit(50)
                ->get()
                ->map(fn (Note $n): array => [
                    'id' => (int) $n->id,
                    'title' => (string) $n->title,
                    'summary' => (string) ($n->summary ?? ''),
                ])
                ->all();

            $aiResult = $this->analysisService->suggestPlacement($content, $existingNotes, $clientId);
            $aiSuggestedLabel = $aiResult['suggested_label'];

            if ($aiResult['matched_note_id'] !== null) {
                $matched = Note::withoutGlobalScope('client')
                    ->where('client_id', $clientId)
                    ->find($aiResult['matched_note_id']);

                if ($matched) {
                    $preview = mb_substr(strip_tags((string) $matched->content), 0, 120);

                    return [
                        'suggestions' => [[
                            'note_id' => (int) $matched->id,
                            'note_title' => (string) $matched->title,
                            'relevance' => 0.8,
                            'preview' => $preview,
                        ]],
                        'suggested_label' => $aiSuggestedLabel,
                    ];
                }
            }
        }

        return [
            'suggestions' => $ftsResults,
            'suggested_label' => $aiSuggestedLabel,
        ];
    }

    /** @return array<int, array{note_id: int, note_title: string, relevance: float, preview: string}> */
    private function searchByFts(int $clientId, string $content): array
    {
        $rankExpr = "ts_rank(search_vector, plainto_tsquery('russian', ?))";

        $notes = Note::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->whereRaw("search_vector @@ plainto_tsquery('russian', ?)", [$content])
            ->whereRaw("{$rankExpr} > 0.01", [$content])
            ->selectRaw("id, title, content, {$rankExpr} as rank", [$content])
            ->orderByDesc('rank')
            ->limit(3)
            ->get();

        $results = [];
        foreach ($notes as $note) {
            $results[] = [
                'note_id' => (int) $note->id,
                'note_title' => (string) $note->title,
                'relevance' => round((float) $note->rank, 4),
                'preview' => mb_substr(strip_tags((string) $note->content), 0, 120),
            ];
        }

        return $results;
    }

    public function appendContent(int $clientId, int $id, string $content): ?Note
    {
        $note = Note::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->find($id);

        if (! $note) {
            return null;
        }

        return DB::transaction(function () use ($note, $content) {
            $newContent = $note->content."\n\n---\n\n".$content;
            $note->update([
                'content' => $newContent,
                'summary' => $this->analysisService->generateSummary($newContent),
            ]);

            event(new DataUpdated('notes'));

            return $note->fresh(['labels', 'folder']);
        });
    }

    /** @return array{note: Note, analysis: array{summary: string, action_items: string[], suggested_labels: string[]}}|null */
    public function analyze(int $clientId, int $id): ?array
    {
        $note = Note::withoutGlobalScope('client')
            ->with('labels')
            ->where('client_id', $clientId)
            ->find($id);

        if (! $note) {
            return null;
        }

        $analysis = $this->analysisService->analyze($note, $clientId);

        $summary = mb_strlen($analysis['summary']) > 100
            ? mb_substr($analysis['summary'], 0, 97).'…'
            : $analysis['summary'];

        $note->update([
            'summary' => $summary,
            'action_items' => $analysis['action_items'],
            'suggested_labels' => $analysis['suggested_labels'],
            'analyzed_at' => now(),
        ]);

        event(new DataUpdated('notes'));

        return [
            'note' => $note->fresh(['labels']) ?? $note,
            'analysis' => $analysis,
        ];
    }

    public function formatContent(string $content, int $clientId): string
    {
        return $this->analysisService->formatContent($content, $clientId);
    }
}
