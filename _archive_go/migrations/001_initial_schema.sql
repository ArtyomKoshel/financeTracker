-- +migrate Up
-- Начальная схема базы данных Finance Tracker

-- Транзакции (доходы и расходы)
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    original_amount REAL,
    currency TEXT DEFAULT 'BYN',
    type TEXT NOT NULL,
    category_id INTEGER,
    account_id INTEGER DEFAULT 1,
    recurring_payment_id INTEGER,
    description TEXT,
    month TEXT,
    is_validated INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Цели накоплений
CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    target_date TEXT NOT NULL,
    current_amount REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Настройки
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Плановые платежи
CREATE TABLE IF NOT EXISTS recurring_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    original_amount REAL,
    currency TEXT DEFAULT 'BYN',
    day_of_month INTEGER NOT NULL,
    category TEXT DEFAULT 'essential',
    category_id INTEGER,
    is_variable INTEGER DEFAULT 0,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- История оплаты плановых платежей
CREATE TABLE IF NOT EXISTS payment_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id INTEGER NOT NULL,
    paid_date TEXT NOT NULL,
    amount REAL NOT NULL,
    month TEXT NOT NULL,
    FOREIGN KEY (payment_id) REFERENCES recurring_payments(id)
);

-- Счета
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    balance REAL DEFAULT 0,
    last_sync_date TEXT,
    last_sync_amount REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Категории расходов
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER,
    icon TEXT,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (parent_id) REFERENCES categories(id)
);

-- Бюджеты по месяцам
CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL UNIQUE,
    total_limit REAL,
    savings_target REAL,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Лимиты по категориям
CREATE TABLE IF NOT EXISTS budget_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    budget_id INTEGER NOT NULL,
    category_id INTEGER,
    amount_limit REAL NOT NULL,
    FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    UNIQUE(budget_id, category_id)
);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions(month);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_recurring ON transactions(recurring_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_month ON payment_history(month);
CREATE INDEX IF NOT EXISTS idx_payment_history_payment ON payment_history(payment_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_active ON recurring_payments(is_active);
CREATE INDEX IF NOT EXISTS idx_goals_active ON goals(is_active);
CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month);

-- +migrate Down
DROP TABLE IF EXISTS budget_categories;
DROP TABLE IF EXISTS budgets;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS payment_history;
DROP TABLE IF EXISTS recurring_payments;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS goals;
DROP TABLE IF EXISTS transactions;
