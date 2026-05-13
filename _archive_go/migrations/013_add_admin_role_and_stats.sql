-- Добавление роли админа и полей статистики
ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN last_activity_at TEXT;

-- Назначаем admin@local админом
UPDATE users SET is_admin = 1 WHERE email = 'admin@local';
