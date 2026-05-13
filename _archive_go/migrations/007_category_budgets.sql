-- +migrate Up
-- Бюджеты по категориям на месяц
CREATE TABLE IF NOT EXISTS category_budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    limit_amount REAL NOT NULL,
    alert_percent REAL DEFAULT 80,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_id, month),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_category_budgets_month ON category_budgets(month);
CREATE INDEX IF NOT EXISTS idx_category_budgets_category ON category_budgets(category_id);

-- +migrate Down
DROP TABLE IF EXISTS category_budgets;
