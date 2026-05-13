-- Установка паролей для учётных записей по умолчанию
-- Клиент (существующие данные): default@local / client123
-- Админ: admin@local / admin123

-- Обновляем пароль клиента по умолчанию
UPDATE users SET password_hash = '186474c1f2c2f735a54c2cf82ee8e87f2a5cd30940e280029363fecedfc5328c' WHERE id = 1;

-- Создаём админ-аккаунт (если ещё не существует)
INSERT INTO users (email, password_hash, name, is_active, created_at)
SELECT 'admin@local', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'Admin', 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@local');
