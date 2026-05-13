-- +migrate Up
-- Добавляем флаг recurring для автоповторения бюджетов

ALTER TABLE category_budgets ADD COLUMN is_recurring INTEGER DEFAULT 0;

-- +migrate Down
-- SQLite не поддерживает DROP COLUMN напрямую
