-- +migrate Up
-- История изменений настроек для корректной работы с историческими данными

CREATE TABLE IF NOT EXISTS settings_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    valid_from TEXT NOT NULL,
    valid_to TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_settings_history_key ON settings_history(key);
CREATE INDEX IF NOT EXISTS idx_settings_history_key_date ON settings_history(key, valid_from);

-- +migrate Down
DROP INDEX IF EXISTS idx_settings_history_key_date;
DROP INDEX IF EXISTS idx_settings_history_key;
DROP TABLE IF EXISTS settings_history;
