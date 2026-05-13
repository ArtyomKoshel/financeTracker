# Changelog

Все значимые изменения в проекте документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

---

## [0.3.0] — 2026-03

### Добавлено

#### BankReceipt — Backend
- **Rules engine** — `categorization_rules` применяются первыми (приоритет выше маппингов и AI); `is_auto` для тихого применения без подтверждения
- **`CategorizationRuleStat`** — запись статистики принятий/отклонений правил при каждом apply (rule_id, suggested_cat, final_cat, accepted)
- **Fuzzy matching маппингов** — fallback при несовпадении точного ключа: загрузка всех маппингов + `similarityScore()` с порогом 0.7
- **`suggested_category` из AI** — используется как последний fallback перед manual (fuzzy-match по названиям категорий пользователя)
- **`CsvReceiptParser`** — парсинг CSV-выписок: автодетекция колонок, разделителей; поддержка UTF-8 и Windows-1251
- **`previewCsv`** — отдельный endpoint для CSV без AI (`POST /api/experimental/bank-receipts/preview-csv`)
- **История импортов** — модель `BankReceiptImport`, методы `getImports` / `deleteImport` (с откатом транзакций и баланса)
- **SHA-256 дедупликация** — предупреждение при повторной загрузке того же файла
- **Флаг `user_confirmed`** — маппинги сохраняются только при явном подтверждении пользователем
- **Split-транзакции** — разбивка одной операции по нескольким категориям
- **`recurring_payment_id`** — привязка к плановому платежу при apply
- **`previewSummary`** — итоги + бюджетные предупреждения перед применением
- **Мультистраничность PDF** — все страницы отправляются одним запросом
- **Мультивалютность** — `currency`, `original_amount`, `exchange_rate` при apply; конвертация через `SettingsService`
- **`match_stats`** — статистика типов сопоставления в ответе preview
- **Retry-логика 429** — `ReceiptAnalysisService` парсит `Retry-After` и повторяет запрос
- **`ExternalApiLogger`** — логирование всех запросов к Groq/OpenAI с duration_ms и response meta

#### BankReceipt — Frontend
- **Фильтры** — новые / уже внесено / расходы / доходы / без категории
- **Группировка** — по дате и по мерчанту с коллапсом групп; авто-коллапс "уже внесено"
- **Propagation** — применение категории ко всем транзакциям с одинаковым мерчантом
- **Редактирование суммы** — inline редактирование в preview
- **Выбор счёта** — при apply можно указать конкретный счёт
- **`scrollToNextUncategorized`** — быстрая навигация к следующей не категоризированной транзакции
- **Компонент `receipt-import-history`** — история импортов с удалением
- **Компонент `receipt-rules-manager`** — CRUD правил категоризации
- **Компонент `receipt-split-editor`** — разбивка транзакции по категориям
- **Компонент `receipt-summary-modal`** — итоги + бюджетные предупреждения перед apply
- **Компонент `receipt-reconciliation`** — сверка баланса с банковской выпиской
- **Компонент `receipt-keyboard`** — горячие клавиши (1-9, Space, Enter, N, A)
- **Session state** — сохранение/восстановление состояния при смене вкладки

#### Календарь (experimental:calendar)
- Backend: `CalendarEvent`, `CalendarService`, `CalendarController`, `CalendarParserService`
- API: GET/POST/PUT/DELETE `/api/calendar`, POST `/api/calendar/parse`
- Frontend: `CalendarPage`, `CalendarView`, `calendar-grid`, `event-form`, `calendar-parser`
- Интеграция с `RecurringPayments` — плановые платежи отображаются в сетке
- AI-парсинг текста в события (NLP rules: даты, времена, периодичность)

#### Другое
- **Dark/Light mode** — `theme-toggle.ts`, `data-theme` на body, localStorage + API settings
- **Telegram-бот** — polling, привязка по коду, текстовые транзакции ("кофе 5"), баланс
- **Глобальный поиск** (Ctrl+K) — `SearchService`, `global-search.ts`
- **YoY аналитика** — сравнение с предыдущим годом по месяцам
- **Правила категоризации** в админке — CRUD, applied/accepted %, кандидаты из маппингов
- **Импонирование (Impersonate)** — вход под клиентом с сохранением admin-токена
- **Экспорт клиентов в CSV** из админки

### Исправлено
- `SIMILAR_MONTHS_AGO` поднят с 3 до 12 — зимние расходы теперь находят летние паттерны
- Убран `->where('description', '!=', '')` — больше не отсекает ручные транзакции без описания
- Дедупликация в ReceiptMatchingService — не теряет маппинги при batch-обработке

---

## [0.4.0] — 2026-03-03

### Добавлено

#### Спринт 1 — Мелкие критичные баги
- **Валидация файла** — лимит 10 MB/файл, 50 MB суммарно в `BankReceiptPreviewRequest` и FE с toast-ошибками
- **Санитизация даты** — `BankReceiptController::apply()` пропускает строки с датой вне диапазона [2 года назад, завтра]
- **Маршруты личных правил** — `GET/POST/PUT/DELETE /api/experimental/bank-receipts/rules` для пользователей

#### Спринт 2 — Глобальная система правил
- **`is_global`** — новое поле в `categorization_rules` с миграцией; существующие правила без `client_id` = `is_global=true`
- **Приоритет личных правил** — `ImportRuleService::getRules()` возвращает личные → глобальные
- **Admin кнопка «Понизить»** — для правил с точностью < 60%

#### Спринт 3 — Admin: статистика BankReceipt
- **`GET /api/admin/bank-receipt-stats`** — импорты 30/90d, транзакции, активные пользователи, топ-5
- **`GET /api/admin/ai-metrics`** — запросы, success rate, avg duration, breakdown по сервисам
- **`GET /api/admin/top-mappings`** — топ мерчантов, кол-во вариантов категорий
- **Секция «📥 Импорт чеков»** — новый таб в admin.html с метриками, AI-статистикой, топ маппингами

#### Спринт 4 — Admin: улучшение логов
- **Пагинация** — `page` + `per_page` для activity logs и external-api-logs (было `limit`)
- **Фильтры по дате** — `date_from` / `date_to`
- **Фильтр по action** — dropdown с уникальными типами действий
- **Живой поиск** — debounce 300мс по action/IP/UA/details
- **Модальное окно деталей** — клик на строку → полный JSON
- **Метрики API** — карточки: запросов/24ч, успешность, ошибки, avg duration
- **Экспорт CSV** — `downloadCsv()` helper, кнопки для обоих типов логов
- **Автообновление** — 30с / 1мин / выкл

#### Спринт 12 — Backlog: Email-парсинг + улучшения
- **Email-парсинг** (#39) — `POST /api/email-parse`; AI-парсинг текста письма; панель в табе Чеки; `EmailParseService` + per-user AI provider
- **Email parse «+ Создать»** — каждая найденная транзакция получает кнопку прямого создания через `api.createTransaction()`; цветовая индикация доход/расход; визуальное подтверждение (кнопка становится «✓»)
- **CSV экспорт улучшен** — `GET /api/transactions/export` теперь поддерживает фильтры `type`, `search`, `source`, `tag`, `year` (был только `month`/`from`/`to`); колонка «Теги» в CSV; фронтенд передаёт все активные фильтры при нажатии «Експорт»

#### Спринт 11 — Backlog: XLSX импорт
- **Импорт из XLSX** (#38) — SheetJS CDN; конвертация первого листа в CSV → существующий pipeline; accept расширен; drop-zone обновлён

#### Спринт 10 — Backlog: Налоговый помощник
- **Налоговый помощник** (#40) — `GET /api/tax`; УСН 6% / самозанятые 4%; разбивка по месяцам; карточка в настройках
- **#36 auto-debit** — подтверждено, что уже реализовано (`finance:auto-debit` в Kernel)

#### Спринт 9 — Backlog: PDF, Auto-savings, OpenAPI
- **PDF-отчёты** — `GET /api/reports/monthly`; print-friendly HTML; кнопка «🖨 PDF» в Аналитике; `api.getMonthlyReportHtml()` blob
- **Auto-savings** — настройки `auto_savings_percent` / `auto_savings_goal_id`; авто-транзакция после каждого дохода; UI в настройках
- **OpenAPI/Postman** — `openapi.yaml` полностью обновлён (40+ эндпоинтов); `postman-collection.json` Postman v2.1

#### Спринт 8 — Модульная система
- **ExperimentalFeature enum** — `ADVANCED_ANALYTICS`, `AUTO_DEBIT`, `AUTO_SAVINGS`, `AI_ANALYSIS`, `AI_PROVIDER` + `all()` / `labels()`
- **config/ai.php** — провайдеры `openai`, `ollama`; `AI_PROVIDER` env; env-переменные для моделей
- **AiProviderService** — per-user выбор провайдера через `ai_provider:<name>` feature-код
- **Admin UI** — чекбоксы новых модулей + radio AI-провайдер в модале клиента
- **advanced_analytics guard** — фичи по умолчанию в bootstrap; `isEnabled()` гард в `analytics.ts`

#### Спринт 7 — Теги и бюджетные шаблоны
- **Теги для транзакций** — `tags` + `transaction_tag` many-to-many; `TagController` CRUD + sync; фильтр по тегу в Operations; `tx-tag-badge` в списке и деталях
- **Бюджетные шаблоны** — `POST /budgets/copy`; кнопка «Применить к следующему месяцу» в разделе Бюджет

#### Спринт 6 — UX пользователя
- **Onboarding wizard** — 3-шаговый wizard (счёт → начальный баланс → первый доход → готово); показывается только новым пользователям (0 транзакций, 0 баланс); `dismissOnboarding()` в localStorage
- **Dashboard тренды ↑↓%** — `loadMonthComparison()` async-подгрузка сравнения с прошлым месяцем; стрелки в карточках доходов/расходов/накоплений
- **Прогресс-бары и debounce** — уже были реализованы ранее

#### Спринт 5 — Admin: UX для десктопа
- **Hash tab-router** — `showTab()`, `history.pushState`, `popstate`, восстановление из hash/localStorage
- **Sticky thead** — `position: sticky; top: 0` для всех `.admin-table th`
- **Сортировка клиентов** — клик по заголовкам email/имя/регистрация/вход/транзакций/баланс
- **Горячие клавиши** — `Ctrl+1-8` табы, `Ctrl+R` refresh, `Ctrl+F` фокус поиска
- **Сохранение фильтров** — per_page и активный таб в localStorage

---

## [Unreleased]

### Добавлено
- **Прогноз денежного потока** — GET /api/forecast?months=3 (баланс, доходы, расходы по месяцам)
- **Управление подписками** — is_subscription, cancel_by_date в RecurringPayment; GET /api/payments/subscription-reminders
- **Отслеживание долгов** — CRUD /api/debts (долги, погашение, план)
- **Конверты (Envelopes)** — CRUD /api/envelopes (разбивка бюджета по целям на месяц)
- **Мультивалютность** — поле currency в accounts (частично)
- **Push-подписки** — POST /api/push/subscribe, POST /api/push/unsubscribe (регистрация для Web Push)
- **AI-рекомендации** — GET /api/recommendations (рост расходов, концентрация по категориям, низкие накопления)
- **Рефакторинг API** — TransactionService, BootstrapService, AccountService, SettingsService; TransactionRepository расширен
- **API Resources** — PaymentResource, GoalResource для единообразного формата
- **Batch API** — POST /api/batch для объединения запросов
- **Документация** — docs/TECHNICAL.md (архитектура, потоки, оптимизация), docs/BUSINESS.md (глоссарий, сценарии)
- **Оптимистичные обновления UI** — транзакции, цели, плановые платежи: UI обновляется сразу, при ошибке API — откат
- **Мобильная навигация админки** — горизонтальное меню разделов (Сводка, Графики, Клиенты, Логи, API) на экранах <768px
- **API документация** — OpenAPI 3.0 (docs/openapi.yaml), Swagger UI на /api/docs
- **Логи активности** — входы в систему (user_id, IP, user_agent) в админке (API: `GET /api/admin/activity-logs`)
- **Графики в админке** — рост пользователей и транзакций по месяцам (API: `GET /api/admin/charts?months=6|12`)
- Календарь предстоящих платежей на вкладке «Планы» (API: `GET /api/payments/calendar`)
- Колонка «Баланс» в таблице клиентов админ-панели
- Fallback для admin API при загрузке админ-панели

### Исправлено
- **Безопасность**: SHA256 хеширование паролей → bcrypt с автоматическим rehash при логине
- **WebSocket**: публичный канал → private channel per-user (`user.{id}`) с JWT-авторизацией
- **БД**: добавлены foreign key constraints на все связи (cascadeOnDelete, nullOnDelete)
- **Division by zero**: исправлены расчёты в BudgetService, DashboardService, HealthService, RecommendationService
- **Атомарность**: переводы между счетами обёрнуты в DB::transaction
- **Валюта**: ForecastService конвертирует recurring payments в BYN
- **Hardcoded 30 дней**: BudgetService использует реальное количество дней месяца
- **Envelopes sync**: автоматическая синхронизация `spent` с фактическими транзакциями по категории
- Ошибка `api.adminDashboard is not a function` в админ-панели
- **Дизайн**: touch targets 44px (inputs, selects, btn-close), читаемость (font-size), контраст (text-muted), overflow (ellipsis), scroll (touch)
- **Админ на мобильных**: формы (full-width filters, font-size 16px в модалке), навигация (section nav), touch targets в header

### Улучшено
- **RecommendationService**: 3 новые проверки (цели отстают, лимиты регулярно превышаются, неиспользуемые подписки 3+ мес)
- **HealthService**: новые метрики (debt_to_income, total_debt, net_worth), влияние на health_score
- **Индексы**: добавлены композитные индексы для analytics-запросов (`client_id + month`, `client_id + category_id + month`)
- **Redis**: добавлен в docker-compose.yml для кэша и сессий (persistent, LRU eviction, maxmemory 256MB)
- **BudgetService**: интеграция долгов в cashflow — учитываются предстоящие платежи по долгам (monthly_payment, due_date)
- **ForecastService**: сезонные паттерны для прогноза (доходы: премии в марте/декабре; расходы: отпуск июль/август, новогодние покупки)
- **AnalyticsService**: детекция аномалий (стандартное отклонение 2σ для трат, по категориям), тренды (возрастающий/убывающий), инсайты (вариативность доходов, динамика накоплений)
- **Rate Limiting**: строгие лимиты для API (логин: 5/мин, мутации: 30/мин, admin: 60/мин, broadcasting: 20/мин, общий: 180/мин)
- **Audit Middleware**: логирование всех мутирующих операций (POST/PUT/DELETE) в таблицу audit_logs (user_id, IP, endpoint, payload, status, duration)

---

## [0.2.0] — 2026-02

### Добавлено
- **Bootstrap endpoint** — один запрос `/api/bootstrap` при старте приложения
- **Ленивая загрузка** — recommendations и health не блокируют первый рендер
- **Кэширование** — rates (1 ч), categories и income-types (15 мин)
- **Повторяющиеся транзакции** — плановые платежи, напоминания
- **Settings History** — история курсов валют на дату
- **SeedCategories** при создании клиента
- **Редактирование и удаление целей** (goals)
- **Лимиты по категориям** — предупреждение при приближении к лимиту
- **Пагинация** для списка транзакций
- **Rate limiting** для login (15 попыток/мин)
- **Skeleton loaders** вместо пустых блоков
- **Broadcast событий** — WebSocket для realtime обновлений
- **Валидация через Form Requests** (Login, Payment, Goal)
- **Унифицированная обработка ошибок API** (interceptor, Handler)
- **Метрики удержания** в админке (активные за 7 дней, новые за 30 дней)
- **Тёмная тема** — консистентные CSS-переменные

### Исправлено
- Баг impersonate: токен с `is_admin` целевого пользователя
- Health check для API в docker-compose

---

## [0.1.0] — 2025

### Добавлено
- Laravel 11 API + Vite SPA (React)
- Транзакции, категории, цели, плановые платежи
- Админ-панель с impersonate
- Docker-окружение (PostgreSQL, nginx, Reverb)
