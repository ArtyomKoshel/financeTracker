<?php

namespace App\Http\Controllers\Api\Budget;

use App\Http\Controllers\Api\Controller;
use App\Models\Account;
use App\Repositories\TransactionRepositoryInterface;
use App\Services\Budget\BudgetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BudgetController extends Controller
{
    protected BudgetService $budgetService;

    protected TransactionRepositoryInterface $transactionRepository;

    public function __construct(BudgetService $budgetService, TransactionRepositoryInterface $transactionRepository)
    {
        $this->budgetService = $budgetService;
        $this->transactionRepository = $transactionRepository;
    }

    public function getCashflow(Request $request): JsonResponse
    {
        $data = $this->budgetService->calculateCashflow($this->clientId());

        return $this->success($data);
    }

    public function calculatePlan(Request $request): JsonResponse
    {
        $request->validate(['income' => 'required|numeric|min:0', 'type' => 'required|string']);
        $income = (float) $request->input('income');
        $saved = $income * 0.2;
        $remaining = $income - $saved;

        return $this->success([
            'income' => $income,
            'suggested_savings' => $saved,
            'remaining' => $remaining,
            'daily_budget' => $remaining / 15,
            'days_until_next' => 15,
        ]);
    }

    public function getMonthly(Request $request): JsonResponse
    {
        $month = $request->query('month', now()->format('Y-m'));
        $clientId = $this->clientId();

        $income = $this->transactionRepository->getIncomeForMonth($clientId, $month);
        $paidPayments = $this->transactionRepository->getPaidPaymentsForMonth($clientId, $month);
        $otherExpenses = $this->transactionRepository->getOtherExpensesForMonth($clientId, $month);
        $savingsIn = $this->transactionRepository->getSavingsForMonth($clientId, $month);
        $savingsOut = $this->transactionRepository->getSavingsWithdrawalForMonth($clientId, $month);
        $savings = $savingsIn - $savingsOut;

        $account = Account::withoutGlobalScope('client')->where('client_id', $clientId)->first();
        $balance = $account ? (float) $account->balance : 0;

        $remaining = $income - $paidPayments - $savings - $otherExpenses;
        $savingsRate = $income > 0 ? ($savings / $income) * 100 : 0;

        return $this->success([
            'month' => $month,
            'total_income' => $income,
            'total_payments' => $paidPayments,
            'total_savings' => $savings,
            'total_expenses' => $otherExpenses,
            'remaining' => $remaining,
            'savings_rate' => $savingsRate,
        ]);
    }
}
