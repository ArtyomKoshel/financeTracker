package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"finance-tracker/internal/domain"
)

// SettingsRepository реализация репозитория настроек для SQLite
type SettingsRepository struct {
	db *DB
}

// NewSettingsRepository создаёт новый репозиторий настроек
func NewSettingsRepository(db *DB) *SettingsRepository {
	return &SettingsRepository{db: db}
}

// Get получает значение настройки
func (r *SettingsRepository) Get(ctx context.Context, key string) (string, error) {
	var value string
	err := r.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, key).Scan(&value)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", fmt.Errorf("query setting: %w", err)
	}
	return value, nil
}

// Set устанавливает значение настройки
func (r *SettingsRepository) Set(ctx context.Context, key, value string) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
		key, value,
	)
	if err != nil {
		return fmt.Errorf("set setting: %w", err)
	}
	return nil
}

// GetAll получает все настройки
func (r *SettingsRepository) GetAll(ctx context.Context) (map[string]string, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT key, value FROM settings`)
	if err != nil {
		return nil, fmt.Errorf("query settings: %w", err)
	}
	defer rows.Close()

	result := make(map[string]string)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, fmt.Errorf("scan setting: %w", err)
		}
		result[key] = value
	}

	return result, nil
}

// SetWithHistory устанавливает настройку с сохранением истории
func (r *SettingsRepository) SetWithHistory(ctx context.Context, key, value string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback()

	now := time.Now().Format("2006-01-02")

	// Закрываем предыдущую запись
	_, err = tx.ExecContext(ctx, `
		UPDATE settings_history 
		SET valid_to = ? 
		WHERE key = ? AND valid_to IS NULL
	`, now, key)
	if err != nil {
		return fmt.Errorf("close previous history: %w", err)
	}

	// Добавляем новую запись в историю
	_, err = tx.ExecContext(ctx, `
		INSERT INTO settings_history (key, value, valid_from) 
		VALUES (?, ?, ?)
	`, key, value, now)
	if err != nil {
		return fmt.Errorf("insert history: %w", err)
	}

	// Обновляем текущее значение
	_, err = tx.ExecContext(ctx, `
		INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
	`, key, value)
	if err != nil {
		return fmt.Errorf("update current value: %w", err)
	}

	return tx.Commit()
}

// GetAtDate возвращает значение настройки на определённую дату
func (r *SettingsRepository) GetAtDate(ctx context.Context, key string, date time.Time) (string, error) {
	dateStr := date.Format("2006-01-02")

	var value string
	err := r.db.QueryRowContext(ctx, `
		SELECT value FROM settings_history 
		WHERE key = ? 
		AND valid_from <= ? 
		AND (valid_to IS NULL OR valid_to > ?)
		ORDER BY valid_from DESC 
		LIMIT 1
	`, key, dateStr, dateStr).Scan(&value)

	if err == sql.ErrNoRows {
		return r.Get(ctx, key)
	}
	if err != nil {
		return "", fmt.Errorf("query setting at date: %w", err)
	}

	return value, nil
}

// GetHistory возвращает историю изменений настройки
func (r *SettingsRepository) GetHistory(ctx context.Context, key string) ([]domain.SettingHistory, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, key, value, valid_from, valid_to, created_at 
		FROM settings_history 
		WHERE key = ? 
		ORDER BY valid_from DESC
	`, key)
	if err != nil {
		return nil, fmt.Errorf("query history: %w", err)
	}
	defer rows.Close()

	var history []domain.SettingHistory
	for rows.Next() {
		var h domain.SettingHistory
		var validTo, createdAt sql.NullString
		err := rows.Scan(&h.ID, &h.Key, &h.Value, &h.ValidFrom, &validTo, &createdAt)
		if err != nil {
			return nil, fmt.Errorf("scan history: %w", err)
		}
		if validTo.Valid {
			h.ValidTo = &validTo.String
		}
		if createdAt.Valid {
			h.CreatedAt = createdAt.String
		}
		history = append(history, h)
	}

	return history, nil
}

// GetSalaryConfig получает конфигурацию зарплаты
func (r *SettingsRepository) GetSalaryConfig(ctx context.Context) (*domain.SalaryConfig, error) {
	config := &domain.SalaryConfig{}

	getValue := func(key string) float64 {
		val, _ := r.Get(ctx, key)
		var f float64
		fmt.Sscanf(val, "%f", &f)
		return f
	}

	config.GrossSalary = getValue("gross_salary")
	config.ExpectedAdvance = getValue("expected_advance")
	config.TolerancePercent = getValue("tolerance")

	return config, nil
}

// GetPaydayConfig получает настройки дней выплат
func (r *SettingsRepository) GetPaydayConfig(ctx context.Context) (*domain.PaydayConfig, error) {
	config := &domain.PaydayConfig{}

	getValue := func(key string) int {
		val, _ := r.Get(ctx, key)
		var i int
		fmt.Sscanf(val, "%d", &i)
		return i
	}

	config.AdvanceDay = getValue("advance_day")
	config.SalaryDay = getValue("salary_day")

	return config, nil
}

// GetSettings получает все настройки как структуру
func (r *SettingsRepository) GetSettings(ctx context.Context) (*domain.Settings, error) {
	settings := &domain.Settings{}

	salaryConfig, err := r.GetSalaryConfig(ctx)
	if err != nil {
		return nil, err
	}
	settings.SalaryConfig = *salaryConfig

	paydayConfig, err := r.GetPaydayConfig(ctx)
	if err != nil {
		return nil, err
	}
	settings.PaydayConfig = *paydayConfig

	getValue := func(key string) float64 {
		val, _ := r.Get(ctx, key)
		var f float64
		fmt.Sscanf(val, "%f", &f)
		return f
	}

	settings.MinLivingBudget = getValue("min_living_budget")
	settings.SavingsPercent = getValue("savings_percent")

	return settings, nil
}

// MigrateToHistory переносит текущие настройки в историю
func (r *SettingsRepository) MigrateToHistory(ctx context.Context) error {
	keys := []string{"gross_salary", "expected_advance", "rub_rate", "eur_rate", "usd_rate", "min_living_budget"}

	for _, key := range keys {
		value, err := r.Get(ctx, key)
		if err != nil || value == "" {
			continue
		}

		var count int
		r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM settings_history WHERE key = ?`, key).Scan(&count)
		if count > 0 {
			continue
		}

		_, err = r.db.ExecContext(ctx, `
			INSERT INTO settings_history (key, value, valid_from) 
			VALUES (?, ?, ?)
		`, key, value, "2024-01-01")
		if err != nil {
			return fmt.Errorf("migrate setting %s: %w", key, err)
		}
	}

	return nil
}
