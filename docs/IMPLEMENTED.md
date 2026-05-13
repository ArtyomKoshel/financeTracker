# Finance Tracker — Реализованные фичи

> Архив выполненных задач. Сюда переносятся пункты из `PLAN.md` после завершения.
> Актуальные задачи — в `PLAN.md`. История релизов — в `CHANGELOG.md`.
> Обновлено: 2026-03-03

---

## BankReceipt — Backend

### BankReceiptController
- `DB::transaction()` вокруг apply — атомарность создания транзакций
- `AccountService` вместо прямого `$account->increment()` — правильный учёт баланса
- `TransactionService` через конструктор — нормализованное создание транзакций
- `Schema::hasTable()` и `Account::defaultIdForClient()` вынесены за цикл — производительность
- История импортов: модель `BankReceiptImport`, методы `getImports`, `deleteImport`
- Дедупликация по SHA-256 хешу файла — предупреждение при повторном импорте
- Флаг `user_confirmed` для маппингов — маппинги сохраняются только при подтверждении
- Выбор счёта (`account_id`) при apply
- Split-транзакции — разбивка одной операции по нескольким категориям
- Связь с `recurring_payment_id` — привязка транзакции к плановому платежу
- Rules CRUD: `getRules`, `storeRule`, `updateRule`, `deleteRule`
- `getMappings` возвращает expense и income маппинги
- `previewSummary` с бюджетными предупреждениями (budget warnings)
- `match_stats` в ответе preview — статистика по типам сопоставления
- Детекция truncation (`finish_reason === 'length'`) + предупреждение пользователю
- `file_hash` / `filename` в apply — для записи в историю импортов
- Мультивалютность: `currency`, `original_amount`, `exchange_rate` при apply
- `CategorizationRuleStat` — запись статистики принятий при confidence=rule

### ReceiptMatchingService
- Rules engine (шаг 0) — наивысший приоритет перед остальными проверками
- `findExistingTransaction` — поиск дублей по сумме/дате/мерчанту
- `batchLearned` — обучение в рамках одного документа (те же мерчанты)
- ERIP-детекция — особый режим для ЭРИП-платежей без маппинга
- `findMapping` — поиск по таблице `bank_receipt_mappings` (exact match)
- `findIncomeMapping` — поиск по `bank_receipt_income_mappings`
- `findCategoryByMerchantName` — поиск по транзакциям за 12 месяцев по описанию
- `findIncomeTypeFromSimilarTransaction` — определение типа дохода по истории
- `findCategoryFromSimilarTransaction` — определение категории по истории расходов
- Fuzzy matching для маппингов (порог 0.7) — fallback при несовпадении точного ключа
- `suggested_category` из AI — используется как последний fallback перед manual
- `guessCategory` / default — последний шаг при полном отсутствии данных
- `attachRecurringPayment` — предложение связи с плановым платежом
- Нормализация имени мерчанта: lowercase, strip punctuation

### ReceiptAnalysisService
- `max_tokens` поднят до 4096
- Детекция `finish_reason === 'length'` — флаг `truncated`
- `suggested_category` в промпте — AI предлагает категорию
- Исключение внутренних переводов из промпта
- Retry-логика при HTTP 429 с парсингом `Retry-After` заголовка
- `ExternalApiLogger` — логирование всех запросов к внешним API

### CsvReceiptParser
- Парсинг CSV-выписок: автодетекция колонок (дата, сумма, описание)
- Поддержка UTF-8 и Windows-1251
- Детекция разделителей (`,`, `;`, `\t`)
- Возвращает структуру транзакций совместимую с ReceiptMatchingService

### Модели
- `BankReceiptImport` — история импортов с глобальным scope по client_id
- `BankReceiptMapping` — expense маппинги мерчант→категория
- `BankReceiptIncomeMapping` — income маппинги мерчант→income_type
- `CategorizationRule` — правила импорта с is_auto, priority, times_applied
- `CategorizationRuleStat` — статистика принятий правил

---

## BankReceipt — Frontend

### experimental-bank-receipts.ts (страница)
- Все страницы PDF отправляются одним запросом (не в цикле)
- Фильтры: новые / уже внесено / расходы / доходы / без категории
- Группировка по дате и по мерчанту с коллапсом групп
- Авто-коллапс раздела "уже внесено" при первой загрузке
- Редактирование суммы прямо в preview
- `userChangedRows` → флаг `user_confirmed` при apply
- Выбор счёта через `<select>`
- `scrollToNextUncategorized` — быстрый переход к следующей транзакции без категории
- Session state — сохранение/восстановление состояния при смене вкладки
- Propagation — применение категории ко всем одинаковым мерчантам
- `pagesCount` — передача при apply для истории импортов
- Debug mode через `localStorage.DEBUG_BANK_RECEIPTS`

### Компоненты
- `receipt-import-history.ts` — история импортов с удалением
- `receipt-rules-manager.ts` — CRUD правил категоризации
- `receipt-split-editor.ts` — разбивка транзакции по категориям
- `receipt-summary-modal.ts` — итоги перед apply с бюджетными предупреждениями
- `receipt-reconciliation.ts` — сверка баланса с банковской выпиской
- `receipt-keyboard.ts` — горячие клавиши (1-9 категории, Space, Enter, N, A)

### API (experimental.ts)
- `bankReceiptPreview` — preview из изображений/PDF (multipage support)
- `bankReceiptPreviewCsv` — preview из CSV файла
- `bankReceiptApply` — применение с meta (filename, file_hash, pages_count)
- `bankReceiptPreviewSummary` — итоги + бюджетные предупреждения
- `getBankReceiptMappings` — expense + income маппинги
- `getBankReceiptImports` — история импортов
- `deleteBankReceiptImport` — удаление импорта с транзакциями
- `getImportRules` / `createImportRule` / `updateImportRule` / `deleteImportRule`

---

## Десктоп Layout

- Sidebar (240px) + main content — двухколоночный layout на ≥768px
- `applyDesktopLayout()` для всех страниц (Dashboard, Operations, Analytics, Budget, Plans, Settings)
- Вызов `applyDesktopLayout` при смене таба и при resize
- Sticky header + фиксированный sidebar

---

## Calendar (experimental:calendar)

- Backend: `CalendarEvent`, `CalendarService`, `CalendarController`, `CalendarParserService`
- GET/POST/PUT/DELETE `/api/calendar`, POST `/api/calendar/parse`
- Frontend страница `calendar.ts` с `CalendarPage extends BasePage`
- Компоненты: `calendar-grid.ts`, `event-form.ts`, `calendar-parser.ts`
- `CalendarView.ts` с `applyDesktopLayout()`
- Интеграция с `RecurringPayments` — плановые платежи в сетке календаря
- AI-парсинг текста в события (NLP rules: даты, времена, периодичность)
- Таб `calendar` показывается только при `isEnabled('calendar')`

---

## Заметки (experimental:notes)

- Backend: `Note`, `NoteFolder`, `NoteLabel`, `NoteAnalysisService`, `NoteService`
- Full-text search через PostgreSQL `tsvector` + GIN индекс
- AI-суммаризация (Groq / правила), action items
- Frontend: `notes.ts`, `NotesView.ts`
- Папки, метки, поиск, создание/редактирование/удаление
- Оптимистичные обновления с откатом при ошибке

---

## Аналитика и дашборд

- `AnalyticsService` — расходы по категориям, YoY, аномалии, тренды
- `HealthService` — health score 0-100, новые метрики: `debt_to_income`, `total_debt`, `net_worth`
- `ForecastService` — прогноз на 3 месяца, сезонные паттерны (премии март/декабрь, отпуск июль/август)
- `RecommendationService` — AI-рекомендации: цели отстают, лимиты превышаются, неиспользуемые подписки 3+ мес
- `DashboardService` — bootstrap endpoint, кэш categories/rates (15 мин)
- History net worth (`NetWorthSnapshot`)
- Сравнение двух месяцев (YoY аналитика)

---

## Планирование и бюджет

- `RecurringPayment` — плановые платежи, подписки с `cancel_by_date`, детекция подписок
- `BudgetService` — месячный бюджет, лимиты по категориям, конверты, долги в cashflow
- Цели накоплений (`Goal`) — прогресс-трекер, план по месяцам
- Конверты (`Envelope`) — выделенная сумма на цель в месяц, авто-синхронизация `spent`
- Долги (`Debt`) — CRUD, план погашения, `debt_to_income`
- Прогноз денежного потока (`ForecastService`)
- Управление подписками (`SubscriptionDetectionService`)

---

## Транзакции и операции

- CRUD транзакций (доход, расход, перевод, накопление)
- Мультисчета (карты, банковские счета)
- Мультивалюта: BYN, RUB, EUR, USD, GBP, PLN с конвертацией
- Шаблоны транзакций (быстрый ввод)
- Split по категориям
- Массовые операции (удаление, смена категории)
- Автокатегоризация (`CategorizationService`, `suggest-category`, обучение)
- Экспорт в CSV
- Сверка баланса
- Глобальный поиск (Ctrl+K) — `SearchService`, `global-search.ts`
- Пагинация списка транзакций

---

## Настройки и система

- Настройка зарплаты (оклад, аванс, даты)
- Курсы валют (ручное + автообновление)
- CRUD категорий с подкатегориями
- CRUD типов доходов (`IncomeType`)
- Push-уведомления (VAPID, preferences) — `PushService`
- WebSocket real-time синхронизация — Laravel Reverb, private channel per-user
- Оптимистичные обновления с откатом при ошибке
- PWA (service worker, manifest)
- Dark/Light mode — `theme-toggle.ts`, `data-theme` на body, сохранение в localStorage + API settings
- Горячие клавиши: Ctrl+K (поиск), Ctrl+N (новая транзакция), Esc

---

## Telegram-бот

- `TelegramBotService` — polling, привязка по коду подтверждения
- Добавление транзакций через текст ("кофе 5")
- Запрос баланса
- Push-уведомления через Telegram

---

## Backend инфраструктура

- Laravel 11, PHP 8.4, JWT (`firebase/php-jwt`)
- Bcrypt хеширование паролей с автоматическим rehash при логине
- Rate limiting: 5/мин логин, 30/мин мутации, 60/мин admin, 180/мин общий
- Audit middleware — логирование всех POST/PUT/DELETE в `audit_logs`
- Composite индексы для analytics-запросов (`client_id + month`, `client_id + category_id + month`)
- Redis для кэша и сессий (persistent, LRU eviction, 256MB)
- Foreign key constraints на все связи
- `DB::transaction()` для атомарных операций
- PHPStan level 5, Laravel Pint (PSR-12)
- PHPUnit 11 тесты

---

## Frontend инфраструктура

- Vite 5, TypeScript strict, vanilla (без фреймворков)
- `api/client.ts` — HTTP клиент с JWT, Batch API
- `store/` — глобальный store (categories, rates, balance, features)
- `BasePage` — базовый класс страниц с `init()`, `load()`, `onActivate()`, `onDeactivate()`
- Skeleton loaders вместо пустых состояний
- WebSocket (Reverb + Laravel Echo) — real-time между вкладками
- Bootstrap endpoint — один запрос при старте
- `modal.ts` — унифицированные диалоги
- `toast.ts` — уведомления
- TypeScript strict, Vitest 1 тесты

---

## Админ-панель (текущий функционал)

- Dashboard: 6 метрик (total_users, active_users, total_transactions, active_7d, new_30d, total_balance)
- Графики: рост пользователей и транзакций по месяцам (до 24 мес)
- Управление клиентами: CRUD, поиск, фильтр по статусу, экспорт CSV, сортировка по столбцам
- Impersonation — вход под клиентом через `AdminService.impersonate()`
- Управление экспериментальными функциями (bank_receipt_import, notes, calendar)
- Push-рассылки — отправка всем / конкретному пользователю, кампании с расписанием
- Правила категоризации — CRUD, статистика applied/accepted%, кандидаты; кнопка «Понизить до предложения» для правил < 60%
- Hash-router — табы с URL hash, восстановление активного таба при обновлении страницы
- Горячие клавиши: `Ctrl+1-8` (переключение табов), `Ctrl+R` (обновить активный лог), `Ctrl+F` (фокус поиска)
- Sticky thead для всех таблиц
- Сохранение активного таба и per_page в localStorage

---

## Спринт 1 — Мелкие критичные баги (2026-03-03)

- **Валидация файла** — `BankReceiptPreviewRequest.php`: лимит 10 MB/файл, 50 MB суммарно; FE: проверка с toast-ошибкой
- **Санитизация даты** — `BankReceiptController::apply()`: пропуск строк с датой > завтра или < 2 лет назад (Carbon)
- **Маршруты правил пользователя** — `GET/POST/PUT/DELETE /experimental/bank-receipts/rules` в `api.php`; методы `getRules`, `storeRule`, `updateRule`, `deleteRule` в `BankReceiptController`

---

## Спринт 2 — Глобальная система правил (2026-03-03)

- **`is_global` в `categorization_rules`** — миграция `2026_03_03_000005_add_is_global_to_categorization_rules.php`; поле + cast в `CategorizationRule` модели; существующие правила без `client_id` помечены `is_global=true`
- **Приоритет правил** — `ImportRuleService::getRules()`: личные правила (`client_id`) перед глобальными (`is_global=true`)
- **Admin UI кнопка «Понизить»** — для правил с `accuracy < 60%`: кнопка в таблице правил, `PUT /api/admin/categorization-rules/{id}` с `is_auto=false`

---

## Спринт 3 — Admin: статистика BankReceipt (2026-03-03)

- **`GET /api/admin/bank-receipt-stats`** — импорты за 30/90 дней, транзакции, активные пользователи, топ-5 по использованию
- **`GET /api/admin/ai-metrics`** — из `external_api_logs`: total/success/errors, avg/max duration_ms, success_rate, breakdown по сервисам
- **`GET /api/admin/top-mappings`** — топ мерчантов по всем пользователям, кол-во вариантов категорий
- **Admin UI «📥 Импорт чеков»** — новая секция: карточки метрик, AI-метрики (summary + таблица по сервисам), топ маппингов мерчантов

---

## Спринт 4 — Admin: улучшение логов (2026-03-03)

- **Пагинация** — `page` + `per_page` (25/50/100) для activity logs и external-api-logs; ответ включает `meta.total/page/last_page`
- **Фильтры по дате** — `date_from` / `date_to` для обоих типов логов
- **Фильтр по типу действия** — `action` параметр + dropdown с уникальными action-значениями (populateд из API)
- **Живой поиск** — debounce 300 мс по action/IP/UA/details в activity logs
- **Модальное окно деталей** — клик на строку → полный JSON в `<pre>` через `modal.alert()`
- **Метрики API-логов** — карточки над таблицей: запросов/24ч, успешность, ошибки, avg duration
- **Экспорт CSV** — кнопки «Экспорт CSV» для activity logs и external-api-logs; использует `downloadCsv()` helper
- **Автообновление** — select 30с / 1мин / выкл; интервал сбрасывается при смене значения; сохраняется в localStorage

---

## Спринт 12 — Backlog: Email-парсинг (2026-03-03)

- **Email-парсинг** (#39) — вместо IMAP-поллинга реализован практичный подход «вставь текст письма → AI-парсинг»: `EmailParseService::parseEmailText()` вызывает AI (поддерживает groq/openai/anthropic через `AiProviderService`), возвращает массив `{date, amount, currency, description, type}`; маршрут `POST /api/email-parse`; `api.parseEmailText()` + тип `EmailParsedTransaction` в `types/index.ts`; панель «✉️ Парсинг письма банка (AI)» в табе Чеки (скрытая, collapsible); результат отвечает строками таблицы с датой, суммой, валютой, типом; `setupEmailParse()` в `experimental-bank-receipts.ts`

---

## Спринт 11 — Backlog: XLSX импорт (2026-03-03)

- **Импорт из XLSX** (#38) — SheetJS (`xlsx@0.18.5`) подключён через CDN в `index.html`; в `experimental-bank-receipts.ts::handleFiles()` добавлен блок обработки `.xlsx`/`.xls` до CSV-ветки: читает `ArrayBuffer`, конвертирует первый лист в CSV через `XLSX.utils.sheet_to_csv()`, передаёт в существующий `bankReceiptPreviewCsv()` pipeline; атрибут `accept` файлового инпута расширен (`.xlsx,.xls`); текст drop-zone обновлён («фото, PDF, CSV или XLSX»); guard на `window.XLSX` с friendly toast если CDN ещё не загрузился

---

## Спринт 10 — Backlog: Налоговый помощник, Auto-debit (2026-03-03)

- **Налоговый помощник** (#40) — `TaxController::summary()` принимает `date_from`/`date_to` (формат `Y-m`), суммирует все income-транзакции за период, возвращает `total_income`, `tax_usn` (6%), `tax_self_employed` (4%) и разбивку `by_month`; маршрут `GET /api/tax`; `api.getTaxSummary()` + тип `TaxSummary` / `TaxMonthEntry` в `types/index.ts`; карточка «🧾 Налоговый помощник» в табе Настройки с выбором периода, кнопкой «Рассчитать», итоговыми строками и таблицей по месяцам; логика в `settings.ts`: `setupTaxHelper()` + `calcTax()`
- **Recurring auto-debit** (#36) — обнаружено, что `AutoDebitSubscriptions` команда уже реализована и запланирована в `Kernel.php` (`dailyAt('07:00')`); создаёт expense-транзакцию для каждого `RecurringPayment` с `is_auto_debit=true` в день `day_of_month`; дублирование предотвращено проверкой существующей транзакции за месяц

---

## Спринт 12 — Backlog: Email-парсинг + улучшения (2026-03-03)

- **Email-парсинг** (#39) — `EmailParseService`: per-user AI provider (Groq/OpenAI/Anthropic), промпт для извлечения JSON, нормализация дат, фильтрация невалидных записей; `EmailParseController`: валидация текста (max 20 000 символов), проверка `isAvailable()`; маршрут `POST /api/email-parse`; `api.parseEmailText()` + тип `EmailParsedTransaction` в `types/index.ts`; панель в табе «Чеки» с textarea, кнопкой «Анализировать» и статусом; `AiUsageService::storeFromResponse()` трекает usage для обоих провайдеров (OpenAI-compatible и Anthropic)
- **Email parse «+ Создать»** — каждая найденная транзакция отображается карточкой с цветовой индикацией доход/расход и кнопкой прямого создания через `api.createTransaction({..., source: 'email_parse'})`; кнопка меняется на «✓» после успешного создания
- **XLSX-импорт** (#38) — SheetJS CDN загружается при активации страницы; drag-and-drop и file picker принимают `.xlsx`/`.xls`; `XLSX.read()` + `sheet_to_csv()` конвертируют первый лист → CSV → в существующий `bankReceiptPreviewCsv()` pipeline
- **CSV экспорт расширен** — `GET /api/transactions/export` переписан через `TransactionRepository::getPaginated` (до 5000 строк); поддерживает фильтры `month`, `year`, `type`, `search`, `source`, `tag`; добавлена колонка «Теги»; фронтенд `initExportButton()` передаёт все активные фильтры; `api.exportTransactionsCsv()` расширен; OpenAPI-спецификация обновлена
- **source tracking** — `source` добавлен в `StoreTransactionRequest` (whitelist: web/telegram/bank_receipt/email_parse/api); `TransactionController::store()` передаёт из validated; тип `createTransaction` в `client.ts` получил `source?`; `transaction-item.ts` показывает бадж 📧 для `email_parse`; filter-bar получил pill-кнопку «📧 Email» для фильтра по источнику
- **Filter-bar рефакторинг** — `sourceFilterActive: boolean` заменён на `activeSource: string`; добавлены два pill-фильтра (🧾 Из импорта / 📧 Email); клик по активной pill снимает фильтр; CSS `.filter-pill` / `.filter-pill.active` добавлены в `style.css`
- **TaxController** — валидация формата дат `date_from`/`date_to` (`regex:/^\d{4}-\d{2}$/`); замена хардкода типов на `TransactionType::NON_INCOME_TYPES + ['transfer']`
- **SettingsController lint** — `auth()->user()` заменён на `$request->user()` во всех методах
- **CSS lint** — добавлены стандартные `background-clip` и `line-clamp` рядом с `-webkit-` префиксными версиями

---

## Спринт 9 — Backlog: PDF, Auto-savings, OpenAPI (2026-03-03)

- **PDF-отчёты** — `ReportController::monthly()` генерирует print-friendly HTML (таблица операций + расходы по категориям + сводка); маршрут `GET /api/reports/monthly?month=2026-03`; `api.getMonthlyReportHtml()` fetch как blob + `window.open()`; кнопка «🖨 PDF» в заголовке страницы Аналитика (появляется после `init()`, защищена дублированием по id); отчёт имеет кнопку «Печать / PDF» для сохранения через `window.print()`
- **Auto-savings правило** — настройки `auto_savings_percent` и `auto_savings_goal_id` в key-value таблице `settings`; `SettingsService::getSetting()` generic getter; `TransactionService::maybeCreateAutoSavings()` вызывается после каждой income-транзакции (guard `_auto_savings` предотвращает рекурсию); поля в форме настроек (`index.html`) + `loadSettings` / `saveSettings` в `settings.ts`; тип `Settings` расширен в `types/index.ts`
- **Postman/OpenAPI коллекция** — `openapi.yaml` полностью переписан: 40+ эндпоинтов покрыты тегами Tags, Budgets, Analytics, Accounts, Debts, Envelopes, Health, Templates + Admin; создан `postman-collection.json` (Postman v2.1) с переменными `{{base_url}}` и `{{token}}`, всеми папками и примерами тел запросов

---

## Спринт 8 — Модульная система (2026-03-03)

- **ExperimentalFeature enum** — добавлены: `ADVANCED_ANALYTICS`, `AUTO_DEBIT`, `AUTO_SAVINGS`, `AI_ANALYSIS`, `AI_PROVIDER`; методы `all()` и `labels()` для перечисления всех кодов и названий
- **config/ai.php** — добавлены провайдеры `openai` (gpt-4o-mini) и `ollama` (localhost); все модели и URL через `env()`; `default_provider` читается из `AI_PROVIDER` env
- **AiProviderService per-user** — `getProviderForUser()` перебирает `ai_provider:*` feature-коды пользователя и возвращает первый поддерживаемый провайдер из `config/ai.providers`
- **Admin UI модули** — в модале клиента: чекбоксы `telegram_bot`, `advanced_analytics`, `auto_debit`, `auto_savings`, `ai_analysis`; radio-группа `AI-провайдер` (default/groq/openai/anthropic/ollama); `getSelectedAiProvider()` + `setAiProvider()` в `admin.ts`
- **advanced_analytics guard** — `MeController` автоматически добавляет `advanced_analytics` и `ai_analysis` в features для всех пользователей; `analytics.ts` оборачивает `loadForecast`, `loadAIRecommendations`, `loadVelocity`, `loadTopGrowth` в `isEnabled('advanced_analytics')`

---

## Спринт 7 — Теги и бюджетные шаблоны (2026-03-03)

- **Теги для транзакций** — миграция `tags` + `transaction_tag` (many-to-many); модели `Tag`, `Transaction::tags()`; `TagController` (CRUD + `syncTransaction`); маршруты `GET/POST /tags`, `DELETE /tags/{id}`, `POST /transactions/{id}/tags`; eager loading тегов в `TransactionRepository`; фильтр по тегу в `getPaginated`; `TransactionResource` с `whenLoaded('tags')`; `Transaction` тип с `tags?: Tag[]`; `filter-bar.ts` с `setTags()` и `tag` в `FilterValues`; отображение `tx-tag-badge` в списке и детальной панели; редактирование через `modal.prompt` в `OperationsPage`
- **Бюджетные шаблоны** — `CategoryBudgetController::copyToNextMonth()`: копирует все лимиты текущего месяца в следующий через `updateOrCreate`; маршрут `POST /budgets/copy`; `api.copyBudgetsToNextMonth(month)` в `client.ts`; кнопка «📋 Применить к следующему месяцу» в `BudgetView.renderCategoryBudgets`; `BudgetPage.copyBudgetsToNextMonth()` с подтверждением

---

## Спринт 6 — UX пользователя (2026-03-03)

- **Onboarding wizard** — `onboarding-wizard.ts`: 3-шаговый wizard (счёт → доход → готово); `shouldShowOnboarding(txCount, balance)` + `dismissOnboarding()` в localStorage; CSS overlay с анимацией; интегрирован в `DashboardPage.load()`
- **Dashboard тренды** — `DashboardPage.loadMonthComparison()`: загружает `compareMonths(prevMonth, currentMonth)` async (non-blocking); вычисляет `income_pct`, `expenses_pct`, `savings_pct`; передаёт в `renderMonthSummary` → `renderTrendBadge` → стрелки ↑↓% в карточках
- **Прогресс-бары** — уже реализованы в `BudgetView.ts` (`budget-progress-fill`, `goal-progress-fill`)
- **Debounce фильтров** — уже реализован в `filter-bar.ts` (300мс для поиска, мгновенно для dropdown)

---

## Спринт 5 — Admin: UX для десктопа (2026-03-03)

- **Tab-router** — `showTab(id)`, `history.pushState`, `popstate`, восстановление из hash и localStorage; active-класс на nav-ссылках
- **Sticky thead** — `position: sticky; top: 0; background: var(--bg-card); z-index: 1` для всех `.admin-table th`
- **Сортировка клиентов** — клик по заголовку: email/name/created_at/last_login_at/transaction_count/balance; стрелки ↑↓; `sortClients()` + `updateSortHeaders()`
- **Горячие клавиши** — `Ctrl+1-8` табы, `Ctrl+R` refresh активного лога, `Ctrl+F` фокус поиска
- **Сохранение фильтров** — `activityLogsPerPage` и `apiLogsPerPage` в localStorage (`saveFiltersToStorage` / `restoreFiltersFromStorage`)
