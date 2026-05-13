<?php

namespace App\Http\Controllers\Api\Notes;

use App\Events\DataUpdated;
use App\Http\Controllers\Api\Controller;
use App\Http\Requests\Notes\StoreNoteLabelRequest;
use App\Http\Requests\Notes\UpdateNoteLabelRequest;
use App\Models\NoteLabel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NoteLabelController extends Controller
{
    public function index(): JsonResponse
    {
        $labels = NoteLabel::withoutGlobalScope('client')
            ->where('client_id', $this->clientId())
            ->orderBy('name')
            ->get()
            ->map(fn (NoteLabel $label) => [
                'id' => $label->id,
                'name' => $label->name,
                'color' => $label->color ?? '#6366f1',
            ]);

        return $this->success($labels);
    }

    public function store(StoreNoteLabelRequest $request): JsonResponse
    {
        $clientId = $this->clientId();
        $data = $request->validated();

        $label = NoteLabel::create([
            'client_id' => $clientId,
            'name' => $data['name'],
            'color' => $data['color'] ?? '#6366f1',
        ]);

        event(new DataUpdated('notes'));

        return $this->success([
            'id' => $label->id,
            'name' => $label->name,
            'color' => $label->color ?? '#6366f1',
        ], 201);
    }

    public function update(UpdateNoteLabelRequest $request, int $id): JsonResponse
    {
        $clientId = $this->clientId();
        $data = $request->validated();

        $label = NoteLabel::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->find($id);

        if (! $label) {
            return $this->error('Label not found', 404);
        }

        $label->update(array_intersect_key($data, array_flip(['name', 'color'])));

        event(new DataUpdated('notes'));

        return $this->success([
            'id' => $label->id,
            'name' => $label->name,
            'color' => $label->color ?? '#6366f1',
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $clientId = $this->clientId();

        $label = NoteLabel::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->find($id);

        if (! $label) {
            return $this->error('Label not found', 404);
        }

        $label->notes()->detach();
        $label->delete();

        event(new DataUpdated('notes'));

        return $this->success(['deleted' => true]);
    }
}
