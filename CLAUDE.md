# CLAUDE.md — Finance Tracker

Персональный учёт финансов: доходы, расходы, цели, повторяющиеся платежи, лимиты по категориям.

## Стек

| Компонент | Технология |
|-----------|------------|
| Backend | Laravel 11, PHP 8.4, JWT (firebase/php-jwt) |
| Frontend | Vite 5, TypeScript (vanilla, без фреймворков), Chart.js |
| БД | PostgreSQL 16 |
| WebSocket | Laravel Reverb + Laravel Echo (Pusher.js) |
| Инфра | Docker Compose (nginx, PHP-FPM, PostgreSQL, Reverb) |
| Тесты | PHPUnit 11 (BE), Vitest 1 (FE) |
| Качество | PHPStan level 5, Laravel Pint (PSR-12), TypeScript strict |

## Быстрый старт (Windows)

```powershell
.\docker-dev.ps1 -Build          # первый раз (сборка контейнеров)
.\docker-dev.ps1 -Migrate        # миграции БД
.\docker-dev.ps1                  # запуск
.\docker-dev.ps1 -Fresh -Migrate -MigrateData   # полный перезапуск
```

| URL | Порт |
|-----|------|
| Приложение | http://localhost:4001 |
| API (nginx) | http://localhost:8000 |
| Swagger UI | http://localhost:8000/api/docs |
| Reverb WS | ws://localhost:8080 |

## Структура проекта

```
api/                          Laravel API
├── app/
│   ├── Http/
│   │   ├── Controllers/Api/  Контроллеры (тонкие, делегируют в Service)
│   │   ├── Requests/         Form Request валидация
│   │   ├── Resources/        API Resources (формат ответа)
│   │   └── Middleware/       JwtAuth, AdminOnly, ExperimentalFeature
│   ├── Models/               Eloquent-модели (25+)
│   ├── Services/             Бизнес-логика (40+ сервисов)
│   ├── Repositories/         Доступ к данным (интерфейс + реализация)
│   ├── Events/               DataUpdated (broadcast)
│   ├── Enums/                TransactionType, ExperimentalFeature
│   └── Console/Commands/     Artisan-команды
├── config/                   17 конфигов
├── database/migrations/      19 миграций
├── routes/api.php            Все маршруты
└── tests/                    Feature/, Unit/

web/                          Vite SPA (TypeScript)
├── src/
│   ├── pages/                Страницы-оркестраторы (dashboard, operations, analytics, budget, plans, settings, admin)
│   ├── views/                View-слой (только рендер, без API)
│   ├── components/           UI-компоненты (формы, модалки, тосты, фильтры)
│   ├── services/             API-обёртки (типизированные методы)
│   ├── api/                  HTTP-клиент (client.ts, admin.ts)
│   ├── store/                Глобальное состояние (Store class)
│   ├── types/                TypeScript-интерфейсы
│   ├── templates/            HTML-шаблоны (transaction-item, payment-item)
│   ├── utils/                format.ts, dom.ts
│   ├── app.ts                Главный контроллер приложения
│   └── main.ts               Entry point
├── index.html, admin.html, login.html
├── vite.config.ts            Base: /static/dist/, proxy /api → API
└── vitest.config.ts

docker/                       Инфра
├── docker-compose.yml        5 сервисов: postgres, nginx, api, web, reverb
└── nginx/default-dev.conf    Reverse proxy
```

## Архитектура

### Backend: Request → Controller → Service → Repository/Model → DB → Resource

| Слой | Ответственность | Правила |
|------|-----------------|---------|
| **Controller** | HTTP, делегирование | Тонкий: валидация через FormRequest, вызов Service, ответ через Resource или `$this->success()` |
| **Service** | Бизнес-логика | Все расчёты, проверки, события. Основной слой логики |
| **Repository** | Сложные запросы | Используется при необходимости подмены источника данных (интерфейс + реализация) |
| **Model** | Eloquent, связи, scope | Связи, атрибуты, глобальный scope по `client_id` |
| **Resource** | Формат ответа | Для сущностей с нестандартным форматом; простые — через `$this->success()` |
| **FormRequest** | Валидация | `StoreTransactionRequest`, `UpdateGoalRequest`, etc. |

### Frontend: Page → View → Component → Service → API Client

| Слой | Ответственность | Именование |
|------|-----------------|------------|
| **Page** | Оркестрация, загрузка, callbacks | `dashboard.ts`, `budget.ts` |
| **View** | Рендер в DOM, **без API-вызовов** | `DashboardView.ts`, `BudgetView.ts` |
| **Component** | Переиспользуемый UI | `transaction-form.ts`, `payment-list.ts` |
| **Service** | API-обёртки | `dashboard.service.ts`, `analytics.service.ts` |
| **API Client** | HTTP, ошибки, JWT | `api/client.ts` |
| **Store** | Глобальное состояние | `store/index.ts` (get/set/update, подписки) |

## Соглашения по именованию

### Backend (PHP)
- Контроллеры: `UserController`, `TransactionController` (PascalCase)
- Сервисы: `TransactionService`, `PaymentService`
- Репозитории: `TransactionRepository` + `TransactionRepositoryInterface`
- Ресурсы: `PaymentResource`, `TransactionResource`
- Модели: `User`, `Transaction`, `Category`
- Запросы: `StoreTransactionRequest`, `UpdateGoalRequest`
- Middleware: `JwtAuth`, `AdminOnly`, `ExperimentalFeature`
- Enum: `TransactionType`, `ExperimentalFeature`

### Frontend (TypeScript)
- Pages: `dashboard.ts`, `operations.ts` (camelCase)
- Views: `DashboardView.ts`, `AnalyticsView.ts` (PascalCase + "View")
- Components: `transaction-form.ts`, `payment-list.ts` (kebab-case)
- Services: `dashboard.service.ts`, `category.service.ts` (camelCase + ".service")
- Types: `Transaction`, `Category`, `Goal` (интерфейсы в `types/index.ts`)
- Import alias: `@/` → `src/`

## Ключевые паттерны

### Bootstrap
Один запрос `GET /api/bootstrap` при старте → me, balance, categories, income_types, rates, reminders. Не блокирует: recommendations и health загружаются отдельно (lazy).

### JWT-аутентификация
`POST /api/auth/login` → token в localStorage. Все запросы: `Authorization: Bearer <token>`.

### Формат ответа API
```json
{ "success": true, "data": T }
{ "success": false, "error": "message" }
```

### Broadcasting (real-time)
`event(new DataUpdated('transactions'))` → Reverb → синхронизация вкладок через Laravel Echo.

### Batch API
`POST /api/batch` — массив запросов, один HTTP-вызов.

### Изоляция данных
Все данные привязаны к `client_id`. Глобальный scope на моделях обеспечивает изоляцию.

### Кэширование
- Categories: 15 мин
- Rates (курсы валют): 1 час

### Оптимистичные обновления
Транзакции, цели, плановые платежи — UI обновляется сразу, при ошибке API — откат.

## База данных (PostgreSQL)

### Основные модели

| Модель | Ключевые поля | Связи |
|--------|---------------|-------|
| **User** | email, name, is_admin | has_many: Account, Transaction, Category, Goal, RecurringPayment, Debt, Envelope |
| **Account** | balance, currency, name | belongs_to: User |
| **Transaction** | date, amount, type, category_id, account_id, recurring_payment_id, goal_id, transfer_to_account_id | belongs_to: User, Category, Account, RecurringPayment, Goal |
| **Category** | name, icon, color, parent_id | self-join (подкатегории), has_many: CategoryBudget |
| **RecurringPayment** | name, amount, day_of_month, is_subscription, cancel_by_date, is_income | belongs_to: User, Category |
| **Goal** | name, target_amount, current_amount, target_date | belongs_to: User |
| **CategoryBudget** | category_id, month, limit_amount, is_essential, alert_percent | belongs_to: User, Category |
| **Debt** | name, total_amount, paid_amount | belongs_to: User. **Не влияет на баланс** |
| **Envelope** | name, allocated, spent, month | belongs_to: User |
| **Settings** | client_id (PK), key (PK), value | key-value store |

### Типы транзакций (TransactionType enum)
- `income` — доход (salary, advance, bonus, etc.)
- `expense` — расход
- `savings` — перевод в копилку
- `savings_withdrawal` — снятие с копилки

### Валюты
BYN (базовая), RUB, EUR, USD — конвертация по курсу из Settings.

## Бизнес-логика

### Cashflow (BudgetService::calculateCashflow)
```
free_funds = balance − living_budget − total_payments
living_budget = (essential_total / 30) × days_until_income
essential_spent = траты по is_essential категориям с даты последнего дохода, без recurring_payment_id
total_payments = только неоплаченные платежи до следующего дохода
```

### Forecast (ForecastService::getForecast)
```
balance_end = running_balance + income − expenses − savings + savings_withdrawal
Текущий месяц: фактические данные
Будущие: avgIncome, planned_payments
```

### Monthly Budget (BudgetService::getMonthlyBudget)
```
remaining = total_income − total_payments − total_savings − total_expenses
```

### Budget Warning
При создании расхода: если сумма по категории за месяц >= alert_percent (дефолт 80%) от лимита → предупреждение в ответе API (`budget_warning`).

## API-маршруты

- **Public:** `GET /api/ping`, `POST /api/auth/login` (rate limited)
- **Auth (jwt.auth):** bootstrap, me, dashboard, transactions, payments, goals, categories, accounts, budget, forecast, analytics, health, recommendations, settings, rates, debts, envelopes, push, income-types, batch
- **Experimental:** bank-receipts (AI receipt parsing)
- **Admin (jwt.auth + admin):** dashboard, charts, clients, activity-logs, push campaigns
- **Docs:** OpenAPI spec — `GET /api/docs` (Swagger UI)

## Тесты

### Backend

**Важно:** тесты используют отдельную БД `finance_test`, чтобы не затирать рабочие данные. Создайте её один раз (ошибка "already exists" — нормально):

```powershell
docker compose -f docker/docker-compose.yml exec postgres psql -U finance -d finance -c "CREATE DATABASE finance_test;"
```

```powershell
docker compose -f docker/docker-compose.yml exec api php artisan test
# или конкретно:
docker compose -f docker/docker-compose.yml exec api ./vendor/bin/phpunit --filter=AuthTest
```
Конфиг: `api/phpunit.xml`. Suites: Feature, Unit. Тесты с `RefreshDatabase` используют `finance_test`.

**Сидеры:**
```powershell
# Admin (admin@local/admin123) + Demo (demo@local/demo123, 2 года данных, ~80-100 tx/мес)
docker compose -f docker/docker-compose.yml exec api php artisan seed:demo

# 3 тестовых пользователя (test1-3@local/test123, 6 мес, ~40-60 tx/мес, разные профили)
docker compose -f docker/docker-compose.yml exec api php artisan seed:test
```

| Пользователь | Email | Пароль | Описание |
|---|---|---|---|
| Admin | admin@local | admin123 | Администратор, без транзакций |
| Demo | demo@local | demo123 | 2 года реалистичных данных, ~5000 BYN/мес |
| Test 1 | test1@local | test123 | Экономный (3000 BYN, savings 20%) |
| Test 2 | test2@local | test123 | Средний (5000 BYN, savings 10%) |
| Test 3 | test3@local | test123 | Транжира (7000 BYN, savings 5%) |

### Frontend
```powershell
docker compose -f docker/docker-compose.yml exec web npm test
```
Конфиг: `web/vitest.config.ts`. Файлы: `*.service.test.ts`, `*.test.ts`.

## Качество кода

### Backend
```powershell
# Статический анализ
docker compose -f docker/docker-compose.yml exec api ./vendor/bin/phpstan analyse
# Стиль (PSR-12)
docker compose -f docker/docker-compose.yml exec api ./vendor/bin/pint
```
PHPStan: level 5, конфиг `api/phpstan.neon`.

### Frontend
```powershell
docker compose -f docker/docker-compose.yml exec web npm run lint
```
TypeScript strict mode, ESLint.

### Сборка Frontend
```powershell
docker compose -f docker/docker-compose.yml exec web npm run build
# tsc && vite build → api/public/static/dist/
```

## Важные файлы

### Backend
- `api/routes/api.php` — все маршруты
- `api/app/Services/TransactionService.php` — CRUD транзакций, баланс, budget warnings
- `api/app/Services/BudgetService.php` — cashflow, monthly budget
- `api/app/Services/ForecastService.php` — прогноз баланса
- `api/app/Services/PaymentService.php` — плановые платежи, напоминания
- `api/app/Services/BootstrapService.php` — агрегация данных при старте
- `api/app/Http/Controllers/Api/` — все контроллеры
- `api/app/Models/Transaction.php` — центральная модель
- `api/app/Repositories/TransactionRepository.php` — сложные запросы

### Frontend
- `web/src/app.ts` — главный контроллер (навигация, bootstrap, роутинг)
- `web/src/pages/` — страницы-оркестраторы
- `web/src/api/client.ts` — HTTP-клиент с JWT
- `web/src/store/index.ts` — глобальное состояние
- `web/src/types/index.ts` — все TypeScript-интерфейсы
- `web/vite.config.ts` — конфиг сборки (proxy, entry points)

### Документация
- `docs/CODEMAP.md` — архитектура, структура кода, таблицы компонентов
- `docs/PLAN.md` — план развития, новые фичи, этапы разработки
- `docs/openapi.yaml` — OpenAPI 3.0 спецификация
