<?php

namespace App\Services\Accounts;

use App\Models\Account;

class AccountService
{
    public function updateBalance(int $clientId, float $delta): void
    {
        $account = Account::withoutGlobalScope('client')->where('client_id', $clientId)->first();
        if ($account) {
            $account->increment('balance', $delta);
        }
    }

    public function updateBalanceByAccount(int $accountId, int $clientId, float $delta): void
    {
        $account = Account::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('id', $accountId)
            ->first();
        if ($account) {
            $account->increment('balance', $delta);
        }
    }

    public function getOrCreateDefault(int $clientId): Account
    {
        $account = Account::withoutGlobalScope('client')->where('client_id', $clientId)->first();
        if (! $account) {
            $account = Account::create([
                'name' => 'Основной счёт',
                'balance' => 0,
                'client_id' => $clientId,
            ]);
        }

        return $account;
    }

    public function getAllForClient(int $clientId): \Illuminate\Support\Collection
    {
        return Account::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
    }

    public function getTotalBalance(int $clientId): float
    {
        return (float) Account::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->sum('balance');
    }
}
