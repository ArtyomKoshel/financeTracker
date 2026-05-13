<?php

namespace App\Http\Controllers\Api\Notes;

use App\Http\Controllers\Api\Controller;
use App\Http\Requests\Notes\StoreNoteFolderRequest;
use App\Http\Requests\Notes\UpdateNoteFolderRequest;
use App\Services\Notes\NoteFolderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NoteFolderController extends Controller
{
    public function __construct(
        private readonly NoteFolderService $folderService,
    ) {}

    public function index(): JsonResponse
    {
        $folders = $this->folderService->list($this->clientId());

        return $this->success($folders->map(fn ($f) => [
            'id' => $f->id,
            'parent_id' => $f->parent_id,
            'name' => $f->name,
            'color' => $f->color ?? '#6366f1',
            'sort_order' => $f->sort_order,
        ])->values()->all());
    }

    public function store(StoreNoteFolderRequest $request): JsonResponse
    {
        $folder = $this->folderService->create($this->clientId(), $request->validated());

        return $this->success([
            'id' => $folder->id,
            'parent_id' => $folder->parent_id,
            'name' => $folder->name,
            'color' => $folder->color ?? '#6366f1',
            'sort_order' => $folder->sort_order,
        ], 201);
    }

    public function update(UpdateNoteFolderRequest $request, int $id): JsonResponse
    {
        $folder = $this->folderService->update($this->clientId(), $id, $request->validated());

        if (! $folder) {
            return $this->error('Folder not found', 404);
        }

        return $this->success([
            'id' => $folder->id,
            'parent_id' => $folder->parent_id,
            'name' => $folder->name,
            'color' => $folder->color ?? '#6366f1',
            'sort_order' => $folder->sort_order,
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        if (! $this->folderService->delete($this->clientId(), $id)) {
            return $this->error('Folder not found', 404);
        }

        return $this->success(['deleted' => true]);
    }

    public function reorder(Request $request): JsonResponse
    {
        $orderedIds = $request->input('ordered_ids', []);
        if (! is_array($orderedIds)) {
            return $this->error('ordered_ids must be an array', 400);
        }

        $this->folderService->reorder($this->clientId(), $orderedIds);

        return $this->success(['reordered' => true]);
    }
}
