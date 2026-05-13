package service

import (
	"context"

	"finance-tracker/internal/domain"
	"finance-tracker/internal/repository"
)

// AnalyticsServiceImpl реализация сервиса аналитики
type AnalyticsServiceImpl struct {
	analyticsRepo repository.AnalyticsRepository
}

// NewAnalyticsService создаёт новый сервис аналитики
func NewAnalyticsService(analyticsRepo repository.AnalyticsRepository) *AnalyticsServiceImpl {
	return &AnalyticsServiceImpl{
		analyticsRepo: analyticsRepo,
	}
}

// GetAnalytics получает данные аналитики за месяц
func (s *AnalyticsServiceImpl) GetAnalytics(ctx context.Context, month string) (*domain.AnalyticsData, error) {
	// Итоги за месяц
	income, expenses, savings, err := s.analyticsRepo.GetMonthTotals(ctx, month)
	if err != nil {
		return nil, err
	}

	// Расходы по категориям
	byCategory, err := s.analyticsRepo.GetExpensesByCategory(ctx, month)
	if err != nil {
		return nil, err
	}

	// Тренд за 6 месяцев
	trend, err := s.analyticsRepo.GetMonthlyTrend(ctx, 6)
	if err != nil {
		return nil, err
	}

	return &domain.AnalyticsData{
		TotalIncome:   income,
		TotalExpenses: expenses,
		TotalSavings:  savings,
		ByCategory:    byCategory,
		MonthlyTrend:  trend,
	}, nil
}

// GetExpensesByCategory получает расходы по категориям
func (s *AnalyticsServiceImpl) GetExpensesByCategory(ctx context.Context, month string) ([]domain.ExpenseByCategory, error) {
	return s.analyticsRepo.GetExpensesByCategory(ctx, month)
}

// GetMonthlyTrend получает тренд по месяцам
func (s *AnalyticsServiceImpl) GetMonthlyTrend(ctx context.Context, months int) ([]domain.MonthSummary, error) {
	return s.analyticsRepo.GetMonthlyTrend(ctx, months)
}

// GetYearlyAnalytics получает годовую аналитику
func (s *AnalyticsServiceImpl) GetYearlyAnalytics(ctx context.Context, year int) (*domain.YearlyAnalytics, error) {
	return s.analyticsRepo.GetYearlyAnalytics(ctx, year)
}

// CompareMonths сравнивает два месяца
func (s *AnalyticsServiceImpl) CompareMonths(ctx context.Context, month1, month2 string) (*domain.MonthComparison, error) {
	return s.analyticsRepo.CompareMonths(ctx, month1, month2)
}

// GetCategoryTrend получает тренд по категории
func (s *AnalyticsServiceImpl) GetCategoryTrend(ctx context.Context, categoryID int64, months int) (*domain.CategoryTrend, error) {
	return s.analyticsRepo.GetCategoryTrend(ctx, categoryID, months)
}
