<?php

namespace App\Console\Commands;

use App\Console\Commands\Traits\RealisticDataTrait;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SeedDemo extends Command
{
    use RealisticDataTrait;

    protected $signature = 'seed:demo';

    protected $description = 'Create admin + demo user with 2 years of realistic financial data (~80-100 tx/month)';

    private const ADMIN_ID = 1;

    private const DEMO_ID = 2;

    public function handle(): int
    {
        $this->info('Seeding admin and demo users...');

        $this->seedAdmin();
        $this->seedDemoUser();
        $this->syncSequences();

        $this->newLine();
        $this->info('Done!');
        $this->table(['User', 'Email', 'Password', 'Role'], [
            ['Admin', 'admin@local', 'admin123', 'admin'],
            ['Demo', 'demo@local', 'demo123', 'user (2 years of data)'],
        ]);

        return 0;
    }

    private function seedAdmin(): void
    {
        $this->deleteAllUserData(self::ADMIN_ID);
        DB::table('users')->where('email', 'admin@local')->delete();

        $this->createUserRecord(self::ADMIN_ID, 'admin@local', 'admin123', 'Администратор', true);
        $this->seedCategoriesForUser(self::ADMIN_ID);
        $this->seedSettingsForUser(self::ADMIN_ID);

        $this->info('  admin@local (id=1): created (admin, no transactions)');
    }

    private function seedDemoUser(): void
    {
        $this->deleteAllUserData(self::DEMO_ID);
        DB::table('users')->where('email', 'demo@local')->delete();

        $this->createUserRecord(self::DEMO_ID, 'demo@local', 'demo123', 'Демо пользователь');
        $catMap = $this->seedCategoriesForUser(self::DEMO_ID);

        $this->seedSettingsForUser(self::DEMO_ID, [
            'gross_salary' => '2500',
            'expected_advance' => '2500',
            'salary_day' => '10',
            'advance_day' => '25',
        ]);

        $paymentIds = $this->seedRecurringPaymentsForUser(self::DEMO_ID, [
            'salary' => 2500,
            'advance' => 2500,
            'salary_day' => 10,
            'advance_day' => 25,
            'rent' => 800,
            'internet' => 35,
            'mobile' => 25,
            'subscriptions' => [
                ['name' => 'Netflix', 'amount' => 15, 'day' => 3],
                ['name' => 'Spotify', 'amount' => 10, 'day' => 7],
            ],
        ], $catMap);

        mt_srand(self::DEMO_ID);

        $endDate = Carbon::today();
        $startDate = $endDate->copy()->subYears(2)->startOfMonth();

        $this->info("  Generating transactions from {$startDate->format('Y-m-d')} to {$endDate->format('Y-m-d')}...");

        $this->generateTransactions(self::DEMO_ID, $startDate, $endDate, [
            'salary' => 2500,
            'advance' => 2500,
            'salary_day' => 10,
            'advance_day' => 25,
            'rent' => 800,
            'internet' => 35,
            'mobile' => 25,
            'grocery_min' => 25,
            'grocery_max' => 32,
            'grocery_amount_min' => 8,
            'grocery_amount_max' => 85,
            'taxi_min' => 10,
            'taxi_max' => 18,
            'fuel_min' => 2,
            'fuel_max' => 4,
            'delivery_min' => 10,
            'delivery_max' => 16,
            'entertainment_min' => 6,
            'entertainment_max' => 12,
            'clothing_chance' => 0.55,
            'health_chance' => 0.45,
            'savings_min' => 200,
            'savings_max' => 450,
            'subscriptions' => [
                ['name' => 'Netflix', 'amount' => 15, 'day' => 3],
                ['name' => 'Spotify', 'amount' => 10, 'day' => 7],
            ],
        ], $catMap, $paymentIds);

        $txCount = DB::table('transactions')->where('client_id', self::DEMO_ID)->count();
        $months = DB::table('transactions')->where('client_id', self::DEMO_ID)->distinct('month')->count('month');
        $avgPerMonth = $months > 0 ? round($txCount / $months) : 0;
        $balance = (float) DB::table('accounts')->where('client_id', self::DEMO_ID)->value('balance');

        $this->seedGoalsForUser(self::DEMO_ID);
        $this->seedDebtsForUser(self::DEMO_ID);
        $this->seedEnvelopesForUser(self::DEMO_ID, $catMap);
        $this->seedCategoryBudgetsForUser(self::DEMO_ID, $catMap);
        $this->seedTemplatesForUser(self::DEMO_ID, $catMap);
        $this->seedCategorizationRulesForUser(self::DEMO_ID);

        mt_srand();

        $this->info("  demo@local (id=2): {$txCount} transactions, {$months} months, ~{$avgPerMonth} tx/month, balance: {$balance} BYN");
    }
}
