-- Создание таблицы пользователей для мультитенантности
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);

-- Создаём дефолтного клиента для существующих данных
INSERT INTO users (id, email, password_hash, name) 
VALUES (1, 'default@local', '', 'Default Client');
