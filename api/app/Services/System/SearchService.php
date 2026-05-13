<?php

namespace App\Services\System;

use App\Models\Category;
use App\Models\Note;
use App\Models\Transaction;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class SearchService
{
    /**
     * @return array{transactions: list<array<string, mixed>>, categories: list<array<string, mixed>>, notes: list<array<string, mixed>>}
     */
    public function search(int $clientId, string $query, int $limit = 20): array
    {
        $transactions = $this->searchTransactions($query, $limit);
        $categories = $this->searchCategories($query);
        $notes = $this->searchNotes($query, $limit);

        return [
            'transactions' => $transactions->toArray(),
            'categories' => $categories->toArray(),
            'notes' => $notes->toArray(),
        ];
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    private function searchTransactions(string $query, int $limit): Collection
    {
        /** @var Collection<int, Transaction> $items */
        $items = Transaction::with(['category', 'account'])
            ->where('description', 'ilike', "%{$query}%")
            ->orderByDesc('date')
            ->limit($limit)
            ->get();

        return $items->map(function (Transaction $tx): array {
            $category = $tx->category;
            $account = $tx->account;

            return [
                'id' => $tx->id,
                'date' => $tx->date ? $tx->date->format('Y-m-d') : null,
                'amount' => (float) $tx->amount,
                'currency' => $tx->currency ?? 'BYN',
                'type' => $tx->type,
                'description' => $tx->description,
                'category_name' => $category ? $category->name : '',
                'category_icon' => $category ? ($category->icon ?? '📦') : '📦',
                'account_name' => $account ? $account->name : '',
            ];
        });
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    private function searchCategories(string $query): Collection
    {
        /** @var Collection<int, Category> $items */
        $items = Category::where('name', 'ilike', "%{$query}%")
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get();

        return $items->map(fn (Category $cat): array => [
            'id' => $cat->id,
            'name' => $cat->name,
            'icon' => $cat->icon ?? '📦',
            'color' => $cat->color ?? '#607D8B',
        ]);
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    private function searchNotes(string $query, int $limit): Collection
    {
        /** @var Builder<Note> $builder */
        $builder = Note::query();
        $builder->search($query)->limit($limit);

        /** @var Collection<int, Note> $items */
        $items = $builder->get();

        return $items->map(fn (Note $note): array => [
            'id' => $note->id,
            'title' => $note->title,
            'summary' => $note->summary,
            'created_at' => $note->created_at ? $note->created_at->toISOString() : null,
        ]);
    }
}
