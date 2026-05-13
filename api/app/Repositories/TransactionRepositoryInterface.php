<?php

namespace App\Repositories;

use App\Models\Transaction;
use Illuminate\Support\Collection;

interface TransactionRepositoryInterface
{
    public function getIncomeForMonth(int $clientId, string $month): float;

    public function getExpensesForMonth(int $clientId, string $month): float;

    public function getSavingsForMonth(int $clientId, string $month): float;

    public function getTotalSavings(int $clientId): float;

    public function getTotalSavingsForGoal(int $clientId, int $goalId): float;

    /** Накопления только по активным целям (для подушки — исключаем закрытые) */
    public function getTotalSavingsActiveGoalsOnly(int $clientId, array $activeGoalIds): float;

    /**
     * @return Collection|\Illuminate\Database\Eloquent\Collection
     */
    public function getByMonth(int $clientId, string $month, int $limit = 10);

    public function getPaidPaymentsForMonth(int $clientId, string $month): float;

    public function getOtherExpensesForMonth(int $clientId, string $month): float;

    public function getSavingsWithdrawalForMonth(int $clientId, string $month): float;

    /** @return array{data: \Illuminate\Support\Collection, meta: array} */
    public function getPaginated(int $clientId, int $perPage, int $page, array $filters = []): array;

    /** @return array{data: \Illuminate\Support\Collection, meta: array} */
    public function getByMonthPaginated(int $clientId, string $month, int $perPage, int $page): array;

    public function findForClient(int $id, int $clientId): ?Transaction;

    public function getSpentByCategory(int $clientId, string $month, int $categoryId): float;
}
