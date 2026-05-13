package domain

// SalaryConfig конфигурация зарплаты для валидации
type SalaryConfig struct {
	GrossSalary      float64 `json:"gross_salary"`      // Чистая ЗП на руки (после налогов)
	ExpectedAdvance  float64 `json:"expected_advance"`  // Ожидаемый аванс (~160650)
	TolerancePercent float64 `json:"tolerance_percent"` // Допустимое отклонение в %
}

// PaydayConfig настройки дней выплат
type PaydayConfig struct {
	AdvanceDay int `json:"advance_day"` // День аванса (обычно 30)
	SalaryDay  int `json:"salary_day"`  // День зарплаты (обычно 15)
}

// SettingHistory история изменений настройки
type SettingHistory struct {
	ID        int64   `json:"id"`
	Key       string  `json:"key"`
	Value     string  `json:"value"`
	ValidFrom string  `json:"valid_from"`
	ValidTo   *string `json:"valid_to"`
	CreatedAt string  `json:"created_at"`
}

// Settings основные настройки приложения
type Settings struct {
	SalaryConfig
	PaydayConfig
	MinLivingBudget float64 `json:"min_living_budget"` // Минимум на жизнь в месяц
	SavingsPercent  float64 `json:"savings_percent"`   // Процент от свободных средств для накоплений
}
