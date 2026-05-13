package domain

// RecurringPayment плановый/регулярный платёж
type RecurringPayment struct {
	ID             int64   `json:"id"`
	ClientID       int64   `json:"client_id"`       // ID клиента (мультитенантность)
	Name           string  `json:"name"`            // Название (Аренда, Рассрочка, Интернет)
	Amount         float64 `json:"amount"`          // Сумма в BYN
	OriginalAmount float64 `json:"original_amount"` // Оригинальная сумма
	Currency       string  `json:"currency"`        // Валюта (BYN, EUR, RUB, USD)
	DayOfMonth     int     `json:"day_of_month"`    // День месяца (1-31) для регулярных
	DueDate        string  `json:"due_date"`        // Конкретная дата (YYYY-MM-DD) для разовых
	Category       string  `json:"category"`        // Тип: essential (обязательный), optional (опциональный)
	CategoryID     *int64  `json:"category_id"`     // ID категории расходов
	IsVariable     bool    `json:"is_variable"`     // Сумма переменная (коммуналка и т.д.)
	IsOneTime      bool    `json:"is_one_time"`     // Разовый платёж (деактивируется после оплаты)
	IsActive       bool    `json:"is_active"`
	Description    string  `json:"description"`
}

// PaymentReminder напоминание о платеже
type PaymentReminder struct {
	Payment     RecurringPayment `json:"payment"`
	DueDate     string           `json:"due_date"`      // Дата платежа
	Month       string           `json:"month"`         // Месяц платежа (YYYY-MM)
	DaysUntil   int              `json:"days_until"`    // Дней до платежа
	IsPaid      bool             `json:"is_paid"`       // Уже оплачен?
	IsOverdue   bool             `json:"is_overdue"`    // Просрочен?
	IsNextMonth bool             `json:"is_next_month"` // Платёж на следующий месяц?
}
