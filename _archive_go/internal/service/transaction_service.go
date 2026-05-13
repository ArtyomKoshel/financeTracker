package service

import (
	"context"
	"fmt"
	"math"
	"time"

	"finance-tracker/internal/domain"
	"finance-tracker/internal/repository"
)

// TransactionServiceImpl реализация сервиса транзакций
type TransactionServiceImpl struct {
	txRepo            repository.TransactionRepository
	paymentRepo       repository.PaymentRepository
	settingsRepo      repository.SettingsRepository
	currencySvc       CurrencyService
	categoryBudgetSvc CategoryBudgetService
	goalSvc           GoalService
}

// NewTransactionService создаёт новый сервис транзакций
func NewTransactionService(
	txRepo repository.TransactionRepository,
	paymentRepo repository.PaymentRepository,
	settingsRepo repository.SettingsRepository,
	currencySvc CurrencyService,
) *TransactionServiceImpl {
	return &TransactionServiceImpl{
		txRepo:       txRepo,
		paymentRepo:  paymentRepo,
		settingsRepo: settingsRepo,
		currencySvc:  currencySvc,
	}
}

// SetCategoryBudgetService устанавливает сервис бюджетов категорий
func (s *TransactionServiceImpl) SetCategoryBudgetService(svc CategoryBudgetService) {
	s.categoryBudgetSvc = svc
}

// SetGoalService устанавливает сервис целей для автообновления прогресса
func (s *TransactionServiceImpl) SetGoalService(svc GoalService) {
	s.goalSvc = svc
}

// ValidCurrencies список поддерживаемых валют
var ValidCurrencies = map[string]bool{
	"BYN": true, "RUB": true, "EUR": true, "USD": true, "GBP": true, "PLN": true,
}

// ValidTransactionTypes список поддерживаемых типов транзакций
var ValidTransactionTypes = map[string]bool{
	"advance": true, "salary": true, "bonus": true, "early_pay": true,
	"year_bonus": true, "vacation": true, "casino": true, "other": true,
	"expense": true, "savings": true, "correction": true,
}

// Create создаёт новую транзакцию с валидацией
func (s *TransactionServiceImpl) Create(ctx context.Context, req CreateTransactionRequest) (*TransactionResult, error) {
	// Валидация суммы
	if req.Amount <= 0 {
		return nil, fmt.Errorf("amount must be greater than 0")
	}
	if math.IsNaN(req.Amount) || math.IsInf(req.Amount, 0) {
		return nil, fmt.Errorf("invalid amount value")
	}

	// Валидация даты
	date, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		return nil, fmt.Errorf("invalid date format, use YYYY-MM-DD")
	}

	// Валидация типа транзакции
	if !ValidTransactionTypes[req.Type] {
		return nil, fmt.Errorf("invalid transaction type: %s", req.Type)
	}

	// Если месяц не указан, берём из даты
	month := req.Month
	if month == "" {
		month = date.Format("2006-01")
	}

	// Валюта по умолчанию
	currency := req.Currency
	if currency == "" {
		currency = "BYN"
	}

	// Валидация валюты
	if !ValidCurrencies[currency] {
		return nil, fmt.Errorf("unsupported currency: %s", currency)
	}

	// Конвертация в базовую валюту (BYN)
	originalAmount := req.Amount
	amountBYN := req.Amount
	var exchangeRate *float64

	if currency != "BYN" {
		rate, err := s.currencySvc.GetRate(ctx, currency)
		if err != nil {
			return nil, fmt.Errorf("failed to get exchange rate: %w", err)
		}
		amountBYN = req.Amount * rate
		exchangeRate = &rate // Сохраняем курс сразу
	}

	// Получаем категорию из обязательного платежа, если не указана
	categoryID := req.CategoryID
	if req.RecurringPaymentID != nil && categoryID == nil {
		payment, err := s.paymentRepo.GetByID(ctx, *req.RecurringPaymentID)
		if err == nil && payment != nil && payment.CategoryID != nil {
			categoryID = payment.CategoryID
		}
	}

	t := &domain.Transaction{
		Date:               date,
		Amount:             amountBYN,
		OriginalAmount:     originalAmount,
		Currency:           currency,
		ExchangeRate:       exchangeRate,
		Type:               domain.TransactionType(req.Type),
		CategoryID:         categoryID,
		RecurringPaymentID: req.RecurringPaymentID,
		Description:        req.Description,
		Month:              month,
		AccountID:          1,
	}

	if err := s.txRepo.Create(ctx, t); err != nil {
		return nil, fmt.Errorf("failed to create transaction: %w", err)
	}

	// Деактивировать разовый платёж после оплаты
	if req.RecurringPaymentID != nil {
		payment, err := s.paymentRepo.GetByID(ctx, *req.RecurringPaymentID)
		if err == nil && payment != nil && payment.IsOneTime {
			_ = s.paymentRepo.Delete(ctx, payment.ID) // Delete деактивирует платёж
		}
	}

	result := &TransactionResult{
		Transaction: t,
	}

	// Проверяем бюджет категории для расходов
	if req.Type == "expense" && categoryID != nil && s.categoryBudgetSvc != nil {
		warning, err := s.categoryBudgetSvc.CheckBudgetWarning(ctx, *categoryID, month, amountBYN)
		if err == nil && warning != nil {
			result.BudgetWarning = warning
		}
	}

	// Автообновление прогресса цели при накоплениях
	if req.Type == "savings" && s.goalSvc != nil {
		_ = s.goalSvc.UpdateProgress(ctx)
	}

	return result, nil
}

// Delete удаляет транзакцию (только за текущий месяц)
func (s *TransactionServiceImpl) Delete(ctx context.Context, id int64) error {
	tx, err := s.txRepo.GetByID(ctx, id)
	if err != nil {
		return fmt.Errorf("транзакция не найдена")
	}
	if tx == nil {
		return fmt.Errorf("транзакция не найдена")
	}

	currentMonth := time.Now().Format("2006-01")
	txMonth := tx.Date.Format("2006-01")
	if txMonth != currentMonth {
		return fmt.Errorf("можно удалять только операции текущего месяца")
	}

	isSavings := tx.Type == domain.TypeSavings

	if err := s.txRepo.Delete(ctx, id); err != nil {
		return err
	}

	// Автообновление прогресса цели при удалении накоплений
	if isSavings && s.goalSvc != nil {
		_ = s.goalSvc.UpdateProgress(ctx)
	}

	return nil
}

// List возвращает список транзакций с фильтрацией
func (s *TransactionServiceImpl) List(ctx context.Context, filter domain.TransactionFilter) ([]domain.Transaction, error) {
	return s.txRepo.List(ctx, filter)
}

// GetRecent возвращает последние N транзакций
func (s *TransactionServiceImpl) GetRecent(ctx context.Context, limit int) ([]domain.Transaction, error) {
	return s.txRepo.GetRecent(ctx, limit)
}

// GetByMonth возвращает транзакции за месяц
func (s *TransactionServiceImpl) GetByMonth(ctx context.Context, month string) ([]domain.Transaction, error) {
	txs, err := s.txRepo.GetByMonth(ctx, month)
	if err != nil {
		return nil, err
	}
	if txs == nil {
		return []domain.Transaction{}, nil
	}
	return txs, nil
}

// Validate проверяет правильность выплаты
func (s *TransactionServiceImpl) Validate(ctx context.Context, amount float64, txType string) (*domain.ValidationResult, error) {
	config, err := s.settingsRepo.GetSalaryConfig(ctx)
	if err != nil {
		return nil, err
	}

	result := &domain.ValidationResult{
		Actual: amount,
	}

	tolerance := config.TolerancePercent / 100.0

	switch txType {
	case "advance":
		expected := config.ExpectedAdvance
		result.ExpectedMin = expected * (1 - tolerance)
		result.ExpectedMax = expected * (1 + tolerance)

	case "salary":
		// Пользователь вводит чистую зарплату (на руки), без расчёта НДФЛ
		// GrossSalary теперь означает ожидаемую чистую ЗП
		minSalary := config.GrossSalary - config.ExpectedAdvance - 50000
		maxSalary := config.GrossSalary - config.ExpectedAdvance + 150000
		result.ExpectedMin = math.Max(minSalary, 50000)
		result.ExpectedMax = maxSalary

	case "bonus":
		result.ExpectedMin = 15000
		result.ExpectedMax = 120000

	case "year_bonus":
		result.ExpectedMin = 300000
		result.ExpectedMax = 450000

	default:
		result.ExpectedMin = 0
		result.ExpectedMax = math.MaxFloat64
	}

	result.IsValid = amount >= result.ExpectedMin && amount <= result.ExpectedMax
	result.Difference = amount - (result.ExpectedMin+result.ExpectedMax)/2

	if result.IsValid {
		result.Message = "✓ Сумма в пределах ожидаемого диапазона"
	} else if amount < result.ExpectedMin {
		result.Message = fmt.Sprintf("⚠ Сумма меньше ожидаемой на %.0f ₽", result.ExpectedMin-amount)
	} else {
		result.Message = fmt.Sprintf("⚠ Сумма больше ожидаемой на %.0f ₽", amount-result.ExpectedMax)
	}

	return result, nil
}
