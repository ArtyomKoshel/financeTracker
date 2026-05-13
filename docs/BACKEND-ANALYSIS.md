# Backend Architecture Analysis

> Глубокий анализ backend-архитектуры Laravel-приложения.
> Составлен на основе трёх независимых источников анализа.
> Обновлено: 2026-03-04

---

## Стек и инфраструктура

| Компонент | Решение | Оценка |
|-----------|---------|--------|
| Framework | Laravel 11 | Solid choice |
| БД | PostgreSQL (ilike, tsquery) | Правильный выбор для full-text search |
| Auth | Custom JWT middleware (firebase/php-jwt) | Велосипед, но работает стабильно |
| WebSocket | Laravel Reverb + Broadcasting | Хорошо |
| Cache | Laravel Cache (Redis) | Хорошо |
| AI | HTTP calls к Groq/Anthropic | Изолировано через AiProviderService |
| Telegram | Long polling (TelegramPollCommand) | Не webhooks — см. проблемы |
| Queue | Supervisor + Workers | Хорошо |

---

## Что сделано хорошо

### 1. Global Scopes для мультитенантности

Самое элегантное решение в проекте. `client_id` фильтрация через Eloquent Global Scope — безопасно, прозрачно, нельзя случайно забыть.

```php
// Transaction, Category, Note — все модели фильтруются автоматически
static::addGlobalScope('client', function (Builder $builder) {
    $clientId = app('client_id') ?? auth()->id();
    if ($clientId) $builder->where('client_id', $clientId);
});
```

### 2. Тонкие Controllers

Controllers — чистые прокси. `NoteController` (151 строка) содержит только делегацию в `NoteService`. Никакой бизнес-логики. `TransactionController` аналогично.

### 3. TransactionService — образцовый

`DB::transaction()`, обновление баланса, `event(new DataUpdated(...))`, auto-savings, budget warning — всё на своём месте. Это референс, как должно быть написано в других сервисах.

### 4. ExperimentalFeature middleware

Feature flags на уровне маршрутов — `experimental:notes`, `experimental:calendar`. Подключить/отключить фичу для конкретного пользователя через БД. Механизм чистый и расширяемый.

### 5. DataUpdated Event + Broadcasting

Единый механизм real-time обновлений. Сервисы диспатчат `DataUpdated('transactions', $clientId)` — клиент получает сигнал и обновляет данные. Используется последовательно.

### 6. Bootstrap endpoint

Single endpoint `/api/bootstrap` загружает всё нужное при старте: категории, курсы, аккаунты, настройки, reminders. Кешируется. Умное решение — минимизирует RTT при старте.

### 7. Batch endpoint

`POST /api/batch` позволяет выполнить несколько запросов за один HTTP call. Важно для мобильных клиентов и офлайн-режима.

### 8. Repository interface для Transaction

```php
TransactionRepositoryInterface → TransactionRepository
```

Инверсия зависимости — `AnalyticsService`, `HealthService` зависят от интерфейса, не от реализации. Тестируемо.

### 9. AuditLog middleware

Все мутирующие операции логируются в `audit_logs` с payload, IP, duration. Не падает при ошибке (`try/catch`). Единое место для аудита.

### 10. Artisan Commands для scheduled tasks

`AutoDebitSubscriptions`, `SendPaymentReminderPush`, `SnapshotNetWorth`, `TelegramPollCommand` — правильный подход через Console. Нет cron в PHP-коде бизнес-логики.

---

## Проблемы и технический долг

### Критические (нарушают архитектурный контракт)

---

#### #1 — BudgetService принимает Request объект

**Файл:** `api/app/Services/BudgetService.php:16`

```php
// Сейчас — Service знает об HTTP
public function calculateCashflow(Request $request): array
{
    $clientId = (int) (app('client_id') ?? auth()->id() ?? 0);
    // ... внутри $request->get('...') обращения
}
```

Service не должен знать об HTTP. Это нарушает SRP, делает сервис нетестируемым без HTTP-контекста и зависит от lifecycle request-а.

```php
// Должно быть
public function calculateCashflow(int $clientId, array $params = []): array
```

Контроллер распаковывает `$request->validated()` и передаёт в сервис.

---

#### #2 — ActivityLog напрямую в контроллере

**Файл:** `api/app/Http/Controllers/Api/TransactionController.php:78, 121, 213`

```php
ActivityLog::create([
    'user_id' => $clientId,
    'action' => 'transaction_create',
    // ...
]);
```

Дублируется в нескольких методах одного контроллера, обходя уже существующий AuditLog middleware. Это cross-cutting concern — должен быть в одном месте (middleware или Service).

---

#### #3 — bulkUpdate минует TransactionService

**Файл:** `api/app/Http/Controllers/Api/TransactionController.php:241`

```php
$updated = \App\Models\Transaction::withoutGlobalScope('client')
    ->where('client_id', $clientId)
    ->whereIn('id', $ids)
    ->update(['category_id' => $categoryId]);
```

Прямой запрос к модели из контроллера, минуя `TransactionService`. При этом:
- Не вызывается `categorizationService->learnFromInput` для обучения
- Event пробрасывается только `'transactions'`, не `'dashboard'`
- Нет централизованного места для future логики bulk-обновления

---

### Значимые (архитектурное несоответствие)

---

#### #4 — BudgetService дублирует SettingsService

**Файл:** `api/app/Services/BudgetService.php:212, 300`

```php
// BudgetService::getSettings() — raw DB query
protected function getSettings(int $clientId): array
{
    $rows = DB::table('settings')->where('client_id', $clientId)->get();
}

// BudgetService::getRates() — raw DB query
protected function getRates(int $clientId): array
{
    $rows = DB::table('settings')->where('client_id', $clientId)->whereIn('key', [...])->get();
}
```

`SettingsService` уже существует и делает то же самое. `TransactionService` правильно инжектит `SettingsService`. `BudgetService` не инжектит его вовсе и дублирует эти запросы.

---

#### #5 — RecommendationService и HealthService обходят Repository

**Файл:** `api/app/Services/RecommendationService.php`, `api/app/Services/HealthService.php`

```php
// RecommendationService::checkBudgetTrend — прямой DB запрос
$spent = (float) DB::table('transactions')
    ->where('client_id', $clientId)
    ->where('category_id', $categoryId)
    ->where('month', $b->month)
    ->sum(DB::raw('ABS(amount)'));

// HealthService — аналогично
$totalDebt = (float) DB::table('debts')
    ->where('client_id', $clientId)
    ->sum(DB::raw('total_amount - paid_amount'));
```

`TransactionRepositoryInterface` уже есть. `RecommendationService` инжектит его для части запросов, но в `checkBudgetTrend` уходит в `DB::table` напрямую. Несогласованность.

Дополнительно: `HealthService` использует `withoutGlobalScope('client')` — прямой запрет по правилам проекта без явной причины:

```php
$goals = Goal::withoutGlobalScope('client')->where('client_id', $clientId)->...
```

---

#### #6 — _auto_savings — магический флаг в data array

**Файл:** `api/app/Services/TransactionService.php:99, 261`

```php
if (TransactionType::isIncomeType($type) && ... && empty($data['_auto_savings'])) {
    $this->maybeCreateAutoSavings(...);
}

// Внутри maybeCreateAutoSavings рекурсивный вызов:
$this->create([
    ...
    '_auto_savings' => true,  // чтобы не рекурсировать
]);
```

Рекурсия предотвращается через подчёркнутый ключ в массиве данных. Хрупко: если кто-то передаст `_auto_savings: true` извне — авто-сохранение молча не сработает. Лучше использовать второй параметр метода или protected-метод без рекурсивного вызова.

---

### Минорные (легко исправить)

---

#### #7 — Кэш категорий — ключ per-user, запрос global

**Файл:** `api/app/Services/BootstrapService.php:97`

```php
protected function getCachedCategories(int $clientId): array
{
    $key = "categories:{$clientId}";  // ключ содержит clientId

    return Cache::remember($key, 900, function () {  // closure не захватывает clientId
        return Category::with('subcategories')        // нет явного where('client_id')
            ->where('is_active', true)
```

Если категории глобальные — кэш дублируется N раз (по числу пользователей) с одинаковыми данными. Ключ должен быть `"categories:global"`. Если per-client — нужен `use ($clientId)` и фильтр.

---

#### #8 — Schema::hasTable() в hot path

**Файл:** `api/app/Services/BootstrapService.php:23`

```php
if (Schema::hasTable('user_experimental_features')) {
    $experimentalFeatures = UserExperimentalFeature::getFeaturesForUser($user->id);
}
```

`Schema::hasTable` — это `INFORMATION_SCHEMA` запрос к БД. Вызывается на каждый `GET /bootstrap`. Таблица уже точно существует (создана миграцией) — этот guard остался от переходного периода.

**Исправление:** убрать проверку. 5 минут работы.

---

#### #9 — Бизнес-логика в моделях

**Файлы:** `api/app/Models/Category.php`, `api/app/Models/IncomeType.php`

```php
// Category.php — 59 строк бизнес-логики в модели
public static function seedForClient(int $clientId): void { ... }

// IncomeType.php — аналогично
public static function seedForClient(int $clientId): void { ... }
```

Нарушение SRP — модель знает о бизнес-правилах инициализации. Должно быть в `CategoryService::seedDefaultsForClient()`.

---

#### #10 — IncomeType::seedForClient при каждом bootstrap

**Файл:** `api/app/Services/BootstrapService.php:32`

```php
IncomeType::seedForClient($clientId);
```

Вызов сидера при каждом запросе к `/api/bootstrap`. Даже если внутри `firstOrCreate` — лишний DB round-trip на каждый холодный старт. Лучше делать один раз при регистрации/первом логине.

---

#### #11 — REST-нарушения в routes

**Файл:** `api/routes/api.php`

| Маршрут | Проблема |
|---------|----------|
| `GET /rates/update` | GET не должен мутировать состояние |
| `POST /categories/update` | Должен быть `PUT /categories/{id}` |
| `DELETE /categories/delete` | Должен быть `DELETE /categories/{id}` |
| `PUT /accounts` без `{id}` | Нельзя понять что именно обновляется |
| `PUT /envelopes` без `{id}` | То же |
| `PUT /income-types` без `{id}` | То же |
| `DELETE /transactions` + query param `?id=` | id должен быть path param |

Часть пришла исторически — когда у сущностей был один экземпляр на пользователя. Теперь технический долг.

---

#### #12 — Resources покрывают 6 из 25+ моделей

Есть: `TransactionResource`, `NoteResource`, `PaymentResource`, `GoalResource`, `DebtResource`, `EnvelopeResource`.

Нет для: `Account`, `Category`, `Budget`, `Analytics`, `CalendarEvent`, `Tag`, `IncomeType` и т.д. — сервисы возвращают сырые `array`. Трансформация данных размазана: часть в Resources, часть в Services, часть в Controllers. Нет единого контракта ответа API.

---

#### #13 — HealthService — God Object с неявным контрактом

**Файл:** `api/app/Services/HealthService.php` (303 строки)

`calculateHealth()` возвращает массив с 25+ ключами:

```php
return [
    'savings_rate' => 0,
    'expense_to_income' => 0,
    'emergency_fund_days' => 0,
    'total_savings' => 0,
    // ... ещё 21 поле
];
```

Нет DTO — никто не знает контракт без чтения 300 строк. PHPStan level 5 пропускает это. При добавлении нового поля легко допустить опечатку.

---

#### #14 — Telegram на long polling, не webhooks

`TelegramPollCommand` делает постоянные HTTP-запросы к Telegram API. При падении сервера — сообщения теряются пока процесс не поднялся. Webhooks надёжнее и дешевле по ресурсам.

---

## Карта зависимостей между сервисами

```
BootstrapService
  ├── PaymentService
  ├── AccountService
  └── PushPreferencesService

TransactionService
  ├── TransactionRepository
  ├── AccountService
  ├── SettingsService
  └── EnvelopeService

NoteService
  ├── NoteAnalysisService
  │     └── AiUsageService
  └── NoteFolderService

TelegramBotService
  ├── TelegramParserService
  ├── TransactionService
  ├── CategorizationService
  └── AccountService
```

Зависимости в целом разумные. Нет циклических зависимостей.

---

## Приоритетный план улучшений

### Приоритет 1 — Быстро, минимальный риск

| # | Задача | Усилие |
|---|--------|--------|
| 8 | Убрать `Schema::hasTable()` из BootstrapService | 5 мин |
| 7 | Исправить ключ кэша категорий | 30 мин |
| 6 | Убрать `_auto_savings` флаг — второй параметр метода | 30 мин |
| 1 | `BudgetService::calculateCashflow(int $clientId)` — убрать Request | 1-2 ч |
| 4 | Инжектить SettingsService в BudgetService | 1 ч |

### Приоритет 2 — Средний риск

| # | Задача | Усилие |
|---|--------|--------|
| 2 | ActivityLog убрать из контроллеров — в middleware или Service | 2-3 ч |
| 3 | bulkUpdate перенести в TransactionService | 1 ч |
| 9 | `seedForClient()` из моделей в сервисы | 1-2 ч |
| 10 | `IncomeType::seedForClient` убрать из bootstrap | 1 ч |
| 12 | Добавить Resources для Account, Category, CalendarEvent | 3-4 ч |
| 13 | HealthData DTO вместо массива с 25 ключами | 2-3 ч |

### Приоритет 3 — Долгосрочно / при необходимости

| # | Задача | Усилие |
|---|--------|--------|
| 5 | Вынести DB::table() запросы из RecommendationService/HealthService в Repository | 3-4 ч |
| 11 | Привести Routes к единому REST стилю (breaking change!) | 3-4 ч + FE |
| 14 | Telegram webhooks вместо long polling | 1 день |
| — | API версионирование `/api/v1/` | 2-3 ч |
| — | PHPStan level 5 → 6 или 7 | по мере добавления DTO |

### Что НЕ делать

- Не вводить Repository повсюду. `TransactionRepository` оправдан — там 15 специализированных запросов. Для простых CRUD (Goals, Debts) прямые Model-запросы в Service — нормально. Либо расширить до всех сущностей, либо оставить только для Transaction — но сделать это осознанным решением.
- Не менять JWT на Sanctum — работает, смена даёт риски без архитектурной выгоды.
- Не вводить CQRS/Event Sourcing — текущая сложность не требует.
