package service

import (
	"context"
	"testing"
	"time"

	"finance-tracker/internal/domain"
)

// MockAccountRepository mock для AccountRepository
type MockAccountRepository struct {
	balance float64
}

func (m *MockAccountRepository) GetByID(ctx context.Context, id int64) (*domain.Account, error) {
	return &domain.Account{ID: id, Balance: m.balance}, nil
}

func (m *MockAccountRepository) GetBalance(ctx context.Context) (float64, error) {
	return m.balance, nil
}

func (m *MockAccountRepository) UpdateBalance(ctx context.Context, id int64, delta float64) error {
	m.balance += delta
	return nil
}

func (m *MockAccountRepository) SetBalance(ctx context.Context, id int64, balance float64) error {
	m.balance = balance
	return nil
}

func (m *MockAccountRepository) SyncBalance(ctx context.Context, id int64, actualBalance float64) error {
	m.balance = actualBalance
	return nil
}

func (m *MockAccountRepository) RecalculateBalance(ctx context.Context) (float64, error) {
	return m.balance, nil
}

// MockTransactionRepository mock для TransactionRepository
type MockTransactionRepository struct {
	totalSavings float64
	monthSummary *domain.MonthSummary
}

func (m *MockTransactionRepository) Create(ctx context.Context, tx *domain.Transaction) error {
	return nil
}

func (m *MockTransactionRepository) GetByID(ctx context.Context, id int64) (*domain.Transaction, error) {
	return nil, nil
}

func (m *MockTransactionRepository) List(ctx context.Context, filter domain.TransactionFilter) ([]domain.Transaction, error) {
	return nil, nil
}

func (m *MockTransactionRepository) GetRecent(ctx context.Context, limit int) ([]domain.Transaction, error) {
	return nil, nil
}

func (m *MockTransactionRepository) Delete(ctx context.Context, id int64) error {
	return nil
}

func (m *MockTransactionRepository) GetByMonth(ctx context.Context, month string) ([]domain.Transaction, error) {
	return nil, nil
}

func (m *MockTransactionRepository) GetMonthSummary(ctx context.Context, month string) (*domain.MonthSummary, error) {
	if m.monthSummary != nil {
		return m.monthSummary, nil
	}
	return &domain.MonthSummary{Month: month}, nil
}

func (m *MockTransactionRepository) GetTotalSavings(ctx context.Context) (float64, error) {
	return m.totalSavings, nil
}

// MockPaymentRepository mock для PaymentRepository
type MockPaymentRepository struct {
	payments []domain.RecurringPayment
}

func (m *MockPaymentRepository) GetAll(ctx context.Context) ([]domain.RecurringPayment, error) {
	return m.payments, nil
}

func (m *MockPaymentRepository) GetActive(ctx context.Context) ([]domain.RecurringPayment, error) {
	return m.payments, nil
}

func (m *MockPaymentRepository) GetByID(ctx context.Context, id int64) (*domain.RecurringPayment, error) {
	return nil, nil
}

func (m *MockPaymentRepository) Create(ctx context.Context, p *domain.RecurringPayment) error {
	return nil
}

func (m *MockPaymentRepository) Update(ctx context.Context, p *domain.RecurringPayment) error {
	return nil
}

func (m *MockPaymentRepository) Delete(ctx context.Context, id int64) error {
	return nil
}

func (m *MockPaymentRepository) GetPaymentsUntilDate(ctx context.Context, targetDate time.Time) ([]domain.PaymentReminder, float64, error) {
	var total float64
	for _, p := range m.payments {
		total += p.Amount
	}
	return nil, total, nil
}

func (m *MockPaymentRepository) IsPaymentPaid(ctx context.Context, paymentID int64, month string) (bool, error) {
	return false, nil
}

// MockSettingsRepository mock для SettingsRepository
type MockSettingsRepository struct {
	settings *domain.Settings
}

func (m *MockSettingsRepository) Get(ctx context.Context, key string) (string, error) {
	return "", nil
}

func (m *MockSettingsRepository) Set(ctx context.Context, key, value string) error {
	return nil
}

func (m *MockSettingsRepository) GetAll(ctx context.Context) (map[string]string, error) {
	return nil, nil
}

func (m *MockSettingsRepository) GetSalaryConfig(ctx context.Context) (*domain.SalaryConfig, error) {
	return &m.settings.SalaryConfig, nil
}

func (m *MockSettingsRepository) GetPaydayConfig(ctx context.Context) (*domain.PaydayConfig, error) {
	return &m.settings.PaydayConfig, nil
}

func (m *MockSettingsRepository) GetSettings(ctx context.Context) (*domain.Settings, error) {
	return m.settings, nil
}

// MockGoalRepository mock для GoalRepository
type MockGoalRepository struct {
	goal *domain.Goal
}

func (m *MockGoalRepository) GetActive(ctx context.Context) (*domain.Goal, error) {
	return m.goal, nil
}

func (m *MockGoalRepository) GetByID(ctx context.Context, id int64) (*domain.Goal, error) {
	return m.goal, nil
}

func (m *MockGoalRepository) Create(ctx context.Context, g *domain.Goal) error {
	m.goal = g
	return nil
}

func (m *MockGoalRepository) Update(ctx context.Context, g *domain.Goal) error {
	return nil
}

func (m *MockGoalRepository) UpdateAmount(ctx context.Context, id int64, amount float64) error {
	if m.goal != nil {
		m.goal.CurrentAmount = amount
	}
	return nil
}

// MockCurrencyService mock для CurrencyService
type MockCurrencyService struct {
	rates map[string]float64
}

func (m *MockCurrencyService) Convert(ctx context.Context, amount float64, from, to string) (float64, error) {
	if from == to {
		return amount, nil
	}
	fromRate := m.rates[from]
	toRate := m.rates[to]
	if fromRate == 0 {
		fromRate = 1
	}
	if toRate == 0 {
		toRate = 1
	}
	return amount * fromRate / toRate, nil
}

func (m *MockCurrencyService) GetRate(ctx context.Context, currency string) (float64, error) {
	if rate, ok := m.rates[currency]; ok {
		return rate, nil
	}
	return 1.0, nil
}

func (m *MockCurrencyService) FetchNBRBRates(ctx context.Context) (map[string]float64, error) {
	return m.rates, nil
}

func (m *MockCurrencyService) UpdateRatesFromNBRB(ctx context.Context) (map[string]float64, error) {
	return m.rates, nil
}

func TestBudgetService_CalculateCashflow(t *testing.T) {
	tests := []struct {
		name          string
		balance       float64
		payments      []domain.RecurringPayment
		settings      *domain.Settings
		wantFreeFunds float64
	}{
		{
			name:    "positive free funds",
			balance: 5000,
			payments: []domain.RecurringPayment{
				{ID: 1, Name: "Rent", Amount: 500, DayOfMonth: 10},
			},
			settings: &domain.Settings{
				MinLivingBudget: 1500,
				SavingsPercent:  20,
				PaydayConfig: domain.PaydayConfig{
					AdvanceDay: 30,
					SalaryDay:  15,
				},
			},
			wantFreeFunds: 5000 - 500 - (1500 / 30 * 15), // approximate
		},
		{
			name:     "no payments",
			balance:  3000,
			payments: []domain.RecurringPayment{},
			settings: &domain.Settings{
				MinLivingBudget: 1500,
				SavingsPercent:  20,
				PaydayConfig: domain.PaydayConfig{
					AdvanceDay: 30,
					SalaryDay:  15,
				},
			},
			wantFreeFunds: 3000 - (1500 / 30 * 15),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			accountRepo := &MockAccountRepository{balance: tt.balance}
			txRepo := &MockTransactionRepository{}
			paymentRepo := &MockPaymentRepository{payments: tt.payments}
			settingsRepo := &MockSettingsRepository{settings: tt.settings}
			goalRepo := &MockGoalRepository{}
			currencySvc := &MockCurrencyService{rates: map[string]float64{"USD": 3.25}}

			svc := NewBudgetService(accountRepo, txRepo, paymentRepo, settingsRepo, goalRepo, currencySvc)

			result, err := svc.CalculateCashflow(context.Background())
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if result.Balance != tt.balance {
				t.Errorf("Balance = %v, want %v", result.Balance, tt.balance)
			}

			if result.DaysUntilIncome < 1 {
				t.Errorf("DaysUntilIncome = %v, should be >= 1", result.DaysUntilIncome)
			}

			if result.LivingBudget < 0 {
				t.Errorf("LivingBudget = %v, should be >= 0", result.LivingBudget)
			}
		})
	}
}

func TestBudgetService_GetMonthlyBudget(t *testing.T) {
	accountRepo := &MockAccountRepository{balance: 5000}
	txRepo := &MockTransactionRepository{
		monthSummary: &domain.MonthSummary{
			Month:       "2025-01",
			TotalIncome: 10000,
			Expenses:    3000,
			TotalSaved:  2000,
		},
	}
	paymentRepo := &MockPaymentRepository{}
	settingsRepo := &MockSettingsRepository{settings: &domain.Settings{}}
	goalRepo := &MockGoalRepository{}
	currencySvc := &MockCurrencyService{}

	svc := NewBudgetService(accountRepo, txRepo, paymentRepo, settingsRepo, goalRepo, currencySvc)

	result, err := svc.GetMonthlyBudget(context.Background(), "2025-01")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.Month != "2025-01" {
		t.Errorf("Month = %v, want %v", result.Month, "2025-01")
	}

	if result.TotalIncome != 10000 {
		t.Errorf("TotalIncome = %v, want %v", result.TotalIncome, 10000)
	}

	expectedRemaining := 10000.0 - 3000.0 - 2000.0
	if result.Remaining != expectedRemaining {
		t.Errorf("Remaining = %v, want %v", result.Remaining, expectedRemaining)
	}

	expectedSavingsRate := (2000.0 / 10000.0) * 100
	if result.SavingsRate != expectedSavingsRate {
		t.Errorf("SavingsRate = %v, want %v", result.SavingsRate, expectedSavingsRate)
	}
}
