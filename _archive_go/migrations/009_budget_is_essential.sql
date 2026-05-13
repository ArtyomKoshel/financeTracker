-- +migrate Up
-- Добавляем флаг "базовые расходы" для бюджетов категорий

ALTER TABLE category_budgets ADD COLUMN is_essential INTEGER DEFAULT 0;

-- +migrate Down
-- SQLite не поддерживает DROP COLUMN напрямую
