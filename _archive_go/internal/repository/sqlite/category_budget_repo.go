package sqlite

import (
	"context"
	"database/sql"
	"fmt"

	"finance-tracker/internal/domain"
)

// CategoryBudgetRepository реализация репозитория бюджетов категорий для SQLite
type CategoryBudgetRepository struct {
	db *DB
}

// NewCategoryBudgetRepository создаёт новый репозиторий бюджетов категорий
func NewCategoryBudgetRepository(db *DB) *CategoryBudgetRepository {
	return &CategoryBudgetRepository{db: db}
}

// GetByMonth получает все бюджеты за месяц с рассчитанными тратами
func (r *CategoryBudgetRepository) GetByMonth(ctx context.Context, month string) ([]domain.CategoryBudget, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT 
			cb.id,
			cb.category_id,
			c.name as category_name,
			COALESCE(c.icon, '📦') as category_icon,
			cb.month,
			cb.limit_amount,
			cb.alert_percent,
			COALESCE(cb.is_recurring, 0) as is_recurring,
			COALESCE(cb.is_essential, 0) as is_essential,
			COALESCE((
				SELECT SUM(ABS(t.amount))
				FROM transactions t
				WHERE t.category_id = cb.category_id 
				  AND t.month = cb.month 
				  AND t.type = 'expense'
			), 0) as spent_amount
		FROM category_budgets cb
		JOIN categories c ON cb.category_id = c.id
		WHERE cb.month = ?
		ORDER BY cb.limit_amount DESC
	`, month)
	if err != nil {
		return nil, fmt.Errorf("query category budgets: %w", err)
	}
	defer rows.Close()

	var result []domain.CategoryBudget
	for rows.Next() {
		var b domain.CategoryBudget
		err := rows.Scan(
			&b.ID,
			&b.CategoryID,
			&b.CategoryName,
			&b.CategoryIcon,
			&b.Month,
			&b.LimitAmount,
			&b.AlertPercent,
			&b.IsRecurring,
			&b.IsEssential,
			&b.SpentAmount,
		)
		if err != nil {
			return nil, fmt.Errorf("scan category budget: %w", err)
		}
		
		// Рассчитываем процент использования и превышение
		if b.LimitAmount > 0 {
			b.PercentUsed = (b.SpentAmount / b.LimitAmount) * 100
			b.IsExceeded = b.PercentUsed >= 100
		}
		
		result = append(result, b)
	}

	return result, nil
}

// GetByCategory получает бюджет конкретной категории за месяц
func (r *CategoryBudgetRepository) GetByCategory(ctx context.Context, categoryID int64, month string) (*domain.CategoryBudget, error) {
	var b domain.CategoryBudget
	err := r.db.QueryRowContext(ctx, `
		SELECT 
			cb.id,
			cb.category_id,
			c.name as category_name,
			COALESCE(c.icon, '📦') as category_icon,
			cb.month,
			cb.limit_amount,
			cb.alert_percent,
			COALESCE(cb.is_recurring, 0) as is_recurring,
			COALESCE(cb.is_essential, 0) as is_essential,
			COALESCE((
				SELECT SUM(ABS(t.amount))
				FROM transactions t
				WHERE t.category_id = cb.category_id 
				  AND t.month = cb.month 
				  AND t.type = 'expense'
			), 0) as spent_amount
		FROM category_budgets cb
		JOIN categories c ON cb.category_id = c.id
		WHERE cb.category_id = ? AND cb.month = ?
	`, categoryID, month).Scan(
		&b.ID,
		&b.CategoryID,
		&b.CategoryName,
		&b.CategoryIcon,
		&b.Month,
		&b.LimitAmount,
		&b.AlertPercent,
		&b.IsRecurring,
		&b.IsEssential,
		&b.SpentAmount,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query category budget: %w", err)
	}

	// Рассчитываем процент использования и превышение
	if b.LimitAmount > 0 {
		b.PercentUsed = (b.SpentAmount / b.LimitAmount) * 100
		b.IsExceeded = b.PercentUsed >= 100
	}

	return &b, nil
}

// Create создаёт новый бюджет категории
func (r *CategoryBudgetRepository) Create(ctx context.Context, budget *domain.CategoryBudget) error {
	// Используем UPSERT для создания или обновления
	result, err := r.db.ExecContext(ctx, `
		INSERT INTO category_budgets (category_id, month, limit_amount, alert_percent, is_recurring, is_essential)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(category_id, month) DO UPDATE SET
			limit_amount = excluded.limit_amount,
			alert_percent = excluded.alert_percent,
			is_recurring = excluded.is_recurring,
			is_essential = excluded.is_essential,
			updated_at = CURRENT_TIMESTAMP
	`, budget.CategoryID, budget.Month, budget.LimitAmount, budget.AlertPercent, budget.IsRecurring, budget.IsEssential)
	if err != nil {
		return fmt.Errorf("create category budget: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return fmt.Errorf("get last insert id: %w", err)
	}
	budget.ID = id

	return nil
}

// Update обновляет существующий бюджет
func (r *CategoryBudgetRepository) Update(ctx context.Context, budget *domain.CategoryBudget) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE category_budgets 
		SET limit_amount = ?, alert_percent = ?, is_recurring = ?, is_essential = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, budget.LimitAmount, budget.AlertPercent, budget.IsRecurring, budget.IsEssential, budget.ID)
	if err != nil {
		return fmt.Errorf("update category budget: %w", err)
	}
	return nil
}

// GetRecurring получает все recurring бюджеты (для автокопирования)
func (r *CategoryBudgetRepository) GetRecurring(ctx context.Context) ([]domain.CategoryBudget, error) {
	// Берём последние recurring бюджеты для каждой категории
	rows, err := r.db.QueryContext(ctx, `
		SELECT DISTINCT
			cb.id,
			cb.category_id,
			c.name as category_name,
			COALESCE(c.icon, '📦') as category_icon,
			cb.month,
			cb.limit_amount,
			cb.alert_percent,
			cb.is_recurring,
			COALESCE(cb.is_essential, 0) as is_essential
		FROM category_budgets cb
		JOIN categories c ON cb.category_id = c.id
		WHERE cb.is_recurring = 1
		ORDER BY cb.month DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("query recurring budgets: %w", err)
	}
	defer rows.Close()

	// Храним только последний бюджет для каждой категории
	latestByCategory := make(map[int64]domain.CategoryBudget)
	for rows.Next() {
		var b domain.CategoryBudget
		err := rows.Scan(
			&b.ID,
			&b.CategoryID,
			&b.CategoryName,
			&b.CategoryIcon,
			&b.Month,
			&b.LimitAmount,
			&b.AlertPercent,
			&b.IsRecurring,
			&b.IsEssential,
		)
		if err != nil {
			return nil, fmt.Errorf("scan recurring budget: %w", err)
		}
		// Берём только первый (последний по дате) для каждой категории
		if _, exists := latestByCategory[b.CategoryID]; !exists {
			latestByCategory[b.CategoryID] = b
		}
	}

	result := make([]domain.CategoryBudget, 0, len(latestByCategory))
	for _, b := range latestByCategory {
		result = append(result, b)
	}

	return result, nil
}

// Delete удаляет бюджет
func (r *CategoryBudgetRepository) Delete(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM category_budgets WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete category budget: %w", err)
	}
	return nil
}

// GetSpentAmount получает сумму трат по категории за месяц
func (r *CategoryBudgetRepository) GetSpentAmount(ctx context.Context, categoryID int64, month string) (float64, error) {
	var spent float64
	err := r.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(ABS(amount)), 0)
		FROM transactions
		WHERE category_id = ? AND month = ? AND type = 'expense'
	`, categoryID, month).Scan(&spent)
	if err != nil {
		return 0, fmt.Errorf("query spent amount: %w", err)
	}
	return spent, nil
}

// GetEssentialBudgetsTotal получает сумму базовых бюджетов за вычетом плановых платежей этих категорий
// Формула: На жизнь = Σ(Бюджет категории - Плановые платежи этой категории)
func (r *CategoryBudgetRepository) GetEssentialBudgetsTotal(ctx context.Context, month string) (float64, error) {
	var total float64
	err := r.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(
			cb.limit_amount - COALESCE((
				SELECT SUM(rp.amount)
				FROM recurring_payments rp
				WHERE rp.category_id = cb.category_id 
				  AND rp.is_active = 1
			), 0)
		), 0)
		FROM category_budgets cb
		WHERE cb.month = ? AND cb.is_essential = 1
	`, month).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("query essential budgets total: %w", err)
	}
	// Не возвращаем отрицательные значения
	if total < 0 {
		total = 0
	}
	return total, nil
}

// GetEssentialSpentAmount получает сумму трат по базовым категориям за месяц
// ИСКЛЮЧАЕТ плановые платежи (recurring_payment_id IS NOT NULL), т.к. они уже вычтены из бюджета
// Используется для расчёта "Осталось на жизнь" = План - Потрачено
func (r *CategoryBudgetRepository) GetEssentialSpentAmount(ctx context.Context, month string) (float64, error) {
	var total float64
	err := r.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(ABS(t.amount)), 0)
		FROM transactions t
		WHERE t.month = ? 
		  AND t.type = 'expense'
		  AND t.recurring_payment_id IS NULL
		  AND t.category_id IN (
			SELECT cb.category_id 
			FROM category_budgets cb 
			WHERE cb.month = ? AND cb.is_essential = 1
		  )
	`, month, month).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("query essential spent amount: %w", err)
	}
	return total, nil
}

// GetEssentialSpentSinceDate получает сумму трат по базовым категориям С ОПРЕДЕЛЁННОЙ ДАТЫ
// Используется для корректного расчёта Cashflow - траты считаются с последнего дохода
func (r *CategoryBudgetRepository) GetEssentialSpentSinceDate(ctx context.Context, month string, sinceDate string) (float64, error) {
	var total float64
	err := r.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(ABS(t.amount)), 0)
		FROM transactions t
		WHERE t.month = ? 
		  AND t.type = 'expense'
		  AND t.recurring_payment_id IS NULL
		  AND date(t.date) >= date(?)
		  AND t.category_id IN (
			SELECT cb.category_id 
			FROM category_budgets cb 
			WHERE cb.month = ? AND cb.is_essential = 1
		  )
	`, month, sinceDate, month).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("query essential spent since date: %w", err)
	}
	return total, nil
}
