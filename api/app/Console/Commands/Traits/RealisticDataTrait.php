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
            'notes', 'note_label', 'note_labels', 'note_folders', 'calendar_events',
            'push_subscriptions', 'user_experimental_features',
            'bank_receipt_mappings', 'bank_receipt_income_mappings',
            'net_worth_snapshots', 'settings_history',
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
            ['name' => 'Отпуск', 'target' => 5000, 'months' => 5, 'currency' => 'BYN', 'pct' => 0.40],
            ['name' => 'Подушка безопасности', 'target' => 15000, 'months' => 14, 'currency' => 'BYN', 'pct' => 0.55],
            ['name' => 'Покупка автомобиля', 'target' => 25000, 'months' => 30, 'currency' => 'BYN', 'pct' => 0.12],
            ['name' => 'Первый взнос на квартиру', 'target' => 50000, 'months' => 48, 'currency' => 'BYN', 'pct' => 0.04],
        ];

        foreach ($goals as $g) {
            $goalSaved = min($savings * $g['pct'], $g['target']);
            DB::table('goals')->insert([
                'name'           => $g['name'],
                'target_amount'  => $g['target'],
                'currency'       => $g['currency'],
                'target_date'    => now()->addMonths($g['months'])->format('Y-m-d'),
                'current_amount' => round($goalSaved, 2),
                'is_active'      => true,
                'client_id'      => $userId,
                'created_at'     => $now,
                'updated_at'     => $now,
            ]);
        }
    }

    protected function seedDebtsForUser(int $userId): void
    {
        if (! Schema::hasTable('debts')) {
            return;
        }
        $now = now()->format('Y-m-d H:i:s');
        $debts = [
            [
                'name' => 'Рассрочка на ноутбук',
                'total' => 3600, 'paid' => 2400,
                'due_months' => 4, 'monthly' => 300,
                'type' => 'installment',
                'notes' => 'Lenovo IdeaPad, 12 платежей по 300 BYN',
            ],
            [
                'name' => 'Автокредит',
                'total' => 18000, 'paid' => 5400,
                'due_months' => 18, 'monthly' => 700,
                'type' => 'loan',
                'notes' => 'Skoda Rapid, ставка 12% годовых',
            ],
            [
                'name' => 'Долг другу Артёму',
                'total' => 500, 'paid' => 0,
                'due_months' => 2, 'monthly' => null,
                'type' => 'personal',
                'notes' => 'Занял на ремонт в марте',
            ],
        ];
        foreach ($debts as $d) {
            DB::table('debts')->insert([
                'client_id'       => $userId,
                'name'            => $d['name'],
                'total_amount'    => $d['total'],
                'paid_amount'     => $d['paid'],
                'currency'        => 'BYN',
                'due_date'        => now()->addMonths($d['due_months'])->format('Y-m-d'),
                'monthly_payment' => $d['monthly'],
                'type'            => $d['type'],
                'is_active'       => true,
                'notes'           => $d['notes'],
                'created_at'      => $now,
                'updated_at'      => $now,
            ]);
        }
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

    protected function seedAdditionalAccountsForUser(int $userId): array
    {
        $now = now()->format('Y-m-d H:i:s');
        $main = DB::table('accounts')->where('client_id', $userId)->first();
        $accounts = ['Основной счёт' => $main->id];

        $savings = abs((float) DB::table('transactions')
            ->where('client_id', $userId)
            ->where('type', 'savings')
            ->sum('amount'));

        $newAccounts = [
            ['name' => 'Сберегательный', 'balance' => round($savings * 0.85, 2), 'currency' => 'BYN', 'sort' => 1],
            ['name' => 'Наличные',       'balance' => round(80 + mt_rand(0, 120), 2), 'currency' => 'BYN', 'sort' => 2],
            ['name' => 'Валютный (USD)', 'balance' => round(250 + mt_rand(0, 100), 2), 'currency' => 'USD', 'sort' => 3],
        ];

        foreach ($newAccounts as $a) {
            $id = DB::table('accounts')->insertGetId([
                'name'       => $a['name'],
                'sort_order' => $a['sort'],
                'balance'    => $a['balance'],
                'currency'   => $a['currency'],
                'client_id'  => $userId,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $accounts[$a['name']] = $id;
        }

        return $accounts;
    }

    protected function seedPaymentHistoryForUser(int $userId, array $paymentIds): void
    {
        $payments = DB::table('recurring_payments')
            ->where('client_id', $userId)
            ->where('is_income', false)
            ->get();

        foreach ($payments as $payment) {
            for ($i = 11; $i >= 0; $i--) {
                $date = now()->subMonths($i);
                $month = $date->format('Y-m');
                $day = min($payment->day_of_month, (int) $date->copy()->endOfMonth()->day);
                $paidDate = $date->copy()->setDay($day)->format('Y-m-d');

                DB::table('payment_history')->insertOrIgnore([
                    'payment_id' => $payment->id,
                    'paid_date'  => $paidDate,
                    'amount'     => $payment->amount,
                    'month'      => $month,
                ]);
            }
        }
    }

    protected function seedSettingsHistoryForUser(int $userId): void
    {
        if (! Schema::hasTable('settings_history')) {
            return;
        }
        $now = now()->format('Y-m-d H:i:s');
        $entries = [
            ['key' => 'gross_salary',    'value' => '2000', 'from' => now()->subYears(2)->format('Y-m-d'), 'to' => now()->subYear()->format('Y-m-d')],
            ['key' => 'gross_salary',    'value' => '2500', 'from' => now()->subYear()->format('Y-m-d'),   'to' => null],
            ['key' => 'expected_advance','value' => '1500', 'from' => now()->subYears(2)->format('Y-m-d'), 'to' => now()->subYear()->format('Y-m-d')],
            ['key' => 'expected_advance','value' => '2500', 'from' => now()->subYear()->format('Y-m-d'),   'to' => null],
            ['key' => 'usd_rate',        'value' => '3.10', 'from' => now()->subMonths(9)->format('Y-m-d'),'to' => now()->subMonths(5)->format('Y-m-d')],
            ['key' => 'usd_rate',        'value' => '3.25', 'from' => now()->subMonths(5)->format('Y-m-d'),'to' => null],
        ];
        foreach ($entries as $e) {
            DB::table('settings_history')->insert([
                'client_id'  => $userId,
                'key'        => $e['key'],
                'value'      => $e['value'],
                'valid_from' => $e['from'],
                'valid_to'   => $e['to'],
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    protected function seedNotesForUser(int $userId): void
    {
        if (! Schema::hasTable('notes')) {
            return;
        }
        $now = now()->format('Y-m-d H:i:s');

        $folders = [];
        if (Schema::hasTable('note_folders')) {
            foreach ([
                ['name' => 'Финансовые планы', 'color' => '#6366f1', 'sort' => 0],
                ['name' => 'Текущие расходы',  'color' => '#22C55E', 'sort' => 1],
                ['name' => 'Жильё',            'color' => '#F59E0B', 'sort' => 2],
            ] as $f) {
                $fid = DB::table('note_folders')->insertGetId([
                    'client_id'  => $userId,
                    'name'       => $f['name'],
                    'color'      => $f['color'],
                    'sort_order' => $f['sort'],
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
                $folders[$f['name']] = $fid;
            }
        }

        $labels = [];
        if (Schema::hasTable('note_labels')) {
            foreach ([
                ['name' => 'важное',     'color' => '#EF4444'],
                ['name' => 'планы',      'color' => '#3B82F6'],
                ['name' => 'инвестиции', 'color' => '#F59E0B'],
                ['name' => 'экономия',   'color' => '#22C55E'],
            ] as $l) {
                $lid = DB::table('note_labels')->insertGetId([
                    'client_id'  => $userId,
                    'name'       => $l['name'],
                    'color'      => $l['color'],
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
                $labels[$l['name']] = $lid;
            }
        }

        $notesData = [
            [
                'folder' => 'Финансовые планы',
                'title'  => 'Бюджет на 2026 год',
                'content' => "## Цели на год\n\n- Накопить на отпуск — 5 000 BYN\n- Погасить рассрочку на ноутбук\n- Пополнить подушку безопасности до 15 000 BYN\n- Начать откладывать на первоначальный взнос\n\n## Ежемесячный план\n\n**Доходы:** 5 000 BYN (зарплата + аванс)\n**Обязательные расходы:** ~2 100 BYN\n**Свободные средства:** ~1 800 BYN\n**Сбережения:** 400–500 BYN",
                'summary' => 'Финансовый план на 2026: 4 цели, бюджет 5000 BYN, сбережения 400–500 BYN/мес.',
                'pinned' => true, 'color' => '#6366f1',
                'labels' => ['важное', 'планы'],
                'actions' => ['Обновить бюджет в начале месяца', 'Проверить прогресс по целям'],
                'days_ago' => 1,
            ],
            [
                'folder' => 'Финансовые планы',
                'title'  => 'Идеи для инвестиций',
                'content' => "## Варианты инвестирования\n\n### Консервативные\n- **Депозит в банке** — ~12% годовых в BYN\n- **Облигации** — стабильный доход\n\n### Умеренные\n- **ETF на индекс S&P 500** — долгосрок\n- **Золото** — защита от инфляции\n\n## Что нужно изучить\n\n- Порог входа на фондовой бирже\n- Условия ИИС\n- Налогообложение доходов с инвестиций\n\n> Начать с небольшой суммы — 200–300 USD",
                'summary' => 'Варианты инвестирования: депозиты, облигации, ETF. Начальная сумма — 200-300 USD.',
                'pinned' => false, 'color' => '#F59E0B',
                'labels' => ['инвестиции', 'планы'],
                'actions' => ['Открыть брокерский счёт', 'Изучить ETF фонды'],
                'days_ago' => 7,
            ],
            [
                'folder' => 'Текущие расходы',
                'title'  => 'Планирование отпуска в июле',
                'content' => "## Турция, июль 2026\n\n**Бюджет:** 4 500 BYN на двоих\n\n| Статья | Сумма |\n|--------|-------|\n| Авиабилеты | 1 200 BYN |\n| Отель (10 ночей) | 1 800 BYN |\n| Питание и развлечения | 800 BYN |\n| Экскурсии | 400 BYN |\n| Прочее | 300 BYN |\n\n### Уже накоплено\n~2 800 BYN, нужно ещё ~1 700 BYN (3 месяца по 570)\n\n### Checklist\n- [x] Выбрать направление\n- [ ] Купить билеты\n- [ ] Забронировать отель\n- [ ] Оформить страховку",
                'summary' => 'Отпуск в Турцию на июль: бюджет 4500 BYN, накоплено 2800 BYN, нужно ещё 1700.',
                'pinned' => false, 'color' => '#22C55E',
                'labels' => ['планы'],
                'actions' => ['Купить авиабилеты до 1 мая', 'Забронировать отель', 'Оформить страховку'],
                'days_ago' => 2,
            ],
            [
                'folder' => 'Жильё',
                'title'  => 'Ипотека vs аренда — сравнение',
                'content' => "## Анализ вариантов\n\n### Текущая ситуация\nАренда: 800 BYN/мес + коммунальные ~100 BYN = **~900 BYN/мес**\n\n### Ипотека (квартира 120 000 USD)\n- Первоначальный взнос 20% = ~78 000 BYN\n- Платёж (20 лет, 12%): ~3 575 BYN/мес\n- Переплата: ~140 000 USD за 20 лет\n\n### Вывод\nАренда ещё 3–4 года, параллельно копить на взнос.\n**Целевой взнос:** 50 000 BYN за 4–5 лет.",
                'summary' => 'Ипотека vs аренда: ипотека 3575 BYN/мес против аренды 900 BYN. Вывод — копить взнос 4-5 лет.',
                'pinned' => false, 'color' => null,
                'labels' => ['важное', 'планы'],
                'actions' => ['Уточнить условия ипотеки в банке', 'Пересчитать ежемесячный взнос в цель'],
                'days_ago' => 10,
            ],
            [
                'folder' => null,
                'title'  => 'Задачи на этот месяц',
                'content' => "## Финансовые задачи\n\n- [ ] Оплатить страховку авто до 20 числа\n- [ ] Перевести 400 BYN на сберегательный счёт\n- [ ] Проверить баланс автокредита\n- [ ] Пересмотреть подписки — отключить лишние\n- [x] Оплатить аренду\n- [x] Пополнить мобильный\n\n## Напоминания\n- Техосмотр: следующий месяц\n- Страховка жизни: продление через 2 месяца",
                'summary' => 'Финансовые задачи месяца: страховка авто, перевод сбережений, проверка кредита.',
                'pinned' => true, 'color' => '#EF4444',
                'labels' => ['важное'],
                'actions' => ['Оплатить страховку авто', 'Перевести 400 BYN на сберегательный'],
                'days_ago' => 0,
            ],
            [
                'folder' => 'Текущие расходы',
                'title'  => 'Сравнение тарифов мобильной связи',
                'content' => "## Текущий тариф\nА1 — 25 BYN/мес, 20 ГБ\n\n| Оператор | Интернет | Цена |\n|----------|----------|------|\n| А1 Smart | 20 ГБ | 25 BYN |\n| МТС Super | 30 ГБ | 22 BYN |\n| Life Макс | 50 ГБ | 28 BYN |\n\n**Вывод:** МТС выгоднее на 3 BYN/мес, экономия 36 BYN/год.",
                'summary' => 'МТС Super выгоднее текущего А1 на 3 BYN/мес. Потенциальная экономия 36 BYN/год.',
                'pinned' => false, 'color' => null,
                'labels' => ['экономия'],
                'actions' => ['Перейти на тариф МТС Super'],
                'days_ago' => 5,
            ],
            [
                'folder' => 'Жильё',
                'title'  => 'Список ремонтных работ',
                'content' => "## Планируемые улучшения\n\n### Приоритет высокий\n- Замена смесителя на кухне — ~80 BYN\n- Ремонт межкомнатной двери — ~150 BYN\n\n### Приоритет средний\n- Покраска стен в спальне — ~120 BYN\n- Новые шторы в гостиную — ~200 BYN\n\n### На потом\n- Замена холодильника — ~700 BYN\n- Новый диван — ~1 200 BYN\n\n**Итого (срочное):** ~230 BYN\nСоздать конверт 'Ремонт' — 200 BYN/мес",
                'summary' => 'Ремонтные работы: срочные 230 BYN, резерв 200 BYN/мес. На перспективу — холодильник и диван.',
                'pinned' => false, 'color' => '#F59E0B',
                'labels' => ['планы'],
                'actions' => ['Создать конверт Ремонт', 'Купить смеситель'],
                'days_ago' => 14,
            ],
        ];

        $hasAnalysis = Schema::hasColumn('notes', 'action_items');
        $hasPinned   = Schema::hasColumn('notes', 'is_pinned');
        $hasFolder   = Schema::hasColumn('notes', 'folder_id');

        foreach ($notesData as $sort => $n) {
            $row = [
                'client_id'  => $userId,
                'title'      => $n['title'],
                'content'    => $n['content'],
                'summary'    => $n['summary'],
                'sort_order' => $sort,
                'color'      => $n['color'],
                'created_at' => now()->subDays($n['days_ago'])->format('Y-m-d H:i:s'),
                'updated_at' => now()->subDays(max(0, $n['days_ago'] - 1))->format('Y-m-d H:i:s'),
            ];
            if ($hasFolder) {
                $row['folder_id'] = $n['folder'] ? ($folders[$n['folder']] ?? null) : null;
            }
            if ($hasPinned) {
                $row['is_pinned'] = $n['pinned'];
            }
            if ($hasAnalysis) {
                $row['action_items']     = json_encode($n['actions'], JSON_UNESCAPED_UNICODE);
                $row['suggested_labels'] = null;
                $row['analyzed_at']      = now()->subDays($n['days_ago'])->format('Y-m-d H:i:s');
            }

            $noteId = DB::table('notes')->insertGetId($row);

            if (Schema::hasTable('note_label') && ! empty($n['labels'])) {
                foreach ($n['labels'] as $labelName) {
                    if (isset($labels[$labelName])) {
                        DB::table('note_label')->insertOrIgnore([
                            'note_id'  => $noteId,
                            'label_id' => $labels[$labelName],
                        ]);
                    }
                }
            }
        }
    }

    protected function seedCalendarEventsForUser(int $userId): void
    {
        if (! Schema::hasTable('calendar_events')) {
            return;
        }
        $now = now()->format('Y-m-d H:i:s');
        $today = now();

        $dom = fn (int $day) => min($day, (int) $today->copy()->endOfMonth()->day);

        $events = [
            [
                'title' => 'Зарплата',
                'description' => 'Поступление зарплаты — 2 500 BYN',
                'start' => $today->copy()->setDay($dom(10))->startOfDay()->format('Y-m-d H:i:s'),
                'end' => null, 'all_day' => true,
                'color' => '#22C55E',
                'rrule' => 'FREQ=MONTHLY;BYMONTHDAY=10',
            ],
            [
                'title' => 'Аванс',
                'description' => 'Поступление аванса — 2 500 BYN',
                'start' => $today->copy()->setDay($dom(25))->startOfDay()->format('Y-m-d H:i:s'),
                'end' => null, 'all_day' => true,
                'color' => '#22C55E',
                'rrule' => 'FREQ=MONTHLY;BYMONTHDAY=25',
            ],
            [
                'title' => 'Оплата аренды',
                'description' => 'Ежемесячный платёж — 800 BYN',
                'start' => $today->copy()->addMonth()->setDay(5)->startOfDay()->format('Y-m-d H:i:s'),
                'end' => null, 'all_day' => true,
                'color' => '#EF4444',
                'rrule' => 'FREQ=MONTHLY;BYMONTHDAY=5',
            ],
            [
                'title' => 'Платёж по рассрочке (последний)',
                'description' => 'Ноутбук — 300 BYN, закрытие долга',
                'start' => now()->addMonths(4)->setDay(15)->startOfDay()->format('Y-m-d H:i:s'),
                'end' => null, 'all_day' => true,
                'color' => '#F59E0B',
                'rrule' => null,
            ],
            [
                'title' => 'Стоматолог',
                'description' => 'Плановый осмотр',
                'start' => $today->copy()->addWeeks(2)->setHour(10)->setMinute(0)->setSecond(0)->format('Y-m-d H:i:s'),
                'end'   => $today->copy()->addWeeks(2)->setHour(11)->setMinute(0)->setSecond(0)->format('Y-m-d H:i:s'),
                'all_day' => false, 'color' => '#3B82F6', 'rrule' => null,
            ],
            [
                'title' => 'Техосмотр автомобиля',
                'description' => 'Обязательный ГТО',
                'start' => $today->copy()->addWeeks(3)->setHour(9)->setMinute(0)->setSecond(0)->format('Y-m-d H:i:s'),
                'end'   => $today->copy()->addWeeks(3)->setHour(10)->setMinute(30)->setSecond(0)->format('Y-m-d H:i:s'),
                'all_day' => false, 'color' => '#8B5CF6', 'rrule' => null,
            ],
            [
                'title' => 'Продление Netflix',
                'description' => 'Автоматическое списание 15 BYN',
                'start' => $today->copy()->addMonth()->setDay(3)->startOfDay()->format('Y-m-d H:i:s'),
                'end' => null, 'all_day' => true,
                'color' => '#EF4444',
                'rrule' => 'FREQ=MONTHLY;BYMONTHDAY=3',
            ],
            [
                'title' => 'Перевод на сберегательный',
                'description' => 'Откладываем 400 BYN согласно плану',
                'start' => $today->copy()->addDays(3)->setHour(12)->setMinute(0)->setSecond(0)->format('Y-m-d H:i:s'),
                'end' => null, 'all_day' => false,
                'color' => '#22C55E', 'rrule' => null,
            ],
            [
                'title' => 'Планирование бюджета на следующий месяц',
                'description' => 'Подвести итоги, поставить лимиты по категориям',
                'start' => $today->copy()->endOfMonth()->subDays(2)->setHour(19)->setMinute(0)->setSecond(0)->format('Y-m-d H:i:s'),
                'end'   => $today->copy()->endOfMonth()->subDays(2)->setHour(19)->setMinute(30)->setSecond(0)->format('Y-m-d H:i:s'),
                'all_day' => false, 'color' => '#6366f1',
                'rrule' => 'FREQ=MONTHLY;BYDAY=-3MO',
            ],
            [
                'title' => 'Дедлайн — купить авиабилеты',
                'description' => 'Цены на июль растут — купить до конца месяца',
                'start' => $today->copy()->endOfMonth()->startOfDay()->format('Y-m-d H:i:s'),
                'end' => null, 'all_day' => true,
                'color' => '#F59E0B', 'rrule' => null,
            ],
        ];

        foreach ($events as $e) {
            DB::table('calendar_events')->insert([
                'client_id'       => $userId,
                'title'           => $e['title'],
                'description'     => $e['description'] ?? null,
                'start_at'        => $e['start'],
                'end_at'          => $e['end'],
                'is_all_day'      => $e['all_day'],
                'color'           => $e['color'],
                'recurrence_rule' => $e['rrule'],
                'source'          => 'manual',
                'created_at'      => $now,
                'updated_at'      => $now,
            ]);
        }
    }

    protected function seedNetWorthSnapshotsForUser(int $userId): void
    {
        if (! Schema::hasTable('net_worth_snapshots')) {
            return;
        }
        $now = now()->format('Y-m-d H:i:s');
        $debtStart = 21600.0;

        for ($i = 23; $i >= 0; $i--) {
            $month    = now()->subMonths($i)->format('Y-m');
            $p        = (23 - $i) / 23;
            $balance  = round(2000 + $p * 14000 + mt_rand(-200, 200), 2);
            $savings  = round($p * 12000 + mt_rand(-100, 100), 2);
            $debt     = max(0, round($debtStart * (1 - $p * 0.85) + mt_rand(-50, 50), 2));
            $netWorth = round($balance + $savings - $debt, 2);

            DB::table('net_worth_snapshots')->insertOrIgnore([
                'client_id'     => $userId,
                'month'         => $month,
                'total_balance' => $balance,
                'total_savings' => $savings,
                'total_debt'    => $debt,
                'net_worth'     => $netWorth,
                'created_at'    => $now,
                'updated_at'    => $now,
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
