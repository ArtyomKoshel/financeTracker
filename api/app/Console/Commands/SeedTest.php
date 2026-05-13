<?php

namespace App\Console\Commands;

use App\Console\Commands\Traits\RealisticDataTrait;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SeedTest extends Command
{
    use RealisticDataTrait;

    protected $signature = 'seed:test';

    protected $description = 'Create 3 test users with 6 months of realistic data for PHPUnit (40-60 tx/month)';

    private const PROFILES = [
        [
            'id' => 10,
            'email' => 'test1@local',
            'name' => 'Экономный Тест',
            'salary' => 1500,
            'advance' => 1500,
            'salary_day' => 10,
            'advance_day' => 25,
            'rent' => 500,
            'internet' => 25,
            'mobile' => 15,
            'grocery_min' => 10,
            'grocery_max' => 14,
            'grocery_amount_min' => 5,
            'grocery_amount_max' => 50,
            'taxi_min' => 1,
            'taxi_max' => 4,
            'fuel_min' => 0,
            'fuel_max' => 1,
            'delivery_min' => 2,
            'delivery_max' => 5,
            'entertainment_min' => 2,
            'entertainment_max' => 4,
            'clothing_chance' => 0.2,
            'health_chance' => 0.2,
            'savings_min' => 250,
            'savings_max' => 400,
            'subscriptions' => [],
            'settings' => ['gross_salary' => '1500', 'expected_advance' => '1500', 'savings_percent' => '20'],
        ],
        [
            'id' => 11,
            'email' => 'test2@local',
            'name' => 'Средний Тест',
            'salary' => 2500,
            'advance' => 2500,
            'salary_day' => 10,
            'advance_day' => 25,
            'rent' => 700,
            'internet' => 30,
            'mobile' => 20,
            'grocery_min' => 12,
            'grocery_max' => 16,
            'grocery_amount_min' => 8,
            'grocery_amount_max' => 65,
            'taxi_min' => 3,
            'taxi_max' => 8,
            'fuel_min' => 1,
            'fuel_max' => 2,
            'delivery_min' => 4,
            'delivery_max' => 8,
            'entertainment_min' => 3,
            'entertainment_max' => 6,
            'clothing_chance' => 0.35,
            'health_chance' => 0.3,
            'savings_min' => 200,
            'savings_max' => 350,
            'subscriptions' => [
                ['name' => 'Netflix', 'amount' => 15, 'day' => 3],
            ],
            'settings' => ['gross_salary' => '2500', 'expected_advance' => '2500', 'savings_percent' => '10'],
        ],
        [
            'id' => 12,
            'email' => 'test3@local',
            'name' => 'Транжира Тест',
            'salary' => 3500,
            'advance' => 3500,
            'salary_day' => 10,
            'advance_day' => 25,
            'rent' => 1000,
            'internet' => 40,
            'mobile' => 30,
            'grocery_min' => 14,
            'grocery_max' => 18,
            'grocery_amount_min' => 12,
            'grocery_amount_max' => 90,
            'taxi_min' => 8,
            'taxi_max' => 15,
            'fuel_min' => 2,
            'fuel_max' => 4,
            'delivery_min' => 8,
            'delivery_max' => 14,
            'entertainment_min' => 6,
            'entertainment_max' => 12,
            'clothing_chance' => 0.6,
            'health_chance' => 0.3,
            'savings_min' => 100,
            'savings_max' => 250,
            'subscriptions' => [
                ['name' => 'Netflix', 'amount' => 15, 'day' => 3],
                ['name' => 'Spotify', 'amount' => 10, 'day' => 7],
                ['name' => 'YouTube Premium', 'amount' => 12, 'day' => 12],
            ],
            'settings' => ['gross_salary' => '3500', 'expected_advance' => '3500', 'savings_percent' => '5'],
        ],
    ];

    public function handle(): int
    {
        $this->info('Seeding 3 test users with 6 months of data...');

        $endDate = Carbon::today();
        $startDate = $endDate->copy()->subMonths(6)->startOfMonth();

        foreach (self::PROFILES as $profile) {
            $this->seedTestUser($profile, $startDate, $endDate);
        }

        $this->syncSequences();

        $this->newLine();
        $this->info('Done!');
        $this->table(['User', 'Email', 'Password', 'Profile'], [
            ['Test 1', 'test1@local', 'test123', 'Экономный (3000 BYN, savings 20%)'],
            ['Test 2', 'test2@local', 'test123', 'Средний (5000 BYN, savings 10%)'],
            ['Test 3', 'test3@local', 'test123', 'Транжира (7000 BYN, savings 5%)'],
        ]);

        return 0;
    }

    private function seedTestUser(array $profile, Carbon $startDate, Carbon $endDate): void
    {
        $userId = $profile['id'];
        $email = $profile['email'];

        $this->deleteAllUserData($userId);
        DB::table('users')->where('email', $email)->delete();

        $this->createUserRecord($userId, $email, 'test123', $profile['name']);
        $catMap = $this->seedCategoriesForUser($userId);

        $this->seedSettingsForUser($userId, array_merge([
            'salary_day' => (string) $profile['salary_day'],
            'advance_day' => (string) $profile['advance_day'],
        ], $profile['settings']));

        $paymentIds = $this->seedRecurringPaymentsForUser($userId, [
            'salary' => $profile['salary'],
            'advance' => $profile['advance'],
            'salary_day' => $profile['salary_day'],
            'advance_day' => $profile['advance_day'],
            'rent' => $profile['rent'],
            'internet' => $profile['internet'],
            'mobile' => $profile['mobile'],
            'subscriptions' => $profile['subscriptions'],
        ], $catMap);

        mt_srand($userId);

        $this->generateTransactions($userId, $startDate, $endDate, $profile, $catMap, $paymentIds);

        $txCount = DB::table('transactions')->where('client_id', $userId)->count();
        $months = DB::table('transactions')->where('client_id', $userId)->distinct('month')->count('month');
        $avgPerMonth = $months > 0 ? round($txCount / $months) : 0;

        $this->seedGoalsForUser($userId);
        $this->seedCategoryBudgetsForUser($userId, $catMap);
        $this->seedTemplatesForUser($userId, $catMap);
        $this->seedCategorizationRulesForUser($userId);

        mt_srand();

        $this->info("  {$email} (id={$userId}): {$txCount} tx, ~{$avgPerMonth}/month");
    }
}
