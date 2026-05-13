package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"time"

	"finance-tracker/internal/domain"
	"finance-tracker/internal/middleware"
)

// PaymentRepository реализация репозитория платежей для SQLite
type PaymentRepository struct {
	db *DB
}

// NewPaymentRepository создаёт новый репозиторий платежей
func NewPaymentRepository(db *DB) *PaymentRepository {
	return &PaymentRepository{db: db}
}

// GetAll получает все плановые платежи
func (r *PaymentRepository) GetAll(ctx context.Context) ([]domain.RecurringPayment, error) {
	clientID := middleware.GetClientIDFromContext(ctx)
	if clientID == 0 {
		return nil, fmt.Errorf("unauthorized: client_id not found in context")
	}

	rows, err := r.db.QueryContext(ctx,
		`SELECT id, client_id, name, amount, COALESCE(original_amount, amount), COALESCE(currency, 'BYN'), 
		        day_of_month, COALESCE(due_date, ''), category, category_id, COALESCE(is_variable, 0), COALESCE(is_one_time, 0), COALESCE(description, ''), is_active 
		 FROM recurring_payments 
		 WHERE client_id = ?
		 ORDER BY CASE WHEN due_date != '' THEN due_date ELSE printf('%02d', day_of_month) END`,
		clientID,
	)
	if err != nil {
		return nil, fmt.Errorf("query payments: %w", err)
	}
	defer rows.Close()

	return r.scanPayments(rows)
}

// GetActive получает активные плановые платежи
func (r *PaymentRepository) GetActive(ctx context.Context) ([]domain.RecurringPayment, error) {
	clientID := middleware.GetClientIDFromContext(ctx)
	if clientID == 0 {
		return nil, fmt.Errorf("unauthorized: client_id not found in context")
	}

	rows, err := r.db.QueryContext(ctx,
		`SELECT id, client_id, name, amount, COALESCE(original_amount, amount), COALESCE(currency, 'BYN'), 
		        day_of_month, COALESCE(due_date, ''), category, category_id, COALESCE(is_variable, 0), COALESCE(is_one_time, 0), COALESCE(description, ''), is_active 
		 FROM recurring_payments 
		 WHERE client_id = ? AND is_active = 1 
		 ORDER BY CASE WHEN due_date != '' THEN due_date ELSE printf('%02d', day_of_month) END`,
		clientID,
	)
	if err != nil {
		return nil, fmt.Errorf("query active payments: %w", err)
	}
	defer rows.Close()

	return r.scanPayments(rows)
}

// GetByID получает платёж по ID
func (r *PaymentRepository) GetByID(ctx context.Context, id int64) (*domain.RecurringPayment, error) {
	clientID := middleware.GetClientIDFromContext(ctx)
	if clientID == 0 {
		return nil, fmt.Errorf("unauthorized: client_id not found in context")
	}

	var p domain.RecurringPayment
	var categoryID sql.NullInt64

	err := r.db.QueryRowContext(ctx, `
		SELECT id, client_id, name, amount, original_amount, currency, day_of_month, COALESCE(due_date, ''), category, category_id, is_variable, COALESCE(is_one_time, 0), description, is_active
		FROM recurring_payments WHERE id = ? AND client_id = ?
	`, id, clientID).Scan(&p.ID, &p.ClientID, &p.Name, &p.Amount, &p.OriginalAmount, &p.Currency, &p.DayOfMonth, &p.DueDate, &p.Category, &categoryID, &p.IsVariable, &p.IsOneTime, &p.Description, &p.IsActive)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("query payment: %w", err)
	}

	if categoryID.Valid {
		p.CategoryID = &categoryID.Int64
	}

	return &p, nil
}

// Create создаёт новый платёж
func (r *PaymentRepository) Create(ctx context.Context, p *domain.RecurringPayment) error {
	clientID := middleware.GetClientIDFromContext(ctx)
	if clientID == 0 {
		return fmt.Errorf("unauthorized: client_id not found in context")
	}
	p.ClientID = clientID

	if p.OriginalAmount == 0 {
		p.OriginalAmount = p.Amount
	}
	if p.Currency == "" {
		p.Currency = "BYN"
	}

	// Для разовых платежей с датой, извлекаем день месяца
	if p.IsOneTime && p.DueDate != "" && p.DayOfMonth == 0 {
		t, err := time.Parse("2006-01-02", p.DueDate)
		if err == nil {
			p.DayOfMonth = t.Day()
		}
	}

	result, err := r.db.ExecContext(ctx,
		`INSERT INTO recurring_payments (client_id, name, amount, original_amount, currency, day_of_month, due_date, category, category_id, is_variable, is_one_time, description, is_active) 
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
		clientID, p.Name, p.Amount, p.OriginalAmount, p.Currency, p.DayOfMonth, p.DueDate, p.Category, p.CategoryID, p.IsVariable, p.IsOneTime, p.Description,
	)
	if err != nil {
		return fmt.Errorf("insert payment: %w", err)
	}

	id, _ := result.LastInsertId()
	p.ID = id
	p.IsActive = true
	return nil
}

// Update обновляет платёж
func (r *PaymentRepository) Update(ctx context.Context, p *domain.RecurringPayment) error {
	// Для разовых платежей с датой, извлекаем день месяца
	if p.IsOneTime && p.DueDate != "" && p.DayOfMonth == 0 {
		t, err := time.Parse("2006-01-02", p.DueDate)
		if err == nil {
			p.DayOfMonth = t.Day()
		}
	}

	_, err := r.db.ExecContext(ctx,
		`UPDATE recurring_payments 
		 SET name=?, amount=?, original_amount=?, currency=?, day_of_month=?, due_date=?, 
		     category=?, category_id=?, is_variable=?, is_one_time=?, description=?, is_active=?
		 WHERE id=?`,
		p.Name, p.Amount, p.OriginalAmount, p.Currency, p.DayOfMonth, p.DueDate,
		p.Category, p.CategoryID, p.IsVariable, p.IsOneTime, p.Description, p.IsActive, p.ID,
	)
	if err != nil {
		return fmt.Errorf("update payment: %w", err)
	}
	return nil
}

// Delete деактивирует платёж
func (r *PaymentRepository) Delete(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `UPDATE recurring_payments SET is_active = 0 WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete payment: %w", err)
	}
	return nil
}

// IsPaymentPaid проверяет оплачен ли платёж в этом месяце
func (r *PaymentRepository) IsPaymentPaid(ctx context.Context, paymentID int64, month string) (bool, error) {
	var count int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM transactions WHERE recurring_payment_id = ? AND month = ?`,
		paymentID, month,
	).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("check payment paid: %w", err)
	}
	return count > 0, nil
}

// GetPaymentsUntilDate получает неоплаченные платежи до указанной даты
func (r *PaymentRepository) GetPaymentsUntilDate(ctx context.Context, targetDate time.Time) ([]domain.PaymentReminder, float64, error) {
	payments, err := r.GetActive(ctx)
	if err != nil {
		return nil, 0, err
	}

	now := time.Now()
	currentMonth := now.Format("2006-01")
	currentDay := now.Day()

	var result []domain.PaymentReminder
	var totalAmount float64

	for _, p := range payments {
		if targetDate.Month() == now.Month() && targetDate.Year() == now.Year() {
			// Платежи в день дохода НЕ включаем - сначала придёт доход, потом можно платить
			if p.DayOfMonth > currentDay && p.DayOfMonth < targetDate.Day() {
				isPaid, _ := r.IsPaymentPaid(ctx, p.ID, currentMonth)
				if !isPaid {
					reminder := domain.PaymentReminder{
						Payment:     p,
						DueDate:     fmt.Sprintf("%s-%02d", currentMonth, p.DayOfMonth),
						Month:       currentMonth,
						DaysUntil:   p.DayOfMonth - currentDay,
						IsPaid:      false,
						IsOverdue:   false,
						IsNextMonth: false,
					}
					result = append(result, reminder)
					totalAmount += p.Amount
				}
			}
		} else {
			if p.DayOfMonth > currentDay {
				isPaid, _ := r.IsPaymentPaid(ctx, p.ID, currentMonth)
				if !isPaid {
					reminder := domain.PaymentReminder{
						Payment:     p,
						DueDate:     fmt.Sprintf("%s-%02d", currentMonth, p.DayOfMonth),
						Month:       currentMonth,
						DaysUntil:   p.DayOfMonth - currentDay,
						IsPaid:      false,
						IsOverdue:   false,
						IsNextMonth: false,
					}
					result = append(result, reminder)
					totalAmount += p.Amount
				}
			}

			nextMonth := now.AddDate(0, 1, 0).Format("2006-01")
			// Платежи в день дохода НЕ включаем - сначала придёт доход
			if p.DayOfMonth < targetDate.Day() {
				isPaid, _ := r.IsPaymentPaid(ctx, p.ID, nextMonth)
				if !isPaid {
					daysInCurrentMonth := time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
					daysUntil := (daysInCurrentMonth - currentDay) + p.DayOfMonth

					reminder := domain.PaymentReminder{
						Payment:     p,
						DueDate:     fmt.Sprintf("%s-%02d", nextMonth, p.DayOfMonth),
						Month:       nextMonth,
						DaysUntil:   daysUntil,
						IsPaid:      false,
						IsOverdue:   false,
						IsNextMonth: true,
					}
					result = append(result, reminder)
					totalAmount += p.Amount
				}
			}
		}
	}

	return result, totalAmount, nil
}

// GetPaymentReminders получает напоминания о платежах
func (r *PaymentRepository) GetPaymentReminders(ctx context.Context, month string, today int) ([]domain.PaymentReminder, error) {
	payments, err := r.GetActive(ctx)
	if err != nil {
		return nil, err
	}

	t, _ := time.Parse("2006-01", month)
	now := time.Now()
	nextMonth := t.AddDate(0, 1, 0).Format("2006-01")
	daysInMonth := time.Date(t.Year(), t.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()

	var reminders []domain.PaymentReminder
	for _, p := range payments {
		// Для разовых платежей с конкретной датой
		if p.IsOneTime && p.DueDate != "" {
			dueDate, err := time.Parse("2006-01-02", p.DueDate)
			if err != nil {
				continue
			}

			dueMonth := dueDate.Format("2006-01")
			isPaid, _ := r.IsPaymentPaid(ctx, p.ID, dueMonth)

			daysUntil := int(dueDate.Sub(now).Hours() / 24)
			isOverdue := now.After(dueDate) && !isPaid
			isNextMonth := dueMonth > month

			reminder := domain.PaymentReminder{
				Payment:     p,
				DueDate:     p.DueDate,
				Month:       dueMonth,
				DaysUntil:   daysUntil,
				IsPaid:      isPaid,
				IsOverdue:   isOverdue,
				IsNextMonth: isNextMonth,
			}
			reminders = append(reminders, reminder)
			continue
		}

		// Для регулярных платежей - старая логика
		isPaidThisMonth, _ := r.IsPaymentPaid(ctx, p.ID, month)

		if isPaidThisMonth {
			// Разовые платежи не показываем после оплаты
			if p.IsOneTime {
				continue
			}

			isPaidNextMonth, _ := r.IsPaymentPaid(ctx, p.ID, nextMonth)
			daysUntilNext := (daysInMonth - today) + p.DayOfMonth

			reminder := domain.PaymentReminder{
				Payment:     p,
				DueDate:     fmt.Sprintf("%s-%02d", nextMonth, p.DayOfMonth),
				Month:       nextMonth,
				DaysUntil:   daysUntilNext,
				IsPaid:      isPaidNextMonth,
				IsOverdue:   false,
				IsNextMonth: true,
			}
			reminders = append(reminders, reminder)
		} else {
			daysUntil := p.DayOfMonth - today
			if daysUntil < 0 {
				daysUntil = 0
			}

			reminder := domain.PaymentReminder{
				Payment:     p,
				DueDate:     fmt.Sprintf("%s-%02d", month, p.DayOfMonth),
				Month:       month,
				DaysUntil:   daysUntil,
				IsPaid:      false,
				IsOverdue:   today > p.DayOfMonth,
				IsNextMonth: false,
			}
			reminders = append(reminders, reminder)
		}
	}

	// Сортировка: сначала просроченные, потом по близости даты
	sort.Slice(reminders, func(i, j int) bool {
		// Просроченные всегда сверху
		if reminders[i].IsOverdue && !reminders[j].IsOverdue {
			return true
		}
		if !reminders[i].IsOverdue && reminders[j].IsOverdue {
			return false
		}
		// Внутри групп - по дням до платежа
		return reminders[i].DaysUntil < reminders[j].DaysUntil
	})

	return reminders, nil
}

// GetTotalMonthlyPayments получает сумму обязательных платежей (ПЛАН)
func (r *PaymentRepository) GetTotalMonthlyPayments(ctx context.Context) (float64, error) {
	var total float64
	err := r.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(amount), 0) FROM recurring_payments WHERE is_active = 1 AND category = 'essential'`,
	).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("sum monthly payments: %w", err)
	}
	return total, nil
}

// GetPaidPaymentsAmount получает сумму оплаченных плановых платежей за месяц (ФАКТ)
func (r *PaymentRepository) GetPaidPaymentsAmount(ctx context.Context, month string) (float64, error) {
	var total float64
	err := r.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(t.amount), 0) 
		 FROM transactions t
		 WHERE t.month = ? 
		   AND t.recurring_payment_id IS NOT NULL 
		   AND t.type = 'expense'`,
		month,
	).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("sum paid payments: %w", err)
	}
	return total, nil
}

func (r *PaymentRepository) scanPayments(rows *sql.Rows) ([]domain.RecurringPayment, error) {
	var payments []domain.RecurringPayment
	for rows.Next() {
		var p domain.RecurringPayment
		var categoryID sql.NullInt64
		err := rows.Scan(&p.ID, &p.ClientID, &p.Name, &p.Amount, &p.OriginalAmount, &p.Currency,
			&p.DayOfMonth, &p.DueDate, &p.Category, &categoryID, &p.IsVariable, &p.IsOneTime, &p.Description, &p.IsActive)
		if err != nil {
			return nil, fmt.Errorf("scan payment: %w", err)
		}
		if categoryID.Valid {
			p.CategoryID = &categoryID.Int64
		}
		payments = append(payments, p)
	}
	return payments, nil
}
