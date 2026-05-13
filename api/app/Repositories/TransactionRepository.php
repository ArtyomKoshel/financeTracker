<?php

namespace App\Repositories;

use App\Models\Transaction;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class TransactionRepository implements TransactionRepositoryInterface
{
    public function getIncomeForMonth(int $clientId, string $month): float
    {
        return (float) Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('month', $month)
            ->whereNotIn('type', ['expense', 'savings', 'correction', 'transfer'])
            ->sum('amount');
    }

    public function getExpensesForMonth(int $clientId, string $month): float
    {
        return (float) Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('month', $month)
            ->where('type', 'expense')
            ->sum(DB::raw('ABS(amount)'));
    }

    public function getSavingsForMonth(int $clientId, string $month): float
    {
        return (float) Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('month', $month)
            ->where('type', 'savings')
            ->sum(DB::raw('ABS(amount)'));
    }

    public function getTotalSavings(int $clientId): float
    {
        $in = (float) Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('type', 'savings')
            ->sum(DB::raw('ABS(amount)'));
        $out = (float) Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('type', 'savings_withdrawal')
            ->sum('amount');

        return max(0.0, $in - $out);
    }

    public function getTotalSavingsForGoal(int $clientId, int $goalId): float
    {
        $in = (float) Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('type', 'savings')
            ->where('goal_id', $goalId)
            ->sum(DB::raw('ABS(amount)'));
        $out = (float) Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('type', 'savings_withdrawal')
            ->where('goal_id', $goalId)
            ->sum('amount');

        return max(0.0, $in - $out);
    }

    public function getTotalSavingsActiveGoalsOnly(int $clientId, array $activeGoalIds): float
    {
        $inQuery = Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('type', 'savings');
        $outQuery = Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('type', 'savings_withdrawal');

        if (! empty($activeGoalIds)) {
            // Только активные цели — не включаем goal_id=null (могут быть старые данные от закрытых целей)
            $inQuery->whereIn('goal_id', $activeGoalIds);
            $outQuery->whereIn('goal_id', $activeGoalIds);
        } else {
            // Нет активных целей — считаем только нераспределённые (goal_id=null)
            $inQuery->whereNull('goal_id');
            $outQuery->whereNull('goal_id');
        }

        $in = (float) $inQuery->sum(DB::raw('ABS(amount)'));
        $out = (float) $outQuery->sum('amount');

        return max(0.0, $in - $out);
    }

    /**
     * @return Collection|\Illuminate\Database\Eloquent\Collection
     */
    public function getByMonth(int $clientId, string $month, int $limit = 10)
    {
        return Transaction::withoutGlobalScope('client')
            ->with(['category', 'account', 'transferToAccount'])
            ->where('client_id', $clientId)
            ->where('month', $month)
            ->orderByDesc('date')
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get();
    }

    public function getPaidPaymentsForMonth(int $clientId, string $month): float
    {
        return (float) Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('month', $month)
            ->where('type', 'expense')
            ->whereNotNull('recurring_payment_id')
            ->sum(DB::raw('ABS(amount)'));
    }

    public function getOtherExpensesForMonth(int $clientId, string $month): float
    {
        return (float) Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('month', $month)
            ->where('type', 'expense')
            ->whereNull('recurring_payment_id')
            ->sum(DB::raw('ABS(amount)'));
    }

    public function getSavingsWithdrawalForMonth(int $clientId, string $month): float
    {
        return (float) Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('month', $month)
            ->where('type', 'savings_withdrawal')
            ->sum('amount');
    }

    public function getPaginated(int $clientId, int $perPage, int $page, array $filters = []): array
    {
        $query = Transaction::withoutGlobalScope('client')
            ->with(['category', 'account', 'transferToAccount', 'splits.category', 'tags'])
            ->where('client_id', $clientId)
            ->orderByDesc('date')
            ->orderByDesc('created_at');

        if (! empty($filters['month'])) {
            $query->where('month', $filters['month']);
        } elseif (! empty($filters['year'])) {
            $query->where('month', 'like', $filters['year'].'-%');
        }

        if (! empty($filters['type'])) {
            $type = $filters['type'];
            if ($type === 'income') {
                $query->whereNotIn('type', ['expense', 'savings', 'savings_withdrawal', 'transfer']);
            } elseif ($type === 'expense') {
                $query->where('type', 'expense');
            } elseif ($type === 'savings') {
                $query->whereIn('type', ['savings', 'savings_withdrawal']);
            } else {
                $query->where('type', $type);
            }
        }

        if (! empty($filters['search'])) {
            $search = $filters['search'];
            $query->where(function ($q) use ($search) {
                $q->where('description', 'ilike', "%{$search}%")
                    ->orWhereHas('category', fn ($cq) => $cq->where('name', 'ilike', "%{$search}%"));
            });
        }

        if (! empty($filters['tag'])) {
            $query->whereHas('tags', fn ($q) => $q->where('name', $filters['tag']));
        }

        if (! empty($filters['source'])) {
            $query->where('source', $filters['source']);
        }

        $total = $query->count();
        $transactions = $query->skip(($page - 1) * $perPage)->take($perPage)->get();

        return [
            'data' => $transactions,
            'meta' => [
                'total' => $total,
                'per_page' => $perPage,
                'page' => $page,
                'last_page' => max(1, (int) ceil($total / $perPage)),
            ],
        ];
    }

    public function getByMonthPaginated(int $clientId, string $month, int $perPage, int $page): array
    {
        $query = Transaction::withoutGlobalScope('client')
            ->with(['category', 'account', 'transferToAccount', 'splits.category', 'tags'])
            ->where('client_id', $clientId)
            ->where('month', $month)
            ->orderByDesc('date')
            ->orderByDesc('created_at');

        $total = $query->count();
        $transactions = $query->skip(($page - 1) * $perPage)->take($perPage)->get();

        return [
            'data' => $transactions,
            'meta' => [
                'total' => $total,
                'per_page' => $perPage,
                'page' => $page,
                'last_page' => (int) ceil($total / $perPage),
            ],
        ];
    }

    public function findForClient(int $id, int $clientId): ?Transaction
    {
        return Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->find($id);
    }

    public function getSpentByCategory(int $clientId, string $month, int $categoryId): float
    {
        return (float) Transaction::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('month', $month)
            ->where('category_id', $categoryId)
            ->where('type', 'expense')
            ->sum(DB::raw('ABS(amount)'));
    }
}
