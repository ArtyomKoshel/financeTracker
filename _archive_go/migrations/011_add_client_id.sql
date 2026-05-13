-- Добавление client_id во все таблицы для изоляции данных по клиентам

-- Добавляем client_id в каждую таблицу с данными
ALTER TABLE transactions ADD COLUMN client_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE goals ADD COLUMN client_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN client_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings_history ADD COLUMN client_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE recurring_payments ADD COLUMN client_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE accounts ADD COLUMN client_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE categories ADD COLUMN client_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE category_budgets ADD COLUMN client_id INTEGER NOT NULL DEFAULT 1;

-- Индексы для производительности
CREATE INDEX idx_transactions_client ON transactions(client_id);
CREATE INDEX idx_goals_client ON goals(client_id);
CREATE INDEX idx_settings_client ON settings(client_id);
CREATE INDEX idx_recurring_payments_client ON recurring_payments(client_id);
CREATE INDEX idx_accounts_client ON accounts(client_id);
CREATE INDEX idx_categories_client ON categories(client_id);
CREATE INDEX idx_category_budgets_client ON category_budgets(client_id);

-- Обновляем UNIQUE constraints для settings (теперь key уникален только внутри client_id)
-- SQLite не поддерживает ALTER для constraints, создаём новую таблицу
CREATE TABLE settings_new (
    client_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (client_id, key),
    FOREIGN KEY (client_id) REFERENCES users(id)
);

INSERT INTO settings_new SELECT client_id, key, value FROM settings;
DROP TABLE settings;
ALTER TABLE settings_new RENAME TO settings;
