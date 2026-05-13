package service

import (
	"context"
	"fmt"
	"time"

	"finance-tracker/internal/domain"
	"finance-tracker/internal/repository"
)

// BudgetServiceImpl реализация сервиса бюджета
type BudgetServiceImpl struct {
	accountRepo         repository.AccountRepository
	txRepo              repository.TransactionRepository
	paymentRepo         repository.PaymentRepository
	settingsRepo        repository.SettingsRepository
	goalRepo            repository.GoalRepository
	categoryBudgetRepo  repository.CategoryBudgetRepository
	currencySvc         CurrencyService
}

// NewBudgetService создаёт новый сервис бюджета
func NewBudgetService(
	accountRepo repository.AccountRepository,
	txRepo repository.TransactionRepository,
	paymentRepo repository.PaymentRepository,
	settingsRepo repository.SettingsRepository,
	goalRepo repository.GoalRepository,
	categoryBudgetRepo repository.CategoryBudgetRepository,
	currencySvc CurrencyService,
) *BudgetServiceImpl {
	return &BudgetServiceImpl{
		accountRepo:        accountRepo,
		txRepo:             txRepo,
		paymentRepo:        paymentRepo,
		settingsRepo:       settingsRepo,
		goalRepo:           goalRepo,
		categoryBudgetRepo: categoryBudgetRepo,
		currencySvc:        currencySvc,
	}
}

// CalculateCashflow рассчитывает cashflow-рекомендацию
func (s *BudgetServiceImpl) CalculateCashflow(ctx context.Context) (*domain.CashflowRecommendation, error) {
	now := time.Now()
	currentDay := now.Day()
	currentMonth := now.Format("2006-01")
	daysInMonth := time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()

	// Получить баланс
	balance, err := s.accountRepo.GetBalance(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get balance: %w", err)
	}

	// Получить настройки
	settings, err := s.settingsRepo.GetSettings(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get settings: %w", err)
	}

	minLiving := settings.MinLivingBudget
	advanceDay := settings.AdvanceDay
	salaryDay := settings.SalaryDay
	savingsPercent := settings.SavingsPercent

	// Значения по умолчанию
	if minLiving == 0 {
		minLiving = 1500
	}
	if advanceDay == 0 {
		advanceDay = 30
	}
	if salaryDay == 0 {
		salaryDay = 15
	}
	if savingsPercent == 0 {
		savingsPercent = 20
	}

	// Определить следующий доход
	var nextIncomeDate time.Time
	var nextIncomeType string
	var daysUntilIncome int

	if salaryDay < advanceDay {
		if currentDay < salaryDay {
			nextIncomeDate = time.Date(now.Year(), now.Month(), salaryDay, 0, 0, 0, 0, time.UTC)
			nextIncomeType = "ЗП"
			daysUntilIncome = salaryDay - currentDay
		} else if currentDay < advanceDay {
			nextIncomeDate = time.Date(now.Year(), now.Month(), advanceDay, 0, 0, 0, 0, time.UTC)
			nextIncomeType = "аванс"
			daysUntilIncome = advanceDay - currentDay
		} else {
			nextIncomeDate = time.Date(now.Year(), now.Month()+1, salaryDay, 0, 0, 0, 0, time.UTC)
			nextIncomeType = "ЗП"
			daysUntilIncome = (daysInMonth - currentDay) + salaryDay
		}
	} else {
		if currentDay < advanceDay {
			nextIncomeDate = time.Date(now.Year(), now.Month(), advanceDay, 0, 0, 0, 0, time.UTC)
			nextIncomeType = "аванс"
			daysUntilIncome = advanceDay - currentDay
		} else if currentDay < salaryDay {
			nextIncomeDate = time.Date(now.Year(), now.Month(), salaryDay, 0, 0, 0, 0, time.UTC)
			nextIncomeType = "ЗП"
			daysUntilIncome = salaryDay - currentDay
		} else {
			nextIncomeDate = time.Date(now.Year(), now.Month()+1, advanceDay, 0, 0, 0, 0, time.UTC)
			nextIncomeType = "аванс"
			daysUntilIncome = (daysInMonth - currentDay) + advanceDay
		}
	}

	if daysUntilIncome < 1 {
		daysUntilIncome = 1
	}

	// Определяем дату последнего дохода (для расчёта трат в текущем периоде)
	var lastIncomeDate time.Time
	if salaryDay < advanceDay {
		// ЗП раньше аванса
		if currentDay >= advanceDay {
			// После аванса - последний доход был аванс
			lastIncomeDate = time.Date(now.Year(), now.Month(), advanceDay, 0, 0, 0, 0, time.UTC)
		} else if currentDay >= salaryDay {
			// После ЗП, до аванса - последний доход была ЗП
			lastIncomeDate = time.Date(now.Year(), now.Month(), salaryDay, 0, 0, 0, 0, time.UTC)
		} else {
			// До ЗП - последний доход был аванс прошлого месяца
			lastIncomeDate = time.Date(now.Year(), now.Month()-1, advanceDay, 0, 0, 0, 0, time.UTC)
		}
	} else {
		// Аванс раньше ЗП
		if currentDay >= salaryDay {
			// После ЗП - последний доход была ЗП
			lastIncomeDate = time.Date(now.Year(), now.Month(), salaryDay, 0, 0, 0, 0, time.UTC)
		} else if currentDay >= advanceDay {
			// После аванса, до ЗП - последний доход был аванс
			lastIncomeDate = time.Date(now.Year(), now.Month(), advanceDay, 0, 0, 0, 0, time.UTC)
		} else {
			// До аванса - последний доход была ЗП прошлого месяца
			lastIncomeDate = time.Date(now.Year(), now.Month()-1, salaryDay, 0, 0, 0, 0, time.UTC)
		}
	}

	// Проверяем, есть ли базовые бюджеты категорий
	// Если есть - используем их сумму (за вычетом плановых платежей)
	// Если нет - используем фиксированную сумму из настроек
	type EssentialBudgetRepo interface {
		GetEssentialBudgetsTotal(ctx context.Context, month string) (float64, error)
		GetEssentialSpentAmount(ctx context.Context, month string) (float64, error)
		GetEssentialSpentSinceDate(ctx context.Context, month string, sinceDate string) (float64, error)
	}

	var livingBudget float64
	var essentialTotal float64     // Полный месячный бюджет
	var essentialSpent float64     // Потрачено из базовых категорий С ПОСЛЕДНЕГО ДОХОДА
	var useEssentialBudgets bool

	if repo, ok := s.categoryBudgetRepo.(EssentialBudgetRepo); ok {
		total, err := repo.GetEssentialBudgetsTotal(ctx, currentMonth)
		if err == nil && total > 0 {
			// Есть базовые бюджеты - используем их
			essentialTotal = total
			// Пропорционально дням до дохода
			livingBudget = (essentialTotal / 30.0) * float64(daysUntilIncome)
			useEssentialBudgets = true

			// Получаем потраченное из базовых категорий С ДАТЫ ПОСЛЕДНЕГО ДОХОДА
			// Это исправляет проблему несогласованности периодов
			lastIncomeDateStr := lastIncomeDate.Format("2006-01-02")
			spent, err := repo.GetEssentialSpentSinceDate(ctx, currentMonth, lastIncomeDateStr)
			if err == nil {
				essentialSpent = spent
			}
		}
	}

	if !useEssentialBudgets {
		// Фолбэк на фиксированную сумму из настроек
		essentialTotal = minLiving
		livingBudget = (minLiving / 30.0) * float64(daysUntilIncome)
	}

	// Рассчитать "Осталось на жизнь" = План - Потрачено
	// Не обнуляем отрицательные значения — показываем реальную картину
	essentialRemaining := livingBudget - essentialSpent

	// Рассчитать дневной бюджет (может быть отрицательным если перерасход)
	dailyBudget := 0.0
	if daysUntilIncome > 0 {
		dailyBudget = essentialRemaining / float64(daysUntilIncome)
	}

	// Получить все платежи до даты дохода
	paymentReminders, totalPayments, err := s.paymentRepo.GetPaymentsUntilDate(ctx, nextIncomeDate)
	if err != nil {
		return nil, fmt.Errorf("failed to get payments: %w", err)
	}

	// Рассчитать свободные средства
	// Свободно = Баланс - Плановые платежи - На жизнь (базовые бюджеты)
	freeFunds := balance - livingBudget - totalPayments

	// Рассчитать рекомендуемые накопления
	suggestedSavings := 0.0
	if freeFunds > 0 {
		suggestedSavings = freeFunds * (savingsPercent / 100)
	}

	return &domain.CashflowRecommendation{
		Balance:            balance,
		LivingBudget:       livingBudget,
		TotalPayments:      totalPayments,
		FreeFunds:          freeFunds,
		SuggestedSavings:   suggestedSavings,
		SavingsPercent:     savingsPercent,
		NextIncomeDate:     nextIncomeDate.Format("02.01"),
		NextIncomeType:     nextIncomeType,
		DaysUntilIncome:    daysUntilIncome,
		PaymentsList:       paymentReminders,
		EssentialSpent:     essentialSpent,
		EssentialRemaining: essentialRemaining,
		DailyBudget:        dailyBudget,
		EssentialTotal:     essentialTotal,
	}, nil
}

// CalculateBudgetPlan рассчитывает план распределения дохода
func (s *BudgetServiceImpl) CalculateBudgetPlan(ctx context.Context, income float64, incomeType string) (*domain.BudgetPlan, error) {
	settings, err := s.settingsRepo.GetSettings(ctx)
	if err != nil {
		return nil, err
	}

	advanceDay := settings.AdvanceDay
	salaryDay := settings.SalaryDay
	savingsPercent := settings.SavingsPercent
	minLiving := settings.MinLivingBudget

	if advanceDay == 0 {
		advanceDay = 30
	}
	if salaryDay == 0 {
		salaryDay = 15
	}
	if savingsPercent == 0 {
		savingsPercent = 20
	}
	if minLiving == 0 {
		minLiving = 1500
	}

	month := time.Now().Format("2006-01")
	today := time.Now().Day()

	// Используем типизированный интерфейс
	type PaymentRepoWithReminders interface {
		GetPaymentReminders(ctx context.Context, month string, today int) ([]domain.PaymentReminder, error)
	}

	var reminders []domain.PaymentReminder
	if repo, ok := s.paymentRepo.(PaymentRepoWithReminders); ok {
		reminders, _ = repo.GetPaymentReminders(ctx, month, today)
	}

	var pendingPayments []domain.PaymentReminder
	var totalPayments float64

	for _, r := range reminders {
		if !r.IsPaid {
			shouldShow := false
			if incomeType == "advance" {
				shouldShow = r.Payment.DayOfMonth >= 1 && r.Payment.DayOfMonth <= 15
			} else {
				shouldShow = r.Payment.DayOfMonth >= 15 && r.Payment.DayOfMonth <= 31
			}

			if shouldShow || r.IsOverdue {
				pendingPayments = append(pendingPayments, r)
				if r.Payment.Category == "essential" {
					totalPayments += r.Payment.Amount
				}
			}
		}
	}

	daysUntilNext := 15

	// Рассчитываем цель накоплений
	goal, _ := s.goalRepo.GetActive(ctx)
	var suggestedSavings float64

	if goal != nil {
		daysRemaining := int(time.Until(goal.TargetDate).Hours() / 24)
		if daysRemaining > 0 {
			usdRate, _ := s.currencySvc.GetRate(ctx, "USD")
			monthsRemaining := float64(daysRemaining) / 30.0
			remaining := goal.TargetAmount - goal.CurrentAmount
			monthlyTarget := remaining / monthsRemaining * usdRate
			suggestedSavings = monthlyTarget / 2
		}
	}

	minSavings := income * savingsPercent / 100
	if suggestedSavings < minSavings {
		suggestedSavings = minSavings
	}

	remaining := income - totalPayments - suggestedSavings

	if remaining < minLiving {
		suggestedSavings = income - totalPayments - minLiving
		if suggestedSavings < 0 {
			suggestedSavings = 0
		}
		remaining = income - totalPayments - suggestedSavings
	}

	dailyBudget := remaining / float64(daysUntilNext)

	var message string
	if totalPayments > 0 {
		message = fmt.Sprintf("💳 Оплати обязательные платежи: %.0f ₽\n", totalPayments)
	}
	if suggestedSavings > 0 {
		message += fmt.Sprintf("🏦 Отложи в копилку: %.0f ₽\n", suggestedSavings)
	}
	message += fmt.Sprintf("💵 На жизнь: %.0f ₽ (~%.0f ₽/день)", remaining, dailyBudget)

	return &domain.BudgetPlan{
		Income:           income,
		Payments:         pendingPayments,
		TotalPayments:    totalPayments,
		SuggestedSavings: suggestedSavings,
		Remaining:        remaining,
		DaysUntilNext:    daysUntilNext,
		DailyBudget:      dailyBudget,
		Message:          message,
	}, nil
}

// GetMonthlyBudget получает месячный бюджет
func (s *BudgetServiceImpl) GetMonthlyBudget(ctx context.Context, month string) (*domain.MonthlyBudget, error) {
	summary, err := s.txRepo.GetMonthSummary(ctx, month)
	if err != nil {
		return nil, err
	}

	// Получаем сумму ОПЛАЧЕННЫХ плановых платежей за месяц (факт, не план)
	type PaymentRepoWithPaid interface {
		GetPaidPaymentsAmount(ctx context.Context, month string) (float64, error)
	}

	var paidPayments float64
	if repo, ok := s.paymentRepo.(PaymentRepoWithPaid); ok {
		paidPayments, _ = repo.GetPaidPaymentsAmount(ctx, month)
	}

	// Получаем реальный баланс счёта
	balance, _ := s.accountRepo.GetBalance(ctx)

	// Расходы без плановых платежей (чтобы не дублировать)
	otherExpenses := summary.Expenses - paidPayments
	if otherExpenses < 0 {
		otherExpenses = 0
	}

	budget := &domain.MonthlyBudget{
		Month:         month,
		TotalIncome:   summary.TotalIncome,
		TotalPayments: paidPayments,   // Оплаченные платежи (факт)
		TotalSavings:  summary.TotalSaved,
		TotalExpenses: otherExpenses,  // Прочие расходы (без платежей)
		Remaining:     balance,        // Реальный баланс счёта
	}

	if budget.TotalIncome > 0 {
		budget.SavingsRate = (budget.TotalSavings / budget.TotalIncome) * 100
	}

	return budget, nil
}
