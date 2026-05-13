<?php

namespace App\Http\Controllers\Api\Budget;

use App\Events\DataUpdated;
use App\Http\Controllers\Api\Controller;
use App\Http\Requests\Budget\StoreCategoryBudgetRequest;
use App\Models\ActivityLog;
use App\Models\CategoryBudget;
use App\Models\Transaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CategoryBudgetController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $month = $request->query('month', now()->format('Y-m'));
        $clientId = $this->clientId();
        $budgets = CategoryBudget::withoutGlobalScope('client')
            ->with('category')
            ->where('client_id', $clientId)
            ->where('month', $month)
            ->get();

        $result = [];
        foreach ($budgets as $b) {
            $spent = (float) Transaction::withoutGlobalScope('client')
                ->where('client_id', $clientId)
                ->where('month', $month)
                ->where('category_id', $b->category_id)
                ->where('type', 'expense')
                ->sum(DB::raw('ABS(amount)'));
            $limitAmount = (float) $b->limit_amount;
            $alertPercent = (float) ($b->alert_percent ?? 80);
            $percentUsed = $limitAmount > 0 ? ($spent / $limitAmount) * 100 : 0;
            $isExceeded = $spent > $limitAmount;

            $result[] = [
                'id' => $b->id,
                'category_id' => $b->category_id,
                'category_name' => $b->category->name ?? 'Категория',
                'category_icon' => $b->category->icon ?? '📦',
                'month' => $b->month,
                'limit_amount' => $limitAmount,
                'spent_amount' => $spent,
                'alert_percent' => $alertPercent,
                'is_exceeded' => $isExceeded,
                'percent_used' => $percentUsed,
                'is_recurring' => (bool) $b->is_recurring,
                'is_essential' => (bool) $b->is_essential,
            ];
        }

        return $this->success($result);
    }

    public function store(StoreCategoryBudgetRequest $request): JsonResponse
    {
        $clientId = $this->clientId();
        $data = $request->only(['category_id', 'month', 'limit_amount', 'alert_percent', 'is_recurring', 'is_essential']);
        $data['client_id'] = $clientId;
        $data['alert_percent'] = $data['alert_percent'] ?? 80;
        $data['is_recurring'] = $data['is_recurring'] ?? false;
        $data['is_essential'] = $data['is_essential'] ?? false;
        $b = CategoryBudget::withoutGlobalScope('client')->updateOrCreate(
            ['client_id' => $clientId, 'category_id' => $data['category_id'], 'month' => $data['month']],
            $data
        );
        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'budget_create',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['category_id' => $b->category_id, 'month' => $b->month, 'limit' => (float) $b->limit_amount],
            'created_at' => now(),
        ]);
        event(new DataUpdated('budgets'));

        return $this->success(['id' => $b->id, 'category_id' => $b->category_id, 'month' => $b->month, 'limit_amount' => (float) $b->limit_amount]);
    }

    public function copyToNextMonth(Request $request): JsonResponse
    {
        $fromMonth = $request->input('from_month', now()->format('Y-m'));
        $clientId = $this->clientId();

        $toDate = \Carbon\Carbon::createFromFormat('Y-m', $fromMonth)->addMonth();
        $toMonth = $toDate->format('Y-m');

        $budgets = CategoryBudget::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('month', $fromMonth)
            ->get();

        $copied = 0;
        foreach ($budgets as $b) {
            CategoryBudget::withoutGlobalScope('client')->updateOrCreate(
                ['client_id' => $clientId, 'category_id' => $b->category_id, 'month' => $toMonth],
                [
                    'client_id' => $clientId,
                    'category_id' => $b->category_id,
                    'month' => $toMonth,
                    'limit_amount' => $b->limit_amount,
                    'alert_percent' => $b->alert_percent,
                    'is_recurring' => $b->is_recurring,
                    'is_essential' => $b->is_essential,
                ]
            );
            $copied++;
        }

        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'budget_copy',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['from' => $fromMonth, 'to' => $toMonth, 'count' => $copied],
            'created_at' => now(),
        ]);
        event(new DataUpdated('budgets'));

        return $this->success(['copied' => $copied, 'to_month' => $toMonth]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $clientId = $this->clientId();
        CategoryBudget::where('id', $id)->where('client_id', $clientId)->delete();
        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'budget_delete',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['id' => $id],
            'created_at' => now(),
        ]);
        event(new DataUpdated('budgets'));

        return $this->success(['success' => true]);
    }
}
