<?php

namespace App\Services\Experimental;

use App\Models\CategorizationRule;
use App\Models\Category;
use Illuminate\Support\Collection;

class ImportRuleService
{
    private int $clientId;

    /** @var Collection<int, CategorizationRule>|null */
    private ?Collection $rulesCache = null;

    public function __construct(int $clientId)
    {
        $this->clientId = $clientId;
    }

    /**
     * @return array{category_id: int|null, category_name: string|null, income_type: string|null, rule_id: int, rule_name: string|null, is_auto: bool}|null
     */
    public function evaluateRules(array $item): ?array
    {
        $rules = $this->getRules();
        if ($rules->isEmpty()) {
            return null;
        }

        foreach ($rules as $rule) {
            if ($this->matchesRule($rule, $item)) {
                $category = $this->resolveCategory($rule);
                $categoryId = $category?->id;

                $rule->timestamps = false;
                $rule->increment('times_applied');
                $rule->update(['last_used_at' => now()]);

                return [
                    'category_id' => $categoryId,
                    'category_name' => $category?->name,
                    'income_type' => $rule->result_income_type,
                    'rule_id' => $rule->id,
                    'rule_name' => $rule->name,
                    'is_auto' => (bool) $rule->is_auto,
                ];
            }
        }

        return null;
    }

    private function matchesRule(CategorizationRule $rule, array $item): bool
    {
        $conditions = $rule->conditions;

        if (! empty($conditions) && is_array($conditions)) {
            return $this->matchConditions($conditions, $item);
        }

        if (! empty($rule->merchant_pattern)) {
            $merchant = mb_strtolower(trim($item['bank_merchant_name'] ?? ''));
            $pattern = mb_strtolower(trim($rule->merchant_pattern));

            return str_contains($merchant, $pattern);
        }

        return false;
    }

    private function matchConditions(array $conditions, array $item): bool
    {
        $logic = $conditions['logic'] ?? 'AND';
        $rules = $conditions['rules'] ?? [];

        if (empty($rules)) {
            return false;
        }

        foreach ($rules as $condition) {
            $result = $this->evaluateCondition($condition, $item);
            if ($logic === 'OR' && $result) {
                return true;
            }
            if ($logic === 'AND' && ! $result) {
                return false;
            }
        }

        return $logic === 'AND';
    }

    private function evaluateCondition(array $condition, array $item): bool
    {
        $field = $condition['field'] ?? '';
        $operator = $condition['operator'] ?? 'contains';
        $value = $condition['value'] ?? '';

        $itemValue = $this->getFieldValue($field, $item);

        return match ($operator) {
            'contains' => is_string($itemValue) && str_contains(mb_strtolower($itemValue), mb_strtolower((string) $value)),
            'not_contains' => is_string($itemValue) && ! str_contains(mb_strtolower($itemValue), mb_strtolower((string) $value)),
            'equals' => mb_strtolower((string) $itemValue) === mb_strtolower((string) $value),
            'starts_with' => is_string($itemValue) && str_starts_with(mb_strtolower($itemValue), mb_strtolower((string) $value)),
            'gt' => is_numeric($itemValue) && (float) $itemValue > (float) $value,
            'lt' => is_numeric($itemValue) && (float) $itemValue < (float) $value,
            'gte' => is_numeric($itemValue) && (float) $itemValue >= (float) $value,
            'lte' => is_numeric($itemValue) && (float) $itemValue <= (float) $value,
            'in' => $this->matchIn($itemValue, $value),
            default => false,
        };
    }

    private function getFieldValue(string $field, array $item): mixed
    {
        return match ($field) {
            'merchant' => $item['bank_merchant_name'] ?? '',
            'description' => $item['raw_description'] ?? $item['bank_merchant_name'] ?? '',
            'amount' => abs((float) ($item['amount'] ?? 0)),
            'type' => ($item['type'] ?? 'expense') === 'income' ? 'income' : 'expense',
            default => $item[$field] ?? null,
        };
    }

    private function matchIn(mixed $itemValue, mixed $value): bool
    {
        if (! is_string($value) || ! is_string($itemValue)) {
            return false;
        }

        $variants = array_map('trim', explode('|', $value));
        $lower = mb_strtolower($itemValue);

        foreach ($variants as $v) {
            if ($v !== '' && str_contains($lower, mb_strtolower($v))) {
                return true;
            }
        }

        return false;
    }

    /** @return Collection<int, CategorizationRule> */
    private function getRules(): Collection
    {
        if ($this->rulesCache === null) {
            // Личные правила пользователя (приоритет выше глобальных)
            $personal = CategorizationRule::withoutGlobalScope('client')
                ->where('client_id', $this->clientId)
                ->orderByDesc('priority')
                ->orderBy('id')
                ->get();

            // Глобальные правила: is_global = true или client_id IS NULL (обратная совместимость)
            $global = CategorizationRule::withoutGlobalScope('client')
                ->where(function ($q) {
                    $q->where('is_global', true)->orWhereNull('client_id');
                })
                ->orderByDesc('priority')
                ->orderBy('id')
                ->get();

            $this->rulesCache = $personal->merge($global);
        }

        return $this->rulesCache;
    }

    private function resolveCategory(CategorizationRule $rule): ?Category
    {
        $categoryName = $rule->category_name;
        if (empty($categoryName)) {
            return null;
        }

        return Category::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)
            ->whereRaw('LOWER(name) = LOWER(?)', [$categoryName])
            ->first();
    }

    // Personal CRUD (user-specific rules, client_id = $this->clientId)

    public function listPersonal(): array
    {
        return CategorizationRule::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)
            ->orderByDesc('priority')
            ->orderBy('name')
            ->get()
            ->map(fn (CategorizationRule $r) => [
                'id' => $r->id,
                'name' => $r->name,
                'merchant_pattern' => $r->merchant_pattern,
                'conditions' => $r->conditions,
                'category_id' => $r->category_id,
                'category_name' => $r->category_name ?? $r->category?->name,
                'category_icon' => $r->category?->icon,
                'result_income_type' => $r->result_income_type,
                'is_auto' => (bool) $r->is_auto,
                'priority' => $r->priority,
                'times_applied' => $r->times_applied,
                'last_used_at' => $r->last_used_at?->toISOString(),
            ])
            ->toArray();
    }

    public function createPersonal(array $data): CategorizationRule
    {
        return CategorizationRule::create([
            'client_id' => $this->clientId,
            'name' => $data['name'] ?? null,
            'merchant_pattern' => $data['merchant_pattern'] ?? '',
            'conditions' => $data['conditions'] ?? null,
            'category_id' => $data['category_id'] ?? null,
            'category_name' => $data['category_name'] ?? null,
            'result_income_type' => $data['result_income_type'] ?? null,
            'is_auto' => $data['is_auto'] ?? false,
            'priority' => $data['priority'] ?? 0,
        ]);
    }

    public function updatePersonal(int $id, array $data): ?CategorizationRule
    {
        $rule = CategorizationRule::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)
            ->where('id', $id)
            ->first();

        if (! $rule) {
            return null;
        }

        $rule->update(array_filter([
            'name' => $data['name'] ?? $rule->name,
            'merchant_pattern' => $data['merchant_pattern'] ?? $rule->merchant_pattern,
            'conditions' => array_key_exists('conditions', $data) ? $data['conditions'] : $rule->conditions,
            'category_id' => $data['category_id'] ?? $rule->category_id,
            'category_name' => $data['category_name'] ?? $rule->category_name,
            'result_income_type' => array_key_exists('result_income_type', $data) ? $data['result_income_type'] : $rule->result_income_type,
            'is_auto' => $data['is_auto'] ?? $rule->is_auto,
            'priority' => $data['priority'] ?? $rule->priority,
        ], fn ($v) => $v !== null));

        return $rule->fresh();
    }

    public function deletePersonal(int $id): bool
    {
        return (bool) CategorizationRule::withoutGlobalScope('client')
            ->where('client_id', $this->clientId)
            ->where('id', $id)
            ->delete();
    }

    // Admin CRUD (global rules)

    public function listGlobal(): array
    {
        return CategorizationRule::withoutGlobalScope('client')
            ->whereNull('client_id')
            ->orderByDesc('priority')
            ->orderBy('name')
            ->get()
            ->map(fn (CategorizationRule $r) => [
                'id' => $r->id,
                'name' => $r->name,
                'merchant_pattern' => $r->merchant_pattern,
                'conditions' => $r->conditions,
                'category_id' => $r->category_id,
                'category_name' => $r->category_name ?? $r->category?->name,
                'category_icon' => $r->category?->icon,
                'result_income_type' => $r->result_income_type,
                'is_auto' => (bool) $r->is_auto,
                'priority' => $r->priority,
                'times_applied' => $r->times_applied,
                'last_used_at' => $r->last_used_at?->toISOString(),
            ])
            ->toArray();
    }

    public function createGlobal(array $data, ?int $adminId): CategorizationRule
    {
        $categoryName = null;
        if (! empty($data['category_id']) && $adminId) {
            $cat = Category::withoutGlobalScope('client')
                ->where('client_id', $adminId)
                ->where('id', $data['category_id'])
                ->first();
            $categoryName = $cat?->name;
        }

        return CategorizationRule::create([
            'client_id' => null,
            'name' => $data['name'] ?? null,
            'merchant_pattern' => $data['merchant_pattern'] ?? '',
            'conditions' => $data['conditions'] ?? null,
            'category_id' => $data['category_id'] ?? null,
            'category_name' => $categoryName ?? $data['category_name'] ?? null,
            'result_income_type' => $data['result_income_type'] ?? null,
            'is_auto' => $data['is_auto'] ?? true,
            'priority' => $data['priority'] ?? 0,
        ]);
    }

    public function updateGlobal(int $id, array $data, ?int $adminId): ?CategorizationRule
    {
        $rule = CategorizationRule::withoutGlobalScope('client')
            ->whereNull('client_id')
            ->where('id', $id)
            ->first();

        if (! $rule) {
            return null;
        }

        $categoryName = $rule->category_name;
        if (array_key_exists('category_id', $data) && $data['category_id'] && $adminId) {
            $cat = Category::withoutGlobalScope('client')
                ->where('client_id', $adminId)
                ->where('id', $data['category_id'])
                ->first();
            $categoryName = $cat?->name;
        } elseif (array_key_exists('category_name', $data)) {
            $categoryName = $data['category_name'];
        }

        $rule->update(array_filter([
            'name' => $data['name'] ?? $rule->name,
            'merchant_pattern' => $data['merchant_pattern'] ?? $rule->merchant_pattern,
            'conditions' => array_key_exists('conditions', $data) ? $data['conditions'] : $rule->conditions,
            'category_id' => $data['category_id'] ?? $rule->category_id,
            'category_name' => $categoryName,
            'result_income_type' => array_key_exists('result_income_type', $data) ? $data['result_income_type'] : $rule->result_income_type,
            'is_auto' => $data['is_auto'] ?? $rule->is_auto,
            'priority' => $data['priority'] ?? $rule->priority,
        ], fn ($v) => $v !== null));

        return $rule->fresh();
    }

    public function deleteGlobal(int $id): bool
    {
        return (bool) CategorizationRule::withoutGlobalScope('client')
            ->whereNull('client_id')
            ->where('id', $id)
            ->delete();
    }
}
