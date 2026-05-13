package sqlite

import (
	"context"
	"database/sql"
	"fmt"

	"finance-tracker/internal/domain"
)

// AccountRepository реализация репозитория счетов для SQLite
type AccountRepository struct {
	db *DB
}

// NewAccountRepository создаёт новый репозиторий счетов
func NewAccountRepository(db *DB) *AccountRepository {
	return &AccountRepository{db: db}
}

// GetByID получает счёт по ID
func (r *AccountRepository) GetByID(ctx context.Context, id int64) (*domain.Account, error) {
	var a domain.Account
	var lastSyncDate sql.NullString
	var lastSyncAmount sql.NullFloat64

	err := r.db.QueryRowContext(ctx,
		`SELECT id, name, balance, last_sync_date, last_sync_amount FROM accounts WHERE id = ?`, id,
	).Scan(&a.ID, &a.Name, &a.Balance, &lastSyncDate, &lastSyncAmount)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("query account: %w", err)
	}

	if lastSyncDate.Valid {
		a.LastSyncDate = lastSyncDate.String
	}
	if lastSyncAmount.Valid {
		a.LastSyncAmount = lastSyncAmount.Float64
	}

	return &a, nil
}

// GetBalance получает баланс основного счёта
func (r *AccountRepository) GetBalance(ctx context.Context) (float64, error) {
	var balance float64
	err := r.db.QueryRowContext(ctx, `SELECT balance FROM accounts WHERE id = 1`).Scan(&balance)
	if err != nil {
		return 0, fmt.Errorf("query balance: %w", err)
	}
	return balance, nil
}

// UpdateBalance обновляет баланс на сумму
func (r *AccountRepository) UpdateBalance(ctx context.Context, id int64, delta float64) error {
	_, err := r.db.ExecContext(ctx, `UPDATE accounts SET balance = balance + ? WHERE id = ?`, delta, id)
	if err != nil {
		return fmt.Errorf("update balance: %w", err)
	}
	return nil
}

// SetBalance устанавливает конкретный баланс
func (r *AccountRepository) SetBalance(ctx context.Context, id int64, balance float64) error {
	_, err := r.db.ExecContext(ctx, `UPDATE accounts SET balance = ? WHERE id = ?`, balance, id)
	if err != nil {
		return fmt.Errorf("set balance: %w", err)
	}
	return nil
}

// SyncBalance сверяет баланс
func (r *AccountRepository) SyncBalance(ctx context.Context, id int64, actualBalance float64) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE accounts SET balance = ?, last_sync_date = date('now'), last_sync_amount = ? WHERE id = ?`,
		actualBalance, actualBalance, id,
	)
	if err != nil {
		return fmt.Errorf("sync balance: %w", err)
	}
	return nil
}

// UpdateSyncInfo обновляет только дату и сумму последней сверки (без изменения баланса)
func (r *AccountRepository) UpdateSyncInfo(ctx context.Context, id int64, syncAmount float64) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE accounts SET last_sync_date = date('now'), last_sync_amount = ? WHERE id = ?`,
		syncAmount, id,
	)
	if err != nil {
		return fmt.Errorf("update sync info: %w", err)
	}
	return nil
}

// RecalculateBalance пересчитывает баланс на основе транзакций
func (r *AccountRepository) RecalculateBalance(ctx context.Context) (float64, error) {
	var balance float64
	err := r.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(
			CASE 
				WHEN type IN ('advance', 'salary', 'bonus', 'early_pay', 'year_bonus', 'vacation', 'other') 
					AND amount > 0 THEN amount
				WHEN type IN ('expense', 'savings') THEN -ABS(amount)
				ELSE amount
			END
		), 0) FROM transactions
	`).Scan(&balance)
	if err != nil {
		return 0, fmt.Errorf("calculate balance: %w", err)
	}

	if err := r.SetBalance(ctx, 1, balance); err != nil {
		return 0, err
	}

	return balance, nil
}

// GetMainAccount получает основной счёт
func (r *AccountRepository) GetMainAccount(ctx context.Context) (*domain.Account, error) {
	return r.GetByID(ctx, 1)
}
