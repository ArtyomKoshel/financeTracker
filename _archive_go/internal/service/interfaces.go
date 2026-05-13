package service

import (
	"context"

	"finance-tracker/internal/domain"
)

// TransactionService интерфейс для бизнес-логики транзакций
type TransactionService interface {
	Create(ctx context.Context, req CreateTransactionRequest) (*TransactionResult, error)
	Delete(ctx context.Context, id int64) error
	List(ctx context.Context, filter domain.TransactionFilter) ([]domain.Transaction, error)
	GetRecent(ctx context.Context, limit int) ([]domain.Transaction, error)
	GetByMonth(ctx context.Context, month string) ([]domain.Transaction, error)
	Validate(ctx context.Context, amount float64, txType string) (*domain.ValidationResult, error)
}

// TransactionResult результат создания транзакции с возможным предупреждением
type TransactionResult struct {
	Transaction   *domain.Transaction  `json:"transaction"`
	BudgetWarning *domain.BudgetWarning `json:"budget_warning,omitempty"`
}

// CreateTransactionRequest запрос на создание транзакции
type CreateTransactionRequest struct {
	Date               string  `json:"date"`
	Amount             float64 `json:"amount"`
	Currency           string  `json:"currency"`
	Type               string  `json:"type"`
	CategoryID         *int64  `json:"category_id"`
	RecurringPaymentID *int64  `json:"recurring_payment_id"`
	Description        string  `json:"description"`
	Month              string  `json:"month"`
}

// BudgetService интерфейс для бизнес-логики бюджета
type BudgetService interface {
	CalculateCashflow(ctx context.Context) (*domain.CashflowRecommendation, error)
	CalculateBudgetPlan(ctx context.Context, income float64, incomeType string) (*domain.BudgetPlan, error)
	GetMonthlyBudget(ctx context.Context, month string) (*domain.MonthlyBudget, error)
}

// DashboardService интерфейс для данных дашборда
type DashboardService interface {
	GetDashboardData(ctx context.Context) (*domain.DashboardData, error)
}

// CurrencyService интерфейс для работы с валютами
type CurrencyService interface {
	Convert(ctx context.Context, amount float64, from, to string) (float64, error)
	GetRate(ctx context.Context, currency string) (float64, error)
	FetchNBRBRates(ctx context.Context) (map[string]float64, error)
	UpdateRatesFromNBRB(ctx context.Context) (map[string]float64, error)
}

// AnalyticsService интерфейс для аналитики
type AnalyticsService interface {
	GetAnalytics(ctx context.Context, month string) (*domain.AnalyticsData, error)
	GetExpensesByCategory(ctx context.Context, month string) ([]domain.ExpenseByCategory, error)
	GetMonthlyTrend(ctx context.Context, months int) ([]domain.MonthSummary, error)
	GetYearlyAnalytics(ctx context.Context, year int) (*domain.YearlyAnalytics, error)
	CompareMonths(ctx context.Context, month1, month2 string) (*domain.MonthComparison, error)
	GetCategoryTrend(ctx context.Context, categoryID int64, months int) (*domain.CategoryTrend, error)
}

// GoalService интерфейс для работы с целями
type GoalService interface {
	GetActive(ctx context.Context) (*domain.Goal, error)
	Create(ctx context.Context, name string, targetAmount float64, targetDate string) (*domain.Goal, error)
	UpdateProgress(ctx context.Context) error
}

// AccountService интерфейс для работы со счетами
type AccountService interface {
	GetMainAccount(ctx context.Context) (*domain.Account, error)
	GetBalance(ctx context.Context) (float64, error)
	SetBalance(ctx context.Context, balance float64) error
	SyncBalance(ctx context.Context, actualBalance float64) (*SyncBalanceResult, error)
}

// SyncBalanceResult результат сверки баланса
type SyncBalanceResult struct {
	Account    *domain.Account `json:"account"`
	Difference float64         `json:"difference"`
}

// CategoryBudgetService интерфейс для работы с бюджетами категорий
type CategoryBudgetService interface {
	GetByMonth(ctx context.Context, month string) ([]domain.CategoryBudget, error)
	SetBudget(ctx context.Context, categoryID int64, month string, limitAmount, alertPercent float64, isRecurring, isEssential bool) (*domain.CategoryBudget, error)
	UpdateBudget(ctx context.Context, id int64, limitAmount, alertPercent float64, isRecurring, isEssential bool) (*domain.CategoryBudget, error)
	DeleteBudget(ctx context.Context, id int64) error
	CheckBudgetWarning(ctx context.Context, categoryID int64, month string, newAmount float64) (*domain.BudgetWarning, error)
}
