<?php

namespace App\Console\Commands;

use App\Models\IncomeType;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class MigrateFromGo extends Command
{
    protected $signature = 'migrate:from-go {source_db?} {--client= : Migrate only this client_id (e.g. 1)}';

    protected $description = '[DEPRECATED] Migrate data from Go SQLite database to Laravel (Go project archived)';

    protected ?int $onlyClientId = null;

    public function handle()
    {
        $sourcePath = $this->argument('source_db') ?? base_path('../data/finance.db');
        if (! file_exists($sourcePath)) {
            $this->error("Source database not found: {$sourcePath}");

            return 1;
        }

        $clientOpt = $this->option('client');
        if ($clientOpt !== null && $clientOpt !== '') {
            $this->onlyClientId = (int) $clientOpt;
            $this->info('Migrating only client_id='.$this->onlyClientId);
        }

        $sourceDb = new \PDO('sqlite:'.$sourcePath);
        $sourceDb->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);

        $this->info('Migrating from '.$sourcePath);

        DB::transaction(function () use ($sourceDb) {
            $this->migrateUsers($sourceDb);
            $this->migrateAccounts($sourceDb);
            $this->migrateCategories($sourceDb);
            $this->migrateTransactions($sourceDb);
            $this->migrateGoals($sourceDb);
            $this->migrateSettings($sourceDb);
            $this->migrateRecurringPayments($sourceDb);
            $this->migratePaymentHistory($sourceDb);
            $this->migrateCategoryBudgets($sourceDb);
        });

        $clientIdsToSeed = $this->onlyClientId !== null
            ? [$this->onlyClientId]
            : DB::table('accounts')->distinct()->pluck('client_id')->all();
        foreach ($clientIdsToSeed as $cid) {
            IncomeType::seedForClient((int) $cid);
        }
        $this->info('Income types seeded for '.count($clientIdsToSeed).' client(s).');

        $this->recalculateGoalsFromTransactions();

        $this->info('Migration completed successfully.');

        return 0;
    }

    protected function migrateUsers(\PDO $src)
    {
        $cols = $this->getColumns($src, 'users');
        $selectCols = array_intersect($cols, ['id', 'email', 'password_hash', 'name', 'is_active', 'is_admin', 'last_login_at', 'last_activity_at', 'created_at']);
        $sql = 'SELECT '.implode(', ', $selectCols).' FROM users';
        if ($this->onlyClientId !== null) {
            $sql .= ' WHERE id IN ('.$this->onlyClientId.', 2)';
        }
        $stmt = $src->query($sql);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        foreach ($rows as $r) {
            $exists = DB::table('users')->where('id', $r['id'])->exists();
            if (! $exists) {
                DB::table('users')->insert([
                    'id' => $r['id'],
                    'email' => $r['email'],
                    'password_hash' => $r['password_hash'] ?: Hash::make('password'),
                    'name' => $r['name'] ?? 'User',
                    'is_active' => (int) ($r['is_active'] ?? 1),
                    'is_admin' => (int) ($r['is_admin'] ?? 0),
                    'last_login_at' => $r['last_login_at'] ?? null,
                    'last_activity_at' => $r['last_activity_at'] ?? null,
                    'created_at' => $r['created_at'] ?? now(),
                    'updated_at' => now(),
                ]);
            }
        }
        $this->info('Users: '.count($rows));
    }

    protected function migrateAccounts(\PDO $src)
    {
        if (! $this->tableExists($src, 'accounts')) {
            return;
        }
        $sql = 'SELECT id, name, balance, last_sync_date, last_sync_amount, client_id FROM accounts';
        if ($this->onlyClientId !== null) {
            $sql .= ' WHERE client_id = '.(int) $this->onlyClientId;
        }
        $stmt = $src->query($sql);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        foreach ($rows as $r) {
            $exists = DB::table('accounts')->where('id', $r['id'])->exists();
            if (! $exists) {
                DB::table('accounts')->insert([
                    'id' => $r['id'],
                    'name' => $r['name'] ?? 'Account',
                    'balance' => $r['balance'] ?? 0,
                    'last_sync_date' => $r['last_sync_date'] ?? null,
                    'last_sync_amount' => $r['last_sync_amount'] ?? null,
                    'client_id' => $r['client_id'] ?? 1,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
        $this->info('Accounts: '.count($rows));
    }

    protected function migrateCategories(\PDO $src)
    {
        $sql = 'SELECT id, name, parent_id, icon, color, sort_order, is_active, client_id FROM categories';
        if ($this->onlyClientId !== null) {
            $sql .= ' WHERE client_id = '.(int) $this->onlyClientId;
        }
        $stmt = $src->query($sql);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $hasClientId = isset($rows[0]['client_id']);
        foreach ($rows as $r) {
            $exists = DB::table('categories')->where('id', $r['id'])->exists();
            if (! $exists) {
                DB::table('categories')->insert([
                    'id' => $r['id'],
                    'name' => $r['name'],
                    'parent_id' => $r['parent_id'] ?? null,
                    'icon' => $r['icon'] ?? null,
                    'color' => $r['color'] ?? null,
                    'sort_order' => $r['sort_order'] ?? 0,
                    'is_active' => (int) ($r['is_active'] ?? 1),
                    'client_id' => $hasClientId ? ($r['client_id'] ?? 1) : 1,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
        $this->info('Categories: '.count($rows));
    }

    protected function migrateTransactions(\PDO $src)
    {
        $cols = $this->getColumns($src, 'transactions');
        $hasClientId = in_array('client_id', $cols);
        $hasExchangeRate = in_array('exchange_rate', $cols);
        $sql = 'SELECT id, date, amount, original_amount, currency, type, category_id, account_id, recurring_payment_id, description, month, is_validated, created_at'.($hasClientId ? ', client_id' : '').($hasExchangeRate ? ', exchange_rate' : '').' FROM transactions';
        if ($this->onlyClientId !== null && $hasClientId) {
            $sql .= ' WHERE client_id = '.(int) $this->onlyClientId;
        }
        $stmt = $src->query($sql);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        foreach ($rows as $r) {
            $exists = DB::table('transactions')->where('id', $r['id'])->exists();
            if (! $exists) {
                DB::table('transactions')->insert([
                    'id' => $r['id'],
                    'client_id' => $hasClientId ? ($r['client_id'] ?? 1) : 1,
                    'date' => $r['date'],
                    'amount' => $r['amount'],
                    'original_amount' => $r['original_amount'] ?? null,
                    'currency' => $r['currency'] ?? 'BYN',
                    'exchange_rate' => $hasExchangeRate ? ($r['exchange_rate'] ?? null) : null,
                    'type' => $r['type'],
                    'category_id' => $r['category_id'] ?? null,
                    'account_id' => $r['account_id'] ?? 1,
                    'recurring_payment_id' => $r['recurring_payment_id'] ?? null,
                    'description' => $r['description'] ?? null,
                    'month' => $r['month'] ?? null,
                    'is_validated' => (int) ($r['is_validated'] ?? 0),
                    'created_at' => $r['created_at'] ?? now(),
                    'updated_at' => now(),
                ]);
            }
        }
        $this->info('Transactions: '.count($rows));
    }

    protected function migrateGoals(\PDO $src)
    {
        $cols = $this->getColumns($src, 'goals');
        $hasClientId = in_array('client_id', $cols);
        $sql = 'SELECT id, name, target_amount, target_date, current_amount, is_active, created_at'.($hasClientId ? ', client_id' : '').' FROM goals';
        if ($this->onlyClientId !== null && $hasClientId) {
            $sql .= ' WHERE client_id = '.(int) $this->onlyClientId;
        }
        $stmt = $src->query($sql);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        foreach ($rows as $r) {
            $exists = DB::table('goals')->where('id', $r['id'])->exists();
            if (! $exists) {
                DB::table('goals')->insert([
                    'id' => $r['id'],
                    'client_id' => $hasClientId ? ($r['client_id'] ?? 1) : 1,
                    'name' => $r['name'],
                    'target_amount' => $r['target_amount'],
                    'target_date' => $r['target_date'],
                    'current_amount' => $r['current_amount'] ?? 0,
                    'is_active' => (int) ($r['is_active'] ?? 1),
                    'created_at' => $r['created_at'] ?? now(),
                    'updated_at' => now(),
                ]);
            }
        }
        $this->info('Goals: '.count($rows));
    }

    protected function migrateSettings(\PDO $src)
    {
        $cols = $this->getColumns($src, 'settings');
        $selectCols = array_intersect($cols, ['client_id', 'key', 'value']);
        if (! in_array('key', $selectCols)) {
            return;
        }
        $sql = 'SELECT '.implode(', ', $selectCols).' FROM settings';
        if ($this->onlyClientId !== null && in_array('client_id', $cols)) {
            $sql .= ' WHERE client_id = '.(int) $this->onlyClientId;
        }
        $stmt = $src->query($sql);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $hasClientId = in_array('client_id', $cols);
        $count = 0;
        foreach ($rows as $r) {
            $clientId = $hasClientId ? ($r['client_id'] ?? 1) : 1;
            DB::table('settings')->updateOrInsert(
                ['client_id' => $clientId, 'key' => $r['key']],
                ['value' => $r['value']]
            );
            $count++;
        }
        $this->info('Settings: '.$count);
    }

    protected function migrateRecurringPayments(\PDO $src)
    {
        $cols = $this->getColumns($src, 'recurring_payments');
        $selectCols = array_intersect($cols, ['id', 'name', 'amount', 'original_amount', 'currency', 'day_of_month', 'category', 'category_id', 'is_variable', 'description', 'is_active', 'created_at', 'client_id', 'due_date', 'is_one_time']);
        $sql = 'SELECT '.implode(', ', $selectCols).' FROM recurring_payments';
        if ($this->onlyClientId !== null && in_array('client_id', $cols)) {
            $sql .= ' WHERE client_id = '.(int) $this->onlyClientId;
        }
        $stmt = $src->query($sql);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $hasClientId = in_array('client_id', $cols);
        $hasDueDate = in_array('due_date', $cols);
        $hasIsOneTime = in_array('is_one_time', $cols);
        foreach ($rows as $r) {
            $exists = DB::table('recurring_payments')->where('id', $r['id'])->exists();
            if (! $exists) {
                $data = [
                    'id' => $r['id'],
                    'client_id' => $hasClientId ? ($r['client_id'] ?? 1) : 1,
                    'name' => $r['name'],
                    'amount' => $r['amount'],
                    'original_amount' => $r['original_amount'] ?? null,
                    'currency' => $r['currency'] ?? 'BYN',
                    'day_of_month' => $r['day_of_month'],
                    'category' => $r['category'] ?? 'essential',
                    'category_id' => $r['category_id'] ?? null,
                    'is_variable' => (int) ($r['is_variable'] ?? 0),
                    'is_one_time' => $hasIsOneTime ? (int) ($r['is_one_time'] ?? 0) : 0,
                    'description' => $r['description'] ?? null,
                    'is_active' => (int) ($r['is_active'] ?? 1),
                    'created_at' => $r['created_at'] ?? now(),
                    'updated_at' => now(),
                ];
                if ($hasDueDate && ! empty($r['due_date'])) {
                    $data['due_date'] = $r['due_date'];
                }
                DB::table('recurring_payments')->insert($data);
            }
        }
        $this->info('Recurring payments: '.count($rows));
    }

    protected function migratePaymentHistory(\PDO $src)
    {
        if (! $this->tableExists($src, 'payment_history')) {
            return;
        }
        $sql = 'SELECT ph.id, ph.payment_id, ph.paid_date, ph.amount, ph.month FROM payment_history ph';
        if ($this->onlyClientId !== null && $this->tableExists($src, 'recurring_payments')) {
            $sql .= ' INNER JOIN recurring_payments rp ON rp.id = ph.payment_id AND rp.client_id = '.(int) $this->onlyClientId;
        }
        $stmt = $src->query($sql);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        foreach ($rows as $r) {
            $exists = DB::table('payment_history')->where('id', $r['id'])->exists();
            if (! $exists) {
                DB::table('payment_history')->insert([
                    'id' => $r['id'],
                    'payment_id' => $r['payment_id'],
                    'paid_date' => $r['paid_date'],
                    'amount' => $r['amount'],
                    'month' => $r['month'],
                ]);
            }
        }
        $this->info('Payment history: '.count($rows));
    }

    protected function migrateCategoryBudgets(\PDO $src)
    {
        if (! $this->tableExists($src, 'category_budgets')) {
            return;
        }
        $cols = $this->getColumns($src, 'category_budgets');
        $hasClientId = in_array('client_id', $cols);
        $hasIsEssential = in_array('is_essential', $cols);
        $sql = 'SELECT id, category_id, month, limit_amount, alert_percent, is_recurring, created_at'.($hasClientId ? ', client_id' : '').($hasIsEssential ? ', is_essential' : '').' FROM category_budgets';
        if ($this->onlyClientId !== null && $hasClientId) {
            $sql .= ' WHERE client_id = '.(int) $this->onlyClientId;
        }
        $stmt = $src->query($sql);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        foreach ($rows as $r) {
            $exists = DB::table('category_budgets')->where('id', $r['id'])->exists();
            if (! $exists) {
                DB::table('category_budgets')->insert([
                    'id' => $r['id'],
                    'client_id' => $hasClientId ? ($r['client_id'] ?? 1) : 1,
                    'category_id' => $r['category_id'],
                    'month' => $r['month'],
                    'limit_amount' => $r['limit_amount'],
                    'alert_percent' => $r['alert_percent'] ?? 80,
                    'is_recurring' => (int) ($r['is_recurring'] ?? 0),
                    'is_essential' => $hasIsEssential ? (int) ($r['is_essential'] ?? 0) : 0,
                    'created_at' => $r['created_at'] ?? now(),
                    'updated_at' => now(),
                ]);
            }
        }
        $this->info('Category budgets: '.count($rows));
    }

    protected function recalculateGoalsFromTransactions(): void
    {
        $goals = DB::table('goals')->get();
        foreach ($goals as $goal) {
            $savings = (float) DB::table('transactions')
                ->where('client_id', $goal->client_id)
                ->where('type', 'savings')
                ->sum('amount');
            // current_amount в BYN (как target_amount) для корректного расчёта прогресса
            DB::table('goals')->where('id', $goal->id)->update(['current_amount' => round($savings, 2)]);
        }
        $this->info('Goals recalculated from transactions: '.$goals->count());
    }

    protected function tableExists(\PDO $src, string $table): bool
    {
        $r = $src->query("SELECT name FROM sqlite_master WHERE type='table' AND name=".$src->quote($table));

        return $r && $r->fetch() !== false;
    }

    protected function getColumns(\PDO $src, string $table): array
    {
        $r = $src->query("PRAGMA table_info({$table})");
        if (! $r) {
            return [];
        }
        $cols = [];
        while ($row = $r->fetch(\PDO::FETCH_ASSOC)) {
            $cols[] = $row['name'];
        }

        return $cols;
    }
}
