package service

import (
	"context"
	"fmt"

	"finance-tracker/internal/domain"
	"finance-tracker/internal/repository"
)

// CategoryBudgetServiceImpl реализация сервиса бюджетов категорий
type CategoryBudgetServiceImpl struct {
	budgetRepo   repository.CategoryBudgetRepository
	categoryRepo repository.CategoryRepository
}

// NewCategoryBudgetService создаёт новый сервис бюджетов категорий
func NewCategoryBudgetService(
	budgetRepo repository.CategoryBudgetRepository,
	categoryRepo repository.CategoryRepository,
) *CategoryBudgetServiceImpl {
	return &CategoryBudgetServiceImpl{
		budgetRepo:   budgetRepo,
		categoryRepo: categoryRepo,
	}
}

// GetByMonth получает все бюджеты за месяц (с автокопированием recurring)
func (s *CategoryBudgetServiceImpl) GetByMonth(ctx context.Context, month string) ([]domain.CategoryBudget, error) {
	// Сначала пробуем скопировать recurring бюджеты если их нет
	_ = s.CopyRecurringBudgets(ctx, month)
	
	return s.budgetRepo.GetByMonth(ctx, month)
}

// SetBudget создаёт или обновляет бюджет категории
func (s *CategoryBudgetServiceImpl) SetBudget(ctx context.Context, categoryID int64, month string, limitAmount, alertPercent float64, isRecurring, isEssential bool) (*domain.CategoryBudget, error) {
	// Проверяем существование категории
	category, err := s.categoryRepo.GetByID(ctx, categoryID)
	if err != nil {
		return nil, fmt.Errorf("get category: %w", err)
	}
	if category == nil {
		return nil, fmt.Errorf("category not found: %d", categoryID)
	}

	// Значение по умолчанию для порога предупреждения
	if alertPercent <= 0 {
		alertPercent = 80
	}

	budget := &domain.CategoryBudget{
		CategoryID:   categoryID,
		Month:        month,
		LimitAmount:  limitAmount,
		AlertPercent: alertPercent,
		IsRecurring:  isRecurring,
		IsEssential:  isEssential,
	}

	err = s.budgetRepo.Create(ctx, budget)
	if err != nil {
		return nil, fmt.Errorf("create budget: %w", err)
	}

	// Получаем полный бюджет с рассчитанными данными
	return s.budgetRepo.GetByCategory(ctx, categoryID, month)
}

// UpdateBudget обновляет существующий бюджет (для конкретного месяца)
func (s *CategoryBudgetServiceImpl) UpdateBudget(ctx context.Context, id int64, limitAmount, alertPercent float64, isRecurring, isEssential bool) (*domain.CategoryBudget, error) {
	budget := &domain.CategoryBudget{
		ID:           id,
		LimitAmount:  limitAmount,
		AlertPercent: alertPercent,
		IsRecurring:  isRecurring,
		IsEssential:  isEssential,
	}

	err := s.budgetRepo.Update(ctx, budget)
	if err != nil {
		return nil, fmt.Errorf("update budget: %w", err)
	}

	// Получаем обновлённый бюджет - нужно найти его по ID
	// Пока возвращаем то что отправили
	return budget, nil
}

// DeleteBudget удаляет бюджет
func (s *CategoryBudgetServiceImpl) DeleteBudget(ctx context.Context, id int64) error {
	return s.budgetRepo.Delete(ctx, id)
}

// CopyRecurringBudgets копирует recurring бюджеты в новый месяц
func (s *CategoryBudgetServiceImpl) CopyRecurringBudgets(ctx context.Context, month string) error {
	// Получаем существующие бюджеты за этот месяц
	existing, err := s.budgetRepo.GetByMonth(ctx, month)
	if err != nil {
		return err
	}

	// Создаём map существующих категорий
	existingCategories := make(map[int64]bool)
	for _, b := range existing {
		existingCategories[b.CategoryID] = true
	}

	// Получаем recurring бюджеты
	recurring, err := s.budgetRepo.GetRecurring(ctx)
	if err != nil {
		return err
	}

	// Копируем те, которых ещё нет в текущем месяце
	for _, r := range recurring {
		if !existingCategories[r.CategoryID] {
			newBudget := &domain.CategoryBudget{
				CategoryID:   r.CategoryID,
				Month:        month,
				LimitAmount:  r.LimitAmount,
				AlertPercent: r.AlertPercent,
				IsRecurring:  true,
				IsEssential:  r.IsEssential, // Сохраняем флаг базовых расходов
			}
			if err := s.budgetRepo.Create(ctx, newBudget); err != nil {
				// Игнорируем ошибки копирования - не критично
				continue
			}
		}
	}

	return nil
}

// CheckBudgetWarning проверяет превышение бюджета при добавлении траты
func (s *CategoryBudgetServiceImpl) CheckBudgetWarning(ctx context.Context, categoryID int64, month string, newAmount float64) (*domain.BudgetWarning, error) {
	budget, err := s.budgetRepo.GetByCategory(ctx, categoryID, month)
	if err != nil {
		return nil, fmt.Errorf("get budget: %w", err)
	}

	// Если бюджет не установлен - нет предупреждения
	if budget == nil {
		return nil, nil
	}

	// Получаем текущие траты
	currentSpent := budget.SpentAmount
	
	// Рассчитываем новую сумму после добавления траты
	newTotal := currentSpent + newAmount
	percent := (newTotal / budget.LimitAmount) * 100

	// Проверяем пороги
	if percent >= budget.AlertPercent {
		warning := &domain.BudgetWarning{
			CategoryID:   budget.CategoryID,
			CategoryName: budget.CategoryName,
			CategoryIcon: budget.CategoryIcon,
			LimitAmount:  budget.LimitAmount,
			SpentAmount:  newTotal,
			Percent:      percent,
		}

		if percent >= 100 {
			warning.Message = fmt.Sprintf("Бюджет на %s превышен (%.0f%%)", budget.CategoryName, percent)
		} else {
			warning.Message = fmt.Sprintf("Приближение к лимиту %s (%.0f%%)", budget.CategoryName, percent)
		}

		return warning, nil
	}

	return nil, nil
}
