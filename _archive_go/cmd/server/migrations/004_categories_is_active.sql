-- +migrate Up
-- Добавляем soft delete для категорий

ALTER TABLE categories ADD COLUMN is_active INTEGER DEFAULT 1;

-- +migrate Down
-- SQLite не поддерживает DROP COLUMN
