package sqlite

import (
	"context"
	"fmt"

	"finance-tracker/internal/domain"
)

// AnalyticsRepository реализация репозитория аналитики для SQLite
type AnalyticsRepository struct {
	db *DB
}

// NewAnalyticsRepository создаёт новый репозиторий аналитики
func NewAnalyticsRepository(db *DB) *AnalyticsRepository {
	return &AnalyticsRepository{db: db}
}

// GetExpensesByCategory получает расходы по категориям за месяц
func (r *AnalyticsRepository) GetExpensesByCategory(ctx context.Context, month string) ([]domain.ExpenseByCategory, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT 
			COALESCE(c.id, 0) as cat_id,
			COALESCE(c.name, 'Без категории') as cat_name,
			COALESCE(c.icon, '📦') as icon,
			COALESCE(c.color, '#808080') as color,
			SUM(ABS(t.amount)) as total
		FROM transactions t
		LEFT JOIN categories c ON t.category_id = c.id
		WHERE t.type = 'expense' AND t.month = ?
		GROUP BY COALESCE(c.id, 0)
		ORDER BY total DESC
	`, month)
	if err != nil {
		return nil, fmt.Errorf("query expenses by category: %w", err)
	}
	defer rows.Close()

	var result []domain.ExpenseByCategory
	var totalAll float64

	for rows.Next() {
		var e domain.ExpenseByCategory
		err := rows.Scan(&e.CategoryID, &e.CategoryName, &e.Icon, &e.Color, &e.Amount)
		if err != nil {
			return nil, fmt.Errorf("scan expense: %w", err)
		}
		totalAll += e.Amount
		result = append(result, e)
	}

	for i := range result {
		if totalAll > 0 {
			result[i].Percent = (result[i].Amount / totalAll) * 100
		}
	}

	return result, nil
}

// GetMonthlyTrend получает тренд по месяцам
func (r *AnalyticsRepository) GetMonthlyTrend(ctx context.Context, months int) ([]domain.MonthSummary, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT 
			month,
			COALESCE(SUM(CASE WHEN type NOT IN ('expense', 'savings', 'correction') THEN amount ELSE 0 END), 0) as income,
			COALESCE(SUM(CASE WHEN type IN ('bonus', 'year_bonus') THEN amount ELSE 0 END), 0) as bonus,
			COALESCE(SUM(CASE WHEN type = 'savings' THEN amount ELSE 0 END), 0) as saved,
			COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0) as expenses
		FROM transactions
		WHERE month >= strftime('%Y-%m', 'now', '-' || ? || ' months')
		GROUP BY month
		ORDER BY month DESC
		LIMIT ?
	`, months, months)
	if err != nil {
		return nil, fmt.Errorf("query monthly trend: %w", err)
	}
	defer rows.Close()

	var result []domain.MonthSummary
	for rows.Next() {
		var m domain.MonthSummary
		err := rows.Scan(&m.Month, &m.TotalIncome, &m.TotalBonus, &m.TotalSaved, &m.Expenses)
		if err != nil {
			return nil, fmt.Errorf("scan month summary: %w", err)
		}
		result = append(result, m)
	}

	return result, nil
}

// GetMonthTotals получает итоги за месяц (исключая correction из дохода)
func (r *AnalyticsRepository) GetMonthTotals(ctx context.Context, month string) (income, expenses, savings float64, err error) {
	err = r.db.QueryRowContext(ctx, `
		SELECT 
			COALESCE(SUM(CASE WHEN type NOT IN ('expense', 'savings', 'correction') THEN amount ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN type = 'savings' THEN amount ELSE 0 END), 0)
		FROM transactions
		WHERE month = ?
	`, month).Scan(&income, &expenses, &savings)
	if err != nil {
		err = fmt.Errorf("query month totals: %w", err)
	}
	return
}

// GetYearlyAnalytics получает годовую аналитику
func (r *AnalyticsRepository) GetYearlyAnalytics(ctx context.Context, year int) (*domain.YearlyAnalytics, error) {
	yearStr := fmt.Sprintf("%d", year)
	data := &domain.YearlyAnalytics{Year: year}

	// Получаем итоги за год
	err := r.db.QueryRowContext(ctx, `
		SELECT 
			COALESCE(SUM(CASE WHEN type NOT IN ('expense', 'savings', 'correction') THEN amount ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN type = 'savings' THEN amount ELSE 0 END), 0)
		FROM transactions
		WHERE month LIKE ? || '-%'
	`, yearStr).Scan(&data.TotalIncome, &data.TotalExpenses, &data.TotalSavings)
	if err != nil {
		return nil, fmt.Errorf("query yearly totals: %w", err)
	}

	// Получаем расходы по категориям за год
	rows, err := r.db.QueryContext(ctx, `
		SELECT 
			COALESCE(c.id, 0) as cat_id,
			COALESCE(c.name, 'Без категории') as cat_name,
			COALESCE(c.icon, '📦') as icon,
			COALESCE(c.color, '#808080') as color,
			SUM(ABS(t.amount)) as total
		FROM transactions t
		LEFT JOIN categories c ON t.category_id = c.id
		WHERE t.type = 'expense' AND t.month LIKE ? || '-%'
		GROUP BY COALESCE(c.id, 0)
		ORDER BY total DESC
	`, yearStr)
	if err != nil {
		return nil, fmt.Errorf("query yearly expenses by category: %w", err)
	}
	defer rows.Close()

	var totalExpenses float64
	for rows.Next() {
		var e domain.ExpenseByCategory
		err := rows.Scan(&e.CategoryID, &e.CategoryName, &e.Icon, &e.Color, &e.Amount)
		if err != nil {
			return nil, fmt.Errorf("scan expense: %w", err)
		}
		totalExpenses += e.Amount
		data.ByCategory = append(data.ByCategory, e)
	}

	// Рассчитываем проценты
	for i := range data.ByCategory {
		if totalExpenses > 0 {
			data.ByCategory[i].Percent = (data.ByCategory[i].Amount / totalExpenses) * 100
		}
	}

	// Получаем помесячные данные
	monthRows, err := r.db.QueryContext(ctx, `
		SELECT 
			month,
			COALESCE(SUM(CASE WHEN type NOT IN ('expense', 'savings', 'correction') THEN amount ELSE 0 END), 0) as income,
			COALESCE(SUM(CASE WHEN type IN ('bonus', 'year_bonus') THEN amount ELSE 0 END), 0) as bonus,
			COALESCE(SUM(CASE WHEN type = 'savings' THEN amount ELSE 0 END), 0) as saved,
			COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0) as expenses
		FROM transactions
		WHERE month LIKE ? || '-%'
		GROUP BY month
		ORDER BY month ASC
	`, yearStr)
	if err != nil {
		return nil, fmt.Errorf("query monthly data: %w", err)
	}
	defer monthRows.Close()

	monthCount := 0
	for monthRows.Next() {
		var m domain.MonthSummary
		err := monthRows.Scan(&m.Month, &m.TotalIncome, &m.TotalBonus, &m.TotalSaved, &m.Expenses)
		if err != nil {
			return nil, fmt.Errorf("scan month summary: %w", err)
		}
		data.MonthlyData = append(data.MonthlyData, m)
		monthCount++
	}

	// Средние значения
	if monthCount > 0 {
		data.AvgMonthlyIncome = data.TotalIncome / float64(monthCount)
		data.AvgMonthlyExpenses = data.TotalExpenses / float64(monthCount)
	}

	return data, nil
}

// CompareMonths сравнивает два месяца
func (r *AnalyticsRepository) CompareMonths(ctx context.Context, month1, month2 string) (*domain.MonthComparison, error) {
	comparison := &domain.MonthComparison{
		Month1: month1,
		Month2: month2,
	}

	// Получаем итоги по каждому месяцу
	var income1, income2, expenses1, expenses2 float64
	
	err := r.db.QueryRowContext(ctx, `
		SELECT 
			COALESCE(SUM(CASE WHEN type NOT IN ('expense', 'savings', 'correction') THEN amount ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0)
		FROM transactions WHERE month = ?
	`, month1).Scan(&income1, &expenses1)
	if err != nil {
		return nil, fmt.Errorf("query month1 totals: %w", err)
	}

	err = r.db.QueryRowContext(ctx, `
		SELECT 
			COALESCE(SUM(CASE WHEN type NOT IN ('expense', 'savings', 'correction') THEN amount ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0)
		FROM transactions WHERE month = ?
	`, month2).Scan(&income2, &expenses2)
	if err != nil {
		return nil, fmt.Errorf("query month2 totals: %w", err)
	}

	comparison.IncomeDiff = income2 - income1
	comparison.ExpensesDiff = expenses2 - expenses1

	// Сравнение по категориям с определением плановости строго по recurring_payment_id
	rows, err := r.db.QueryContext(ctx, `
		SELECT 
			cat_id, cat_name, cat_icon,
			COALESCE(SUM(CASE WHEN month = ? THEN amount ELSE 0 END), 0) as m1,
			COALESCE(SUM(CASE WHEN month = ? THEN amount ELSE 0 END), 0) as m2,
			MAX(CASE WHEN recurring_payment_id IS NOT NULL THEN 1 ELSE 0 END) as is_planned
		FROM (
			SELECT 
				COALESCE(c.id, 0) as cat_id,
				COALESCE(c.name, 'Без категории') as cat_name,
				COALESCE(c.icon, '📦') as cat_icon,
				t.month,
				ABS(t.amount) as amount,
				t.recurring_payment_id
			FROM transactions t
			LEFT JOIN categories c ON t.category_id = c.id
			WHERE t.type = 'expense' AND (t.month = ? OR t.month = ?)
		)
		GROUP BY cat_id, cat_name, cat_icon
		ORDER BY (COALESCE(SUM(CASE WHEN month = ? THEN amount ELSE 0 END), 0) + 
				  COALESCE(SUM(CASE WHEN month = ? THEN amount ELSE 0 END), 0)) DESC
	`, month1, month2, month1, month2, month1, month2)
	if err != nil {
		return nil, fmt.Errorf("query category comparison: %w", err)
	}
	defer rows.Close()

	// Инициализируем итоги нулями
	comparison.PlannedMonth1 = 0
	comparison.PlannedMonth2 = 0
	comparison.OtherMonth1 = 0
	comparison.OtherMonth2 = 0

	for rows.Next() {
		var c domain.CategoryComparison
		var isPlanned int
		err := rows.Scan(&c.CategoryID, &c.CategoryName, &c.CategoryIcon, &c.Month1Amount, &c.Month2Amount, &isPlanned)
		if err != nil {
			return nil, fmt.Errorf("scan category comparison: %w", err)
		}
		c.Difference = c.Month2Amount - c.Month1Amount
		if c.Month1Amount > 0 {
			c.PercentChange = (c.Difference / c.Month1Amount) * 100
		} else if c.Month2Amount > 0 {
			c.PercentChange = 100 // Новая категория
		}
		// Категория плановая если хотя бы одна транзакция была оплатой планового платежа
		c.IsPlanned = isPlanned == 1
		
		// Считаем итоги
		if c.IsPlanned {
			comparison.PlannedMonth1 += c.Month1Amount
			comparison.PlannedMonth2 += c.Month2Amount
		} else {
			comparison.OtherMonth1 += c.Month1Amount
			comparison.OtherMonth2 += c.Month2Amount
		}
		
		comparison.Categories = append(comparison.Categories, c)
	}

	// Рассчитываем разницу по группам
	comparison.PlannedDiff = comparison.PlannedMonth2 - comparison.PlannedMonth1
	comparison.OtherDiff = comparison.OtherMonth2 - comparison.OtherMonth1

	return comparison, nil
}

// GetCategoryTrend получает тренд по категории за последние N месяцев
func (r *AnalyticsRepository) GetCategoryTrend(ctx context.Context, categoryID int64, months int) (*domain.CategoryTrend, error) {
	trend := &domain.CategoryTrend{
		CategoryID: categoryID,
	}

	// Получаем информацию о категории
	err := r.db.QueryRowContext(ctx, `
		SELECT name, COALESCE(icon, '📦') FROM categories WHERE id = ?
	`, categoryID).Scan(&trend.CategoryName, &trend.CategoryIcon)
	if err != nil {
		return nil, fmt.Errorf("get category info: %w", err)
	}

	// Получаем данные по месяцам
	rows, err := r.db.QueryContext(ctx, `
		SELECT 
			month,
			COALESCE(SUM(ABS(amount)), 0) as total
		FROM transactions
		WHERE category_id = ? AND type = 'expense' 
		  AND month >= strftime('%Y-%m', 'now', '-' || ? || ' months')
		GROUP BY month
		ORDER BY month ASC
	`, categoryID, months)
	if err != nil {
		return nil, fmt.Errorf("query category trend: %w", err)
	}
	defer rows.Close()

	var total float64
	count := 0
	trend.Min = -1 // Sentinel value
	
	for rows.Next() {
		var ma domain.MonthAmount
		err := rows.Scan(&ma.Month, &ma.Amount)
		if err != nil {
			return nil, fmt.Errorf("scan month amount: %w", err)
		}
		trend.MonthlyData = append(trend.MonthlyData, ma)
		total += ma.Amount
		count++
		
		if trend.Min < 0 || ma.Amount < trend.Min {
			trend.Min = ma.Amount
		}
		if ma.Amount > trend.Max {
			trend.Max = ma.Amount
		}
	}

	if count > 0 {
		trend.Average = total / float64(count)
	}
	if trend.Min < 0 {
		trend.Min = 0
	}

	return trend, nil
}
