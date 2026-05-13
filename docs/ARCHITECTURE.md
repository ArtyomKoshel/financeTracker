# Architecture Analysis & Restructuring Plan

> Анализ текущей архитектуры продукта и план перехода к feature-based структуре.
> Составлен на основе трёх независимых источников анализа.
> Обновлено: 2026-03-04

---

## Текущее состояние (диагноз)

### Backend (`api/app/`) — Laravel PHP

| Директория | Файлов | Проблема |
|-----------|--------|----------|
| `Services/` | 40 | Всё плоско: `NoteService` рядом с `TelegramBotService` |
| `Controllers/Api/` | 38 | Аналогичная плоскость |
| `Http/Requests/` | 30 | Аналогичная плоскость |
| `Models/` | 25 | Плоско, но так принято в Laravel |
| `Http/Resources/` | 6 | Покрывают 6 из 25+ моделей |
| `Repositories/` | 2 | Только для Transaction |

Слои разделены правильно (Controller → Service → Repository), но внутри каждого слоя — плоский список без группировки по домену.

### Frontend (`web/src/`) — Vanilla TypeScript + Vite

| Директория | Файлов | Проблема |
|-----------|--------|----------|
| `pages/` | 12 | Некоторые гигантские: `admin.ts` ~58KB, `settings.ts` ~37KB, `experimental-bank-receipts.ts` ~52KB |
| `views/` | 10 | Разделены от связанных page/service |
| `services/` | 17 | Плоская папка, всё вперемешку |
| `components/` | 24 | Плоская папка (кроме кластера `receipt-*`) |
| `api/client.ts` | 1 | Монолит ~42KB — все эндпоинты в одном файле |
| `types/index.ts` | 1 | Монолит ~15KB — все типы в одном файле |

**Ключевая боль:** файлы одной фичи разбросаны по 5 разным папкам.
`notes.service.ts` + `NotesView.ts` + `notes.ts` + `notes-related components` → четыре разные директории.

---

## Plan: Feature-based реорганизация

### Backend — целевая структура `api/app/`

```
Services/
├── Auth/
│   └── AuthService.php
├── Transactions/
│   ├── TransactionService.php
│   └── CategorizationService.php
├── Budget/
│   ├── BudgetService.php
│   └── EnvelopeService.php
├── Analytics/
│   ├── AnalyticsService.php
│   ├── ForecastService.php
│   ├── RecommendationService.php
│   └── ReportService.php
├── Plans/
│   ├── PaymentService.php
│   ├── GoalService.php
│   └── SubscriptionDetectionService.php
├── Accounts/
│   ├── AccountService.php
│   └── DebtService.php
├── Categories/
│   └── CategoryService.php           ← seedForClient() переехал из модели
├── Notes/
│   ├── NoteService.php
│   ├── NoteFolderService.php
│   └── NoteAnalysisService.php
├── Calendar/
│   ├── CalendarService.php
│   └── CalendarParserService.php
├── Notifications/
│   ├── PushService.php
│   ├── PushPreferencesService.php
│   ├── TelegramBotService.php
│   └── TelegramParserService.php
├── Banking/
│   ├── ExchangeRateService.php
│   └── EmailParseService.php
├── Tax/
│   └── TaxService.php
├── Ai/
│   ├── AiProviderService.php
│   └── AiUsageService.php
├── System/
│   ├── BootstrapService.php
│   ├── DashboardService.php
│   ├── SearchService.php
│   └── HealthService.php
├── Settings/
│   └── SettingsService.php
├── Admin/               ← уже есть
│   ├── AdminUserService.php
│   └── CategorizationRuleStatsService.php
└── Experimental/        ← уже есть
    ├── ReceiptAnalysisService.php
    ├── ReceiptMatchingService.php
    ├── CsvReceiptParser.php
    ├── ImportRuleService.php
    └── ExternalApiLogger.php
```

```
Http/Controllers/Api/
├── Auth/
│   └── AuthController.php
├── Transactions/
│   ├── TransactionController.php
│   ├── TransactionTemplateController.php
│   └── BatchController.php
├── Budget/
│   ├── BudgetController.php
│   ├── CategoryBudgetController.php
│   └── EnvelopeController.php
├── Analytics/
│   ├── AnalyticsController.php
│   ├── DashboardController.php
│   ├── ForecastController.php
│   ├── HealthController.php
│   └── RecommendationController.php
├── Plans/
│   ├── PaymentController.php
│   └── GoalController.php
├── Accounts/
│   ├── AccountController.php
│   └── DebtController.php
├── Notes/
│   ├── NoteController.php
│   ├── NoteFolderController.php
│   └── NoteLabelController.php
├── Calendar/
│   └── CalendarController.php
├── Notifications/
│   └── PushSubscriptionController.php
├── Ai/
│   ├── AiUsageController.php
│   └── EmailParseController.php
├── Shared/
│   ├── SearchController.php
│   ├── BootstrapController.php
│   ├── ReportController.php
│   ├── TaxController.php
│   ├── SettingsController.php
│   ├── MeController.php
│   ├── MonthSummaryController.php
│   ├── CategoryController.php
│   ├── TagController.php
│   └── IncomeTypeController.php
├── Admin/               ← уже есть
└── Experimental/        ← уже есть
    └── BankReceiptController.php
```

```
Http/Requests/
├── Notes/
│   ├── StoreNoteRequest.php
│   ├── UpdateNoteRequest.php
│   ├── StoreNoteFolderRequest.php
│   ├── UpdateNoteFolderRequest.php
│   ├── StoreNoteLabelRequest.php
│   ├── UpdateNoteLabelRequest.php
│   ├── AppendNoteRequest.php
│   ├── FormatNoteRequest.php
│   └── SuggestNoteRequest.php
├── Transactions/
│   ├── StoreTransactionRequest.php
│   ├── StoreTagRequest.php
│   ├── StoreTransactionTemplateRequest.php
│   └── UpdateTransactionTemplateRequest.php
├── Goals/
│   ├── StoreGoalRequest.php
│   └── UpdateGoalRequest.php
├── Budget/
│   ├── StoreCategoryBudgetRequest.php
│   ├── StoreCategoryRequest.php
│   └── UpdateCategoryRequest.php
├── Calendar/
│   ├── StoreCalendarEventRequest.php
│   └── UpdateCalendarEventRequest.php
├── Payments/
│   ├── StorePaymentRequest.php
│   └── UpdatePaymentRequest.php
├── Accounts/
│   ├── StoreAccountRequest.php
│   ├── UpdateAccountRequest.php
│   └── SyncBalanceRequest.php
└── Shared/
    ├── LoginRequest.php
    ├── SearchRequest.php
    ├── StoreIncomeTypeRequest.php
    └── UpdateIncomeTypeRequest.php
```

**Models/ — оставить плоскими.** Eloquent-конвенция, автозагрузка, миграции ссылаются напрямую.

**Стоимость backend-рефакторинга:** умеренная. Laravel автолоадит по PSR-4 — достаточно переместить файлы и обновить `namespace` + `use`-импорты. PHPStan сразу покажет все сломанные зависимости.

---

### Frontend — целевая структура `web/src/`

```
features/
├── transactions/
│   ├── operations.ts              ← был pages/operations.ts
│   ├── OperationsView.ts          ← был views/OperationsView.ts
│   ├── transaction.service.ts     ← был services/transaction.service.ts
│   ├── types.ts                   ← Transaction, Tag из types/index.ts
│   ├── transaction-form.ts        ← был components/transaction-form.ts
│   ├── transaction-list.ts        ← был components/transaction-list.ts
│   └── transaction-item.ts        ← был templates/transaction-item.ts
├── budget/
│   ├── budget.ts
│   ├── BudgetView.ts
│   └── budget.service.ts
├── analytics/
│   ├── analytics.ts
│   ├── AnalyticsView.ts
│   └── analytics.service.ts
├── notes/
│   ├── notes.ts
│   ├── NotesView.ts
│   └── notes.service.ts
├── calendar/
│   ├── calendar.ts
│   ├── CalendarView.ts
│   ├── calendar.service.ts
│   ├── calendar-grid.ts           ← был components/calendar-grid.ts
│   ├── calendar-parser.ts
│   └── event-form.ts
├── plans/
│   ├── plans.ts
│   ├── PlansView.ts
│   ├── plans.service.ts
│   └── payment-form.ts            ← был components/payment-form.ts
├── receipts/                      ← experimental
│   ├── experimental-bank-receipts.ts
│   ├── BankReceiptsView.ts
│   ├── receipt-keyboard.ts
│   ├── receipt-split-editor.ts
│   ├── receipt-summary-modal.ts
│   ├── receipt-reconciliation.ts
│   ├── receipt-rules-manager.ts
│   └── receipt-import-history.ts
├── settings/
│   ├── settings.ts
│   ├── SettingsView.ts
│   └── settings.service.ts
└── dashboard/
    ├── dashboard.ts
    ├── DashboardView.ts
    └── dashboard.service.ts

shared/
├── components/                    ← только используемые в 2+ фичах
│   ├── modal.ts
│   ├── toast.ts
│   ├── sidebar.ts
│   ├── filter-bar.ts
│   ├── global-search.ts
│   ├── searchable-select.ts
│   ├── onboarding-wizard.ts
│   ├── offline-indicator.ts
│   ├── theme-toggle.ts
│   ├── hint.ts
│   └── picker.ts
├── services/                      ← cross-cutting сервисы
│   ├── offline.service.ts
│   ├── sync.service.ts
│   ├── websocket.service.ts
│   ├── tab-sync.service.ts
│   ├── push.service.ts
│   └── search.service.ts
└── utils/
    ├── dom.ts
    ├── format.ts
    ├── markdown.ts
    ├── shortcuts.ts
    ├── features.ts
    ├── label-colors.ts
    ├── textarea-format.ts
    └── pdf-to-images.ts

api/                               ← оставить как есть
├── client.ts
├── admin.ts
└── experimental.ts

store/index.ts                     ← оставить
types/index.ts                     ← оставить общие типы
pages/base.ts                      ← оставить
pages/admin.ts                     ← оставить (отдельное приложение)
app.ts                             ← оставить
main.ts                            ← оставить
```

**Правило:** всё специфичное для фичи — в папку фичи. В `shared/` только то, что используется двумя и более фичами.

---

## Миграция на React: стоит ли?

### Аргументы ЗА

| Боль сейчас | С React |
|-------------|---------|
| HTML как строки (`innerHTML = \`<div>...\``) | JSX с типами, нет строк |
| Ручной `render()` + pub/sub | Автоматическая реактивность |
| Сложные формы — много boilerplate (receipts, transaction со splits) | `react-hook-form` + zod |
| Notes + AI suggestions — реактивный state вручную | `useQuery` / `useMutation` |
| 6 receipt-компонентов — уже своя мини-экосистема | Нормальные React-компоненты |
| Templates как HTML-строки в TS | JSX |
| Нет UI-библиотеки | shadcn/ui, TailwindCSS |

### Аргументы ПРОТИВ (прямо сейчас)

- **Огромная стоимость:** ~50 файлов переписать — это 2-4 месяца без новых фич
- **Приложение активно развивается:** переписывание заморозит фичи
- **Текущая архитектура работает:** есть офлайн, push, Tab Sync, WebSocket — всё нужно переосмыслить
- **Архитектура Page → View → Component уже чистая** — проблема в структуре папок, не в языке

### Рекомендация

**Не делать полную миграцию сейчас.** Стратегия — **инкрементальная, через "island" подход:**

1. Сначала feature-based реструктуризация (1-2 дня, нулевой риск)
2. Новые Personal OS фичи (AI Chat, Journal, What-if симулятор) — сразу в React как отдельный entry point
3. Существующие страницы не трогать — мигрировать feature за feature по мере необходимости

Vite поддерживает несколько entry points. Можно добавить `personal.html` с React-приложением для Personal OS фич, не трогая `index.html` с vanilla TS.

**Исключение:** Notes и bank-receipts — уже сейчас кандидаты на React-компоненты. Можно добавить React только для них через `createRoot` на конкретных DOM-элементах — без переписывания всего остального.

**Когда переходить на полный React:** если нужен второй разработчик, или когда Personal OS фичи займут больше 50% кодовой базы.

---

## Приоритет работ

```
Шаг 1 [1-2ч, минимальный риск]
  Backend: создать подпапки в Services/, Controllers/Api/, Http/Requests/
  Обновить namespaces
  Прогнать: phpstan, pint → убедиться что всё зелёное

Шаг 2 [4-8ч, низкий риск]
  Frontend: создать features/ + shared/ структуру
  Переместить файлы, обновить @/-импорты
  Прогнать: tsc, npm run build → убедиться что всё зелёное

Шаг 3 [по мере надобности]
  Разбить api/client.ts на feature-specific API модули внутри features/
  (при переходе на React это произойдёт само собой)

Шаг 4 [долгосрочно]
  React entry point для Personal OS фич (AI Chat, Journal, What-if)
  Инкрементальная миграция старых страниц если возникнет необходимость
```
