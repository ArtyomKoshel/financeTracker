<?php

namespace App\Http\Controllers\Api\Notes;

use App\Http\Controllers\Api\Controller;
use App\Http\Requests\Notes\AppendNoteRequest;
use App\Http\Requests\Notes\FormatNoteRequest;
use App\Http\Requests\Notes\StoreNoteRequest;
use App\Http\Requests\Notes\SuggestNoteRequest;
use App\Http\Requests\Notes\UpdateNoteRequest;
use App\Http\Resources\NoteResource;
use App\Services\Notes\NoteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NoteController extends Controller
{
    public function __construct(
        private readonly NoteService $noteService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $perPage = min((int) $request->query('per_page', '20'), 100);
        $page = max(1, (int) $request->query('page', '1'));
        $search = $request->query('q') ?? $request->query('search');
        $labelId = $request->query('label_id') !== null ? (int) $request->query('label_id') : null;
        $folderId = $request->query('folder_id');
        $folderId = $folderId !== null && $folderId !== '' ? (int) $folderId : null;

        $result = $this->noteService->list($this->clientId(), $perPage, $page, $search, $labelId, $folderId);

        return $this->success([
            'data' => NoteResource::collection($result['data']),
            'meta' => $result['meta'],
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $note = $this->noteService->find($this->clientId(), $id);

        if (! $note) {
            return $this->error('Note not found', 404);
        }

        return $this->success(new NoteResource($note));
    }

    public function store(StoreNoteRequest $request): JsonResponse
    {
        $note = $this->noteService->create(
            $this->clientId(),
            $request->validated()
        );

        return $this->success(new NoteResource($note), 201);
    }

    public function update(UpdateNoteRequest $request, int $id): JsonResponse
    {
        $note = $this->noteService->update($this->clientId(), $id, $request->validated());

        if (! $note) {
            return $this->error('Note not found', 404);
        }

        return $this->success(new NoteResource($note));
    }

    public function destroy(int $id): JsonResponse
    {
        if (! $this->noteService->delete($this->clientId(), $id)) {
            return $this->error('Note not found', 404);
        }

        return $this->success(['deleted' => true]);
    }

    public function analyze(int $id): JsonResponse
    {
        $result = $this->noteService->analyze($this->clientId(), $id);

        if (! $result) {
            return $this->error('Note not found', 404);
        }

        return $this->success([
            'note' => new NoteResource($result['note']),
            'analysis' => $result['analysis'],
        ]);
    }

    public function format(FormatNoteRequest $request): JsonResponse
    {
        $content = $this->noteService->formatContent(
            $request->validated('content'),
            $this->clientId()
        );

        return $this->success(['content' => $content]);
    }

    public function suggest(SuggestNoteRequest $request): JsonResponse
    {
        $result = $this->noteService->suggest(
            $this->clientId(),
            $request->validated('content')
        );

        return $this->success($result);
    }

    public function append(AppendNoteRequest $request, int $id): JsonResponse
    {
        $note = $this->noteService->appendContent(
            $this->clientId(),
            $id,
            $request->validated('content')
        );

        if (! $note) {
            return $this->error('Note not found', 404);
        }

        return $this->success(new NoteResource($note));
    }

    public function togglePin(int $id): JsonResponse
    {
        $note = $this->noteService->togglePin($this->clientId(), $id);

        if (! $note) {
            return $this->error('Note not found', 404);
        }

        return $this->success(new NoteResource($note));
    }

    public function reorder(Request $request): JsonResponse
    {
        $orderedIds = $request->input('ordered_ids', []);
        if (! is_array($orderedIds)) {
            return $this->error('ordered_ids must be an array', 400);
        }

        $this->noteService->reorder($this->clientId(), $orderedIds);

        return $this->success(['reordered' => true]);
    }
}
