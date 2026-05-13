# Finance Tracker — Текущий план разработки

> Единый активный план. Выполненные задачи переносятся в `IMPLEMENTED.md`, с датой — в `CHANGELOG.md`.
> Обновлено: 2026-03-04 (выполнены Спринты 1-12)

---

## ✅ ВЫПОЛНЕНО — Спринты 1-12 (2026-03-03)

> Подробности в `IMPLEMENTED.md` и `CHANGELOG.md [0.4.0]`

- **Спринт 1** (#1-3): Валидация файла, санитизация дат, маршруты личных правил
- **Спринт 2** (#4-8): `is_global`, приоритет правил, Admin UI кнопка «Понизить»
- **Спринт 3** (#9-12): Admin BankReceipt stats, AI-метрики, топ маппингов, UI-секция «Чеки»
- **Спринт 4** (#13-19): Пагинация, фильтры дат/action, debounce поиск, modal деталей, CSV экспорт, автообновление
- **Спринт 5** (#20-23, 25-26): Hash tab-router, sticky thead, сортировка клиентов, горячие клавиши, localStorage
- **Спринт 6** (#27-30): Onboarding wizard, Dashboard тренды, прогресс-бары (уже были), debounce (уже был)
- **Спринт 7** (#31-32): Теги для транзакций (many-to-many, фильтр, badge), бюджетные шаблоны (copy to next month)
- **Спринт 8** (#41-45): ExperimentalFeature enum расширен, config/ai.php, AiProviderService per-user, Admin UI модули + AI radio, advanced_analytics guard
- **Спринт 9** (#33, #35, #37): PDF-отчёты (print HTML), Auto-savings правило (% от дохода → копилка), OpenAPI/Postman коллекция
- **Спринт 10** (#36, #40): Налоговый помощник УСН/самозанятые, Recurring auto-debit (подтверждено — было реализовано ранее)
- **Спринт 11** (#38): Импорт из XLSX — SheetJS CDN, конвертация в CSV, интеграция в существующий pipeline
- **Спринт 12** (#39): Email-парсинг через AI (вставь текст письма → транзакции) (выполнено)

---

## 🏗️ Архитектура двух продуктов

Система развивается в двух направлениях, разделённых через `ExperimentalFeature` + `isEnabled()`:

```
┌─────────────────────────────────────────────────────┐
│               PERSONAL OS (для владельца)           │
│                                                     │
│  📊 Finance      📔 Journal     🗓️ Life Calendar    │
│  - всё что есть  - дневник       - события + цели   │
│  - AI-чат        - рефлексия     - milestones       │
│  - поведение     - настроение    - привычки         │
│                                                     │
│  🤖 AI Assistant — связывает всё                   │
│  «почему грустно? → смотрит траты + записи + сон»  │
└─────────────────────────────────────────────────────┘
         ↓ subset (feature flags)
┌─────────────────────────────────────────────────────┐
│           FINANCE TRACKER (для клиентов)            │
│                                                     │
│  📊 Finance only                                    │
│  - транзакции, бюджет, цели                        │
│  - AI импорт чеков                                 │
│  - аналитика                                       │
│  НЕТ: дневник, личные записи, трекер привычек      │
└─────────────────────────────────────────────────────┘
```

**Механизм:** `ExperimentalFeature` enum + `user_experimental_features` таблица.
Для включения Personal OS-фич владельцу — добавить записи через Admin UI или напрямую в БД.

### Новые константы для ExperimentalFeature (добавлять по мере реализации)

| Константа | Значение | Уровень |
|-----------|----------|---------|
| `AI_CHAT` | `ai_chat` | Personal OS |
| `JOURNAL` | `journal` | Personal OS |
| `HABITS` | `habits` | Personal OS |
| `LIFE_GOALS` | `life_goals` | Personal OS |
| `MOOD_TRACKING` | `mood_tracking` | Personal OS |
| `AI_CHAT_LITE` | `ai_chat_lite` | Оба продукта |
| `BEHAVIORAL_ANALYTICS` | `behavioral_analytics` | Оба продукта |
| `WHAT_IF_SIMULATOR` | `what_if_simulator` | Оба продукта |
| `SMART_NOTIFICATIONS` | `smart_notifications` | Оба продукта |
| `VOICE_INPUT` | `voice_input` | Оба продукта |

---

## 📦 BACKLOG — Новые задачи

---

### 🔴 TIER 0 — Улучшение существующих слабых фич

Эти фичи реализованы, но работают плохо. Приоритет высокий — они уже в продакшне.

#### #46 Health Score — объяснения и динамика
**Файл:** `api/app/Services/HealthService.php`

**Проблема:** Возвращает число 0-100 без объяснений и без динамики.
**Сейчас:** «здоровье: 67» — и всё.
**Нужно:**
- Разбивка по факторам: `{ score: 67, delta: -8, factors: [{ name: "Превышен лимит в 3 категориях", impact: -8 }, ...] }`
- Динамика за 30 дней: `history: [{ date, score }]`
- Backend: `HealthService` возвращает массив `factors[]` + `delta` (изменение за 30 дней)
- Frontend: Dashboard widget — трендовый график + список факторов с impact

#### #47 Goals — нарратив и история
**Проблема:** Цели — только числа и прогресс-бар. Нет контекста «зачем».
**Нужно:**
- Новые поля в таблице `goals`: `description` (text), `motivation` (text), `emoji` (varchar)
- Milestones: таблица `goal_milestones` (goal_id, title, target_amount, reached_at)
- Frontend: карточка цели показывает motivation + milestone timeline
- При создании цели — опциональный prompt «что значит для тебя эта цель?»

#### #48 Recommendations — контекстный движок
**Файл:** `api/app/Services/RecommendationService.php`

**Проблема:** Простые правила-шаблоны, не персонализированные.
**Сейчас:** «У вас перерасход по категории Кафе»
**Нужно:**
- Паттерны по времени: «Вы обычно тратите больше в конце месяца — рассмотрите лимит на импульсивные покупки»
- Контекст из истории: сравнение с предыдущими N месяцами
- Конкретные цифры: «В пятницу вечером вы тратите в среднем на 45 BYN больше»
- Подключить `BehavioralAnalyticsService` (см. #52) как источник данных

#### #49 Forecast — сценарии и confidence interval
**Файл:** `api/app/Services/ForecastService.php`

**Проблема:** UI показывает один детерминистический прогноз.
**Нужно:**
- Три сценария: `pessimistic` (−20% доходов, +10% расходов), `base`, `optimistic` (+10% доходов, −10% расходов)
- Confidence interval: диапазон на графике (затенённая область)
- Backend: `ForecastService::getForecastWithScenarios()` → `{ base, pessimistic, optimistic }`
- Frontend: переключатель сценариев на графике прогноза

---

### 🟡 TIER 1 — Personal OS (только для владельца, guard: `personal_os`)

Фичи включаются через `ExperimentalFeature` для конкретного аккаунта. По умолчанию выключены для всех.

#### #50 AI Financial Chat (модуль `ai_chat`)
**Guard:** `experimental:ai_chat`

**Backend:**
- `POST /api/ai/chat` — принимает `{ question, context_window? }`
- `AiChatService` — собирает контекст (последние N транзакций, цели, баланс, категории)
- Function calling через Groq Llama: `getTransactions`, `getGoals`, `getForecast`, `getCategoryStats`
- История чата: таблица `ai_chat_messages` (user_id, role, content, context_snapshot, created_at)
- `GET /api/ai/chat/history` — последние 50 сообщений
- `DELETE /api/ai/chat/history` — очистить историю

**Frontend:**
- Floating chat bubble (кнопка в правом нижнем углу, доступна на всех страницах)
- Или отдельная страница `/chat` в навигации
- Примеры запросов: «Сколько я потратил на кофе в феврале?», «Когда закрою долг?», «Что срезать чтобы накопить быстрее?»

#### #51 Journal / Дневник (модуль `journal`)
**Guard:** `experimental:journal`

Отдельный модуль от Notes (Notes — рабочий инструмент, Journal — личное).

**Backend:**
- Таблица `journal_entries`: id, client_id, content (text/markdown), mood (enum: great/good/neutral/bad/awful), energy_level (1-5), tags (jsonb), linked_transaction_ids (jsonb), linked_goal_id, created_at
- `JournalService` — CRUD, AI-рефлексия, поиск по FTS
- `POST /api/journal` — создать запись
- `GET /api/journal` — список (с фильтром по дате, mood, тегу)
- `GET /api/journal/:id` — детали
- `PUT /api/journal/:id` — обновить
- `DELETE /api/journal/:id` — удалить
- `POST /api/journal/weekly-reflection` — AI суммаризирует записи + финансы за неделю → возвращает текст
- `POST /api/journal/export` — экспорт в ZIP с .md файлами

**Frontend:**
- Страница `/journal` — timeline записей с mood emoji
- Редактор: markdown + mood selector + energy level + теги
- Связь с транзакциями: выбрать транзакцию при создании записи
- Weekly reflection виджет на Dashboard (только Personal OS)

#### #52 Поведенческая аналитика (модуль `behavioral_analytics`)
**Guard:** `experimental:behavioral_analytics`

**Backend:**
- `BehavioralAnalyticsService`:
  - Паттерны по дню недели: средние траты по каждому дню
  - Паттерны по числу месяца: «день зарплаты эффект», риск перерасхода в конце месяца
  - Паттерны по времени суток (если есть время в транзакциях)
  - Корреляции: категория × день недели
- `GET /api/analytics/behavioral` → `{ weekday_patterns, monthly_patterns, top_correlations, insights[] }`
- Инсайты в виде текста: «По пятницам вы тратите на 40% больше среднего»
- Использовать как источник данных для `RecommendationService` (#48)

**Frontend:**
- Новая вкладка «Поведение» в разделе Аналитика
- Heatmap: день недели × категория
- График «Паттерн месяца» — траты по дням числа

#### #53 Трекер привычек (модуль `habits`)
**Guard:** `experimental:habits`

**Backend:**
- Таблица `habits`: id, client_id, name, icon, target_days_per_week, color, is_financial (bool), linked_category_id, created_at
- Таблица `habit_completions`: id, habit_id, completed_date
- `HabitService` — CRUD, streak calculation, корреляция с финансами
- `GET /api/habits` — список с текущим streak
- `POST /api/habits/:id/complete` — отметить выполненной за сегодня
- `GET /api/habits/:id/stats` — статистика + корреляция с тратами

**Корреляция с финансами:**
- `HabitService::getFinancialCorrelation(habitId)` — сравнивает траты в дни выполнения привычки vs невыполнения
- Инсайт: «В дни когда ты занимаешься спортом, тратишь на 30% меньше»

**Frontend:**
- Виджет на Dashboard: список привычек + streak + чекбокс «сегодня»
- Страница `/habits` — детальная статистика, календарь выполнений
- Корреляционный инсайт в карточке привычки

#### #54 Life Goals / Расширение целей (модуль `life_goals`)
**Guard:** `experimental:life_goals`

**Backend:**
- Новый тип в Goals: поле `type` (enum: `financial` / `life`)
- Life goal дополнительные поля: `motivation` (text), `emoji` (varchar), `deadline_flexibility` (enum: strict/flexible/no_deadline)
- Таблица `goal_milestones`: id, goal_id, title, description, target_value, reached_at
- Life цели не влияют на баланс, могут быть связаны с Journal записями

#### #55 Mood + Finance корреляция (модуль `mood_tracking`)
**Guard:** `experimental:mood_tracking`

**Backend:**
- Опциональное поле `mood` (enum: great/good/neutral/bad/awful) при создании транзакции
- `MoodAnalyticsService::getCorrelation()` — средние траты по каждому mood
- `GET /api/analytics/mood-correlation` → `{ mood_spending: { great: 120, bad: 340, ... }, insight: "Вы тратите на 40% больше когда настроение 😔" }`

**Frontend:**
- При создании транзакции — опциональный emoji-выбор настроения (5 вариантов, можно пропустить)
- Dashboard widget: mood chart vs spending (только Personal OS)
- Инсайт в разделе Аналитика

---

### 🟢 TIER 2 — Улучшения для обоих продуктов

#### #56 What-if симулятор (модуль `what_if_simulator`)
**Guard:** `experimental:what_if_simulator`

Интерактивный симулятор поверх `ForecastService`.

**Backend:**
- `POST /api/forecast/what-if` — принимает `{ income_delta, expense_delta, savings_delta, months }` → возвращает изменённый прогноз
- Параметры: относительные (процент) или абсолютные (сумма)
- Расчёт «на сколько месяцев раньше/позже достигну цели» при изменении параметров
- Реиспользует `ForecastService::buildForecast()` с подменёнными параметрами

**Frontend:**
- Страница или modal «Симулятор»
- Слайдеры: Доход ±50%, Расходы ±50%, Накопления ±200%
- Интерактивный график — пересчитывается при движении слайдера (debounce 300ms)
- Дельта: «При таких параметрах: цель "Отпуск" достигается на 3 месяца раньше»
- Кнопка «Сохранить сценарий» (опционально, localStorage)

#### #57 Smart Notifications / Insights (модуль `smart_notifications`)
**Guard:** `experimental:smart_notifications`

**Backend:**
- `AiInsightService::generateWeeklyDigest(userId)` — суммаризирует неделю через AI
- Формат дайджеста: `{ spent_total, spent_delta_pct, top_categories[], anomalies[], positive_note }`
- `POST /api/notifications/weekly-digest` → отправляет через существующий push или Telegram
- Аномалии в реальном времени: при создании транзакции `TransactionService` проверяет `AnomalyDetectionService::check()` → если транзакция > 2σ от среднего — возвращает `anomaly_warning` в ответе
- Планировщик: `artisan notifications:send-weekly-digest` — запускать по cron каждое воскресенье

**Frontend:**
- Инсайт-блок на Dashboard: «На этой неделе потрачено 340 BYN, −12% vs прошлая»
- Уведомление при создании аномальной транзакции: «Эта трата в 2× больше вашего среднего по Кафе»

#### #58 Finance ↔ Notes связь
**Guard:** без guard, улучшение существующего Notes модуля

**Backend:**
- Новые поля в `notes`: `linked_transaction_ids` (jsonb), `linked_goal_id` (int, FK)
- `PUT /api/notes/:id` уже есть — добавить новые поля в `UpdateNoteRequest`
- `GET /api/transactions/:id` → добавить `linked_notes[]` в ответ (через reverse lookup)
- `POST /api/notes/from-transaction/:transactionId` — создать заметку с prefill из транзакции

**Frontend:**
- В карточке транзакции — кнопка «Добавить заметку» → открывает Note editor с linked_transaction_id
- В редакторе заметки — раздел «Связанные транзакции» (выбор из последних 20)
- В аналитике заметок: «В апреле ты писал про стресс — траты выросли на 30%» (если Notes включены)

#### #59 Notes — Action Items виджет
**Guard:** без guard (работает при включённом `notes`)

**Backend:** action_items уже извлекаются AI. Нужно:
- `GET /api/notes/action-items` — все незакрытые action_items из всех заметок пользователя
- `POST /api/notes/:id/action-items/:index/complete` — пометить конкретный action item выполненным (обновляет поле в note)

**Frontend:**
- Виджет «Задачи из заметок» на Dashboard (если `notes` включены)
- Список с checkbox-ами, группировка по заметке, ссылка на заметку
- Отдельная вкладка в разделе Notes

#### #60 Notes — Шаблоны заметок
**Guard:** без guard (работает при включённом `notes`)

Захардкодить 5 шаблонов на фронтенде (backend не нужен):

| Шаблон | Содержимое |
|--------|-----------|
| 📅 Еженедельный обзор | Как прошла неделя, ключевые события, финансовые итоги, планы |
| 💰 Финансовая рефлексия | Крупная покупка — стоило ли?, что изменил бы, вывод |
| 🎯 Прогресс по цели | Текущий прогресс, что сделал, следующий шаг |
| 📔 Свободный дневник | Пустой шаблон с заголовком-датой |
| 🔍 Анализ месяца | Доходы/расходы ощущения, 3 хорошего, 1 улучшить |

**Frontend:** При создании заметки — опциональный шаг «Выбрать шаблон» (можно пропустить).

#### #61 Notes — AI-чат по заметкам
**Guard:** `experimental:notes` (расширение)

**Backend:**
- `POST /api/notes/chat` — принимает `{ question }`, ищет релевантные заметки через FTS, передаёт топ-5 в контекст AI, возвращает ответ + `sources[]` (id заметок)
- Переиспользует существующий AI провайдер из `AiProviderService`
- Примеры: «Что я писал про карьеру в этом году?», «Суммаризируй мой март», «Найди все заметки про [цель]»

**Frontend:**
- Поле поиска/чата в шапке раздела Notes: «Спросить AI о заметках»
- Ответ отображается над списком заметок с ссылками на источники

#### #62 Notes — Экспорт в Markdown
**Guard:** без guard (работает при включённом `notes`)

**Backend:**
- `GET /api/notes/export?format=markdown` — ZIP архив с .md файлами
- Имена файлов: `YYYY-MM-DD-{slug-title}.md`
- Метаданные в front matter: date, tags, labels

#### #63 Voice Input (модуль `voice_input`)
**Guard:** `experimental:voice_input`

**Backend:** Без изменений — существующий `POST /api/bank-receipts` уже принимает текст.
Или новый `POST /api/transactions/from-voice` — принимает `{ transcript }` → парсит через AI → возвращает prefilled транзакцию (не сохраняет, пользователь подтверждает).

**Frontend:**
- Кнопка микрофона в форме создания транзакции
- Web Speech API (`SpeechRecognition`) для записи
- Fallback: textarea для ввода текста от голоса
- После распознавания → отправить транскрипт → AI заполняет форму
- Примеры: «Кофе 4.50», «Зарплата 2800», «Продукты на неделю 120»

#### #64 Weekly Push Digest для Journal
**Guard:** `experimental:journal` + push подписка

**Backend:**
- Artisan command `notifications:journal-weekly-prompt` — каждое воскресенье 20:00
- Push уведомление: «Как прошла неделя? Добавь запись» с deeplink `/journal?new=1`
- Переиспользует существующую push инфраструктуру

---

## ❌ Не делаем

- **Виджеты PWA Android** (#34) — требует нативного Android Widget API, вне scope web-приложения
- **Семейный / multi-user бюджет** — не нужен по требованиям
- **Геолокация трат** — маленькая ценность, высокая сложность
- **Инвестиционный портфель** — отдельный продукт, вне scope
- **Wiki-ссылки между заметками** (`[[Заметка]]`) — высокая сложность парсера, низкий приоритет

---

## Порядок выполнения (рекомендуемый)

```
Спринт 13: #46, #49     Health Score объяснения + Forecast сценарии (исправление слабых фич)
Спринт 14: #47, #48     Goals нарратив + Recommendations контекстный движок
Спринт 15: #52, #56     Поведенческая аналитика + What-if симулятор (связаны)
Спринт 16: #58, #59, #60  Finance↔Notes связь + Action Items + Шаблоны (без новых feature flags)
Спринт 17: #57          Smart Notifications / Insights + Anomaly detection
Спринт 18: #50          AI Financial Chat (крупная фича, только Personal OS)
Спринт 19: #51          Journal / Дневник (только Personal OS)
Спринт 20: #53, #54     Трекер привычек + Life Goals (только Personal OS)
Спринт 21: #55, #63     Mood tracking + Voice Input
Спринт 22: #61, #62, #64  Notes AI-чат + Экспорт + Weekly Push
```

### Приоритет для «только мой аккаунт»

Чтобы включить Personal OS фичи для конкретного аккаунта — добавить в `user_experimental_features`:

```sql
-- Включить Personal OS для user_id = 1 (владелец)
INSERT INTO user_experimental_features (client_id, feature_code)
VALUES
  (1, 'ai_chat'),
  (1, 'journal'),
  (1, 'habits'),
  (1, 'life_goals'),
  (1, 'mood_tracking');
```

Или через Admin UI → Клиенты → Модули (когда константы добавлены в `ExperimentalFeature::all()`).
