package domain

// MonthSummary сводка за месяц
type MonthSummary struct {
	Month       string  `json:"month"`
	TotalIncome float64 `json:"total_income"`
	TotalBonus  float64 `json:"total_bonus"`
	TotalSaved  float64 `json:"total_saved"`
	Expenses    float64 `json:"expenses"`
}

// AnalyticsData данные для аналитики
type AnalyticsData struct {
	TotalIncome   float64             `json:"total_income"`
	TotalExpenses float64             `json:"total_expenses"`
	TotalSavings  float64             `json:"total_savings"`
	ByCategory    []ExpenseByCategory `json:"by_category"`
	MonthlyTrend  []MonthSummary      `json:"monthly_trend"`
}

// YearlyAnalytics годовая аналитика
type YearlyAnalytics struct {
	Year               int                 `json:"year"`
	TotalIncome        float64             `json:"total_income"`
	TotalExpenses      float64             `json:"total_expenses"`
	TotalSavings       float64             `json:"total_savings"`
	AvgMonthlyIncome   float64             `json:"avg_monthly_income"`
	AvgMonthlyExpenses float64             `json:"avg_monthly_expenses"`
	ByCategory         []ExpenseByCategory `json:"by_category"`
	MonthlyData        []MonthSummary      `json:"monthly_data"`
}

// MonthComparison сравнение двух месяцев
type MonthComparison struct {
	Month1       string               `json:"month1"`
	Month2       string               `json:"month2"`
	IncomeDiff   float64              `json:"income_diff"`
	ExpensesDiff float64              `json:"expenses_diff"`
	Categories   []CategoryComparison `json:"categories"`
	// Итоги по плановым платежам
	PlannedMonth1 float64 `json:"planned_month1"`
	PlannedMonth2 float64 `json:"planned_month2"`
	PlannedDiff   float64 `json:"planned_diff"`
	// Итоги по прочим расходам
	OtherMonth1   float64 `json:"other_month1"`
	OtherMonth2   float64 `json:"other_month2"`
	OtherDiff     float64 `json:"other_diff"`
}

// CategoryComparison сравнение категории между месяцами
type CategoryComparison struct {
	CategoryID    int64   `json:"category_id"`
	CategoryName  string  `json:"category_name"`
	CategoryIcon  string  `json:"category_icon"`
	Month1Amount  float64 `json:"month1_amount"`
	Month2Amount  float64 `json:"month2_amount"`
	Difference    float64 `json:"difference"`
	PercentChange float64 `json:"percent_change"`
	IsPlanned     bool    `json:"is_planned"` // Связан с плановым платежом
}

// CategoryTrend тренд расходов по категории
type CategoryTrend struct {
	CategoryID   int64          `json:"category_id"`
	CategoryName string         `json:"category_name"`
	CategoryIcon string         `json:"category_icon"`
	MonthlyData  []MonthAmount  `json:"monthly_data"`
	Average      float64        `json:"average"`
	Max          float64        `json:"max"`
	Min          float64        `json:"min"`
}

// MonthAmount сумма за месяц
type MonthAmount struct {
	Month  string  `json:"month"`
	Amount float64 `json:"amount"`
}
