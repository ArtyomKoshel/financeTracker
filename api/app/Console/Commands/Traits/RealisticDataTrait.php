<?php

namespace App\Console\Commands\Traits;

use App\Models\IncomeType;
use App\Models\RecurringPayment;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

trait RealisticDataTrait
{
    private const CATEGORIES = [
        ['name' => 'Продукты', 'icon' => '🛒', 'color' => '#4CAF50', 'sort' => 1, 'essential' => true],
        ['name' => 'Жильё', 'icon' => '🏠', 'color' => '#FF9800', 'sort' => 2, 'essential' => true],
        ['name' => 'Транспорт', 'icon' => '🚗', 'color' => '#2196F3', 'sort' => 3, 'essential' => true],
        ['name' => 'Доставка', 'icon' => '🍕', 'color' => '#FF5722', 'sort' => 4, 'essential' => false],
        ['name' => 'Развлечения', 'icon' => '🎬', 'color' => '#9C27B0', 'sort' => 5, 'essential' => false],
        ['name' => 'Одежда', 'icon' => '👕', 'color' => '#00BCD4', 'sort' => 6, 'essential' => false],
        ['name' => 'Здоровье', 'icon' => '💊', 'color' => '#F44336', 'sort' => 7, 'essential' => false],
        ['name' => 'Подарки', 'icon' => '🎁', 'color' => '#E91E63', 'sort' => 8, 'essential' => false],
        ['name' => 'Связь', 'icon' => '📱', 'color' => '#3F51B5', 'sort' => 9, 'essential' => true],
        ['name' => 'Другое', 'icon' => '📦', 'color' => '#607D8B', 'sort' => 99, 'essential' => false],
    ];

    private const GROCERY_STORES = [
        'Евроопт', 'Грин', 'Соседи', 'Виталюр', 'Рублёвский',
        'Корона', 'Гиппо', 'Алми', 'Санта', 'Белмаркет',
    ];

    private const GROCERY_ITEMS = [
        'Продукты', 'Молочные продукты', 'Хлеб и выпечка', 'Мясо',
        'Овощи и фрукты', 'Напитки', 'Бакалея', 'Сладости',
    ];

    private const TRANSPORT_DESCS = [
        'Яндекс.Такси', 'Uber', 'Bolt', 'Метро', 'Автобус',
        'Бензин А-95', 'Бензин А-92', 'Мойка авто', 'Парковка',
    ];

    private const DELIVERY_DESCS = [
        'Glovo', 'Яндекс.Еда', 'Доставка пиццы', 'Суши доставка',
        'Wolt', 'Delivery Club', 'Доставка бургеров', 'Доставка обедов',
    ];

    private const ENTERTAINMENT_DESCS = [
        'Кинотеатр', 'Netflix', 'Spotify', 'YouTube Premium', 'Кафе',
        'Ресторан', 'Боулинг', 'Бильярд', 'Концерт', 'Театр',
        'Steam', 'PlayStation Store', 'Кофейня', 'Бар',
    ];

    private const CLOTHING_DESCS = [
        'Wildberries', 'ZARA', 'H&M', 'Ozon', '21vek.by',
        'Mark Formelle', 'Conte', 'Мила', 'Обувь',
    ];

    private const HEALTH_DESCS = [
        'Аптека', 'Стоматолог', 'Анализы', 'Витамины',
        'Линзы', 'Терапевт', 'Спортзал', 'Массаж',
    ];

    private const GIFT_DESCS = [
        'Подарок на ДР', 'Цветы', 'Подарок', 'Сертификат',
        'Подарок коллеге', 'Подарок маме', 'Подарок другу',
    ];

    private const OTHER_DESCS = [
        'Канцтовары', 'Бытовая химия', 'Хозтовары', 'Ремонт телефона',
        'Стрижка', 'Химчистка', 'Почта', 'Фото',
    ];

    protected function deleteAllUserData(int $userId): void
    {
        $existing = DB::table('users')->where('id', $userId)->exists();
        if (! $existing) {
            return;
        }

        $paymentIds = DB::table('recurring_payments')->where('client_id', $userId)->pluck('id');
        if ($paymentIds->isNotEmpty()) {
            DB::table('payment_history')->whereIn('payment_id', $paymentIds)->delete();
        }

        $txIds = DB::table('transactions')->where('client_id', $userId)->pluck('id');
        if ($txIds->isNotEmpty() && Schema::hasTable('transaction_splits')) {
            DB::table('transaction_splits')->whereIn('transaction_id', $txIds)->delete();
        }

        $tablesToClean = [
            'category_budgets', 'transactions', 'recurring_payments', 'goals',
            'settings', 'categories', 'income_types', 'accounts',
        ];
        $optionalTables = [
            'debts', 'envelopes', 'transaction_templates', 'categorization_rules',
            'notes', 'note_label', 'note_labels', 'calendar_events',
            'push_subscriptions', 'user_experimental_features',
            'bank_receipt_mappings', 'bank_receipt_income_mappings',
            'net_worth_snapshots',
        ];

        foreach ($tablesToClean as $table) {
            DB::table($table)->where('client_id', $userId)->delete();
        }
        foreach ($optionalTables as $table) {
            if (Schema::hasTable($table)) {
                $col = in_array($table, ['push_subscriptions', 'user_experimental_features']) ? 'user_id' : 'client_id';
                if ($table === 'note_label') {
                    $noteIds = DB::table('notes')->where('client_id', $userId)->pluck('id');
                    if ($noteIds->isNotEmpty()) {
                        DB::table('note_label')->whereIn('note_id', $noteIds)->delete();
                    }

                    continue;
                }
                if (Schema::hasColumn($table, $col)) {
                    DB::table($table)->where($col, $userId)->delete();
                }
            }
        }

        DB::table('users')->where('id', $userId)->delete();
    }

    protected function createUserRecord(int $id, string $email, string $password, string $name, bool $isAdmin = false): void
    {
        $now = now()->format('Y-m-d H:i:s');
        DB::table('users')->insert([
            'id' => $id,
            'email' => $email,
            'password_hash' => Hash::make($password),
            'name' => $name,
            'is_active' => true,
            'is_admin' => $isAdmin,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        DB::table('accounts')->insert([
            'name' => 'Основной счёт',
            'balance' => 0,
            'client_id' => $id,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        IncomeType::seedForClient($id);
    }

    /** @return array<string, int> category name => id */
    protected function seedCategoriesForUser(int $userId): array
    {
        $now = now()->format('Y-m-d H:i:s');
        $map = [];
        foreach (self::CATEGORIES as $c) {
            $id = DB::table('categories')->insertGetId([
                'name' => $c['name'],
                'parent_id' => null,
                'icon' => $c['icon'],
                'color' => $c['color'],
                'sort_order' => $c['sort'],
                'is_active' => true,
                'client_id' => $userId,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $map[$c['name']] = $id;
        }

        return $map;
    }

    /** @param array<string, string> $overrides */
    protected function seedSettingsForUser(int $userId, array $overrides = []): void
    {
        $defaults = [
            'gross_salary' => '2500',
            'expected_advance' => '2500',
            'salary_day' => '10',
            'advance_day' => '25',
            'savings_percent' => '10',
            'min_living_budget' => '500',
            'usd_rate' => '3.25',
            'eur_rate' => '3.55',
            'rub_rate' => '0.034',
            'base_currency' => 'BYN',
        ];
        $settings = array_merge($defaults, $overrides);
        foreach ($settings as $k => $v) {
            DB::table('settings')->updateOrInsert(
                ['client_id' => $userId, 'key' => $k],
                ['value' => $v]
            );
        }
    }

    /**
     * @param  array<string, mixed>  $config
     * @return array<string, int> payment name => id
     */
    protected function seedRecurringPaymentsForUser(int $userId, array $config, array $catMap): array
    {
        $ids = [];

        $payments = [
            ['name' => 'Зарплата', 'amount' => $config['salary'], 'day' => (int) ($config['salary_day'] ?? 10), 'income' => true, 'cat' => null],
            ['name' => 'Аванс', 'amount' => $config['advance'], 'day' => (int) ($config['advance_day'] ?? 25), 'income' => true, 'cat' => null],
            ['name' => 'Аренда', 'amount' => $config['rent'], 'day' => 5, 'income' => false, 'cat' => 'Жильё'],
            ['name' => 'Интернет', 'amount' => $config['internet'], 'day' => 15, 'income' => false, 'cat' => 'Жильё', 'sub' => true],
            ['name' => 'Мобильная связь', 'amount' => $config['mobile'], 'day' => 20, 'income' => false, 'cat' => 'Связь', 'sub' => true],
        ];

        /** @var array<int, array{name: string, amount: float, day?: int}>|null $subs */
        $subs = $config['subscriptions'] ?? [];
        foreach ($subs as $sub) {
            $payments[] = [
                'name' => $sub['name'],
                'amount' => $sub['amount'],
                'day' => $sub['day'] ?? 1,
                'income' => false,
                'cat' => 'Развлечения',
                'sub' => true,
            ];
        }

        foreach ($payments as $p) {
            /** @var RecurringPayment $rp */
            $rp = RecurringPayment::withoutGlobalScope('client')->create([
                'client_id' => $userId,
                'name' => $p['name'],
                'amount' => $p['amount'],
                'day_of_month' => $p['day'],
                'category' => 'essential',
                'category_id' => isset($p['cat']) ? ($catMap[$p['cat']] ?? null) : null,
                'currency' => 'BYN',
                'is_variable' => false,
                'is_active' => true,
                'is_income' => $p['income'],
                'is_subscription' => $p['sub'] ?? false,
            ]);
            $ids[$p['name']] = $rp->id;
        }

        return $ids;
    }

    /** @param array<string, mixed> $profile */
    protected function generateTransactions(
        int $userId,
        Carbon $from,
        Carbon $to,
        array $profile,
        array $catMap,
        array $paymentIds
    ): void {
        $accountId = DB::table('accounts')->where('client_id', $userId)->value('id');
        $txBatch = [];
        $balance = 0.0;
        $today = $to->format('Y-m-d');
        $totalMonths = $from->diffInMonths($to) + 1;

        $current = $from->copy();
        $monthIndex = 0;

        while ($current->lte($to)) {
            $y = (int) $current->format('Y');
            $m = (int) $current->format('m');
            $month = $current->format('Y-m');
            $daysInMonth = (int) $current->copy()->endOfMonth()->day;
            $progress = $totalMonths > 1 ? $monthIndex / ($totalMonths - 1) : 0.5;

            $salaryVariation = 1.0 + (mt_rand(-50, 50) / 1000);
            $salaryDay = min($profile['salary_day'], $daysInMonth);
            $advanceDay = min($profile['advance_day'], $daysInMonth);

            $salaryDate = sprintf('%04d-%02d-%02d', $y, $m, $salaryDay);
            $advanceDate = sprintf('%04d-%02d-%02d', $y, $m, $advanceDay);

            if ($salaryDate <= $today) {
                $amt = round($profile['salary'] * $salaryVariation, 2);
                $txBatch[] = $this->makeTx($userId, $accountId, $salaryDate, $month, $amt, 'salary', 'Зарплата', null, $paymentIds['Зарплата'] ?? null);
                $balance += $amt;
            }
            if ($advanceDate <= $today) {
                $amt = round($profile['advance'] * $salaryVariation, 2);
                $txBatch[] = $this->makeTx($userId, $accountId, $advanceDate, $month, $amt, 'advance', 'Аванс', null, $paymentIds['Аванс'] ?? null);
                $balance += $amt;
            }

            // Rent
            $rentDate = sprintf('%04d-%02d-05', $y, $m);
            if ($rentDate <= $today) {
                $amt = -$profile['rent'];
                $txBatch[] = $this->makeTx($userId, $accountId, $rentDate, $month, $amt, 'expense', 'Аренда квартиры', $catMap['Жильё'] ?? null, $paymentIds['Аренда'] ?? null);
                $balance += $amt;
            }

            // Utilities (variable)
            $utilDate = sprintf('%04d-%02d-08', $y, $m);
            if ($utilDate <= $today) {
                $utilAmt = -(80 + mt_rand(0, 40));
                $txBatch[] = $this->makeTx($userId, $accountId, $utilDate, $month, $utilAmt, 'expense', 'Коммунальные услуги', $catMap['Жильё'] ?? null);
                $balance += $utilAmt;
            }

            // Internet
            $inetDate = sprintf('%04d-%02d-15', $y, $m);
            if ($inetDate <= $today) {
                $amt = -$profile['internet'];
                $txBatch[] = $this->makeTx($userId, $accountId, $inetDate, $month, $amt, 'expense', 'Интернет', $catMap['Жильё'] ?? null, $paymentIds['Интернет'] ?? null);
                $balance += $amt;
            }

            // Mobile
            $mobDate = sprintf('%04d-%02d-20', $y, $m);
            if ($mobDate <= $today) {
                $amt = -$profile['mobile'];
                $txBatch[] = $this->makeTx($userId, $accountId, $mobDate, $month, $amt, 'expense', 'Мобильная связь', $catMap['Связь'] ?? null, $paymentIds['Мобильная связь'] ?? null);
                $balance += $amt;
            }

            /** @var array<int, array{name: string, amount: float, day?: int}> $profileSubs */
            $profileSubs = $profile['subscriptions'] ?? [];
            foreach ($profileSubs as $sub) {
                $subDay = min($sub['day'] ?? 1, $daysInMonth);
                $subDate = sprintf('%04d-%02d-%02d', $y, $m, $subDay);
                if ($subDate <= $today) {
                    $amt = -$sub['amount'];
                    $txBatch[] = $this->makeTx($userId, $accountId, $subDate, $month, $amt, 'expense', $sub['name'], $catMap['Развлечения'] ?? null, $paymentIds[$sub['name']] ?? null);
                    $balance += $amt;
                }
            }

            // Groceries
            $groceryCount = mt_rand($profile['grocery_min'], $profile['grocery_max']);
            for ($g = 0; $g < $groceryCount; $g++) {
                $day = mt_rand(1, $daysInMonth);
                $date = sprintf('%04d-%02d-%02d', $y, $m, $day);
                if ($date > $today) {
                    continue;
                }
                $amt = -$this->randomFloat($profile['grocery_amount_min'], $profile['grocery_amount_max']);
                $store = self::GROCERY_STORES[mt_rand(0, count(self::GROCERY_STORES) - 1)];
                $item = self::GROCERY_ITEMS[mt_rand(0, count(self::GROCERY_ITEMS) - 1)];
                $desc = mt_rand(0, 1) ? $store : $store.' — '.$item;
                $txBatch[] = $this->makeTx($userId, $accountId, $date, $month, $amt, 'expense', $desc, $catMap['Продукты'] ?? null);
                $balance += $amt;
            }

            // Transport
            $taxiCount = mt_rand($profile['taxi_min'], $profile['taxi_max']);
            for ($t = 0; $t < $taxiCount; $t++) {
                $day = mt_rand(1, $daysInMonth);
                $date = sprintf('%04d-%02d-%02d', $y, $m, $day);
                if ($date > $today) {
                    continue;
                }
                $amt = -$this->randomFloat(6, 28);
                $desc = self::TRANSPORT_DESCS[mt_rand(0, 4)]; // taxi-related
                $txBatch[] = $this->makeTx($userId, $accountId, $date, $month, $amt, 'expense', $desc, $catMap['Транспорт'] ?? null);
                $balance += $amt;
            }
            $fuelCount = mt_rand($profile['fuel_min'], $profile['fuel_max']);
            for ($f = 0; $f < $fuelCount; $f++) {
                $day = mt_rand(1, $daysInMonth);
                $date = sprintf('%04d-%02d-%02d', $y, $m, $day);
                if ($date > $today) {
                    continue;
                }
                $amt = -$this->randomFloat(35, 70);
                $desc = self::TRANSPORT_DESCS[mt_rand(5, 8)]; // fuel/parking
                $txBatch[] = $this->makeTx($userId, $accountId, $date, $month, $amt, 'expense', $desc, $catMap['Транспорт'] ?? null);
                $balance += $amt;
            }

            // Delivery — grows over time
            $deliveryBase = $profile['delivery_min'] + (int) round(($profile['delivery_max'] - $profile['delivery_min']) * $progress * 0.5);
            $deliveryCount = mt_rand($deliveryBase, $deliveryBase + 4);
            for ($d = 0; $d < $deliveryCount; $d++) {
                $day = mt_rand(1, $daysInMonth);
                $date = sprintf('%04d-%02d-%02d', $y, $m, $day);
                if ($date > $today) {
                    continue;
                }
                $amt = -$this->randomFloat(12, 48);
                $desc = self::DELIVERY_DESCS[mt_rand(0, count(self::DELIVERY_DESCS) - 1)];
                $txBatch[] = $this->makeTx($userId, $accountId, $date, $month, $amt, 'expense', $desc, $catMap['Доставка'] ?? null);
                $balance += $amt;
            }

            // Entertainment
            $entCount = mt_rand($profile['entertainment_min'], $profile['entertainment_max']);
            $summerBoost = in_array($m, [6, 7, 8]) ? 2 : 0;
            $entCount += $summerBoost;
            for ($e = 0; $e < $entCount; $e++) {
                $day = mt_rand(1, $daysInMonth);
                $date = sprintf('%04d-%02d-%02d', $y, $m, $day);
                if ($date > $today) {
                    continue;
                }
                $amt = -$this->randomFloat(8, 60);
                $desc = self::ENTERTAINMENT_DESCS[mt_rand(0, count(self::ENTERTAINMENT_DESCS) - 1)];
                $txBatch[] = $this->makeTx($userId, $accountId, $date, $month, $amt, 'expense', $desc, $catMap['Развлечения'] ?? null);
                $balance += $amt;
            }

            // Clothing — seasonal (more in spring/autumn)
            $clothingChance = $profile['clothing_chance'];
            if (in_array($m, [3, 4, 9, 10])) {
                $clothingChance *= 2;
            }
            if ($this->chance($clothingChance)) {
                $count = mt_rand(1, 3);
                for ($c = 0; $c < $count; $c++) {
                    $day = mt_rand(1, $daysInMonth);
                    $date = sprintf('%04d-%02d-%02d', $y, $m, $day);
                    if ($date > $today) {
                        continue;
                    }
                    $amt = -$this->randomFloat(25, 180);
                    $desc = self::CLOTHING_DESCS[mt_rand(0, count(self::CLOTHING_DESCS) - 1)];
                    $txBatch[] = $this->makeTx($userId, $accountId, $date, $month, $amt, 'expense', $desc, $catMap['Одежда'] ?? null);
                    $balance += $amt;
                }
            }

            // Health — sporadic
            if ($this->chance($profile['health_chance'])) {
                $count = mt_rand(1, 2);
                for ($h = 0; $h < $count; $h++) {
                    $day = mt_rand(1, $daysInMonth);
                    $date = sprintf('%04d-%02d-%02d', $y, $m, $day);
                    if ($date > $today) {
                        continue;
                    }
                    $amt = -$this->randomFloat(10, 120);
                    $desc = self::HEALTH_DESCS[mt_rand(0, count(self::HEALTH_DESCS) - 1)];
                    $txBatch[] = $this->makeTx($userId, $accountId, $date, $month, $amt, 'expense', $desc, $catMap['Здоровье'] ?? null);
                    $balance += $amt;
                }
            }

            // Gifts — seasonal (Dec, Mar, birthdays)
            $giftChance = in_array($m, [12, 3]) ? 0.8 : 0.15;
            if ($this->chance($giftChance)) {
                $day = mt_rand(1, $daysInMonth);
                $date = sprintf('%04d-%02d-%02d', $y, $m, $day);
                if ($date <= $today) {
                    $amt = -$this->randomFloat(30, 200);
                    $desc = self::GIFT_DESCS[mt_rand(0, count(self::GIFT_DESCS) - 1)];
                    $txBatch[] = $this->makeTx($userId, $accountId, $date, $month, $amt, 'expense', $desc, $catMap['Подарки'] ?? null);
                    $balance += $amt;
                }
            }

            // Other — random small expenses
            $otherCount = mt_rand(1, 4);
            for ($o = 0; $o < $otherCount; $o++) {
                $day = mt_rand(1, $daysInMonth);
                $date = sprintf('%04d-%02d-%02d', $y, $m, $day);
                if ($date > $today) {
                    continue;
                }
                $amt = -$this->randomFloat(3, 35);
                $desc = self::OTHER_DESCS[mt_rand(0, count(self::OTHER_DESCS) - 1)];
                $txBatch[] = $this->makeTx($userId, $accountId, $date, $month, $amt, 'expense', $desc, $catMap['Другое'] ?? null);
                $balance += $amt;
            }

            // Savings — grows over time
            $savingsAmt = $this->randomFloat($profile['savings_min'], $profile['savings_max']);
            $savingsAmt += $savingsAmt * $progress * 0.3;
            $savingsDay = min(27, $daysInMonth);
            $savingsDate = sprintf('%04d-%02d-%02d', $y, $m, $savingsDay);
            if ($savingsDate <= $today) {
                $amt = -round($savingsAmt, 2);
                $txBatch[] = $this->makeTx($userId, $accountId, $savingsDate, $month, $amt, 'savings', 'В копилку');
                $balance += $amt;
            }

            $monthIndex++;
            $current->addMonth();
        }

        foreach (array_chunk($txBatch, 200) as $chunk) {
            DB::table('transactions')->insert($chunk);
        }

        DB::table('accounts')->where('client_id', $userId)->update(['balance' => round($balance, 2)]);
    }

    protected function seedGoalsForUser(int $userId): void
    {
        $now = now()->format('Y-m-d H:i:s');
        $savings = abs((float) DB::table('transactions')
            ->where('client_id', $userId)
            ->where('type', 'savings')
            ->sum('amount'));

        $goals = [
            ['name' => 'Отпуск', 'target' => 5000, 'months' => 6, 'currency' => 'BYN'],
            ['name' => 'Подушка безопасности', 'target' => 15000, 'months' => 18, 'currency' => 'BYN'],
        ];

        $allocated = 0;
        foreach ($goals as $i => $g) {
            $goalSaved = $i === 0 ? min($savings * 0.4, $g['target']) : min($savings * 0.6, $g['target']);
            $allocated += $goalSaved;
            DB::table('goals')->insert([
                'name' => $g['name'],
                'target_amount' => $g['target'],
                'currency' => $g['currency'],
                'target_date' => now()->addMonths($g['months'])->format('Y-m-d'),
                'current_amount' => round($goalSaved, 2),
                'is_active' => true,
                'client_id' => $userId,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    protected function seedDebtsForUser(int $userId): void
    {
        if (! Schema::hasTable('debts')) {
            return;
        }
        $now = now()->format('Y-m-d H:i:s');
        DB::table('debts')->insert([
            'client_id' => $userId,
            'name' => 'Рассрочка на ноутбук',
            'total_amount' => 3600,
            'paid_amount' => 2400,
            'currency' => 'BYN',
            'due_date' => now()->addMonths(4)->format('Y-m-d'),
            'monthly_payment' => 300,
            'type' => 'installment',
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    protected function seedEnvelopesForUser(int $userId, array $catMap): void
    {
        if (! Schema::hasTable('envelopes')) {
            return;
        }
        $now = now()->format('Y-m-d H:i:s');
        $month = now()->format('Y-m');
        $envelopes = [
            ['name' => 'Продукты', 'allocated' => 600, 'cat' => 'Продукты'],
            ['name' => 'Развлечения', 'allocated' => 250, 'cat' => 'Развлечения'],
            ['name' => 'Транспорт', 'allocated' => 200, 'cat' => 'Транспорт'],
            ['name' => 'Доставка', 'allocated' => 200, 'cat' => 'Доставка'],
        ];

        foreach ($envelopes as $e) {
            $catId = $catMap[$e['cat']] ?? null;
            $spent = $catId ? (float) DB::table('transactions')
                ->where('client_id', $userId)
                ->where('month', $month)
                ->where('category_id', $catId)
                ->where('type', 'expense')
                ->sum(DB::raw('ABS(amount)')) : 0;

            DB::table('envelopes')->insert([
                'client_id' => $userId,
                'name' => $e['name'],
                'allocated' => $e['allocated'],
                'spent' => round($spent, 2),
                'month' => $month,
                'category_id' => $catId,
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    protected function seedCategoryBudgetsForUser(int $userId, array $catMap): void
    {
        $now = now()->format('Y-m-d H:i:s');
        $months = [now()->format('Y-m'), now()->subMonth()->format('Y-m')];
        $limits = [
            'Продукты' => 700, 'Жильё' => 1000, 'Транспорт' => 250,
            'Доставка' => 250, 'Развлечения' => 300, 'Одежда' => 200,
            'Здоровье' => 150, 'Подарки' => 200, 'Связь' => 50, 'Другое' => 100,
        ];

        foreach ($months as $month) {
            foreach ($catMap as $name => $catId) {
                $limit = $limits[$name] ?? 150;
                $essential = in_array($name, ['Продукты', 'Жильё', 'Транспорт', 'Связь']);
                DB::table('category_budgets')->insertOrIgnore([
                    'category_id' => $catId,
                    'month' => $month,
                    'limit_amount' => $limit,
                    'alert_percent' => 80,
                    'is_recurring' => false,
                    'is_essential' => $essential,
                    'client_id' => $userId,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    protected function seedTemplatesForUser(int $userId, array $catMap): void
    {
        if (! Schema::hasTable('transaction_templates')) {
            return;
        }
        $now = now()->format('Y-m-d H:i:s');
        $templates = [
            ['name' => 'Продукты', 'type' => 'expense', 'amount' => null, 'cat' => 'Продукты'],
            ['name' => 'Такси', 'type' => 'expense', 'amount' => 10.00, 'cat' => 'Транспорт'],
            ['name' => 'Кофе', 'type' => 'expense', 'amount' => 5.50, 'cat' => 'Развлечения'],
            ['name' => 'Обед', 'type' => 'expense', 'amount' => 15.00, 'cat' => 'Доставка'],
            ['name' => 'Бензин', 'type' => 'expense', 'amount' => 50.00, 'cat' => 'Транспорт'],
        ];
        foreach ($templates as $i => $t) {
            DB::table('transaction_templates')->insert([
                'client_id' => $userId,
                'name' => $t['name'],
                'type' => $t['type'],
                'amount' => $t['amount'],
                'currency' => 'BYN',
                'category_id' => $catMap[$t['cat']] ?? null,
                'description' => null,
                'sort_order' => $i,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    protected function seedCategorizationRulesForUser(int $userId): void
    {
        if (! Schema::hasTable('categorization_rules')) {
            return;
        }
        $patterns = DB::table('transactions')
            ->where('client_id', $userId)
            ->where('type', 'expense')
            ->whereNotNull('category_id')
            ->where('description', '!=', '')
            ->select(DB::raw('LOWER(TRIM(description)) as pattern'), 'category_id', DB::raw('COUNT(*) as cnt'))
            ->groupBy(DB::raw('LOWER(TRIM(description))'), 'category_id')
            ->having(DB::raw('COUNT(*)'), '>=', 3)
            ->orderByDesc(DB::raw('COUNT(*)'))
            ->limit(30)
            ->get();

        $now = now()->format('Y-m-d H:i:s');
        foreach ($patterns as $p) {
            DB::table('categorization_rules')->insert([
                'client_id' => $userId,
                'merchant_pattern' => $p->pattern,
                'category_id' => $p->category_id,
                'confidence' => min(10, (int) $p->cnt),
                'last_used_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    protected function syncSequences(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }
        $tables = [
            'users', 'accounts', 'categories', 'transactions', 'recurring_payments',
            'goals', 'category_budgets', 'debts', 'envelopes',
        ];
        foreach ($tables as $table) {
            if (! Schema::hasTable($table)) {
                continue;
            }
            $max = DB::table($table)->max('id');
            if ($max !== null) {
                DB::statement("SELECT setval(pg_get_serial_sequence(?, 'id'), ?)", [$table, $max]);
            }
        }
    }

    private function makeTx(
        int $userId,
        int $accountId,
        string $date,
        string $month,
        float $amount,
        string $type,
        string $description,
        ?int $categoryId = null,
        ?int $recurringPaymentId = null
    ): array {
        $now = now()->format('Y-m-d H:i:s');

        return [
            'client_id' => $userId,
            'account_id' => $accountId,
            'date' => $date,
            'month' => $month,
            'amount' => $amount,
            'type' => $type,
            'currency' => 'BYN',
            'category_id' => $categoryId,
            'recurring_payment_id' => $recurringPaymentId,
            'description' => $description,
            'created_at' => $now,
            'updated_at' => $now,
        ];
    }

    private function randomFloat(float $min, float $max): float
    {
        return round($min + mt_rand(0, 10000) / 10000 * ($max - $min), 2);
    }

    private function chance(float $probability): bool
    {
        return mt_rand(0, 1000) / 1000 < $probability;
    }
}
