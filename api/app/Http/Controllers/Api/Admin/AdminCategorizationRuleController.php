<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\Controller;
use App\Services\Admin\CategorizationRuleStatsService;
use App\Services\Experimental\ImportRuleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminCategorizationRuleController extends Controller
{
    public function __construct(
        protected readonly CategorizationRuleStatsService $statsService,
        protected readonly ImportRuleService $ruleService,
    ) {}

    public function index(): JsonResponse
    {
        $rules = $this->statsService->getRulesWithStats();

        return $this->success(['rules' => $rules]);
    }

    public function candidates(Request $request): JsonResponse
    {
        $minMappings = (int) $request->query('min_mappings', 5);
        $minConsistency = (int) $request->query('min_consistency', 70);

        $candidates = $this->statsService->getCandidates($minMappings, $minConsistency);

        return $this->success(['candidates' => $candidates]);
    }

    public function stats(int $id): JsonResponse
    {
        $detail = $this->statsService->getRuleDetailStats($id);

        if (! $detail) {
            return $this->error('Правило не найдено', 404);
        }

        return $this->success($detail);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'nullable|string|max:255',
            'merchant_pattern' => 'nullable|string|max:255',
            'conditions' => 'nullable|array',
            'conditions.logic' => 'nullable|string|in:AND,OR',
            'conditions.rules' => 'nullable|array',
            'category_id' => 'nullable|integer|exists:categories,id',
            'category_name' => 'nullable|string|max:255',
            'result_income_type' => 'nullable|string|max:50',
            'is_auto' => 'nullable|boolean',
            'priority' => 'nullable|integer|min:0|max:999',
        ]);

        $rule = $this->ruleService->createGlobal($request->all(), $this->clientId());

        return $this->success(['id' => $rule->id]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'name' => 'nullable|string|max:255',
            'merchant_pattern' => 'nullable|string|max:255',
            'conditions' => 'nullable|array',
            'category_id' => 'nullable|integer|exists:categories,id',
            'category_name' => 'nullable|string|max:255',
            'result_income_type' => 'nullable|string|max:50',
            'is_auto' => 'nullable|boolean',
            'priority' => 'nullable|integer|min:0|max:999',
        ]);

        $rule = $this->ruleService->updateGlobal($id, $request->all(), $this->clientId());

        if (! $rule) {
            return $this->error('Правило не найдено', 404);
        }

        return $this->success(['id' => $rule->id]);
    }

    public function destroy(int $id): JsonResponse
    {
        if (! $this->ruleService->deleteGlobal($id)) {
            return $this->error('Правило не найдено', 404);
        }

        return $this->success(['deleted' => true]);
    }
}
