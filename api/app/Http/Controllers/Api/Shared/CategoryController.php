<?php

namespace App\Http\Controllers\Api\Shared;

use App\Events\DataUpdated;
use App\Http\Controllers\Api\Controller;
use App\Http\Requests\Budget\StoreCategoryRequest;
use App\Http\Requests\Budget\UpdateCategoryRequest;
use App\Models\ActivityLog;
use App\Models\Category;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class CategoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $includeInactive = $request->query('include_inactive') === 'true';
        $query = Category::with('subcategories')->orderBy('sort_order')->orderBy('name');
        if (! $includeInactive) {
            $query->where('is_active', true);
        }
        $categories = $query->get();
        $formatted = $categories->map(function ($c) {
            return $this->formatCategory($c);
        });

        return $this->success($formatted);
    }

    public function store(StoreCategoryRequest $request): JsonResponse
    {
        $clientId = $this->clientId();
        $cat = Category::create([
            'name' => $request->input('name'),
            'parent_id' => $request->input('parent_id'),
            'icon' => $request->input('icon', "\u{1F4E6}"),
            'color' => $request->input('color'),
            'client_id' => $clientId,
            'sort_order' => Category::withoutGlobalScope('client')->where('client_id', $clientId)->max('sort_order') + 1,
        ]);
        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'category_create',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['category_id' => $cat->id, 'name' => $cat->name],
            'created_at' => now(),
        ]);
        event(new DataUpdated('categories'));
        Cache::forget('categories:'.$this->clientId());

        return $this->success($this->formatCategory($cat->load('subcategories')));
    }

    public function update(UpdateCategoryRequest $request, int $id): JsonResponse
    {
        $cat = Category::findOrFail($id);
        $cat->update(['name' => $request->input('name'), 'icon' => $request->input('icon'), 'color' => $request->input('color')]);
        ActivityLog::create([
            'user_id' => $this->clientId(),
            'action' => 'category_update',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['category_id' => $cat->id, 'name' => $cat->name],
            'created_at' => now(),
        ]);
        event(new DataUpdated('categories'));
        Cache::forget('categories:'.$this->clientId());

        return $this->success($this->formatCategory($cat->load('subcategories')));
    }

    public function delete(Request $request, int $id): JsonResponse
    {
        $cat = Category::findOrFail($id);
        $cat->update(['is_active' => false]);
        ActivityLog::create([
            'user_id' => $this->clientId(),
            'action' => 'category_delete',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['category_id' => $id, 'name' => $cat->name],
            'created_at' => now(),
        ]);
        event(new DataUpdated('categories'));
        Cache::forget('categories:'.$this->clientId());

        return $this->success(['status' => 'deleted']);
    }

    public function restore(Request $request): JsonResponse
    {
        $request->validate(['id' => 'required|integer|exists:categories,id']);
        $cat = Category::findOrFail($request->input('id'));
        $cat->update(['is_active' => true]);
        ActivityLog::create([
            'user_id' => $this->clientId(),
            'action' => 'category_restore',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['category_id' => $cat->id, 'name' => $cat->name],
            'created_at' => now(),
        ]);
        event(new DataUpdated('categories'));
        Cache::forget('categories:'.$this->clientId());

        return $this->success(['status' => 'restored']);
    }

    protected function formatCategory($c)
    {
        $subs = $c->relationLoaded('subcategories') ? $c->subcategories->map(function ($s) {
            return $this->formatCategory($s);
        })->values()->all() : [];

        return [
            'id' => $c->id,
            'name' => $c->name,
            'parent_id' => $c->parent_id,
            'icon' => $c->icon ?? "\u{1F4E6}",
            'color' => $c->color,
            'sort_order' => $c->sort_order,
            'is_active' => $c->is_active,
            'subcategories' => $subs,
        ];
    }
}
