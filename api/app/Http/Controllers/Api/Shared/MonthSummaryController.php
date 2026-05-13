<?php

namespace App\Http\Controllers\Api\Shared;

use App\Http\Controllers\Api\Controller;
use App\Repositories\TransactionRepositoryInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MonthSummaryController extends Controller
{
    protected TransactionRepositoryInterface $transactionRepository;

    public function __construct(TransactionRepositoryInterface $transactionRepository)
    {
        $this->transactionRepository = $transactionRepository;
    }

    public function index(Request $request): JsonResponse
    {
        $month = $request->query('month', now()->format('Y-m'));
        $clientId = $this->clientId();
        $income = $this->transactionRepository->getIncomeForMonth($clientId, $month);
        $expenses = $this->transactionRepository->getExpensesForMonth($clientId, $month);
        $savingsIn = $this->transactionRepository->getSavingsForMonth($clientId, $month);
        $savingsOut = $this->transactionRepository->getSavingsWithdrawalForMonth($clientId, $month);
        $savings = max(0, $savingsIn - $savingsOut);

        return $this->success(['month' => $month, 'total_income' => $income, 'expenses' => $expenses, 'total_saved' => $savings]);
    }
}
