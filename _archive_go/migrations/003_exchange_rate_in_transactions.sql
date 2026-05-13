-- +migrate Up
-- Сохранение курса валюты на момент создания транзакции

ALTER TABLE transactions ADD COLUMN exchange_rate REAL;

-- +migrate Down
-- SQLite не поддерживает DROP COLUMN, пропускаем
