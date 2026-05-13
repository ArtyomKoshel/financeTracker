<?php

namespace App\Services\Admin;

use App\Models\BankReceiptMapping;
use App\Models\CategorizationRule;
use App\Models\CategorizationRuleStat;
use App\Models\Category;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

class CategorizationRuleStatsService
{
    public function getRulesWithStats(): array
    {
        $rules = CategorizationRule::withoutGlobalScope('client')
            ->whereNull('client_id')
            ->orderByDesc('priority')
            ->orderBy('name')
            ->get();

        $stats = CategorizationRuleStat::query()
            ->selectRaw('rule_id, COUNT(*) as applied, SUM(CASE WHEN accepted THEN 1 ELSE 0 END) as accepted')
            ->groupBy('rule_id')
            ->get()
            ->keyBy('rule_id');

        return $rules->map(function (CategorizationRule $r) use ($stats) {
            $s = $stats->get($r->id);
            $applied = (int) ($s?->applied ?? 0);
            $accepted = (int) ($s?->accepted ?? 0);
            $accuracy = $applied > 0 ? round(100 * $accepted / $applied, 1) : null;
            $status = $accuracy === null ? 'candidate' : ($accuracy >= 85 ? 'auto' : ($accuracy >= 60 ? 'suggestion' : 'review'));

            return [
                'id' => $r->id,
                'name' => $r->name,
                'merchant_pattern' => $r->merchant_pattern,
                'conditions' => $r->conditions,
                'category_name' => $r->category_name ?? $r->category?->name,
                'result_income_type' => $r->result_income_type,
                'is_auto' => (bool) $r->is_auto,
                'priority' => $r->priority,
                'times_applied' => $r->times_applied,
                'last_used_at' => $r->last_used_at?->toISOString(),
                'applied' => $applied,
                'accepted' => $accepted,
                'accuracy_percent' => $accuracy,
                'status' => $status,
            ];
        })->toArray();
    }

    public function getRuleDetailStats(int $ruleId): ?array
    {
        $rule = CategorizationRule::withoutGlobalScope('client')
            ->whereNull('client_id')
            ->where('id', $ruleId)
            ->first();

        if (! $rule) {
            return null;
        }

        $stats = CategorizationRuleStat::where('rule_id', $ruleId)->get();
        $applied = $stats->count();
        $accepted = $stats->where('accepted', true)->count();
        $accuracy = $applied > 0 ? round(100 * $accepted / $applied, 1) : null;

        $rejectedByCategory = $stats->where('accepted', false)
            ->whereNotNull('final_category_id')
            ->groupBy('final_category_id')
            ->map(fn (Collection $g) => $g->count())
            ->sortDesc();

        $categoryNames = [];
        foreach ($rejectedByCategory->keys() as $catId) {
            $cat = Category::withoutGlobalScope('client')->find($catId);
            $categoryNames[$catId] = $cat?->name ?? '?';
        }

        $rejectedBreakdown = $rejectedByCategory->map(fn (int $count, $catId) => [
            'category_name' => $categoryNames[$catId] ?? '?',
            'count' => $count,
        ])->values()->toArray();

        $uniqueClients = $stats->pluck('client_id')->unique()->count();

        return [
            'rule' => [
                'id' => $rule->id,
                'name' => $rule->name,
                'merchant_pattern' => $rule->merchant_pattern,
                'conditions' => $rule->conditions,
                'category_name' => $rule->category_name ?? $rule->category?->name,
                'result_income_type' => $rule->result_income_type,
                'is_auto' => (bool) $rule->is_auto,
            ],
            'applied' => $applied,
            'accepted' => $accepted,
            'rejected' => $applied - $accepted,
            'accuracy_percent' => $accuracy,
            'unique_clients' => $uniqueClients,
            'rejected_breakdown' => $rejectedBreakdown,
        ];
    }

    public function getCandidates(int $minMappings = 5, int $minConsistencyPercent = 70): array
    {
        if (! Schema::hasTable('bank_receipt_mappings')) {
            return [];
        }

        $rules = CategorizationRule::withoutGlobalScope('client')
            ->whereNull('client_id')
            ->get();

        $mappings = BankReceiptMapping::withoutGlobalScope('client')
            ->join('categories', function ($j) {
                $j->on('bank_receipt_mappings.category_id', '=', 'categories.id')
                    ->on('bank_receipt_mappings.client_id', '=', 'categories.client_id');
            })
            ->selectRaw('bank_receipt_mappings.bank_merchant_normalized as merchant, bank_receipt_mappings.bank_merchant_name as name, categories.name as category_name, COUNT(*) as cnt')
            ->whereNotNull('bank_receipt_mappings.bank_merchant_normalized')
            ->where('bank_receipt_mappings.bank_merchant_normalized', '!=', '')
            ->groupBy('bank_receipt_mappings.bank_merchant_normalized', 'bank_receipt_mappings.bank_merchant_name', 'categories.name')
            ->get();

        $uniqueClientsByMerchant = BankReceiptMapping::withoutGlobalScope('client')
            ->whereNotNull('bank_merchant_normalized')
            ->where('bank_merchant_normalized', '!=', '')
            ->selectRaw('bank_merchant_normalized, COUNT(DISTINCT client_id) as clients')
            ->groupBy('bank_merchant_normalized')
            ->pluck('clients', 'bank_merchant_normalized');

        $byMerchant = $mappings->groupBy('merchant');
        $candidates = [];

        foreach ($byMerchant as $merchantNorm => $rows) {
            $total = $rows->sum('cnt');
            if ($total < $minMappings) {
                continue;
            }

            $matched = false;
            foreach ($rules as $rule) {
                if ($this->ruleMatchesMerchant($rule, $rows->first()->name ?? '')) {
                    $matched = true;
                    break;
                }
            }
            if ($matched) {
                continue;
            }

            $topCategory = $rows->sortByDesc('cnt')->first();
            $topCount = $topCategory->cnt;
            $consistency = $total > 0 ? round(100 * $topCount / $total, 0) : 0;

            if ($consistency >= $minConsistencyPercent) {
                $candidates[] = [
                    'merchant' => $topCategory->name ?? $merchantNorm,
                    'merchant_normalized' => $merchantNorm,
                    'category_name' => $topCategory->category_name ?? '?',
                    'total_mappings' => $total,
                    'unique_clients' => (int) ($uniqueClientsByMerchant[$merchantNorm] ?? 0),
                    'consistency_percent' => $consistency,
                ];
            }
        }

        usort($candidates, fn ($a, $b) => $b['total_mappings'] <=> $a['total_mappings']);

        return array_slice($candidates, 0, 50);
    }

    private function ruleMatchesMerchant(CategorizationRule $rule, string $merchant): bool
    {
        $merchantLower = mb_strtolower($merchant);
        if (! empty($rule->merchant_pattern) && str_contains($merchantLower, mb_strtolower($rule->merchant_pattern))) {
            return true;
        }
        $conditions = $rule->conditions['rules'] ?? [];
        foreach ($conditions as $c) {
            if (($c['field'] ?? '') === 'merchant') {
                $val = mb_strtolower((string) ($c['value'] ?? ''));
                $op = $c['operator'] ?? 'contains';
                if ($op === 'contains' && str_contains($merchantLower, $val)) {
                    return true;
                }
                if ($op === 'equals' && $merchantLower === $val) {
                    return true;
                }
                if ($op === 'starts_with' && str_starts_with($merchantLower, $val)) {
                    return true;
                }
            }
        }

        return false;
    }
}
