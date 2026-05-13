<?php

namespace App\Services\Notes;

use App\Events\DataUpdated;
use App\Models\NoteFolder;
use Illuminate\Support\Collection;

class NoteFolderService
{
    /** @return Collection<int, NoteFolder> */
    public function list(int $clientId): Collection
    {
        $all = NoteFolder::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return $this->buildTreeOrder($all, null);
    }

    /** @param \Illuminate\Support\Collection<int, NoteFolder> $folders */
    private function buildTreeOrder($folders, ?int $parentId): \Illuminate\Support\Collection
    {
        return $folders
            ->where('parent_id', $parentId)
            ->values()
            ->flatMap(fn ($f) => collect([$f])->concat($this->buildTreeOrder($folders, $f->id)));
    }

    /** @return array<int> IDs папки и всех её потомков (для фильтрации заметок) */
    public function getFolderIdsWithDescendants(int $clientId, int $folderId): array
    {
        $all = NoteFolder::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->get();

        $collect = collect($this->collectDescendantIds($all, $folderId));

        return $collect->prepend($folderId)->unique()->values()->all();
    }

    /** @param \Illuminate\Support\Collection<int, NoteFolder> $folders */
    private function collectDescendantIds($folders, int $parentId): array
    {
        $children = $folders->where('parent_id', $parentId);
        $ids = $children->pluck('id')->all();

        foreach ($children as $child) {
            $ids = array_merge($ids, $this->collectDescendantIds($folders, $child->id));
        }

        return $ids;
    }

    public function create(int $clientId, array $data): NoteFolder
    {
        $parentId = $data['parent_id'] ?? null;
        $maxOrder = NoteFolder::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('parent_id', $parentId)
            ->max('sort_order');

        $folder = NoteFolder::create([
            'client_id' => $clientId,
            'parent_id' => $parentId,
            'name' => $data['name'],
            'color' => $data['color'] ?? '#6366f1',
            'sort_order' => ($maxOrder ?? 0) + 1,
        ]);

        event(new DataUpdated('notes'));

        return $folder;
    }

    public function update(int $clientId, int $id, array $data): ?NoteFolder
    {
        $folder = NoteFolder::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->find($id);

        if (! $folder) {
            return null;
        }

        $folder->update(array_intersect_key($data, array_flip(['name', 'color', 'sort_order', 'parent_id'])));

        event(new DataUpdated('notes'));

        return $folder->fresh();
    }

    public function delete(int $clientId, int $id): bool
    {
        $folder = NoteFolder::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->find($id);

        if (! $folder) {
            return false;
        }

        $folder->notes()->update(['folder_id' => null]);
        $folder->children()->update(['parent_id' => $folder->parent_id]);
        $folder->delete();

        event(new DataUpdated('notes'));

        return true;
    }

    public function reorder(int $clientId, array $orderedIds): void
    {
        $folders = NoteFolder::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->whereIn('id', $orderedIds)
            ->get()
            ->keyBy('id');

        foreach ($orderedIds as $index => $id) {
            $folder = $folders->get((int) $id);
            if ($folder) {
                $folder->update(['sort_order' => $index]);
            }
        }

        event(new DataUpdated('notes'));
    }
}
