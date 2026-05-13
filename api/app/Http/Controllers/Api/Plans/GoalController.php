<?php

namespace App\Http\Controllers\Api\Plans;

use App\Events\DataUpdated;
use App\Http\Controllers\Api\Controller;
use App\Http\Requests\Goals\StoreGoalRequest;
use App\Http\Requests\Goals\UpdateGoalRequest;
use App\Http\Resources\GoalResource;
use App\Models\ActivityLog;
use App\Models\Goal;
use App\Repositories\TransactionRepositoryInterface;
use App\Services\Plans\GoalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GoalController extends Controller
{
    public function __construct(
        protected TransactionRepositoryInterface $transactionRepository,
        protected GoalService $goalService,
    ) {}

    public function index(): JsonResponse
    {
        $clientId = $this->clientId();
        $goals = Goal::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('is_active', true)
            ->orderBy('created_at')
            ->get();

        return $this->success(
            $goals->map(fn ($g) => [
                'id' => $g->id,
                'name' => $g->name,
                'target_amount' => (float) $g->target_amount,
                'currency' => $g->currency ?? 'BYN',
                'target_date' => $g->target_date->format('Y-m-d'),
            ])
        );
    }

    public function completed(): JsonResponse
    {
        $clientId = $this->clientId();
        $goals = Goal::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('is_active', false)
            ->orderByDesc('updated_at')
            ->limit(20)
            ->get();

        return $this->success(
            $goals->map(fn ($g) => (new GoalResource($g))->resolve())
        );
    }

    public function store(StoreGoalRequest $request): JsonResponse
    {
        $clientId = $this->clientId();
        $goal = Goal::create([
            'client_id' => $clientId,
            'name' => $request->input('name'),
            'target_amount' => $request->input('target_amount'),
            'currency' => $request->input('currency', 'BYN'),
            'target_date' => $request->input('target_date'),
            'current_amount' => 0,
        ]);

        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'goal_create',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['goal_id' => $goal->id, 'name' => $goal->name, 'target_amount' => (float) $goal->target_amount],
            'created_at' => now(),
        ]);

        event(new DataUpdated('goals'));
        event(new DataUpdated('dashboard'));

        return $this->success((new GoalResource($goal))->resolve());
    }

    public function update(UpdateGoalRequest $request, int $id): JsonResponse
    {
        $clientId = $this->clientId();
        $goal = Goal::withoutGlobalScope('client')->where('client_id', $clientId)->findOrFail($id);
        $goal->update($request->only(['name', 'target_amount', 'currency', 'target_date', 'is_active']));
        event(new DataUpdated('goals'));
        event(new DataUpdated('dashboard'));

        return $this->success((new GoalResource($goal->fresh()))->resolve());
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $clientId = $this->clientId();
        $goal = Goal::withoutGlobalScope('client')->where('client_id', $clientId)->findOrFail($id);
        $savedForGoalBYN = $this->transactionRepository->getTotalSavingsForGoal($clientId, $id);
        $currentInGoalCurrency = $this->goalService->convertToGoalCurrency($clientId, $savedForGoalBYN, $goal->currency ?? 'BYN');
        $goal->update([
            'is_active' => false,
            'current_amount' => $currentInGoalCurrency,
        ]);

        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'goal_complete',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['goal_id' => $id, 'goal_name' => $goal->name, 'amount_saved' => $currentInGoalCurrency],
            'created_at' => now(),
        ]);

        event(new DataUpdated('goals'));
        event(new DataUpdated('dashboard'));

        return $this->success(['deleted' => true]);
    }

    /**
     * Get auto-savings plan for all active goals.
     * GET /api/goals/savings-plan
     *
     * For each goal, calculates the recommended monthly savings amount
     * based on remaining amount and months until target date.
     */
    public function savingsPlan(): JsonResponse
    {
        $clientId = $this->clientId();

        return $this->success($this->goalService->getSavingsPlan($clientId));
    }
}
