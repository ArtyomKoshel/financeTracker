<?php

namespace App\Console\Commands;

use App\Models\Account;
use App\Models\Debt;
use App\Models\Goal;
use App\Models\NetWorthSnapshot;
use App\Models\User;
use Illuminate\Console\Command;

class SnapshotNetWorth extends Command
{
    protected $signature = 'finance:snapshot-net-worth';

    protected $description = 'Take monthly net worth snapshot for all users';

    public function handle(): int
    {
        $month = now()->format('Y-m');
        $users = User::all();
        $count = 0;

        foreach ($users as $user) {
            $totalBalance = (float) Account::withoutGlobalScope('client')
                ->where('client_id', $user->id)
                ->sum('balance');

            $totalSavings = (float) Goal::withoutGlobalScope('client')
                ->where('client_id', $user->id)
                ->where('is_active', true)
                ->sum('current_amount');

            $totalDebt = (float) Debt::withoutGlobalScope('client')
                ->where('client_id', $user->id)
                ->where('is_active', true)
                ->selectRaw('SUM(total_amount - paid_amount) as remaining')
                ->value('remaining') ?? 0;

            $netWorth = $totalBalance + $totalSavings - $totalDebt;

            NetWorthSnapshot::updateOrCreate(
                ['client_id' => $user->id, 'month' => $month],
                [
                    'total_balance' => $totalBalance,
                    'total_savings' => $totalSavings,
                    'total_debt' => $totalDebt,
                    'net_worth' => $netWorth,
                ]
            );

            $count++;
        }

        $this->info("Net worth snapshots created for {$count} users (month: {$month}).");

        return self::SUCCESS;
    }
}
