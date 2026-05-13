package repository

import (
	"context"
	"time"

	"finance-tracker/internal/domain"
)

// UserRepository интерфейс для работы с пользователями
type UserRepository interface {
	GetByEmail(ctx context.Context, email string) (*domain.User, error)
	GetByID(ctx context.Context, id int64) (*domain.User, error)
	Create(ctx context.Context, user *domain.User) error
	Update(ctx context.Context, user *domain.User) error
	List(ctx context.Context) ([]domain.User, error)
	UpdateLastLogin(ctx context.Context, userID int64) error
}

// TransactionRepository интерфейс для работы с транзакциями
type TransactionRepository interface {
	Create(ctx context.Context, tx *domain.Transaction) error
	GetByID(ctx context.Context, id int64) (*domain.Transaction, error)
	List(ctx context.Context, filter domain.TransactionFilter) ([]domain.Transaction, error)
	GetRecent(ctx context.Context, limit int) ([]domain.Transaction, error)
	Delete(ctx context.Context, id int64) error
	GetByMonth(ctx context.Context, month string) ([]domain.Transaction, error)
	GetMonthSummary(ctx context.Context, month string) (*domain.MonthSummary, error)
	GetTotalSavings(ctx context.Context) (float64, error)
	CountByClientID(ctx context.Context, clientID int64) (int, error)
}

// CategoryRepository интерфейс для работы с категориями
type CategoryRepository interface {
	GetAll(ctx context.Context, includeInactive bool) ([]domain.CategoryWithSubs, error)
	GetByID(ctx context.Context, id int64) (*domain.Category, error)
	Create(ctx context.Context, cat *domain.Category) error
	Update(ctx context.Context, cat *domain.Category) error
	Delete(ctx context.Context, id int64) error
	Restore(ctx context.Context, id int64) error
	IsUsed(ctx context.Context, id int64) (bool, error)
	ValidateParentID(ctx context.Context, categoryID int64, newParentID *int64) error
}

// PaymentRepository интерфейс для работы с плановыми платежами
type PaymentRepository interface {
	GetAll(ctx context.Context) ([]domain.RecurringPayment, error)
	GetActive(ctx context.Context) ([]domain.RecurringPayment, error)
	GetByID(ctx context.Context, id int64) (*domain.RecurringPayment, error)
	Create(ctx context.Context, p *domain.RecurringPayment) error
	Update(ctx context.Context, p *domain.RecurringPayment) error
	Delete(ctx context.Context, id int64) error
	GetPaymentsUntilDate(ctx context.Context, targetDate time.Time) ([]domain.PaymentReminder, float64, error)
	IsPaymentPaid(ctx context.Context, paymentID int64, month string) (bool, error)
}

// GoalRepository интерфейс для работы с целями
type GoalRepository interface {
	GetActive(ctx context.Context) (*domain.Goal, error)
	GetByID(ctx context.Context, id int64) (*domain.Goal, error)
	Create(ctx context.Context, g *domain.Goal) error
	Update(ctx context.Context, g *domain.Goal) error
	UpdateAmount(ctx context.Context, id int64, amount float64) error
}

// AccountRepository интерфейс для работы со счетами
type AccountRepository interface {
	GetByID(ctx context.Context, id int64) (*domain.Account, error)
	GetMainAccount(ctx context.Context) (*domain.Account, error)
	GetBalance(ctx context.Context) (float64, error)
	UpdateBalance(ctx context.Context, id int64, delta float64) error
	SetBalance(ctx context.Context, id int64, balance float64) error
	SyncBalance(ctx context.Context, id int64, actualBalance float64) error
	UpdateSyncInfo(ctx context.Context, id int64, syncAmount float64) error
	RecalculateBalance(ctx context.Context) (float64, error)
}

// SettingsRepository интерфейс для работы с настройками
type SettingsRepository interface {
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key, value string) error
	GetAll(ctx context.Context) (map[string]string, error)
	GetSalaryConfig(ctx context.Context) (*domain.SalaryConfig, error)
	GetPaydayConfig(ctx context.Context) (*domain.PaydayConfig, error)
	GetSettings(ctx context.Context) (*domain.Settings, error)
}

// AnalyticsRepository интерфейс для аналитических запросов
type AnalyticsRepository interface {
	GetExpensesByCategory(ctx context.Context, month string) ([]domain.ExpenseByCategory, error)
	GetMonthlyTrend(ctx context.Context, months int) ([]domain.MonthSummary, error)
	GetMonthTotals(ctx context.Context, month string) (income, expenses, savings float64, err error)
	GetYearlyAnalytics(ctx context.Context, year int) (*domain.YearlyAnalytics, error)
	CompareMonths(ctx context.Context, month1, month2 string) (*domain.MonthComparison, error)
	GetCategoryTrend(ctx context.Context, categoryID int64, months int) (*domain.CategoryTrend, error)
}

// CurrencyRepository интерфейс для работы с курсами валют
type CurrencyRepository interface {
	GetRate(ctx context.Context, currency string) (float64, error)
	SetRate(ctx context.Context, currency string, rate float64) error
	GetAllRates(ctx context.Context) (map[string]float64, error)
}

// CategoryBudgetRepository интерфейс для работы с бюджетами категорий
type CategoryBudgetRepository interface {
	GetByMonth(ctx context.Context, month string) ([]domain.CategoryBudget, error)
	GetByCategory(ctx context.Context, categoryID int64, month string) (*domain.CategoryBudget, error)
	Create(ctx context.Context, budget *domain.CategoryBudget) error
	Update(ctx context.Context, budget *domain.CategoryBudget) error
	Delete(ctx context.Context, id int64) error
	GetSpentAmount(ctx context.Context, categoryID int64, month string) (float64, error)
	GetRecurring(ctx context.Context) ([]domain.CategoryBudget, error)
	GetEssentialBudgetsTotal(ctx context.Context, month string) (float64, error)
	GetEssentialSpentAmount(ctx context.Context, month string) (float64, error)
	GetEssentialSpentSinceDate(ctx context.Context, month string, sinceDate string) (float64, error)
}
