package domain

import "time"

// BudgetPlan план распределения дохода
type BudgetPlan struct {
	Income           float64           `json:"income"`            // Полученный доход
	Payments         []PaymentReminder `json:"payments"`          // Платежи которые нужно сделать
	TotalPayments    float64           `json:"total_payments"`    // Сумма обязательных платежей
	SuggestedSavings float64           `json:"suggested_savings"` // Рекомендуемая сумма в копилку
	Remaining        float64           `json:"remaining"`         // Остаётся на жизнь
	DaysUntilNext    int               `json:"days_until_next"`   // Дней до следующего дохода
	DailyBudget      float64           `json:"daily_budget"`      // Бюджет на день
	Message          string            `json:"message"`           // Рекомендация
}

// MonthlyBudget месячный бюджет
type MonthlyBudget struct {
	Month         string  `json:"month"`
	TotalIncome   float64 `json:"total_income"`
	TotalPayments float64 `json:"total_payments"` // Обязательные платежи
	TotalSavings  float64 `json:"total_savings"`  // Отложено
	TotalExpenses float64 `json:"total_expenses"` // Прочие расходы
	Remaining     float64 `json:"remaining"`      // Остаток
	SavingsRate   float64 `json:"savings_rate"`   // % накоплений от дохода
}

// Budget бюджет на месяц
type Budget struct {
	ID            int64            `json:"id"`
	Month         string           `json:"month"`
	TotalLimit    float64          `json:"total_limit"`
	SavingsTarget float64          `json:"savings_target"`
	Notes         string           `json:"notes"`
	Categories    []BudgetCategory `json:"categories"`
	CreatedAt     time.Time        `json:"created_at"`
	UpdatedAt     time.Time        `json:"updated_at"`
}

// BudgetCategory лимит бюджета по категории
type BudgetCategory struct {
	ID           int64   `json:"id"`
	BudgetID     int64   `json:"budget_id"`
	CategoryID   *int64  `json:"category_id"`
	CategoryName string  `json:"category_name"`
	AmountLimit  float64 `json:"amount_limit"`
	AmountSpent  float64 `json:"amount_spent"` // вычисляется динамически
	Percent      float64 `json:"percent"`      // вычисляется динамически
}

// BudgetSummary сводка по бюджету
type BudgetSummary struct {
	Budget       *Budget `json:"budget"`
	TotalSpent   float64 `json:"total_spent"`
	TotalLimit   float64 `json:"total_limit"`
	Remaining    float64 `json:"remaining"`
	PercentUsed  float64 `json:"percent_used"`
	IsOverBudget bool    `json:"is_over_budget"`
}

// CashflowRecommendation рекомендация по распределению средств
type CashflowRecommendation struct {
	Balance          float64           `json:"balance"`
	LivingBudget     float64           `json:"living_budget"`
	TotalPayments    float64           `json:"total_payments"`
	FreeFunds        float64           `json:"free_funds"`
	SuggestedSavings float64           `json:"suggested_savings"`
	SavingsPercent   float64           `json:"savings_percent"`
	NextIncomeDate   string            `json:"next_income_date"`
	NextIncomeType   string            `json:"next_income_type"`
	DaysUntilIncome  int               `json:"days_until_income"`
	PaymentsList     []PaymentReminder `json:"payments_list"`
	// Новые метрики для отслеживания прогресса трат
	EssentialSpent     float64 `json:"essential_spent"`      // Потрачено из базовых бюджетов
	EssentialRemaining float64 `json:"essential_remaining"`  // Осталось на жизнь (план - факт)
	DailyBudget        float64 `json:"daily_budget"`         // Бюджет в день
	EssentialTotal     float64 `json:"essential_total"`      // Полный месячный бюджет (для подсказки)
}

// CategoryBudget бюджет по категории на месяц
type CategoryBudget struct {
	ID           int64   `json:"id"`
	ClientID     int64   `json:"client_id"`      // ID клиента (мультитенантность)
	CategoryID   int64   `json:"category_id"`
	CategoryName string  `json:"category_name"`
	CategoryIcon string  `json:"category_icon"`
	Month        string  `json:"month"`
	LimitAmount  float64 `json:"limit_amount"`
	SpentAmount  float64 `json:"spent_amount"`   // рассчитывается динамически
	AlertPercent float64 `json:"alert_percent"`  // порог предупреждения (по умолчанию 80)
	IsExceeded   bool    `json:"is_exceeded"`    // рассчитывается динамически
	PercentUsed  float64 `json:"percent_used"`   // рассчитывается динамически
	IsRecurring  bool    `json:"is_recurring"`   // повторять каждый месяц
	IsEssential  bool    `json:"is_essential"`   // базовые расходы (влияет на "На жизнь")
}

// BudgetWarning предупреждение о превышении бюджета
type BudgetWarning struct {
	CategoryID   int64   `json:"category_id"`
	CategoryName string  `json:"category_name"`
	CategoryIcon string  `json:"category_icon"`
	LimitAmount  float64 `json:"limit_amount"`
	SpentAmount  float64 `json:"spent_amount"`
	Percent      float64 `json:"percent"`
	Message      string  `json:"message"`
}

// FinancialHealth метрики финансового здоровья для AI-рекомендаций
// OverBudgetInfo информация о превышенном бюджете категории
type OverBudgetInfo struct {
	CategoryName string  `json:"category_name"` // Название категории
	BudgetAmount float64 `json:"budget_amount"` // Бюджет
	SpentAmount  float64 `json:"spent_amount"`  // Потрачено
	OverAmount   float64 `json:"over_amount"`   // Превышение
	OverPercent  float64 `json:"over_percent"`  // % превышения
}

type FinancialHealth struct {
	// Базовые метрики
	SavingsRate       float64 `json:"savings_rate"`        // % накоплений от дохода
	ExpenseToIncome   float64 `json:"expense_to_income"`   // % расходов от дохода
	EmergencyFundDays int     `json:"emergency_fund_days"` // На сколько дней хватит баланса

	// Копилка (подушка безопасности)
	TotalSavings    float64 `json:"total_savings"`     // Сумма в копилке (в базовой валюте)
	TotalSavingsUSD float64 `json:"total_savings_usd"` // Сумма в копилке (USD)
	SavingsDays     int     `json:"savings_days"`      // На сколько дней хватит копилки
	GoalName        string  `json:"goal_name"`         // Название цели
	GoalProgress    float64 `json:"goal_progress"`     // Прогресс цели %

	// Тренды (по сравнению с прошлым месяцем)
	IncomeGrowth   float64 `json:"income_growth"`   // Изменение дохода %
	ExpenseGrowth  float64 `json:"expense_growth"`  // Изменение расходов %
	SavingsGrowth  float64 `json:"savings_growth"`  // Изменение накоплений %

	// Риски
	OverBudgetCount    int                `json:"over_budget_count"`    // Сколько категорий превышено
	OverBudgetList     []OverBudgetInfo   `json:"over_budget_list"`     // Список превышенных категорий
	UpcomingPayments   float64            `json:"upcoming_payments"`    // Платежи в ближайшие 7 дней
	PaymentCoverage    float64            `json:"payment_coverage"`     // Баланс / Платежи до ЗП

	// Поведение
	DailySpendingAvg float64 `json:"daily_spending_avg"` // Средние траты в день
	BurnRate         float64 `json:"burn_rate"`          // Скорость трат (Br/день)
	DaysUntilZero    int     `json:"days_until_zero"`    // При текущем burn rate

	// Прогноз
	PredictedEndOfMonth float64 `json:"predicted_end_of_month"` // Прогноз баланса на конец месяца

	// Cashflow
	CashflowFree    float64 `json:"cashflow_free"`    // Свободно до ЗП
	CashflowDeficit bool    `json:"cashflow_deficit"` // Есть дефицит?

	// Общий скоринг (0-100)
	HealthScore int    `json:"health_score"`
	Status      string `json:"status"` // "excellent", "good", "warning", "critical"
	Message     string `json:"message"`
}
