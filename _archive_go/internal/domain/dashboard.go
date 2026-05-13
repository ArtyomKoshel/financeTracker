package domain

// DashboardData данные для главной страницы
type DashboardData struct {
	Goal               *Goal         `json:"goal"`
	ProgressPercent    float64       `json:"progress_percent"`
	DaysRemaining      int           `json:"days_remaining"`
	MonthlyTarget      float64       `json:"monthly_target"` // Сколько нужно откладывать в месяц
	CurrentMonth       MonthSummary  `json:"current_month"`
	RecentTransactions []Transaction `json:"recent_transactions"`
	USDRate            float64       `json:"usd_rate"`
	TotalSavedRUB      float64       `json:"total_saved_rub"`
	TotalSavedUSD      float64       `json:"total_saved_usd"`
}
