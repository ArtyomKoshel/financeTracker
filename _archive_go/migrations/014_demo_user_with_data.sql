-- +migrate Up
-- Демо-пользователь с данными за ~2 года (на основе структуры существующего клиента)
-- Логин: demo@local / demo123

-- 1. Создаём демо-пользователя
INSERT INTO users (email, password_hash, name, is_active, is_admin, created_at)
SELECT 'demo@local', 'd3ad9315b7be5dd53b31a273b3b3aba5defe700808305aa16a3062b76658a791', 'Демо', 1, 0, datetime('now', '-2 years')
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'demo@local');

-- 2. Счёт для демо
INSERT INTO accounts (name, balance, client_id)
SELECT 'Основной счёт', 0, id FROM users u
WHERE u.email = 'demo@local'
AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.client_id = u.id);

-- 3. Настройки для демо (копируем от client_id=1 или создаём дефолтные)
INSERT OR IGNORE INTO settings (client_id, key, value)
SELECT u.id, 'gross_salary', '320000' FROM users u WHERE u.email = 'demo@local'
UNION ALL SELECT u.id, 'expected_advance', '160650' FROM users u WHERE u.email = 'demo@local'
UNION ALL SELECT u.id, 'ndfl_rate', '0.15' FROM users u WHERE u.email = 'demo@local'
UNION ALL SELECT u.id, 'base_currency', 'BYN' FROM users u WHERE u.email = 'demo@local'
UNION ALL SELECT u.id, 'rub_rate', '0.034' FROM users u WHERE u.email = 'demo@local'
UNION ALL SELECT u.id, 'eur_rate', '3.55' FROM users u WHERE u.email = 'demo@local'
UNION ALL SELECT u.id, 'usd_rate', '3.25' FROM users u WHERE u.email = 'demo@local'
UNION ALL SELECT u.id, 'min_living_budget', '1500' FROM users u WHERE u.email = 'demo@local'
UNION ALL SELECT u.id, 'savings_percent', '20' FROM users u WHERE u.email = 'demo@local';

-- 4. Категории для демо (создаём базовый набор, если нет от client 1)
INSERT INTO categories (name, parent_id, icon, color, sort_order, is_active, client_id)
SELECT c.name, NULL, c.icon, c.color, c.sort_order, 1, u.id
FROM (SELECT 'Еда' as name, '🍕' as icon, '#FF6B6B' as color, 0 as sort_order
  UNION SELECT 'Жильё', '🏠', '#4ECDC4', 10
  UNION SELECT 'Транспорт', '🚗', '#45B7D1', 20
  UNION SELECT 'Связь', '📱', '#96CEB4', 30
  UNION SELECT 'Развлечения', '🎮', '#DDA0DD', 40
  UNION SELECT 'Другое', '📦', '#C0C0C0', 50) c, users u
WHERE u.email = 'demo@local'
AND NOT EXISTS (SELECT 1 FROM categories cat WHERE cat.client_id = u.id AND cat.parent_id IS NULL);

-- Подкатегории Еда для демо
INSERT INTO categories (name, parent_id, icon, color, sort_order, is_active, client_id)
SELECT 'Продукты', p.id, '🛒', p.color, 1, 1, p.client_id
FROM categories p JOIN users u ON p.client_id = u.id
WHERE u.email = 'demo@local' AND p.name = 'Еда' AND p.parent_id IS NULL;

-- 5. Генерируем транзакции за ~2 года
-- Используем SQLite для генерации (рекурсивный CTE или серия INSERT)
-- Простой подход: создаём транзакции помесячно

-- Для демо: зарплата ~3200 BYN, расходы ~2000-2500 BYN, накопления ~300-500 BYN
-- Берём category_id из категорий демо-пользователя

-- Создаём временную таблицу с датами за 24 месяца
WITH RECURSIVE months AS (
  SELECT 1 as m
  UNION ALL
  SELECT m + 1 FROM months WHERE m < 24
),
demo_meta AS (
  SELECT 
    u.id as client_id,
    (SELECT id FROM accounts WHERE client_id = u.id LIMIT 1) as account_id,
    (SELECT id FROM categories WHERE client_id = u.id AND parent_id IS NULL AND name = 'Еда' LIMIT 1) as cat_food,
    (SELECT id FROM categories WHERE client_id = u.id AND parent_id IS NULL AND name = 'Транспорт' LIMIT 1) as cat_transport,
    (SELECT id FROM categories WHERE client_id = u.id AND parent_id IS NULL AND name = 'Жильё' LIMIT 1) as cat_housing,
    (SELECT id FROM categories WHERE client_id = u.id AND parent_id IS NULL AND name = 'Связь' LIMIT 1) as cat_phone,
    (SELECT id FROM categories WHERE client_id = u.id AND parent_id IS NULL AND name = 'Развлечения' LIMIT 1) as cat_fun,
    (SELECT id FROM categories WHERE client_id = u.id AND parent_id IS NULL AND name = 'Другое' LIMIT 1) as cat_other
  FROM users u WHERE u.email = 'demo@local'
)
INSERT INTO transactions (client_id, date, amount, original_amount, currency, exchange_rate, type, category_id, account_id, description, month, is_validated)
SELECT 
  d.client_id,
  date('now', '-' || (24 - m) || ' months', '+' || (m % 28 + 1) || ' days'),
  1600 + (m % 5) * 50,
  1600 + (m % 5) * 50,
  'BYN',
  NULL,
  'advance',
  NULL,
  d.account_id,
  'Аванс',
  strftime('%Y-%m', date('now', '-' || (24 - m) || ' months')),
  1
FROM months, demo_meta d
WHERE d.account_id IS NOT NULL;

-- Зарплата (расчёт) ~15 числа
WITH RECURSIVE months AS (
  SELECT 1 as m UNION ALL SELECT m + 1 FROM months WHERE m < 24
),
demo_meta AS (
  SELECT u.id as client_id, (SELECT id FROM accounts WHERE client_id = u.id LIMIT 1) as account_id
  FROM users u WHERE u.email = 'demo@local'
)
INSERT INTO transactions (client_id, date, amount, original_amount, currency, exchange_rate, type, category_id, account_id, description, month, is_validated)
SELECT 
  d.client_id,
  date('now', '-' || (24 - m) || ' months', '+15 days'),
  1600 + (m % 3) * 100,
  1600 + (m % 3) * 100,
  'BYN',
  NULL,
  'salary',
  NULL,
  d.account_id,
  'Зарплата',
  strftime('%Y-%m', date('now', '-' || (24 - m) || ' months')),
  1
FROM months, demo_meta d
WHERE d.account_id IS NOT NULL;

-- Расходы на еду (4 раза в месяц)
WITH RECURSIVE months AS (
  SELECT 1 as m UNION ALL SELECT m + 1 FROM months WHERE m < 24
),
demo_meta AS (
  SELECT u.id as client_id, (SELECT id FROM accounts WHERE client_id = u.id LIMIT 1) as account_id,
    (SELECT id FROM categories WHERE client_id = u.id AND parent_id IS NULL AND name = 'Еда' LIMIT 1) as cat_id
  FROM users u WHERE u.email = 'demo@local'
)
INSERT INTO transactions (client_id, date, amount, original_amount, currency, exchange_rate, type, category_id, account_id, description, month, is_validated)
SELECT 
  d.client_id,
  date('now', '-' || (24 - m) || ' months', '+' || (dow * 7 + 3) || ' days'),
  120 + (m * 11 + dow) % 80,
  120 + (m * 11 + dow) % 80,
  'BYN',
  NULL,
  'expense',
  d.cat_id,
  d.account_id,
  'Продукты',
  strftime('%Y-%m', date('now', '-' || (24 - m) || ' months')),
  0
FROM months, demo_meta d,
     (SELECT 0 as dow UNION SELECT 1 UNION SELECT 2 UNION SELECT 3) days
WHERE d.account_id IS NOT NULL AND d.cat_id IS NOT NULL;

-- Накопления (копилка) ~500 BYN в месяц
WITH RECURSIVE months AS (
  SELECT 1 as m UNION ALL SELECT m + 1 FROM months WHERE m < 24
),
demo_meta AS (
  SELECT u.id as client_id, (SELECT id FROM accounts WHERE client_id = u.id LIMIT 1) as account_id
  FROM users u WHERE u.email = 'demo@local'
)
INSERT INTO transactions (client_id, date, amount, original_amount, currency, exchange_rate, type, category_id, account_id, description, month, is_validated)
SELECT 
  d.client_id,
  date('now', '-' || (24 - m) || ' months', '+25 days'),
  400 + (m % 6) * 50,
  400 + (m % 6) * 50,
  'BYN',
  NULL,
  'savings',
  NULL,
  d.account_id,
  'В копилку',
  strftime('%Y-%m', date('now', '-' || (24 - m) || ' months')),
  0
FROM months, demo_meta d
WHERE d.account_id IS NOT NULL;

-- Расходы на транспорт
WITH RECURSIVE months AS (
  SELECT 1 as m UNION ALL SELECT m + 1 FROM months WHERE m < 24
),
demo_meta AS (
  SELECT u.id as client_id, (SELECT id FROM accounts WHERE client_id = u.id LIMIT 1) as account_id,
    (SELECT id FROM categories WHERE client_id = u.id AND parent_id IS NULL AND name = 'Транспорт' LIMIT 1) as cat_id
  FROM users u WHERE u.email = 'demo@local'
)
INSERT INTO transactions (client_id, date, amount, original_amount, currency, exchange_rate, type, category_id, account_id, description, month, is_validated)
SELECT 
  d.client_id,
  date('now', '-' || (24 - m) || ' months', '+' || (dow * 4 + 2) || ' days'),
  15 + (m + dow) % 25,
  15 + (m + dow) % 25,
  'BYN',
  NULL,
  'expense',
  d.cat_id,
  d.account_id,
  'Транспорт',
  strftime('%Y-%m', date('now', '-' || (24 - m) || ' months')),
  0
FROM months, demo_meta d,
     (SELECT 0 as dow UNION SELECT 1 UNION SELECT 2) days
WHERE d.account_id IS NOT NULL AND d.cat_id IS NOT NULL;

-- 6. Цель накоплений для демо
INSERT INTO goals (name, target_amount, target_date, current_amount, is_active, client_id)
SELECT 'Накопить на отпуск', 5000, date('now', '+1 year'), 4800, 1, u.id FROM users u
WHERE u.email = 'demo@local'
AND NOT EXISTS (SELECT 1 FROM goals g WHERE g.client_id = u.id);

-- 7. Плановый платёж (интернет)
INSERT INTO recurring_payments (client_id, name, amount, original_amount, currency, day_of_month, category, is_active)
SELECT u.id, 'Интернет', 45, 45, 'BYN', 5, 'essential', 1 FROM users u
WHERE u.email = 'demo@local'
AND NOT EXISTS (SELECT 1 FROM recurring_payments rp WHERE rp.client_id = u.id AND rp.name = 'Интернет');

-- 8. Обновляем баланс счёта демо
UPDATE accounts SET balance = (
  SELECT COALESCE(SUM(
    CASE 
      WHEN type IN ('advance', 'salary', 'bonus', 'early_pay', 'year_bonus', 'vacation', 'other') AND amount > 0 THEN amount
      WHEN type IN ('expense', 'savings') THEN -ABS(amount)
      ELSE amount
    END
  ), 0) FROM transactions WHERE client_id = accounts.client_id
)
WHERE client_id = (SELECT id FROM users WHERE email = 'demo@local');

-- +migrate Down
-- Удаление демо-пользователя и его данных
DELETE FROM transactions WHERE client_id = (SELECT id FROM users WHERE email = 'demo@local');
DELETE FROM category_budgets WHERE client_id = (SELECT id FROM users WHERE email = 'demo@local');
DELETE FROM recurring_payments WHERE client_id = (SELECT id FROM users WHERE email = 'demo@local');
DELETE FROM goals WHERE client_id = (SELECT id FROM users WHERE email = 'demo@local');
DELETE FROM settings WHERE client_id = (SELECT id FROM users WHERE email = 'demo@local');
DELETE FROM settings_history WHERE client_id = (SELECT id FROM users WHERE email = 'demo@local');
DELETE FROM categories WHERE client_id = (SELECT id FROM users WHERE email = 'demo@local');
DELETE FROM accounts WHERE client_id = (SELECT id FROM users WHERE email = 'demo@local');
DELETE FROM users WHERE email = 'demo@local';
