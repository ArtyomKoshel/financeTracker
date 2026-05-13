<?php

namespace App\Http\Controllers\Api\Shared;

use App\Http\Controllers\Api\Controller;
use App\Http\Requests\Transactions\StoreTagRequest;
use App\Models\Tag;
use App\Models\Transaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TagController extends Controller
{
    public function index(): JsonResponse
    {
        $tags = Tag::where('client_id', $this->clientId())
            ->orderBy('name')
            ->get(['id', 'name', 'color']);

        return $this->success($tags);
    }

    public function store(StoreTagRequest $request): JsonResponse
    {

        $clientId = $this->clientId();
        $tag = Tag::firstOrCreate(
            ['client_id' => $clientId, 'name' => trim($request->input('name'))],
            ['color' => $request->input('color', '#6C5CE7')]
        );

        return $this->success(['id' => $tag->id, 'name' => $tag->name, 'color' => $tag->color]);
    }

    public function destroy(int $id): JsonResponse
    {
        Tag::where('id', $id)->where('client_id', $this->clientId())->delete();

        return $this->success(['success' => true]);
    }

    public function syncTransaction(Request $request, int $transactionId): JsonResponse
    {
        $request->validate([
            'tags' => 'nullable|array',
            'tags.*' => 'string|max:50',
        ]);

        $clientId = $this->clientId();

        $transaction = Transaction::where('id', $transactionId)
            ->where('client_id', $clientId)
            ->firstOrFail();

        $tagNames = array_unique(array_filter(array_map('trim', $request->input('tags', []))));
        $tagIds = [];

        foreach ($tagNames as $name) {
            $tag = Tag::firstOrCreate(
                ['client_id' => $clientId, 'name' => $name],
                ['color' => '#6C5CE7']
            );
            $tagIds[] = $tag->id;
        }

        $transaction->tags()->sync($tagIds);

        $tags = $transaction->tags()->get(['tags.id', 'tags.name', 'tags.color']);

        return $this->success($tags);
    }
}
