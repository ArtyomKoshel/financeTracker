package service

import (
	"context"
	"fmt"
	"time"

	"finance-tracker/internal/domain"
	"finance-tracker/internal/repository"
)

// GoalServiceImpl реализация сервиса целей
type GoalServiceImpl struct {
	goalRepo    repository.GoalRepository
	txRepo      repository.TransactionRepository
	currencySvc CurrencyService
}

// NewGoalService создаёт новый сервис целей
func NewGoalService(
	goalRepo repository.GoalRepository,
	txRepo repository.TransactionRepository,
	currencySvc CurrencyService,
) *GoalServiceImpl {
	return &GoalServiceImpl{
		goalRepo:    goalRepo,
		txRepo:      txRepo,
		currencySvc: currencySvc,
	}
}

// GetActive получает активную цель
func (s *GoalServiceImpl) GetActive(ctx context.Context) (*domain.Goal, error) {
	return s.goalRepo.GetActive(ctx)
}

// Create создаёт новую цель
func (s *GoalServiceImpl) Create(ctx context.Context, name string, targetAmount float64, targetDateStr string) (*domain.Goal, error) {
	targetDate, err := time.Parse("2006-01-02", targetDateStr)
	if err != nil {
		return nil, fmt.Errorf("invalid date format")
	}

	goal := &domain.Goal{
		Name:         name,
		TargetAmount: targetAmount,
		TargetDate:   targetDate,
		IsActive:     true,
	}

	if err := s.goalRepo.Create(ctx, goal); err != nil {
		return nil, err
	}

	return goal, nil
}

// UpdateProgress обновляет прогресс активной цели
func (s *GoalServiceImpl) UpdateProgress(ctx context.Context) error {
	goal, err := s.goalRepo.GetActive(ctx)
	if err != nil || goal == nil {
		return nil
	}

	totalSavings, err := s.txRepo.GetTotalSavings(ctx)
	if err != nil {
		return err
	}

	usdRate, _ := s.currencySvc.GetRate(ctx, "USD")
	if usdRate == 0 {
		usdRate = 3.25
	}

	totalSavingsUSD := totalSavings / usdRate

	return s.goalRepo.UpdateAmount(ctx, goal.ID, totalSavingsUSD)
}
