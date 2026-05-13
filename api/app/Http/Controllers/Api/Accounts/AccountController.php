<?php

namespace App\Http\Controllers\Api\Accounts;

use App\Events\DataUpdated;
use App\Http\Controllers\Api\Controller;
use App\Http\Requests\Accounts\StoreAccountRequest;
use App\Http\Requests\Accounts\SyncBalanceRequest;
use App\Http\Requests\Accounts\UpdateAccountRequest;
use App\Models\Account;
use App\Models\ActivityLog;
use App\Models\Transaction;
use App\Services\Accounts\AccountService;
use App\Services\Transactions\TransactionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountController extends Controller
{
    public function __construct(
        protected AccountService $accountService,
        protected TransactionService $transactionService,
    ) {}

    public function index(): JsonResponse
    {
        $clientId = $this->clientId();
        $accounts = $this->accountService->getAllForClient($clientId);
        $total = $this->accountService->getTotalBalance($clientId);

        return $this->success([
            'accounts' => $accounts->map(fn ($a) => [
                'id' => $a->id,
                'name' => $a->name,
                'balance' => (float) $a->balance,
                'currency' => $a->currency ?? 'BYN',
                'last_sync_date' => $a->last_sync_date?->format('Y-m-d'),
                'last_sync_amount' => $a->last_sync_amount ? (float) $a->last_sync_amount : 0,
                'sort_order' => (int) ($a->sort_order ?? 0),
            ])->values()->all(),
            'total_balance' => $total,
        ]);
    }

    public function store(StoreAccountRequest $request): JsonResponse
    {
        $clientId = $this->clientId();
        $maxOrder = Account::withoutGlobalScope('client')->where('client_id', $clientId)->max('sort_order') ?? 0;

        $account = Account::create([
            'client_id' => $clientId,
            'name' => $request->input('name'),
            'balance' => 0,
            'sort_order' => $maxOrder + 1,
        ]);
        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'account_create',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['account_id' => $account->id, 'name' => $account->name],
            'created_at' => now(),
        ]);
        event(new DataUpdated('balance'));
        event(new DataUpdated('dashboard'));

        return $this->success([
            'id' => $account->id,
            'name' => $account->name,
            'balance' => (float) $account->balance,
            'currency' => $account->currency ?? 'BYN',
            'sort_order' => (int) $account->sort_order,
        ]);
    }

    public function update(UpdateAccountRequest $request, int $id): JsonResponse
    {
        $clientId = $this->clientId();
        $account = Account::withoutGlobalScope('client')->where('client_id', $clientId)->findOrFail($id);
        $account->update($request->only(['name', 'sort_order']));
        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'account_update',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['account_id' => $account->id, 'name' => $account->name],
            'created_at' => now(),
        ]);
        event(new DataUpdated('balance'));

        return $this->success([
            'id' => $account->id,
            'name' => $account->name,
            'balance' => (float) $account->balance,
            'currency' => $account->currency ?? 'BYN',
            'sort_order' => (int) ($account->sort_order ?? 0),
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $clientId = $this->clientId();
        $account = Account::withoutGlobalScope('client')->where('client_id', $clientId)->findOrFail($id);

        $count = Account::withoutGlobalScope('client')->where('client_id', $clientId)->count();
        if ($count <= 1) {
            return $this->error('Нельзя удалить единственный счёт', 422);
        }

        $txCount = Transaction::withoutGlobalScope('client')->where('account_id', $id)->count();
        if ($txCount > 0) {
            return $this->error('Нельзя удалить счёт с операциями. Сначала переназначьте их.', 422);
        }

        $name = $account->name;
        $account->delete();
        ActivityLog::create([
            'user_id' => $clientId,
            'action' => 'account_delete',
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => ['account_id' => $id, 'name' => $name],
            'created_at' => now(),
        ]);
        event(new DataUpdated('balance'));
        event(new DataUpdated('dashboard'));

        return $this->success(['deleted' => true]);
    }

    public function getBalance(Request $request): JsonResponse
    {
        $clientId = $this->clientId();
        $this->accountService->getOrCreateDefault($clientId);
        $accounts = $this->accountService->getAllForClient($clientId);
        $total = $this->accountService->getTotalBalance($clientId);

        return $this->success([
            'accounts' => $accounts->map(fn ($a) => [
                'id' => $a->id,
                'name' => $a->name,
                'balance' => (float) $a->balance,
                'currency' => $a->currency ?? 'BYN',
                'last_sync_date' => $a->last_sync_date?->format('Y-m-d'),
                'last_sync_amount' => $a->last_sync_amount ? (float) $a->last_sync_amount : 0,
            ])->values()->all(),
            'total_balance' => $total,
        ]);
    }

    public function setInitialBalance(Request $request): JsonResponse
    {
        $request->validate(['balance' => 'required|numeric']);

        $clientId = $this->clientId();
        $balance = (float) $request->input('balance');

        $account = Account::withoutGlobalScope('client')->where('client_id', $clientId)->first();
        if (! $account) {
            $account = Account::create([
                'name' => 'Основной счёт',
                'balance' => $balance,
                'client_id' => $clientId,
            ]);
        } else {
            $account->update(['balance' => $balance]);
        }

        return $this->success([
            'id' => $account->id,
            'name' => $account->name,
            'balance' => (float) $account->balance,
            'last_sync_date' => $account->last_sync_date ? $account->last_sync_date->format('Y-m-d') : null,
            'last_sync_amount' => $account->last_sync_amount ? (float) $account->last_sync_amount : 0,
        ]);
    }

    public function syncBalance(SyncBalanceRequest $request): JsonResponse
    {

        $clientId = $this->clientId();
        $actualBalance = (float) $request->input('actual_balance');
        $accountId = $request->input('account_id');

        $account = $accountId
            ? Account::withoutGlobalScope('client')->where('client_id', $clientId)->where('id', $accountId)->first()
            : Account::withoutGlobalScope('client')->where('client_id', $clientId)->first();

        if (! $account) {
            return $this->error('Account not found', 404);
        }

        $currentBalance = (float) $account->balance;
        $difference = $actualBalance - $currentBalance;

        if (abs($difference) > 0.01) {
            ActivityLog::create([
                'user_id' => $clientId,
                'action' => 'balance_sync',
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'details' => ['account_id' => $account->id, 'difference' => $difference,
                    'old' => $currentBalance, 'new' => $actualBalance],
                'created_at' => now(),
            ]);
            $account->update([
                'balance' => $actualBalance,
                'last_sync_date' => now(),
                'last_sync_amount' => $currentBalance,
            ]);

            $this->transactionService->createBalanceCorrection(
                $clientId,
                $account->id,
                $difference,
                now()->format('Y-m-d')
            );
        }

        return $this->success([
            'account' => [
                'id' => $account->id,
                'name' => $account->name,
                'balance' => (float) $account->balance,
                'last_sync_date' => $account->last_sync_date ? $account->last_sync_date->format('Y-m-d') : null,
                'last_sync_amount' => $account->last_sync_amount ? (float) $account->last_sync_amount : 0,
            ],
            'difference' => $difference,
        ]);
    }
}
