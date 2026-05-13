package service

import (
	"context"
	"math"
	"time"

	"finance-tracker/internal/domain"
	"finance-tracker/internal/repository"
)

// HealthServiceImpl сервис расчёта финансового здоровья
type HealthServiceImpl struct {
	accountRepo        repository.AccountRepository
	txRepo             repository.TransactionRepository
	paymentRepo        repository.PaymentRepository
	categoryBudgetRepo repository.CategoryBudgetRepository
	analyticsRepo      repository.AnalyticsRepository
	goalRepo           repository.GoalRepository
	currencySvc        CurrencyService
	budgetSvc          BudgetService
}

// NewHealthService создаёт новый сервис здоровья
func NewHealthService(
	accountRepo repository.AccountRepository,
	txRepo repository.TransactionRepository,
	paymentRepo repository.PaymentRepository,
	categoryBudgetRepo repository.CategoryBudgetRepository,
	analyticsRepo repository.AnalyticsRepository,
	goalRepo repository.GoalRepository,
	currencySvc CurrencyService,
	budgetSvc BudgetService,
) *HealthServiceImpl {
	return &HealthServiceImpl{
		accountRepo:        accountRepo,
		txRepo:             txRepo,
		paymentRepo:        paymentRepo,
		categoryBudgetRepo: categoryBudgetRepo,
		analyticsRepo:      analyticsRepo,
		goalRepo:           goalRepo,
		currencySvc:        currencySvc,
		budgetSvc:          budgetSvc,
	}
}

// CalculateHealth рассчитывает метрики финансового здоровья
func (s *HealthServiceImpl) CalculateHealth(ctx context.Context) (*domain.FinancialHealth, error) {
	health := &domain.FinancialHealth{}
	now := time.Now()
	currentMonth := now.Format("2006-01")
	prevMonth := now.AddDate(0, -1, 0).Format("2006-01")
	dayOfMonth := now.Day()

	// Получаем баланс
	balance, err := s.accountRepo.GetBalance(ctx)
	if err != nil {
		return nil, err
	}

	// Получаем данные за текущий и прошлый месяц
	currentIncome, currentExpenses, currentSavings, _ := s.analyticsRepo.GetMonthTotals(ctx, currentMonth)
	prevIncome, prevExpenses, prevSavings, _ := s.analyticsRepo.GetMonthTotals(ctx, prevMonth)

	// Получаем данные за 3 месяца для расчёта средних
	month2 := now.AddDate(0, -2, 0).Format("2006-01")
	_, expenses2, _, _ := s.analyticsRepo.GetMonthTotals(ctx, month2)

	// Рассчитываем среднедневные расходы на основе истории (более надёжно)
	// Используем прошлые 2 месяца + текущий пропорционально
	totalHistoricalExpenses := prevExpenses + expenses2
	historicalDays := 60 // ~2 месяца
	
	var avgDailyExpenses float64
	if totalHistoricalExpenses > 0 {
		avgDailyExpenses = totalHistoricalExpenses / float64(historicalDays)
	}
	
	// Если в начале месяца (< 15 дней) — используем прошлый месяц для метрик
	// Иначе используем текущий
	useCurrentMonth := dayOfMonth >= 15

	var referenceIncome, referenceExpenses, referenceSavings float64
	if useCurrentMonth && currentIncome > 0 {
		referenceIncome = currentIncome
		referenceExpenses = currentExpenses
		referenceSavings = currentSavings
	} else {
		// Используем прошлый месяц как базу
		referenceIncome = prevIncome
		referenceExpenses = prevExpenses
		referenceSavings = prevSavings
	}

	// Базовые метрики
	if referenceIncome > 0 {
		health.SavingsRate = (referenceSavings / referenceIncome) * 100
		health.ExpenseToIncome = (referenceExpenses / referenceIncome) * 100
	}

	// Burn rate — среднедневные расходы (на основе истории)
	health.DailySpendingAvg = avgDailyExpenses
	health.BurnRate = avgDailyExpenses

	// На сколько дней хватит баланса (при средних расходах)
	if health.BurnRate > 0 {
		health.DaysUntilZero = int(balance / health.BurnRate)
		health.EmergencyFundDays = health.DaysUntilZero
	}

	// Тренды — сравниваем прошлый месяц с позапрошлым (более стабильно)
	_, prevPrevExpenses, _, _ := s.analyticsRepo.GetMonthTotals(ctx, month2)
	if prevPrevExpenses > 0 {
		health.ExpenseGrowth = ((prevExpenses - prevPrevExpenses) / prevPrevExpenses) * 100
	}
	// Для дохода сравниваем текущий с прошлым только если есть данные
	if prevIncome > 0 && currentIncome > 0 {
		health.IncomeGrowth = ((currentIncome - prevIncome) / prevIncome) * 100
	}
	if prevSavings > 0 && referenceSavings > 0 {
		health.SavingsGrowth = ((referenceSavings - prevSavings) / prevSavings) * 100
	}

	// Бюджеты категорий - считаем превышенные и сохраняем список
	budgets, err := s.categoryBudgetRepo.GetByMonth(ctx, currentMonth)
	if err == nil {
		for _, b := range budgets {
			if b.IsExceeded {
				health.OverBudgetCount++
				overAmount := b.SpentAmount - b.LimitAmount
				overPercent := 0.0
				if b.LimitAmount > 0 {
					overPercent = (overAmount / b.LimitAmount) * 100
				}
				health.OverBudgetList = append(health.OverBudgetList, domain.OverBudgetInfo{
					CategoryName: b.CategoryName,
					BudgetAmount: b.LimitAmount,
					SpentAmount:  b.SpentAmount,
					OverAmount:   overAmount,
					OverPercent:  overPercent,
				})
			}
		}
	}

	// Предстоящие платежи (7 дней)
	nextWeek := now.AddDate(0, 0, 7)
	reminders, totalPayments, _ := s.paymentRepo.GetPaymentsUntilDate(ctx, nextWeek)
	health.UpcomingPayments = totalPayments
	_ = reminders // Используем только totalPayments

	// Payment coverage
	if totalPayments > 0 {
		health.PaymentCoverage = balance / totalPayments
	} else {
		health.PaymentCoverage = 100 // Нет платежей = отличное покрытие
	}

	// Прогноз на конец месяца
	daysLeft := time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day() - now.Day()
	health.PredictedEndOfMonth = balance - (health.BurnRate * float64(daysLeft))

	// Получаем обязательные ежемесячные платежи (аренда, кредиты и т.д.)
	var monthlyPayments float64
	payments, err := s.paymentRepo.GetActive(ctx)
	if err == nil {
		for _, p := range payments {
			// Только обязательные и не разовые
			if p.Category == "essential" && !p.IsOneTime {
				// Конвертируем в BYN если нужно
				amount := p.Amount
				if p.Currency != "BYN" && s.currencySvc != nil {
					rate, err := s.currencySvc.GetRate(ctx, p.Currency)
					if err == nil && rate > 0 {
						amount = p.Amount * rate
					}
				}
				monthlyPayments += amount
			}
		}
	}
	dailyPayments := monthlyPayments / 30.0 // Обязательные платежи в пересчёте на день

	// Копилка (подушка безопасности)
	if s.goalRepo != nil {
		goal, err := s.goalRepo.GetActive(ctx)
		if err == nil && goal != nil {
			health.GoalName = goal.Name
			health.TotalSavingsUSD = goal.CurrentAmount
			health.GoalProgress = 0
			if goal.TargetAmount > 0 {
				health.GoalProgress = (goal.CurrentAmount / goal.TargetAmount) * 100
			}

			// Конвертируем накопления в BYN для расчёта дней
			if s.currencySvc != nil {
				usdRate, err := s.currencySvc.GetRate(ctx, "USD")
				if err == nil && usdRate > 0 {
					health.TotalSavings = goal.CurrentAmount * usdRate
					// На сколько дней хватит копилки
					// Учитываем и повседневные расходы, и обязательные платежи
					totalDailyExpenses := health.BurnRate + dailyPayments
					if totalDailyExpenses > 0 {
						health.SavingsDays = int(health.TotalSavings / totalDailyExpenses)
					}
				}
			}
		}
	}

	// Получаем Cashflow для учёта дефицита
	if s.budgetSvc != nil {
		cashflow, err := s.budgetSvc.CalculateCashflow(ctx)
		if err == nil {
			health.CashflowFree = cashflow.FreeFunds
			health.CashflowDeficit = cashflow.FreeFunds < 0
		}
	}

	// Расчёт Health Score (0-100)
	health.HealthScore = s.calculateHealthScore(health)
	health.Status, health.Message = s.getStatusAndMessage(health)

	return health, nil
}

// calculateHealthScore рассчитывает общий скоринг здоровья
func (s *HealthServiceImpl) calculateHealthScore(h *domain.FinancialHealth) int {
	score := 100.0

	// КРИТИЧНО: Дефицит Cashflow (нет денег до ЗП)
	if h.CashflowDeficit {
		// Чем больше дефицит, тем хуже
		if h.CashflowFree < -500 {
			score -= 50 // Серьёзный дефицит
		} else if h.CashflowFree < -100 {
			score -= 35 // Значительный дефицит
		} else {
			score -= 25 // Небольшой дефицит
		}
	}

	// Savings Rate (20% идеально)
	if h.SavingsRate < 0 {
		score -= 20
	} else if h.SavingsRate < 10 {
		score -= 10
	} else if h.SavingsRate < 20 {
		score -= 5
	}

	// Expense to Income (< 80% хорошо)
	if h.ExpenseToIncome > 100 {
		score -= 25
	} else if h.ExpenseToIncome > 90 {
		score -= 15
	} else if h.ExpenseToIncome > 80 {
		score -= 5
	}

	// Баланс (на сколько дней хватит)
	if h.EmergencyFundDays < 7 {
		score -= 10
	} else if h.EmergencyFundDays < 14 {
		score -= 5
	}

	// Копилка / подушка безопасности (рекомендуется 3-6 месяцев = 90-180 дней)
	if h.SavingsDays <= 0 {
		score -= 20 // Нет подушки — серьёзный риск
	} else if h.SavingsDays < 30 {
		score -= 15 // Меньше месяца — опасно
	} else if h.SavingsDays < 60 {
		score -= 10 // 1-2 месяца — недостаточно
	} else if h.SavingsDays < 90 {
		score -= 5 // 2-3 месяца — нормально
	}
	// >= 90 дней — хорошо, бонус не нужен

	// Превышенные бюджеты
	score -= float64(h.OverBudgetCount * 5)

	// Payment Coverage
	if h.PaymentCoverage < 1 {
		score -= 15
	} else if h.PaymentCoverage < 1.5 {
		score -= 5
	}

	// Expense Growth (рост расходов плохо)
	if h.ExpenseGrowth > 30 {
		score -= 10
	} else if h.ExpenseGrowth > 15 {
		score -= 5
	}

	return int(math.Max(0, math.Min(100, score)))
}

// getStatusAndMessage возвращает статус и сообщение на основе скоринга
func (s *HealthServiceImpl) getStatusAndMessage(h *domain.FinancialHealth) (string, string) {
	// Приоритет: дефицит важнее всего
	if h.CashflowDeficit {
		if h.CashflowFree < -500 {
			return "critical", "🚨 Серьёзный дефицит! Денег не хватит до зарплаты. Срочно сократите расходы."
		}
		return "warning", "⚠️ Дефицит до ЗП! Рекомендуется сократить необязательные расходы."
	}

	switch {
	case h.HealthScore >= 80:
		if h.SavingsDays >= 90 {
			return "excellent", "🌟 Отличное состояние! Подушка безопасности в норме."
		}
		return "excellent", "🌟 Хорошее состояние! Рекомендуем увеличить подушку до 3 месяцев."
	case h.HealthScore >= 60:
		msg := "👍 Хорошее состояние. "
		if h.SavingsDays < 30 {
			msg += "Подушка слишком маленькая! "
		} else if h.SavingsDays < 60 {
			msg += "Увеличьте подушку безопасности. "
		}
		if h.OverBudgetCount > 0 {
			msg += "Следите за бюджетами. "
		}
		return "good", msg
	case h.HealthScore >= 40:
		msg := "⚠️ Внимание! "
		if h.SavingsDays <= 0 {
			msg += "Нет подушки безопасности! "
		} else if h.SavingsDays < 30 {
			msg += "Подушка меньше месяца — рискованно. "
		}
		if h.PaymentCoverage < 1 {
			msg += "Баланс не покрывает платежи. "
		}
		if h.OverBudgetCount > 0 {
			msg += "Превышены бюджеты. "
		}
		return "warning", msg
	default:
		if h.SavingsDays <= 0 {
			return "critical", "🚨 Критично! Нет подушки безопасности. Срочно начните откладывать."
		}
		return "critical", "🚨 Критическое состояние! Требуется пересмотр расходов."
	}
}
