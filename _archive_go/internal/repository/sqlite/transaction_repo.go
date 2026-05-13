package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"finance-tracker/internal/domain"
	"finance-tracker/internal/middleware"
)

// TransactionRepository реализация репозитория транзакций для SQLite
type TransactionRepository struct {
	db *DB
}

// NewTransactionRepository создаёт новый репозиторий транзакций
func NewTransactionRepository(db *DB) *TransactionRepository {
	return &TransactionRepository{db: db}
}

// Create создаёт новую транзакцию
func (r *TransactionRepository) Create(ctx context.Context, t *domain.Transaction) error {
	// Получаем client_id из контекста
	clientID := middleware.GetClientIDFromContext(ctx)
	if clientID == 0 {
		return fmt.Errorf("unauthorized: client_id not found in context")
	}
	t.ClientID = clientID

	if t.OriginalAmount == 0 {
		t.OriginalAmount = t.Amount
	}
	if t.Currency == "" {
		t.Currency = "BYN"
	}
	if t.AccountID == 0 {
		t.AccountID = 1
	}

	// Сохраняем курс валюты на момент транзакции
	if t.ExchangeRate == nil && t.Currency != "BYN" {
		rateKey := fmt.Sprintf("%s_rate", t.Currency)
		var rateStr string
		err := r.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE client_id = ? AND key = ?`, clientID, rateKey).Scan(&rateStr)
		if err == nil {
			var rate float64
			if _, err := fmt.Sscanf(rateStr, "%f", &rate); err == nil && rate > 0 {
				t.ExchangeRate = &rate
			}
		}
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(ctx,
		`INSERT INTO transactions (client_id, date, amount, original_amount, currency, exchange_rate, type, category_id, account_id, recurring_payment_id, description, month, is_validated) 
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		clientID,
		t.Date.Format("2006-01-02"),
		t.Amount,
		t.OriginalAmount,
		t.Currency,
		t.ExchangeRate,
		t.Type,
		t.CategoryID,
		t.AccountID,
		t.RecurringPaymentID,
		t.Description,
		t.Month,
		t.IsValidated,
	)
	if err != nil {
		return fmt.Errorf("insert transaction: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return fmt.Errorf("get last insert id: %w", err)
	}
	t.ID = id

	// Обновить баланс
	balanceDelta := t.Amount
	if t.Type == domain.TypeExpense || t.Type == domain.TypeSavings {
		balanceDelta = -t.Amount
	}

	_, err = tx.ExecContext(ctx, `UPDATE accounts SET balance = balance + ? WHERE id = ?`, balanceDelta, t.AccountID)
	if err != nil {
		return fmt.Errorf("update balance: %w", err)
	}

	return tx.Commit()
}

// GetByID получает транзакцию по ID
func (r *TransactionRepository) GetByID(ctx context.Context, id int64) (*domain.Transaction, error) {
	clientID := middleware.GetClientIDFromContext(ctx)
	if clientID == 0 {
		return nil, fmt.Errorf("unauthorized: client_id not found in context")
	}

	var t domain.Transaction
	var dateStr, createdStr string
	var month, currency, categoryName sql.NullString
	var originalAmount, exchangeRate sql.NullFloat64
	var categoryID, accountID, recurringPaymentID sql.NullInt64

	var categoryIcon sql.NullString
	err := r.db.QueryRowContext(ctx, `
		SELECT t.id, t.client_id, t.date, t.amount, t.original_amount, t.currency, t.exchange_rate,
		       t.type, t.category_id, c.name, c.icon, t.account_id, t.recurring_payment_id,
		       t.description, t.month, t.is_validated, t.created_at
		FROM transactions t
		LEFT JOIN categories c ON t.category_id = c.id
		WHERE t.id = ? AND t.client_id = ?
	`, id, clientID).Scan(
		&t.ID, &t.ClientID, &dateStr, &t.Amount, &originalAmount, &currency, &exchangeRate,
		&t.Type, &categoryID, &categoryName, &categoryIcon, &accountID, &recurringPaymentID,
		&t.Description, &month, &t.IsValidated, &createdStr,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("query transaction: %w", err)
	}

	r.scanTransaction(&t, dateStr, createdStr, month, currency, categoryName, categoryIcon,
		originalAmount, exchangeRate, categoryID, accountID, recurringPaymentID)

	return &t, nil
}

// List получает список транзакций с фильтрацией
func (r *TransactionRepository) List(ctx context.Context, filter domain.TransactionFilter) ([]domain.Transaction, error) {
	clientID := middleware.GetClientIDFromContext(ctx)
	if clientID == 0 {
		return nil, fmt.Errorf("unauthorized: client_id not found in context")
	}

	query := `SELECT t.id, t.client_id, t.date, t.amount, t.original_amount, t.currency, t.exchange_rate, t.type, 
	                 t.category_id, COALESCE(c.name, ''), COALESCE(c.icon, ''), t.account_id, t.recurring_payment_id,
	                 t.description, t.month, t.is_validated, t.created_at 
	          FROM transactions t
	          LEFT JOIN categories c ON t.category_id = c.id
	          WHERE t.client_id = ?`

	var args []interface{}
	args = append(args, clientID)

	if filter.Month != "" {
		query += ` AND t.month = ?`
		args = append(args, filter.Month)
	}

	if filter.Type != "" {
		query += ` AND t.type = ?`
		args = append(args, filter.Type)
	}

	if filter.CategoryID != nil {
		query += ` AND t.category_id = ?`
		args = append(args, *filter.CategoryID)
	}

	query += ` ORDER BY t.date DESC, t.id DESC`

	if filter.Limit > 0 {
		query += ` LIMIT ?`
		args = append(args, filter.Limit)
	}

	if filter.Offset > 0 {
		query += ` OFFSET ?`
		args = append(args, filter.Offset)
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query transactions: %w", err)
	}
	defer rows.Close()

	return r.scanTransactions(rows)
}

// GetRecent получает последние N транзакций
func (r *TransactionRepository) GetRecent(ctx context.Context, limit int) ([]domain.Transaction, error) {
	clientID := middleware.GetClientIDFromContext(ctx)
	if clientID == 0 {
		return nil, fmt.Errorf("unauthorized: client_id not found in context")
	}

	rows, err := r.db.QueryContext(ctx,
		`SELECT t.id, t.client_id, t.date, t.amount, t.original_amount, t.currency, t.exchange_rate, t.type, 
		        t.category_id, COALESCE(c.name, ''), COALESCE(c.icon, ''), t.account_id, t.recurring_payment_id,
		        t.description, t.month, t.is_validated, t.created_at 
		 FROM transactions t
		 LEFT JOIN categories c ON t.category_id = c.id
		 WHERE t.client_id = ?
		 ORDER BY t.date DESC, t.id DESC
		 LIMIT ?`,
		clientID,
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("query recent transactions: %w", err)
	}
	defer rows.Close()

	return r.scanTransactions(rows)
}

// GetByMonth получает транзакции за месяц
func (r *TransactionRepository) GetByMonth(ctx context.Context, month string) ([]domain.Transaction, error) {
	clientID := middleware.GetClientIDFromContext(ctx)
	if clientID == 0 {
		return nil, fmt.Errorf("unauthorized: client_id not found in context")
	}

	rows, err := r.db.QueryContext(ctx,
		`SELECT t.id, t.client_id, t.date, t.amount, t.original_amount, t.currency, t.exchange_rate, t.type, 
		        t.category_id, COALESCE(c.name, ''), COALESCE(c.icon, ''), t.account_id, t.recurring_payment_id,
		        t.description, t.month, t.is_validated, t.created_at 
		 FROM transactions t
		 LEFT JOIN categories c ON t.category_id = c.id
		 WHERE t.client_id = ? AND t.month = ?
		 ORDER BY t.date DESC, t.id DESC`,
		clientID,
		month,
	)
	if err != nil {
		return nil, fmt.Errorf("query transactions by month: %w", err)
	}
	defer rows.Close()

	return r.scanTransactions(rows)
}

// Delete удаляет транзакцию и корректирует баланс
func (r *TransactionRepository) Delete(ctx context.Context, id int64) error {
	clientID := middleware.GetClientIDFromContext(ctx)
	if clientID == 0 {
		return fmt.Errorf("unauthorized: client_id not found in context")
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback()

	var amount float64
	var txType string
	var accountID int64
	err = tx.QueryRowContext(ctx, `SELECT amount, type, account_id FROM transactions WHERE id = ? AND client_id = ?`, id, clientID).Scan(&amount, &txType, &accountID)
	if err != nil {
		return fmt.Errorf("get transaction: %w", err)
	}

	result, err := tx.ExecContext(ctx, `DELETE FROM transactions WHERE id = ? AND client_id = ?`, id, clientID)
	if err != nil {
		return fmt.Errorf("delete transaction: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("transaction not found or already deleted")
	}

	// Корректировка баланса (обратная операция)
	balanceDelta := -amount
	if txType == string(domain.TypeExpense) || txType == string(domain.TypeSavings) {
		balanceDelta = amount
	}

	_, err = tx.ExecContext(ctx, `UPDATE accounts SET balance = balance + ? WHERE id = ?`, balanceDelta, accountID)
	if err != nil {
		return fmt.Errorf("update balance: %w", err)
	}

	return tx.Commit()
}

// GetMonthSummary получает сводку за месяц
func (r *TransactionRepository) GetMonthSummary(ctx context.Context, month string) (*domain.MonthSummary, error) {
	clientID := middleware.GetClientIDFromContext(ctx)
	if clientID == 0 {
		return nil, fmt.Errorf("unauthorized: client_id not found in context")
	}

	summary := &domain.MonthSummary{Month: month}

	err := r.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(amount), 0) FROM transactions 
		 WHERE client_id = ? AND month = ? AND type NOT IN ('savings', 'expense', 'correction')`,
		clientID,
		month,
	).Scan(&summary.TotalIncome)
	if err != nil {
		return nil, fmt.Errorf("sum income: %w", err)
	}

	err = r.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(amount), 0) FROM transactions 
		 WHERE client_id = ? AND month = ? AND type IN ('bonus', 'year_bonus')`,
		clientID,
		month,
	).Scan(&summary.TotalBonus)
	if err != nil {
		return nil, fmt.Errorf("sum bonus: %w", err)
	}

	err = r.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(amount), 0) FROM transactions 
		 WHERE client_id = ? AND month = ? AND type = 'savings'`,
		clientID,
		month,
	).Scan(&summary.TotalSaved)
	if err != nil {
		return nil, fmt.Errorf("sum savings: %w", err)
	}

	err = r.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions 
		 WHERE client_id = ? AND month = ? AND type = 'expense'`,
		clientID,
		month,
	).Scan(&summary.Expenses)
	if err != nil {
		return nil, fmt.Errorf("sum expenses: %w", err)
	}

	return summary, nil
}

// GetTotalSavings получает общую сумму накоплений
func (r *TransactionRepository) GetTotalSavings(ctx context.Context) (float64, error) {
	clientID := middleware.GetClientIDFromContext(ctx)
	if clientID == 0 {
		return 0, fmt.Errorf("unauthorized: client_id not found in context")
	}

	var total float64
	err := r.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE client_id = ? AND type = 'savings'`,
		clientID,
	).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("sum total savings: %w", err)
	}
	return total, nil
}

// scanTransactions сканирует результаты запроса в слайс транзакций
func (r *TransactionRepository) scanTransactions(rows *sql.Rows) ([]domain.Transaction, error) {
	var transactions []domain.Transaction

	for rows.Next() {
		var t domain.Transaction
		var dateStr, createdStr string
		var month, currency, categoryName, categoryIcon sql.NullString
		var originalAmount, exchangeRate sql.NullFloat64
		var categoryID, accountID, recurringPaymentID sql.NullInt64

		err := rows.Scan(&t.ID, &t.ClientID, &dateStr, &t.Amount, &originalAmount, &currency, &exchangeRate, &t.Type,
			&categoryID, &categoryName, &categoryIcon, &accountID, &recurringPaymentID,
			&t.Description, &month, &t.IsValidated, &createdStr)
		if err != nil {
			return nil, fmt.Errorf("scan transaction: %w", err)
		}

		r.scanTransaction(&t, dateStr, createdStr, month, currency, categoryName, categoryIcon,
			originalAmount, exchangeRate, categoryID, accountID, recurringPaymentID)

		transactions = append(transactions, t)
	}

	return transactions, nil
}

// scanTransaction заполняет поля транзакции из nullable значений
func (r *TransactionRepository) scanTransaction(t *domain.Transaction, dateStr, createdStr string,
	month, currency, categoryName, categoryIcon sql.NullString,
	originalAmount, exchangeRate sql.NullFloat64,
	categoryID, accountID, recurringPaymentID sql.NullInt64) {

	t.Date, _ = time.Parse("2006-01-02", dateStr)
	t.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdStr)

	if month.Valid {
		t.Month = month.String
	}
	if currency.Valid {
		t.Currency = currency.String
	} else {
		t.Currency = "BYN"
	}
	if originalAmount.Valid {
		t.OriginalAmount = originalAmount.Float64
	} else {
		t.OriginalAmount = t.Amount
	}
	if exchangeRate.Valid {
		t.ExchangeRate = &exchangeRate.Float64
	}
	if categoryID.Valid {
		t.CategoryID = &categoryID.Int64
	}
	if categoryName.Valid {
		t.CategoryName = categoryName.String
	}
	if categoryIcon.Valid {
		t.CategoryIcon = categoryIcon.String
	}
	if accountID.Valid {
		t.AccountID = accountID.Int64
	} else {
		t.AccountID = 1
	}
	if recurringPaymentID.Valid {
		t.RecurringPaymentID = &recurringPaymentID.Int64
	}
}

// CountByClientID возвращает количество транзакций для клиента
func (r *TransactionRepository) CountByClientID(ctx context.Context, clientID int64) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM transactions WHERE client_id = ?`, clientID).Scan(&count)
	return count, err
}
