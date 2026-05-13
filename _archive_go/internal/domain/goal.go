package domain

import "time"

// Goal цель накопления
type Goal struct {
	ID            int64     `json:"id"`
	ClientID      int64     `json:"client_id"`      // ID клиента (мультитенантность)
	Name          string    `json:"name"`
	TargetAmount  float64   `json:"target_amount"`  // Целевая сумма в USD
	TargetDate    time.Time `json:"target_date"`
	CurrentAmount float64   `json:"current_amount"` // Текущая сумма в USD
	IsActive      bool      `json:"is_active"`
	CreatedAt     time.Time `json:"created_at"`
}

// ProgressPercent возвращает процент выполнения цели
func (g *Goal) ProgressPercent() float64 {
	if g.TargetAmount == 0 {
		return 0
	}
	return (g.CurrentAmount / g.TargetAmount) * 100
}

// DaysRemaining возвращает количество дней до целевой даты
func (g *Goal) DaysRemaining() int {
	days := int(time.Until(g.TargetDate).Hours() / 24)
	if days < 0 {
		return 0
	}
	return days
}
