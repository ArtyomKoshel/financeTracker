package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"finance-tracker/internal/domain"
	"finance-tracker/internal/middleware"
)

// GoalRepository реализация репозитория целей для SQLite
type GoalRepository struct {
	db *DB
}

// NewGoalRepository создаёт новый репозиторий целей
func NewGoalRepository(db *DB) *GoalRepository {
	return &GoalRepository{db: db}
}

// GetActive получает активную цель
func (r *GoalRepository) GetActive(ctx context.Context) (*domain.Goal, error) {
	clientID := middleware.GetClientIDFromContext(ctx)
	if clientID == 0 {
		return nil, fmt.Errorf("unauthorized: client_id not found in context")
	}

	var g domain.Goal
	var dateStr, createdStr string

	err := r.db.QueryRowContext(ctx,
		`SELECT id, client_id, name, target_amount, target_date, current_amount, is_active, created_at 
		 FROM goals WHERE client_id = ? AND is_active = 1 LIMIT 1`,
		clientID,
	).Scan(&g.ID, &g.ClientID, &g.Name, &g.TargetAmount, &dateStr, &g.CurrentAmount, &g.IsActive, &createdStr)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query active goal: %w", err)
	}

	g.TargetDate, _ = time.Parse("2006-01-02", dateStr)
	g.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdStr)

	return &g, nil
}

// GetByID получает цель по ID
func (r *GoalRepository) GetByID(ctx context.Context, id int64) (*domain.Goal, error) {
	clientID := middleware.GetClientIDFromContext(ctx)
	if clientID == 0 {
		return nil, fmt.Errorf("unauthorized: client_id not found in context")
	}

	var g domain.Goal
	var dateStr, createdStr string

	err := r.db.QueryRowContext(ctx,
		`SELECT id, client_id, name, target_amount, target_date, current_amount, is_active, created_at 
		 FROM goals WHERE id = ? AND client_id = ?`, id, clientID,
	).Scan(&g.ID, &g.ClientID, &g.Name, &g.TargetAmount, &dateStr, &g.CurrentAmount, &g.IsActive, &createdStr)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query goal: %w", err)
	}

	g.TargetDate, _ = time.Parse("2006-01-02", dateStr)
	g.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdStr)

	return &g, nil
}

// Create создаёт новую цель
func (r *GoalRepository) Create(ctx context.Context, g *domain.Goal) error {
	clientID := middleware.GetClientIDFromContext(ctx)
	if clientID == 0 {
		return fmt.Errorf("unauthorized: client_id not found in context")
	}
	g.ClientID = clientID

	// Деактивируем предыдущие цели для данного клиента
	_, err := r.db.ExecContext(ctx, `UPDATE goals SET is_active = 0 WHERE client_id = ?`, clientID)
	if err != nil {
		return fmt.Errorf("deactivate goals: %w", err)
	}

	result, err := r.db.ExecContext(ctx,
		`INSERT INTO goals (client_id, name, target_amount, target_date, current_amount, is_active) 
		 VALUES (?, ?, ?, ?, ?, 1)`,
		clientID,
		g.Name,
		g.TargetAmount,
		g.TargetDate.Format("2006-01-02"),
		g.CurrentAmount,
	)
	if err != nil {
		return fmt.Errorf("insert goal: %w", err)
	}

	id, _ := result.LastInsertId()
	g.ID = id
	g.IsActive = true
	return nil
}

// Update обновляет цель
func (r *GoalRepository) Update(ctx context.Context, g *domain.Goal) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE goals SET name = ?, target_amount = ?, target_date = ? WHERE id = ?`,
		g.Name, g.TargetAmount, g.TargetDate.Format("2006-01-02"), g.ID,
	)
	if err != nil {
		return fmt.Errorf("update goal: %w", err)
	}
	return nil
}

// UpdateAmount обновляет текущую сумму цели
func (r *GoalRepository) UpdateAmount(ctx context.Context, id int64, amount float64) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE goals SET current_amount = ? WHERE id = ?`,
		amount, id,
	)
	if err != nil {
		return fmt.Errorf("update goal amount: %w", err)
	}
	return nil
}

// UpdateProgress обновляет прогресс активной цели
func (r *GoalRepository) UpdateProgress(ctx context.Context, totalSavingsUSD float64) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE goals SET current_amount = ? WHERE is_active = 1`,
		totalSavingsUSD,
	)
	if err != nil {
		return fmt.Errorf("update goal progress: %w", err)
	}
	return nil
}
