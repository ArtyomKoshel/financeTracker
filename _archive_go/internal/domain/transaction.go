package domain

import "time"

// TransactionType тип транзакции
type TransactionType string

const (
	TypeAdvance    TransactionType = "advance"    // Аванс (за первую половину месяца)
	TypeSalary     TransactionType = "salary"     // Зарплата (расчёт)
	TypeBonus      TransactionType = "bonus"      // Премия
	TypeEarlyPay   TransactionType = "early_pay"  // Досрочная выплата по запросу
	TypeYearBonus  TransactionType = "year_bonus" // Годовой бонус
	TypeVacation   TransactionType = "vacation"   // Отпускные
	TypeOther      TransactionType = "other"      // Другое
	TypeSavings    TransactionType = "savings"    // Отложено в копилку
	TypeExpense    TransactionType = "expense"    // Расход
	TypeCorrection TransactionType = "correction" // Сверка баланса
)

// Transaction транзакция (доход или расход)
type Transaction struct {
	ID                 int64           `json:"id"`
	ClientID           int64           `json:"client_id"`            // ID клиента (мультитенантность)
	Date               time.Time       `json:"date"`
	Amount             float64         `json:"amount"`               // Сумма в базовой валюте (BYN)
	OriginalAmount     float64         `json:"original_amount"`      // Оригинальная сумма
	Currency           string          `json:"currency"`             // Валюта оригинала (RUB, EUR, BYN, USD)
	ExchangeRate       *float64        `json:"exchange_rate"`        // Курс на момент транзакции
	Type               TransactionType `json:"type"`
	CategoryID         *int64          `json:"category_id"`          // Категория (для расходов)
	CategoryName       string          `json:"category_name"`        // Название категории (для отображения)
	CategoryIcon       string          `json:"category_icon"`        // Иконка категории (emoji)
	AccountID          int64           `json:"account_id"`           // Счёт
	RecurringPaymentID *int64          `json:"recurring_payment_id"` // Плановый платёж (если это оплата планового)
	Description        string          `json:"description"`
	Month              string          `json:"month"`        // Месяц к которому относится (YYYY-MM)
	IsValidated        bool            `json:"is_validated"` // Проверена ли выплата
	CreatedAt          time.Time       `json:"created_at"`
}

// TransactionFilter фильтр для запроса транзакций
type TransactionFilter struct {
	Month      string
	Type       TransactionType
	CategoryID *int64
	Limit      int
	Offset     int
}
