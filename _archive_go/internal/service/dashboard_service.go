package service

import (
	"context"
	"time"

	"finance-tracker/internal/domain"
	"finance-tracker/internal/repository"
)

// DashboardServiceImpl реализация сервиса дашборда
type DashboardServiceImpl struct {
	txRepo       repository.TransactionRepository
	goalRepo     repository.GoalRepository
	settingsRepo repository.SettingsRepository
	currencySvc  CurrencyService
}

// NewDashboardService создаёт новый сервис дашборда
func NewDashboardService(
	txRepo repository.TransactionRepository,
	goalRepo repository.GoalRepository,
	settingsRepo repository.SettingsRepository,
	currencySvc CurrencyService,
) *DashboardServiceImpl {
	return &DashboardServiceImpl{
		txRepo:       txRepo,
		goalRepo:     goalRepo,
		settingsRepo: settingsRepo,
		currencySvc:  currencySvc,
	}
}

// GetDashboardData получает данные для дашборда
func (s *DashboardServiceImpl) GetDashboardData(ctx context.Context) (*domain.DashboardData, error) {
	data := &domain.DashboardData{}

	// Курс USD
	data.USDRate, _ = s.currencySvc.GetRate(ctx, "USD")
	if data.USDRate == 0 {
		data.USDRate = 3.25 // Default BYN rate
	}

	// Цель
	goal, _ := s.goalRepo.GetActive(ctx)
	data.Goal = goal

	if goal != nil {
		// Обновляем прогресс
		totalSavings, _ := s.txRepo.GetTotalSavings(ctx)
		totalSavingsUSD := totalSavings / data.USDRate

		// Используем типизированный интерфейс для обновления
		type GoalRepoWithProgress interface {
			UpdateProgress(ctx context.Context, totalSavingsUSD float64) error
		}
		if repo, ok := s.goalRepo.(GoalRepoWithProgress); ok {
			repo.UpdateProgress(ctx, totalSavingsUSD)
		}

		// Перечитываем цель
		goal, _ = s.goalRepo.GetActive(ctx)
		data.Goal = goal

		if goal != nil {
			// Прогресс в процентах
			if goal.TargetAmount > 0 {
				data.ProgressPercent = (goal.CurrentAmount / goal.TargetAmount) * 100
			}

			// Дней до цели
			data.DaysRemaining = int(time.Until(goal.TargetDate).Hours() / 24)
			if data.DaysRemaining < 0 {
				data.DaysRemaining = 0
			}

			// Сколько нужно откладывать в месяц
			monthsRemaining := float64(data.DaysRemaining) / 30.0
			if monthsRemaining > 0 {
				remaining := goal.TargetAmount - goal.CurrentAmount
				data.MonthlyTarget = remaining / monthsRemaining
			}
		}
	}

	// Накопления
	data.TotalSavedRUB, _ = s.txRepo.GetTotalSavings(ctx)
	data.TotalSavedUSD = data.TotalSavedRUB / data.USDRate

	// Текущий месяц
	currentMonth := time.Now().Format("2006-01")
	summary, _ := s.txRepo.GetMonthSummary(ctx, currentMonth)
	if summary != nil {
		data.CurrentMonth = *summary
	}

	// Последние транзакции
	data.RecentTransactions, _ = s.txRepo.GetRecent(ctx, 10)

	return data, nil
}
