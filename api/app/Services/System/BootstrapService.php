<?php

namespace App\Services\System;

use App\Models\Category;
use App\Models\IncomeType;
use App\Models\UserExperimentalFeature;
use App\Services\Accounts\AccountService;
use App\Services\Notifications\PushPreferencesService;
use App\Services\Plans\PaymentService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class BootstrapService
{
    public function __construct(
        protected PaymentService $paymentService,
        protected AccountService $accountService,
        protected PushPreferencesService $pushPrefs
    ) {}

    public function getBootstrapData(int $clientId, $user): array
    {
        $experimentalFeatures = UserExperimentalFeature::getFeaturesForUser($user->id);

        $this->accountService->getOrCreateDefault($clientId);
        $accounts = $this->accountService->getAllForClient($clientId);
        $totalBalance = $this->accountService->getTotalBalance($clientId);

        $categories = $this->getCachedCategories($clientId);
        $incomeTypes = $this->getCachedIncomeTypes($clientId);
        $reminders = $this->paymentService->getReminders($clientId);

        $allSettings = DB::table('settings')
            ->where('client_id', $clientId)
            ->whereIn('key', [
                'usd_rate', 'eur_rate', 'rub_rate', 'rates_updated',
                'theme',
                PushPreferencesService::KEY_OVERDUE,
                PushPreferencesService::KEY_UPCOMING,
                PushPreferencesService::KEY_UPCOMING_DAYS,
            ])
            ->pluck('value', 'key');

        $rates = [
            'RUB' => $allSettings->get('rub_rate', ''),
            'EUR' => $allSettings->get('eur_rate', ''),
            'USD' => $allSettings->get('usd_rate', ''),
            'updated' => $allSettings->get('rates_updated', ''),
        ];

        $theme = $allSettings->get('theme');

        $pushPreferences = [
            'push_overdue' => ($allSettings->get(PushPreferencesService::KEY_OVERDUE, '1')) === '1',
            'push_upcoming' => ($allSettings->get(PushPreferencesService::KEY_UPCOMING, '1')) === '1',
            'push_upcoming_days' => (int) ($allSettings->get(PushPreferencesService::KEY_UPCOMING_DAYS, '1')),
        ];

        return [
            'me' => [
                'id' => $user->id,
                'email' => $user->email,
                'name' => $user->name,
                'experimental_features' => $experimentalFeatures,
            ],
            'accounts' => $accounts->map(fn ($a) => [
                'id' => $a->id,
                'name' => $a->name,
                'balance' => (float) $a->balance,
                'currency' => $a->currency ?? 'BYN',
                'last_sync_date' => $a->last_sync_date?->format('Y-m-d'),
                'last_sync_amount' => $a->last_sync_amount ? (float) $a->last_sync_amount : 0,
            ])->values()->all(),
            'total_balance' => $totalBalance,
            'balance' => [
                'id' => $accounts->first()?->id,
                'name' => $accounts->first()?->name ?? 'Основной',
                'balance' => $totalBalance,
                'currency' => 'BYN',
                'last_sync_date' => $accounts->first()?->last_sync_date?->format('Y-m-d'),
                'last_sync_amount' => (float) ($accounts->first()?->last_sync_amount ?? 0),
            ],
            'categories' => $categories,
            'income_types' => $incomeTypes,
            'rates' => $rates,
            'reminders' => $reminders,
            'vapid_public' => config('services.webpush.vapid_public'),
            'push_preferences' => $pushPreferences,
            'theme' => $theme,
            'telegram_linked' => $user->telegram_chat_id !== null,
        ];
    }

    protected function getCachedCategories(int $clientId): array
    {
        $key = "categories:{$clientId}";

        return Cache::remember($key, 900, function () use ($clientId) {
            return Category::withoutGlobalScope('client')
                ->with(['subcategories' => fn ($q) => $q->withoutGlobalScope('client')])
                ->where('client_id', $clientId)
                ->where('is_active', true)
                ->orderBy('sort_order')
                ->orderBy('name')
                ->get()
                ->map(fn ($c) => $this->formatCategory($c))
                ->values()
                ->all();
        });
    }

    protected function getCachedIncomeTypes(int $clientId): array
    {
        $key = "income_types:{$clientId}";

        return Cache::remember($key, 900, function () use ($clientId) {
            return IncomeType::withoutGlobalScope('client')
                ->where('client_id', $clientId)
                ->orderBy('sort_order')
                ->orderBy('label')
                ->get()
                ->map(fn ($t) => [
                    'id' => $t->id,
                    'code' => $t->code,
                    'label' => $t->label,
                    'icon' => $t->icon ?? '📦',
                    'default_currency' => $t->default_currency ?? 'BYN',
                    'sort_order' => $t->sort_order,
                    'is_salary_related' => (bool) $t->is_salary_related,
                ])
                ->values()
                ->all();
        });
    }

    protected function formatCategory($c): array
    {
        $subs = $c->relationLoaded('subcategories')
            ? $c->subcategories->map(fn ($s) => $this->formatCategory($s))->values()->all()
            : [];

        return [
            'id' => $c->id,
            'name' => $c->name,
            'parent_id' => $c->parent_id,
            'icon' => $c->icon ?? "\u{1F4E6}",
            'color' => $c->color,
            'sort_order' => $c->sort_order,
            'is_active' => $c->is_active,
            'subcategories' => $subs,
        ];
    }
}
