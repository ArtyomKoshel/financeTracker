<?php

namespace App\Services\Transactions;

use App\Models\CategorizationRule;
use App\Models\Category;

class CategorizationService
{
    /**
     * Suggest a category based on description pattern matching.
     */
    public function suggestCategory(int $clientId, string $description): ?array
    {
        if (strlen(trim($description)) < 2) {
            return null;
        }

        $normalized = $this->normalize($description);

        // 1. Check saved rules (highest confidence first)
        $rule = CategorizationRule::where('client_id', $clientId)
            ->whereRaw('LOWER(merchant_pattern) LIKE ?', ["%{$normalized}%"])
            ->orderByDesc('confidence')
            ->first();

        if ($rule) {
            $category = Category::withoutGlobalScope('client')->find($rule->category_id);
            if ($category) {
                return [
                    'category_id' => $category->id,
                    'category_name' => $category->name,
                    'category_icon' => $category->icon ?? '📦',
                    'confidence' => $rule->confidence,
                    'source' => 'rule',
                ];
            }
        }

        // 2. Check recent transactions with similar description
        $recent = \App\Models\Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('type', 'expense')
            ->whereNotNull('category_id')
            ->where('description', '!=', '')
            ->whereRaw('LOWER(description) LIKE ?', ["%{$normalized}%"])
            ->orderByDesc('date')
            ->first();

        if ($recent && $recent->category_id) {
            $category = Category::withoutGlobalScope('client')->find($recent->category_id);
            if ($category) {
                return [
                    'category_id' => $category->id,
                    'category_name' => $category->name,
                    'category_icon' => $category->icon ?? '📦',
                    'confidence' => 1,
                    'source' => 'history',
                ];
            }
        }

        // 3. Match against category names (with ё→е normalization)
        $category = Category::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('is_active', true)
            ->get()
            ->first(fn ($c) => $this->normalize($c->name) === $normalized);

        if ($category) {
            return [
                'category_id' => $category->id,
                'category_name' => $category->name,
                'category_icon' => $category->icon ?? '📦',
                'confidence' => 1,
                'source' => 'category_name',
            ];
        }

        return null;
    }

    /**
     * Learn from user input — create or strengthen a rule.
     */
    public function learnFromInput(int $clientId, string $description, int $categoryId): void
    {
        $normalized = $this->normalize($description);
        if (strlen($normalized) < 2) {
            return;
        }

        $rule = CategorizationRule::where('client_id', $clientId)
            ->where('merchant_pattern', $normalized)
            ->where('category_id', $categoryId)
            ->first();

        if ($rule) {
            $rule->increment('confidence');
            $rule->update(['last_used_at' => now()]);
        } else {
            $existing = CategorizationRule::where('client_id', $clientId)
                ->where('merchant_pattern', $normalized)
                ->first();

            if ($existing) {
                $existing->decrement('confidence');
                if ($existing->confidence <= 0) {
                    $existing->update([
                        'category_id' => $categoryId,
                        'confidence' => 1,
                        'last_used_at' => now(),
                    ]);
                }
            } else {
                CategorizationRule::create([
                    'client_id' => $clientId,
                    'merchant_pattern' => $normalized,
                    'category_id' => $categoryId,
                    'confidence' => 1,
                    'last_used_at' => now(),
                ]);
            }
        }
    }

    protected function normalize(string $text): string
    {
        $text = mb_strtolower(trim($text));
        $text = str_replace('ё', 'е', $text);
        $text = (string) preg_replace('/\s+/', ' ', $text);

        return $text;
    }
}
