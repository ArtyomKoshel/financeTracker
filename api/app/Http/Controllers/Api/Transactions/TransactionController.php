<?php

namespace App\Http\Controllers\Api\Transactions;

use App\Enums\TransactionType;
use App\Http\Controllers\Api\Controller;
use App\Http\Requests\Transactions\StoreTransactionRequest;
use App\Http\Resources\TransactionResource;
use App\Repositories\TransactionRepositoryInterface;
use App\Services\Transactions\CategorizationService;
use App\Services\Transactions\TransactionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class TransactionController extends Controller
{
    public function __construct(
        protected TransactionService $transactionService,
        protected TransactionRepositoryInterface $transactionRepo,
        protected CategorizationService $categorizationService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $clientId = $this->clientId();
        $perPage = min((int) $request->query('per_page', 50), 100);
        $page = max(1, (int) $request->query('page', 1));

        $filters = array_filter([
            'month' => $request->query('month'),
            'year' => $request->query('year'),
            'type' => $request->query('type'),
            'search' => $request->query('search'),
            'source' => $request->query('source'),
            'tag' => $request->query('tag'),
        ]);

        $result = $this->transactionRepo->getPaginated($clientId, $perPage, $page, $filters);

        return $this->success([
            'data' => TransactionResource::collection($result['data']),
            'meta' => $result['meta'],
        ]);
    }

    public function getByMonth(Request $request): JsonResponse
    {
        $month = $request->query('month', now()->format('Y-m'));
        $clientId = $this->clientId();
        $perPage = min((int) $request->query('per_page', 100), 200);
        $page = max(1, (int) $request->query('page', 1));

        $result = $this->transactionRepo->getByMonthPaginated($clientId, $month, $perPage, $page);

        return $this->success([
            'data' => TransactionResource::collection($result['data']),
            'meta' => $result['meta'],
        ]);
    }

    public function store(StoreTransactionRequest $request): JsonResponse
    {
        $clientId = $this->clientId();
        $data = array_merge($request->validated(), [
            'client_id' => $clientId,
            'currency' => $request->input('currency', 'BYN'),
            'month' => $request->input('month') ?? substr($request->input('date'), 0, 7),
            'goal_id' => in_array($request->input('type'), ['savings', 'savings_withdrawal']) ? $request->input('goal_id') : null,
            'account_id' => $request->input('account_id'),
            'transfer_to_account_id' => $request->input('transfer_to_account_id'),
            'splits' => $request->input('splits'),
        ]);
        $data['source'] = $data['source'] ?? 'web';

        $tx = $this->transactionService->create($data);

        // Learn categorization pattern
        if ($request->input('category_id') && $request->input('description')) {
            $this->categorizationService->learnFromInput(
                $clientId,
                (string) $request->input('description'),
                (int) $request->input('category_id')
            );
        }

        $response = ['transaction' => new TransactionResource($tx)];
        if (TransactionType::isExpenseType($request->input('type')) && $request->input('category_id')) {
            $warning = $this->transactionService->checkBudgetWarning(
                $clientId,
                $data['month'],
                (int) $request->input('category_id'),
                abs((float) $tx->amount)
            );
            if ($warning) {
                $response['budget_warning'] = $warning;
            }
        }

        return $this->success($response);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $clientId = $this->clientId();

        if (! $this->transactionService->delete($id, $clientId)) {
            return $this->error('Transaction not found', 404);
        }

        return $this->success(['deleted' => true]);
    }

    /**
     * Export transactions as CSV file (up to 5000 rows).
     * GET /api/transactions/export?month=2026-02&year=2026&type=expense&search=...&source=...&tag=...
     */
    public function export(Request $request): StreamedResponse
    {
        $clientId = $this->clientId();

        $filters = array_filter([
            'month' => $request->query('month'),
            'year' => $request->query('year'),
            'type' => $request->query('type'),
            'search' => $request->query('search'),
            'source' => $request->query('source'),
            'tag' => $request->query('tag'),
        ]);

        $result = $this->transactionRepo->getPaginated($clientId, 5000, 1, $filters);

        $month = $request->query('month');
        $year = $request->query('year');
        $filename = 'transactions';
        if ($month) {
            $filename .= "_{$month}";
        } elseif ($year) {
            $filename .= "_{$year}";
        }
        $filename .= '.csv';

        return response()->streamDownload(function () use ($result) {
            $handle = fopen('php://output', 'w');
            if ($handle === false) {
                return;
            }
            // BOM for Excel UTF-8 support
            fwrite($handle, "\xEF\xBB\xBF");
            fputcsv($handle, ['Дата', 'Тип', 'Сумма', 'Валюта', 'Сумма BYN', 'Категория', 'Счёт', 'Описание', 'Теги'], ';');

            foreach ($result['data'] as $tx) {
                $tags = $tx->tags->pluck('name')->implode(', ');
                fputcsv($handle, [
                    $tx->date?->format('Y-m-d') ?? '',
                    $tx->type ?? '',
                    abs((float) ($tx->original_amount ?? $tx->amount)),
                    $tx->currency ?? 'BYN',
                    abs((float) $tx->amount),
                    $tx->category?->name ?? '',
                    $tx->account?->name ?? '',
                    $tx->description ?? '',
                    $tags,
                ], ';');
            }

            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    /**
     * Bulk delete transactions.
     * POST /api/transactions/bulk-delete { ids: [1, 2, 3] }
     */
    public function bulkDelete(Request $request): JsonResponse
    {
        $request->validate([
            'ids' => 'required|array|min:1|max:100',
            'ids.*' => 'integer',
        ]);

        $clientId = $this->clientId();
        $ids = $request->input('ids');
        $deleted = 0;

        foreach ($ids as $id) {
            if ($this->transactionService->delete((int) $id, $clientId)) {
                $deleted++;
            }
        }

        return $this->success(['deleted' => $deleted]);
    }

    /**
     * Bulk update category for transactions.
     * POST /api/transactions/bulk-update { ids: [1, 2, 3], category_id: 5 }
     */
    public function bulkUpdate(Request $request): JsonResponse
    {
        $request->validate([
            'ids' => 'required|array|min:1|max:100',
            'ids.*' => 'integer',
            'category_id' => 'required|integer|exists:categories,id',
        ]);

        $clientId = $this->clientId();
        $ids = $request->input('ids');
        $categoryId = (int) $request->input('category_id');

        $updated = $this->transactionService->bulkUpdateCategory($ids, $categoryId, $clientId);

        return $this->success(['updated' => $updated]);
    }

    /**
     * Suggest category based on description.
     * GET /api/transactions/suggest-category?description=...
     */
    public function suggestCategory(Request $request): JsonResponse
    {
        $description = (string) $request->query('description', '');
        $suggestion = $this->categorizationService->suggestCategory($this->clientId(), $description);

        return $this->success(['suggestion' => $suggestion]);
    }

    public function validatePayment(Request $request): JsonResponse
    {
        $request->validate([
            'amount' => 'required|numeric|min:0',
            'type' => 'required|string',
        ]);

        $amount = (float) $request->input('amount');
        $type = $request->input('type');

        $result = [
            'valid' => $amount > 0 && in_array($type, ['advance', 'salary', 'bonus', 'early_pay', 'year_bonus', 'vacation', 'other', 'expense', 'savings', 'savings_withdrawal', 'correction']),
            'message' => $amount > 0 ? 'OK' : 'Amount must be positive',
        ];

        return $this->success($result);
    }
}
