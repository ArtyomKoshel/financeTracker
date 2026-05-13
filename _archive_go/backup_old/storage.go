package main

import (
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

type Storage struct {
	db *sql.DB
}

func NewStorage(dbPath string) (*Storage, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	s := &Storage{db: db}
	if err := s.init(); err != nil {
		return nil, err
	}

	return s, nil
}

func (s *Storage) init() error {
	// Схема БД теперь создаётся через миграции (см. migrator.go)
	// Здесь только инициализация данных по умолчанию

	// Установим настройки по умолчанию
	// Базовая валюта - BYN (белорусский рубль)
	// Курсы: сколько BYN за 1 единицу валюты
	defaults := map[string]string{
		"gross_salary":      "320000",   // Оклад в RUB
		"expected_advance":  "160650",   // Ожидаемый аванс в RUB
		"ndfl_rate":         "0.15",
		"tolerance":         "3",
		"base_currency":     "BYN",
		"rub_rate":          "0.034",    // 1 RUB = 0.034 BYN (примерно 29.4 RUB за 1 BYN)
		"eur_rate":          "3.55",     // 1 EUR = 3.55 BYN
		"usd_rate":          "3.25",     // 1 USD = 3.25 BYN
		"advance_day":       "30",
		"salary_day":        "15",
		"min_living_budget": "1500",     // Минимум на жизнь в BYN
		"savings_percent":   "20",
	}

	for k, v := range defaults {
		s.db.Exec(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, k, v)
	}

	// Мигрируем существующие настройки в историю (один раз)
	s.MigrateSettingsToHistory()

	// Создать основной счёт если не существует
	var accountCount int
	s.db.QueryRow(`SELECT COUNT(*) FROM accounts`).Scan(&accountCount)
	if accountCount == 0 {
		s.db.Exec(`INSERT INTO accounts (name, balance) VALUES ('Основной счёт', 0)`)
	}

	// Создать предустановленные категории если их нет
	var catCount int
	s.db.QueryRow(`SELECT COUNT(*) FROM categories`).Scan(&catCount)
	if catCount == 0 {
		s.seedCategories()
	}

	return nil
}

// seedCategories создаёт предустановленные категории расходов
func (s *Storage) seedCategories() {
	type cat struct {
		name  string
		icon  string
		color string
		subs  []struct{ name, icon string }
	}

	categories := []cat{
		{"Еда", "🍕", "#FF6B6B", []struct{ name, icon string }{
			{"Продукты", "🛒"},
			{"Кафе и рестораны", "🍽️"},
			{"Доставка еды", "🛵"},
		}},
		{"Жильё", "🏠", "#4ECDC4", []struct{ name, icon string }{
			{"Аренда", "🔑"},
			{"Коммуналка", "💡"},
			{"Ремонт", "🔧"},
		}},
		{"Транспорт", "🚗", "#45B7D1", []struct{ name, icon string }{
			{"Такси", "🚕"},
			{"Топливо", "⛽"},
			{"Общественный", "🚌"},
		}},
		{"Связь", "📱", "#96CEB4", []struct{ name, icon string }{
			{"Телефон", "📞"},
			{"Интернет", "🌐"},
		}},
		{"Здоровье", "💊", "#FFEAA7", []struct{ name, icon string }{
			{"Аптека", "💉"},
			{"Врачи", "👨‍⚕️"},
			{"Спорт", "🏃"},
		}},
		{"Развлечения", "🎮", "#DDA0DD", []struct{ name, icon string }{
			{"Кино", "🎬"},
			{"Игры", "🕹️"},
			{"Подписки", "📺"},
		}},
		{"Одежда", "👕", "#FFB347", nil},
		{"Образование", "📚", "#87CEEB", nil},
		{"Подарки", "🎁", "#FFB6C1", nil},
		{"Другое", "📦", "#C0C0C0", nil},
	}

	for i, c := range categories {
		result, err := s.db.Exec(
			`INSERT INTO categories (name, icon, color, sort_order) VALUES (?, ?, ?, ?)`,
			c.name, c.icon, c.color, i*10,
		)
		if err != nil {
			continue
		}

		parentID, _ := result.LastInsertId()
		for j, sub := range c.subs {
			s.db.Exec(
				`INSERT INTO categories (name, parent_id, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)`,
				sub.name, parentID, sub.icon, c.color, i*10+j+1,
			)
		}
	}
}

// AddTransaction добавить транзакцию и обновить баланс
func (s *Storage) AddTransaction(t *Transaction) error {
	// Если оригинальная сумма не указана, используем amount
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
		if rateStr, err := s.GetSetting(rateKey); err == nil {
			var rate float64
			if _, err := fmt.Sscanf(rateStr, "%f", &rate); err == nil && rate > 0 {
				t.ExchangeRate = &rate
			}
		}
	}

	// Используем SQL транзакцию для атомарности
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() // будет проигнорирован после Commit

	result, err := tx.Exec(
		`INSERT INTO transactions (date, amount, original_amount, currency, exchange_rate, type, category_id, account_id, recurring_payment_id, description, month, is_validated) 
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	t.ID = id

	// Обновить баланс в той же транзакции
	balanceDelta := t.Amount
	// Для расходов и накоплений - вычитаем из баланса
	if t.Type == TypeExpense || t.Type == TypeSavings {
		balanceDelta = -t.Amount
	}

	_, err = tx.Exec(`UPDATE accounts SET balance = balance + ? WHERE id = ?`, balanceDelta, t.AccountID)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// GetTransactions получить транзакции за период
func (s *Storage) GetTransactions(from, to time.Time) ([]Transaction, error) {
	rows, err := s.db.Query(
		`SELECT t.id, t.date, t.amount, t.original_amount, t.currency, t.exchange_rate, t.type, 
		        t.category_id, COALESCE(c.name, ''), t.account_id, t.recurring_payment_id,
		        t.description, t.month, t.is_validated, t.created_at 
		 FROM transactions t
		 LEFT JOIN categories c ON t.category_id = c.id
		 WHERE t.date >= ? AND t.date <= ?
		 ORDER BY t.date DESC`,
		from.Format("2006-01-02"),
		to.Format("2006-01-02"),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return s.scanTransactions(rows)
}

// GetRecentTransactions получить последние N транзакций
func (s *Storage) GetRecentTransactions(limit int) ([]Transaction, error) {
	rows, err := s.db.Query(
		`SELECT t.id, t.date, t.amount, t.original_amount, t.currency, t.exchange_rate, t.type, 
		        t.category_id, COALESCE(c.name, ''), t.account_id, t.recurring_payment_id,
		        t.description, t.month, t.is_validated, t.created_at 
		 FROM transactions t
		 LEFT JOIN categories c ON t.category_id = c.id
		 ORDER BY t.date DESC, t.id DESC
		 LIMIT ?`,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return s.scanTransactions(rows)
}

// GetAllTransactions получить все транзакции
func (s *Storage) GetAllTransactions() ([]Transaction, error) {
	rows, err := s.db.Query(
		`SELECT t.id, t.date, t.amount, t.original_amount, t.currency, t.exchange_rate, t.type, 
		        t.category_id, COALESCE(c.name, ''), t.account_id, t.recurring_payment_id,
		        t.description, t.month, t.is_validated, t.created_at 
		 FROM transactions t
		 LEFT JOIN categories c ON t.category_id = c.id
		 ORDER BY t.date DESC, t.id DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return s.scanTransactions(rows)
}

// GetTransactionsByMonth получить транзакции за месяц
func (s *Storage) GetTransactionsByMonth(month string) ([]Transaction, error) {
	rows, err := s.db.Query(
		`SELECT t.id, t.date, t.amount, t.original_amount, t.currency, t.exchange_rate, t.type, 
		        t.category_id, COALESCE(c.name, ''), t.account_id, t.recurring_payment_id,
		        t.description, t.month, t.is_validated, t.created_at 
		 FROM transactions t
		 LEFT JOIN categories c ON t.category_id = c.id
		 WHERE t.month = ?
		 ORDER BY t.date DESC, t.id DESC`,
		month,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return s.scanTransactions(rows)
}

func (s *Storage) scanTransactions(rows *sql.Rows) ([]Transaction, error) {
	var transactions []Transaction

	for rows.Next() {
		var t Transaction
		var dateStr, createdStr string
		var month, currency, categoryName sql.NullString
		var originalAmount, exchangeRate sql.NullFloat64
		var categoryID, accountID, recurringPaymentID sql.NullInt64

		err := rows.Scan(&t.ID, &dateStr, &t.Amount, &originalAmount, &currency, &exchangeRate, &t.Type, 
		                 &categoryID, &categoryName, &accountID, &recurringPaymentID,
		                 &t.Description, &month, &t.IsValidated, &createdStr)
		if err != nil {
			return nil, err
		}

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
		if accountID.Valid {
			t.AccountID = accountID.Int64
		} else {
			t.AccountID = 1
		}
		if recurringPaymentID.Valid {
			t.RecurringPaymentID = &recurringPaymentID.Int64
		}

		transactions = append(transactions, t)
	}

	return transactions, nil
}

// GetTransactionByID получить транзакцию по ID
func (s *Storage) GetTransactionByID(id int64) (*Transaction, error) {
	var t Transaction
	var dateStr, createdStr string
	var month, currency, categoryName sql.NullString
	var originalAmount, exchangeRate sql.NullFloat64
	var categoryID, accountID, recurringPaymentID sql.NullInt64

	err := s.db.QueryRow(`
		SELECT t.id, t.date, t.amount, t.original_amount, t.currency, t.exchange_rate,
		       t.type, t.category_id, c.name, t.account_id, t.recurring_payment_id,
		       t.description, t.month, t.is_validated, t.created_at
		FROM transactions t
		LEFT JOIN categories c ON t.category_id = c.id
		WHERE t.id = ?
	`, id).Scan(
		&t.ID, &dateStr, &t.Amount, &originalAmount, &currency, &exchangeRate,
		&t.Type, &categoryID, &categoryName, &accountID, &recurringPaymentID,
		&t.Description, &month, &t.IsValidated, &createdStr,
	)
	if err != nil {
		return nil, err
	}

	t.Date, _ = time.Parse("2006-01-02", dateStr)
	t.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdStr)
	if originalAmount.Valid {
		t.OriginalAmount = originalAmount.Float64
	} else {
		t.OriginalAmount = t.Amount
	}
	if currency.Valid {
		t.Currency = currency.String
	} else {
		t.Currency = "BYN"
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
	if accountID.Valid {
		t.AccountID = accountID.Int64
	} else {
		t.AccountID = 1
	}
	if recurringPaymentID.Valid {
		t.RecurringPaymentID = &recurringPaymentID.Int64
	}
	if month.Valid {
		t.Month = month.String
	}

	return &t, nil
}

// DeleteTransaction удалить транзакцию и скорректировать баланс
func (s *Storage) DeleteTransaction(id int64) error {
	// Используем SQL транзакцию для атомарности
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() // будет проигнорирован после Commit

	// Получить информацию о транзакции для корректировки баланса
	var amount float64
	var txType string
	err = tx.QueryRow(`SELECT amount, type FROM transactions WHERE id = ?`, id).Scan(&amount, &txType)
	if err != nil {
		return err
	}

	// Удалить транзакцию
	result, err := tx.Exec(`DELETE FROM transactions WHERE id = ?`, id)
	if err != nil {
		return err
	}

	// Проверяем, что транзакция была удалена
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return fmt.Errorf("transaction not found or already deleted")
	}

	// Скорректировать баланс (обратная операция)
	balanceDelta := -amount // для доходов - вычитаем
	if txType == string(TypeExpense) || txType == string(TypeSavings) {
		balanceDelta = amount // для расходов - возвращаем
	}

	// Обновить баланс в той же транзакции
	_, err = tx.Exec(`UPDATE accounts SET balance = balance + ? WHERE id = 1`, balanceDelta)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// GetMonthSummary получить сводку за месяц
func (s *Storage) GetMonthSummary(month string) (*MonthSummary, error) {
	summary := &MonthSummary{Month: month}

	// Доходы (кроме savings и expense)
	err := s.db.QueryRow(
		`SELECT COALESCE(SUM(amount), 0) FROM transactions 
		 WHERE month = ? AND type NOT IN ('savings', 'expense')`,
		month,
	).Scan(&summary.TotalIncome)
	if err != nil {
		return nil, err
	}

	// Премии
	err = s.db.QueryRow(
		`SELECT COALESCE(SUM(amount), 0) FROM transactions 
		 WHERE month = ? AND type IN ('bonus', 'year_bonus')`,
		month,
	).Scan(&summary.TotalBonus)
	if err != nil {
		return nil, err
	}

	// Отложено
	err = s.db.QueryRow(
		`SELECT COALESCE(SUM(amount), 0) FROM transactions 
		 WHERE month = ? AND type = 'savings'`,
		month,
	).Scan(&summary.TotalSaved)
	if err != nil {
		return nil, err
	}

	// Расходы
	err = s.db.QueryRow(
		`SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions 
		 WHERE month = ? AND type = 'expense'`,
		month,
	).Scan(&summary.Expenses)
	if err != nil {
		return nil, err
	}

	return summary, nil
}

// GetTotalSavings получить общую сумму накоплений
func (s *Storage) GetTotalSavings() (float64, error) {
	var total float64
	err := s.db.QueryRow(
		`SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'savings'`,
	).Scan(&total)
	return total, err
}

// Goals

// CreateGoal создать цель
func (s *Storage) CreateGoal(g *Goal) error {
	// Деактивируем предыдущие цели
	s.db.Exec(`UPDATE goals SET is_active = 0`)

	result, err := s.db.Exec(
		`INSERT INTO goals (name, target_amount, target_date, current_amount, is_active) 
		 VALUES (?, ?, ?, ?, 1)`,
		g.Name,
		g.TargetAmount,
		g.TargetDate.Format("2006-01-02"),
		g.CurrentAmount,
	)
	if err != nil {
		return err
	}

	id, _ := result.LastInsertId()
	g.ID = id
	return nil
}

// GetActiveGoal получить активную цель
func (s *Storage) GetActiveGoal() (*Goal, error) {
	var g Goal
	var dateStr, createdStr string

	err := s.db.QueryRow(
		`SELECT id, name, target_amount, target_date, current_amount, is_active, created_at 
		 FROM goals WHERE is_active = 1 LIMIT 1`,
	).Scan(&g.ID, &g.Name, &g.TargetAmount, &dateStr, &g.CurrentAmount, &g.IsActive, &createdStr)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	g.TargetDate, _ = time.Parse("2006-01-02", dateStr)
	g.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdStr)

	return &g, nil
}

// UpdateGoalProgress обновить прогресс цели на основе накоплений
func (s *Storage) UpdateGoalProgress(usdRate float64) error {
	totalRUB, err := s.GetTotalSavings()
	if err != nil {
		return err
	}

	totalUSD := totalRUB / usdRate

	_, err = s.db.Exec(
		`UPDATE goals SET current_amount = ? WHERE is_active = 1`,
		totalUSD,
	)
	return err
}

// Settings

// GetSetting получить настройку
func (s *Storage) GetSetting(key string) (string, error) {
	var value string
	err := s.db.QueryRow(`SELECT value FROM settings WHERE key = ?`, key).Scan(&value)
	return value, err
}

// SetSetting установить настройку
func (s *Storage) SetSetting(key, value string) error {
	_, err := s.db.Exec(
		`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
		key, value,
	)
	return err
}

// SetSettingWithHistory устанавливает настройку с сохранением истории
// Используется для настроек, которые могут меняться со временем (оклад, курсы)
func (s *Storage) SetSettingWithHistory(key, value string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}

	now := time.Now().Format("2006-01-02")

	// Закрываем предыдущую запись (устанавливаем valid_to)
	_, err = tx.Exec(`
		UPDATE settings_history 
		SET valid_to = ? 
		WHERE key = ? AND valid_to IS NULL
	`, now, key)
	if err != nil {
		tx.Rollback()
		return err
	}

	// Добавляем новую запись в историю
	_, err = tx.Exec(`
		INSERT INTO settings_history (key, value, valid_from) 
		VALUES (?, ?, ?)
	`, key, value, now)
	if err != nil {
		tx.Rollback()
		return err
	}

	// Обновляем текущее значение
	_, err = tx.Exec(`
		INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
	`, key, value)
	if err != nil {
		tx.Rollback()
		return err
	}

	return tx.Commit()
}

// GetSettingAtDate возвращает значение настройки на определённую дату
func (s *Storage) GetSettingAtDate(key string, date time.Time) (string, error) {
	dateStr := date.Format("2006-01-02")

	var value string
	err := s.db.QueryRow(`
		SELECT value FROM settings_history 
		WHERE key = ? 
		AND valid_from <= ? 
		AND (valid_to IS NULL OR valid_to > ?)
		ORDER BY valid_from DESC 
		LIMIT 1
	`, key, dateStr, dateStr).Scan(&value)

	if err == sql.ErrNoRows {
		// Если нет записи в истории, берём текущее значение
		return s.GetSetting(key)
	}

	return value, err
}

// GetSettingsHistory возвращает всю историю изменений настройки
func (s *Storage) GetSettingsHistory(key string) ([]SettingHistory, error) {
	rows, err := s.db.Query(`
		SELECT id, key, value, valid_from, valid_to, created_at 
		FROM settings_history 
		WHERE key = ? 
		ORDER BY valid_from DESC
	`, key)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []SettingHistory
	for rows.Next() {
		var h SettingHistory
		var validTo, createdAt sql.NullString
		err := rows.Scan(&h.ID, &h.Key, &h.Value, &h.ValidFrom, &validTo, &createdAt)
		if err != nil {
			return nil, err
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

// MigrateSettingsToHistory переносит текущие настройки в историю
// Вызывается один раз при первой миграции
func (s *Storage) MigrateSettingsToHistory() error {
	// Список настроек, которые нужно отслеживать
	keys := []string{"gross_salary", "expected_advance", "rub_rate", "eur_rate", "usd_rate", "min_living_budget"}

	for _, key := range keys {
		value, err := s.GetSetting(key)
		if err != nil {
			continue
		}

		// Проверяем, есть ли уже запись в истории
		var count int
		s.db.QueryRow(`SELECT COUNT(*) FROM settings_history WHERE key = ?`, key).Scan(&count)
		if count > 0 {
			continue
		}

		// Добавляем начальную запись
		_, err = s.db.Exec(`
			INSERT INTO settings_history (key, value, valid_from) 
			VALUES (?, ?, ?)
		`, key, value, "2024-01-01") // Начальная дата
		if err != nil {
			return err
		}
	}

	return nil
}

// GetSalaryConfig получить конфигурацию зарплаты
func (s *Storage) GetSalaryConfig() (*SalaryConfig, error) {
	config := &SalaryConfig{}

	getValue := func(key string) float64 {
		val, _ := s.GetSetting(key)
		var f float64
		fmt.Sscanf(val, "%f", &f)
		return f
	}

	config.GrossSalary = getValue("gross_salary")
	config.ExpectedAdvance = getValue("expected_advance")
	config.NDFLRate = getValue("ndfl_rate")
	config.TolerancePercent = getValue("tolerance")

	return config, nil
}

// === Recurring Payments ===

// AddRecurringPayment добавить плановый платёж
func (s *Storage) AddRecurringPayment(p *RecurringPayment) error {
	if p.OriginalAmount == 0 {
		p.OriginalAmount = p.Amount
	}
	if p.Currency == "" {
		p.Currency = "BYN"
	}

	result, err := s.db.Exec(
		`INSERT INTO recurring_payments (name, amount, original_amount, currency, day_of_month, category, category_id, is_variable, description, is_active) 
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
		p.Name, p.Amount, p.OriginalAmount, p.Currency, p.DayOfMonth, p.Category, p.CategoryID, p.IsVariable, p.Description,
	)
	if err != nil {
		return err
	}
	id, _ := result.LastInsertId()
	p.ID = id
	p.IsActive = true
	return nil
}

// GetRecurringPaymentByID получить плановый платёж по ID
func (s *Storage) GetRecurringPaymentByID(id int64) (*RecurringPayment, error) {
	var p RecurringPayment
	var categoryID sql.NullInt64
	
	err := s.db.QueryRow(`
		SELECT id, name, amount, original_amount, currency, day_of_month, category, category_id, is_variable, description, is_active
		FROM recurring_payments WHERE id = ?
	`, id).Scan(&p.ID, &p.Name, &p.Amount, &p.OriginalAmount, &p.Currency, &p.DayOfMonth, &p.Category, &categoryID, &p.IsVariable, &p.Description, &p.IsActive)
	
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	
	if categoryID.Valid {
		p.CategoryID = &categoryID.Int64
	}
	
	return &p, nil
}

// GetRecurringPayments получить все активные плановые платежи
func (s *Storage) GetRecurringPayments() ([]RecurringPayment, error) {
	rows, err := s.db.Query(
		`SELECT id, name, amount, COALESCE(original_amount, amount), COALESCE(currency, 'BYN'), 
		        day_of_month, category, category_id, COALESCE(is_variable, 0), COALESCE(description, ''), is_active 
		 FROM recurring_payments 
		 WHERE is_active = 1 
		 ORDER BY day_of_month`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var payments []RecurringPayment
	for rows.Next() {
		var p RecurringPayment
		err := rows.Scan(&p.ID, &p.Name, &p.Amount, &p.OriginalAmount, &p.Currency, 
		                 &p.DayOfMonth, &p.Category, &p.CategoryID, &p.IsVariable, &p.Description, &p.IsActive)
		if err != nil {
			return nil, err
		}
		payments = append(payments, p)
	}
	return payments, nil
}

// UpdateRecurringPayment обновить плановый платёж
func (s *Storage) UpdateRecurringPayment(p *RecurringPayment) error {
	_, err := s.db.Exec(
		`UPDATE recurring_payments SET name=?, amount=?, day_of_month=?, category=?, description=? WHERE id=?`,
		p.Name, p.Amount, p.DayOfMonth, p.Category, p.Description, p.ID,
	)
	return err
}

// DeleteRecurringPayment удалить (деактивировать) плановый платёж
func (s *Storage) DeleteRecurringPayment(id int64) error {
	_, err := s.db.Exec(`UPDATE recurring_payments SET is_active = 0 WHERE id = ?`, id)
	return err
}

// MarkPaymentPaid отметить платёж как оплаченный за месяц
func (s *Storage) MarkPaymentPaid(paymentID int64, month string, amount float64) error {
	_, err := s.db.Exec(
		`INSERT INTO payment_history (payment_id, paid_date, amount, month) VALUES (?, date('now'), ?, ?)`,
		paymentID, amount, month,
	)
	return err
}

// IsPaymentPaid проверить оплачен ли платёж в этом месяце
func (s *Storage) IsPaymentPaid(paymentID int64, month string) (bool, error) {
	var count int
	// Ищем транзакцию-расход с привязкой к этому плановому платежу за этот месяц
	err := s.db.QueryRow(
		`SELECT COUNT(*) FROM transactions WHERE recurring_payment_id = ? AND month = ?`,
		paymentID, month,
	).Scan(&count)
	return count > 0, err
}

// GetPaymentReminders получить напоминания о платежах
func (s *Storage) GetPaymentReminders(month string, today int) ([]PaymentReminder, error) {
	payments, err := s.GetRecurringPayments()
	if err != nil {
		return nil, err
	}

	// Вычислить следующий месяц
	t, _ := time.Parse("2006-01", month)
	nextMonth := t.AddDate(0, 1, 0).Format("2006-01")
	
	// Количество дней в текущем месяце
	daysInMonth := time.Date(t.Year(), t.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()

	var reminders []PaymentReminder
	for _, p := range payments {
		isPaidThisMonth, _ := s.IsPaymentPaid(p.ID, month)
		
		// Если платёж за этот месяц уже оплачен - показываем на следующий месяц
		if isPaidThisMonth {
			isPaidNextMonth, _ := s.IsPaymentPaid(p.ID, nextMonth)
			
			// Дней до следующего платежа = оставшиеся дни месяца + день платежа
			daysUntilNext := (daysInMonth - today) + p.DayOfMonth
			
			reminder := PaymentReminder{
				Payment:     p,
				DueDate:     fmt.Sprintf("%s-%02d", nextMonth, p.DayOfMonth),
				Month:       nextMonth,
				DaysUntil:   daysUntilNext,
				IsPaid:      isPaidNextMonth,
				IsOverdue:   false, // Следующий месяц ещё не наступил
				IsNextMonth: true,
			}
			reminders = append(reminders, reminder)
		} else {
			// Платёж ещё не оплачен - показываем на текущий месяц
			daysUntil := p.DayOfMonth - today
			if daysUntil < 0 {
				daysUntil = 0
			}

			reminder := PaymentReminder{
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

	return reminders, nil
}

// GetTotalMonthlyPayments получить сумму обязательных платежей за месяц
func (s *Storage) GetTotalMonthlyPayments() (float64, error) {
	var total float64
	err := s.db.QueryRow(
		`SELECT COALESCE(SUM(amount), 0) FROM recurring_payments WHERE is_active = 1 AND category = 'essential'`,
	).Scan(&total)
	return total, err
}

// GetPaymentsUntilDate получить все неоплаченные платежи до указанной даты
// Используется для cashflow-расчёта: все платежи до следующего дохода
func (s *Storage) GetPaymentsUntilDate(targetDate time.Time) ([]PaymentReminder, float64, error) {
	payments, err := s.GetRecurringPayments()
	if err != nil {
		return nil, 0, err
	}

	now := time.Now()
	currentMonth := now.Format("2006-01")
	currentDay := now.Day()

	var result []PaymentReminder
	var totalAmount float64

	for _, p := range payments {
		// Проверяем платежи в текущем месяце
		if targetDate.Month() == now.Month() && targetDate.Year() == now.Year() {
			// Целевая дата в этом же месяце
			// Берём неоплаченные платежи с сегодня до целевой даты
			if p.DayOfMonth > currentDay && p.DayOfMonth <= targetDate.Day() {
				isPaid, _ := s.IsPaymentPaid(p.ID, currentMonth)
				if !isPaid {
					reminder := PaymentReminder{
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
			// Целевая дата в следующем месяце (или позже)
			// 1. Берём все неоплаченные платежи текущего месяца после сегодня
			if p.DayOfMonth > currentDay {
				isPaid, _ := s.IsPaymentPaid(p.ID, currentMonth)
				if !isPaid {
					reminder := PaymentReminder{
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

			// 2. Берём платежи следующего месяца до целевой даты
			nextMonth := now.AddDate(0, 1, 0).Format("2006-01")
			if p.DayOfMonth <= targetDate.Day() {
				isPaid, _ := s.IsPaymentPaid(p.ID, nextMonth)
				if !isPaid {
					daysInCurrentMonth := time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
					daysUntil := (daysInCurrentMonth - currentDay) + p.DayOfMonth

					reminder := PaymentReminder{
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

// === Accounts / Balance ===

// GetMainAccount получить основной счёт
func (s *Storage) GetMainAccount() (*Account, error) {
	var a Account
	var lastSyncDate sql.NullString
	var lastSyncAmount sql.NullFloat64

	err := s.db.QueryRow(
		`SELECT id, name, balance, last_sync_date, last_sync_amount FROM accounts WHERE id = 1`,
	).Scan(&a.ID, &a.Name, &a.Balance, &lastSyncDate, &lastSyncAmount)
	if err != nil {
		return nil, err
	}

	if lastSyncDate.Valid {
		a.LastSyncDate = lastSyncDate.String
	}
	if lastSyncAmount.Valid {
		a.LastSyncAmount = lastSyncAmount.Float64
	}

	return &a, nil
}

// UpdateBalance обновить баланс на сумму (+ или -)
func (s *Storage) UpdateBalance(delta float64) error {
	_, err := s.db.Exec(`UPDATE accounts SET balance = balance + ? WHERE id = 1`, delta)
	return err
}

// SetBalance установить конкретный баланс
func (s *Storage) SetBalance(balance float64) error {
	_, err := s.db.Exec(`UPDATE accounts SET balance = ? WHERE id = 1`, balance)
	return err
}

// SyncBalance сверить баланс (установить новый и записать дату сверки)
func (s *Storage) SyncBalance(actualBalance float64) (float64, error) {
	// Получить текущий баланс
	account, err := s.GetMainAccount()
	if err != nil {
		return 0, err
	}

	diff := actualBalance - account.Balance

	// Обновить баланс и записать дату сверки
	_, err = s.db.Exec(
		`UPDATE accounts SET balance = ?, last_sync_date = date('now'), last_sync_amount = ? WHERE id = 1`,
		actualBalance, actualBalance,
	)
	if err != nil {
		return 0, err
	}

	// Если есть разница - создать корректирующую транзакцию
	if diff != 0 {
		txType := TypeOther
		desc := "Корректировка баланса (сверка)"
		if diff < 0 {
			txType = TypeExpense
			desc = "Неучтённые расходы (сверка)"
		}
		s.db.Exec(
			`INSERT INTO transactions (date, amount, type, description, month, account_id) 
			 VALUES (date('now'), ?, ?, ?, strftime('%Y-%m', 'now'), 1)`,
			diff, txType, desc,
		)
	}

	return diff, nil
}

// RecalculateBalance пересчитать баланс на основе всех транзакций
func (s *Storage) RecalculateBalance() (float64, error) {
	var balance float64
	err := s.db.QueryRow(`
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
		return 0, err
	}

	s.SetBalance(balance)
	return balance, nil
}

// === Categories ===

// GetCategories получить все активные категории (с подкатегориями)
func (s *Storage) GetCategories() ([]CategoryWithSubs, error) {
	return s.getCategoriesWithFilter(true)
}

// GetAllCategoriesIncludingInactive получить все категории включая неактивные
func (s *Storage) GetAllCategoriesIncludingInactive() ([]CategoryWithSubs, error) {
	return s.getCategoriesWithFilter(false)
}

func (s *Storage) getCategoriesWithFilter(activeOnly bool) ([]CategoryWithSubs, error) {
	// Получаем все категории одним запросом (исправление N+1)
	query := `SELECT id, name, parent_id, icon, color, sort_order, COALESCE(is_active, 1) 
		 FROM categories`
	if activeOnly {
		query += ` WHERE is_active = 1 OR is_active IS NULL`
	}
	query += ` ORDER BY parent_id NULLS FIRST, sort_order`

	rows, err := s.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Map для быстрого доступа к родительским категориям по индексу
	parentIndexMap := make(map[int64]int) // id -> index in result
	var result []CategoryWithSubs
	var subcategories []Category

	for rows.Next() {
		var id int64
		var name string
		var parentID *int64
		var icon, color *string
		var sortOrder int
		var isActive int

		err := rows.Scan(&id, &name, &parentID, &icon, &color, &sortOrder, &isActive)
		if err != nil {
			return nil, err
		}

		if parentID == nil {
			// Это корневая категория
			c := CategoryWithSubs{
				Category: Category{
					ID:        id,
					Name:      name,
					SortOrder: sortOrder,
					IsActive:  isActive == 1,
				},
			}
			if icon != nil {
				c.Category.Icon = *icon
			}
			if color != nil {
				c.Category.Color = *color
			}
			parentIndexMap[id] = len(result)
			result = append(result, c)
		} else {
			// Это подкатегория - сохраняем для второго прохода
			sub := Category{
				ID:        id,
				Name:      name,
				ParentID:  parentID,
				SortOrder: sortOrder,
				IsActive:  isActive == 1,
			}
			if icon != nil {
				sub.Icon = *icon
			}
			if color != nil {
				sub.Color = *color
			}
			subcategories = append(subcategories, sub)
		}
	}

	// Привязываем подкатегории к родителям по индексу
	for _, sub := range subcategories {
		if idx, ok := parentIndexMap[*sub.ParentID]; ok {
			result[idx].Subcategories = append(result[idx].Subcategories, sub)
		}
	}

	return result, nil
}

// AddCategory добавить категорию
func (s *Storage) AddCategory(c *Category) error {
	result, err := s.db.Exec(
		`INSERT INTO categories (name, parent_id, icon, color, sort_order, is_active) 
		 VALUES (?, ?, ?, ?, ?, 1)`,
		c.Name, c.ParentID, c.Icon, c.Color, c.SortOrder,
	)
	if err != nil {
		return err
	}
	id, _ := result.LastInsertId()
	c.ID = id
	c.IsActive = true
	return nil
}

// UpdateCategory обновить категорию
func (s *Storage) UpdateCategory(c *Category) error {
	_, err := s.db.Exec(
		`UPDATE categories SET name = ?, icon = ?, color = ?, sort_order = ? WHERE id = ?`,
		c.Name, c.Icon, c.Color, c.SortOrder, c.ID,
	)
	return err
}

// DeleteCategory soft delete категории
func (s *Storage) DeleteCategory(id int64) error {
	// Деактивируем категорию и все её подкатегории
	_, err := s.db.Exec(`UPDATE categories SET is_active = 0 WHERE id = ? OR parent_id = ?`, id, id)
	return err
}

// RestoreCategory восстановить категорию
func (s *Storage) RestoreCategory(id int64) error {
	_, err := s.db.Exec(`UPDATE categories SET is_active = 1 WHERE id = ?`, id)
	return err
}

// GetCategoryByID получить категорию по ID
func (s *Storage) GetCategoryByID(id int64) (*Category, error) {
	var c Category
	var parentID *int64
	var icon, color *string
	var isActive int

	err := s.db.QueryRow(
		`SELECT id, name, parent_id, icon, color, sort_order, COALESCE(is_active, 1) 
		 FROM categories WHERE id = ?`, id,
	).Scan(&c.ID, &c.Name, &parentID, &icon, &color, &c.SortOrder, &isActive)
	if err != nil {
		return nil, err
	}

	c.ParentID = parentID
	c.IsActive = isActive == 1
	if icon != nil {
		c.Icon = *icon
	}
	if color != nil {
		c.Color = *color
	}

	return &c, nil
}

// GetAllCategoriesFlat получить все категории плоским списком
func (s *Storage) GetAllCategoriesFlat() ([]Category, error) {
	rows, err := s.db.Query(
		`SELECT id, name, parent_id, icon, color, sort_order 
		 FROM categories ORDER BY sort_order`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []Category
	for rows.Next() {
		var c Category
		var parentID sql.NullInt64
		err := rows.Scan(&c.ID, &c.Name, &parentID, &c.Icon, &c.Color, &c.SortOrder)
		if err != nil {
			return nil, err
		}
		if parentID.Valid {
			c.ParentID = &parentID.Int64
		}
		result = append(result, c)
	}
	return result, nil
}

// GetExpensesByCategory получить расходы по категориям за период
func (s *Storage) GetExpensesByCategory(month string) ([]ExpenseByCategory, error) {
	rows, err := s.db.Query(`
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
		return nil, err
	}
	defer rows.Close()

	var result []ExpenseByCategory
	var totalAll float64

	for rows.Next() {
		var e ExpenseByCategory
		err := rows.Scan(&e.CategoryID, &e.CategoryName, &e.Icon, &e.Color, &e.Amount)
		if err != nil {
			return nil, err
		}
		totalAll += e.Amount
		result = append(result, e)
	}

	// Рассчитать проценты
	for i := range result {
		if totalAll > 0 {
			result[i].Percent = (result[i].Amount / totalAll) * 100
		}
	}

	return result, nil
}

// === Analytics ===

// GetMonthlyTrend получить тренд по месяцам
func (s *Storage) GetMonthlyTrend(months int) ([]MonthSummary, error) {
	rows, err := s.db.Query(`
		SELECT 
			month,
			COALESCE(SUM(CASE WHEN type NOT IN ('expense', 'savings') THEN amount ELSE 0 END), 0) as income,
			COALESCE(SUM(CASE WHEN type IN ('bonus', 'year_bonus') THEN amount ELSE 0 END), 0) as bonus,
			COALESCE(SUM(CASE WHEN type = 'savings' THEN amount ELSE 0 END), 0) as saved,
			COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0) as expenses
		FROM transactions
		WHERE month >= date('now', '-' || ? || ' months')
		GROUP BY month
		ORDER BY month DESC
		LIMIT ?
	`, months, months)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []MonthSummary
	for rows.Next() {
		var m MonthSummary
		err := rows.Scan(&m.Month, &m.TotalIncome, &m.TotalBonus, &m.TotalSaved, &m.Expenses)
		if err != nil {
			return nil, err
		}
		result = append(result, m)
	}
	return result, nil
}

// Close закрыть соединение
func (s *Storage) Close() error {
	return s.db.Close()
}
