package main

import "time"

// TransactionType тип транзакции
type TransactionType string

const (
	TypeAdvance     TransactionType = "advance"      // Аванс (за первую половину месяца)
	TypeSalary      TransactionType = "salary"       // Зарплата (расчёт)
	TypeBonus       TransactionType = "bonus"        // Премия
	TypeEarlyPay    TransactionType = "early_pay"    // Досрочная выплата по запросу
	TypeYearBonus   TransactionType = "year_bonus"   // Годовой бонус
	TypeVacation    TransactionType = "vacation"     // Отпускные
	TypeOther       TransactionType = "other"        // Другое
	TypeSavings     TransactionType = "savings"      // Отложено в копилку
	TypeExpense     TransactionType = "expense"      // Расход
)

// Transaction транзакция (доход или расход)
type Transaction struct {
	ID                 int64           `json:"id"`
	Date               time.Time       `json:"date"`
	Amount             float64         `json:"amount"`               // Сумма в базовой валюте (BYN)
	OriginalAmount     float64         `json:"original_amount"`      // Оригинальная сумма
	Currency           string          `json:"currency"`             // Валюта оригинала (RUB, EUR, BYN, USD)
	ExchangeRate       *float64        `json:"exchange_rate"`        // Курс на момент транзакции
	Type               TransactionType `json:"type"`
	CategoryID         *int64          `json:"category_id"`          // Категория (для расходов)
	CategoryName       string          `json:"category_name"`        // Название категории (для отображения)
	AccountID          int64           `json:"account_id"`           // Счёт
	RecurringPaymentID *int64          `json:"recurring_payment_id"` // Плановый платёж (если это оплата планового)
	Description        string          `json:"description"`
	Month              string          `json:"month"`                // Месяц к которому относится (YYYY-MM)
	IsValidated        bool            `json:"is_validated"`         // Проверена ли выплата
	CreatedAt          time.Time       `json:"created_at"`
}

// Goal цель накопления
type Goal struct {
	ID            int64     `json:"id"`
	Name          string    `json:"name"`
	TargetAmount  float64   `json:"target_amount"`  // Целевая сумма в USD
	TargetDate    time.Time `json:"target_date"`
	CurrentAmount float64   `json:"current_amount"` // Текущая сумма в USD
	IsActive      bool      `json:"is_active"`
	CreatedAt     time.Time `json:"created_at"`
}

// SalaryConfig конфигурация зарплаты для валидации
type SalaryConfig struct {
	GrossSalary      float64 `json:"gross_salary"`       // Оклад до налогов (320000)
	ExpectedAdvance  float64 `json:"expected_advance"`   // Ожидаемый аванс (~160650)
	NDFLRate         float64 `json:"ndfl_rate"`          // Ставка НДФЛ (0.13-0.15)
	TolerancePercent float64 `json:"tolerance_percent"`  // Допустимое отклонение в %
}

// MonthSummary сводка за месяц
type MonthSummary struct {
	Month       string  `json:"month"`
	TotalIncome float64 `json:"total_income"`
	TotalBonus  float64 `json:"total_bonus"`
	TotalSaved  float64 `json:"total_saved"`
	Expenses    float64 `json:"expenses"`
}

// DashboardData данные для главной страницы
type DashboardData struct {
	Goal             *Goal          `json:"goal"`
	ProgressPercent  float64        `json:"progress_percent"`
	DaysRemaining    int            `json:"days_remaining"`
	MonthlyTarget    float64        `json:"monthly_target"`    // Сколько нужно откладывать в месяц
	CurrentMonth     MonthSummary   `json:"current_month"`
	RecentTransactions []Transaction `json:"recent_transactions"`
	USDRate          float64        `json:"usd_rate"`
	TotalSavedRUB    float64        `json:"total_saved_rub"`
	TotalSavedUSD    float64        `json:"total_saved_usd"`
}

// ValidationResult результат проверки выплаты
type ValidationResult struct {
	IsValid       bool    `json:"is_valid"`
	ExpectedMin   float64 `json:"expected_min"`
	ExpectedMax   float64 `json:"expected_max"`
	Actual        float64 `json:"actual"`
	Difference    float64 `json:"difference"`
	Message       string  `json:"message"`
}

// RecurringPayment плановый/регулярный платёж
type RecurringPayment struct {
	ID             int64   `json:"id"`
	Name           string  `json:"name"`            // Название (Аренда, Рассрочка, Интернет)
	Amount         float64 `json:"amount"`          // Сумма в BYN
	OriginalAmount float64 `json:"original_amount"` // Оригинальная сумма
	Currency       string  `json:"currency"`        // Валюта (BYN, EUR, RUB, USD)
	DayOfMonth     int     `json:"day_of_month"`    // День месяца (1-31)
	Category       string  `json:"category"`        // Тип: essential (обязательный), optional (опциональный)
	CategoryID     *int64  `json:"category_id"`     // ID категории расходов
	IsVariable     bool    `json:"is_variable"`     // Сумма переменная (коммуналка и т.д.)
	IsActive       bool    `json:"is_active"`
	Description    string  `json:"description"`
}

// PaydayConfig настройки дней выплат
type PaydayConfig struct {
	AdvanceDay int `json:"advance_day"` // День аванса (обычно 30)
	SalaryDay  int `json:"salary_day"`  // День зарплаты (обычно 15)
}

// BudgetPlan план распределения дохода
type BudgetPlan struct {
	Income           float64            `json:"income"`            // Полученный доход
	Payments         []PaymentReminder  `json:"payments"`          // Платежи которые нужно сделать
	TotalPayments    float64            `json:"total_payments"`    // Сумма обязательных платежей
	SuggestedSavings float64            `json:"suggested_savings"` // Рекомендуемая сумма в копилку
	Remaining        float64            `json:"remaining"`         // Остаётся на жизнь
	DaysUntilNext    int                `json:"days_until_next"`   // Дней до следующего дохода
	DailyBudget      float64            `json:"daily_budget"`      // Бюджет на день
	Message          string             `json:"message"`           // Рекомендация
}

// PaymentReminder напоминание о платеже
type PaymentReminder struct {
	Payment      RecurringPayment `json:"payment"`
	DueDate      string           `json:"due_date"`       // Дата платежа
	Month        string           `json:"month"`          // Месяц платежа (YYYY-MM)
	DaysUntil    int              `json:"days_until"`     // Дней до платежа
	IsPaid       bool             `json:"is_paid"`        // Уже оплачен?
	IsOverdue    bool             `json:"is_overdue"`     // Просрочен?
	IsNextMonth  bool             `json:"is_next_month"`  // Платёж на следующий месяц?
}

// MonthlyBudget месячный бюджет
type MonthlyBudget struct {
	Month            string  `json:"month"`
	TotalIncome      float64 `json:"total_income"`
	TotalPayments    float64 `json:"total_payments"`    // Обязательные платежи
	TotalSavings     float64 `json:"total_savings"`     // Отложено
	TotalExpenses    float64 `json:"total_expenses"`    // Прочие расходы
	Remaining        float64 `json:"remaining"`         // Остаток
	SavingsRate      float64 `json:"savings_rate"`      // % накоплений от дохода
}

// Account счёт/кошелёк
type Account struct {
	ID             int64   `json:"id"`
	Name           string  `json:"name"`             // "Основной счёт"
	Balance        float64 `json:"balance"`          // Текущий баланс в BYN
	LastSyncDate   string  `json:"last_sync_date"`   // Последняя сверка
	LastSyncAmount float64 `json:"last_sync_amount"` // Сумма при последней сверке
}

// Category категория расходов
type Category struct {
	ID        int64   `json:"id"`
	Name      string  `json:"name"`       // "Еда", "Транспорт"
	ParentID  *int64  `json:"parent_id"`  // nil = корневая категория
	Icon      string  `json:"icon"`       // emoji
	Color     string  `json:"color"`      // для графиков (#FF5733)
	SortOrder int     `json:"sort_order"` // порядок сортировки
	IsActive  bool    `json:"is_active"`  // для soft delete
}

// CategoryWithSubs категория с подкатегориями
type CategoryWithSubs struct {
	Category
	Subcategories []Category `json:"subcategories"`
}

// ExpenseByCategory расходы по категории
type ExpenseByCategory struct {
	CategoryID   int64   `json:"category_id"`
	CategoryName string  `json:"category_name"`
	Icon         string  `json:"icon"`
	Color        string  `json:"color"`
	Amount       float64 `json:"amount"`
	Percent      float64 `json:"percent"`
}

// AnalyticsData данные для аналитики
type AnalyticsData struct {
	TotalIncome     float64             `json:"total_income"`
	TotalExpenses   float64             `json:"total_expenses"`
	TotalSavings    float64             `json:"total_savings"`
	ByCategory      []ExpenseByCategory `json:"by_category"`
	MonthlyTrend    []MonthSummary      `json:"monthly_trend"`
}

// Budget бюджет на месяц
type Budget struct {
	ID            int64              `json:"id"`
	Month         string             `json:"month"`
	TotalLimit    float64            `json:"total_limit"`
	SavingsTarget float64            `json:"savings_target"`
	Notes         string             `json:"notes"`
	Categories    []BudgetCategory   `json:"categories"`
	CreatedAt     time.Time          `json:"created_at"`
	UpdatedAt     time.Time          `json:"updated_at"`
}

// BudgetCategory лимит бюджета по категории
type BudgetCategory struct {
	ID           int64   `json:"id"`
	BudgetID     int64   `json:"budget_id"`
	CategoryID   *int64  `json:"category_id"`
	CategoryName string  `json:"category_name"`
	AmountLimit  float64 `json:"amount_limit"`
	AmountSpent  float64 `json:"amount_spent"`  // вычисляется динамически
	Percent      float64 `json:"percent"`       // вычисляется динамически
}

// BudgetSummary сводка по бюджету
type BudgetSummary struct {
	Budget        *Budget `json:"budget"`
	TotalSpent    float64 `json:"total_spent"`
	TotalLimit    float64 `json:"total_limit"`
	Remaining     float64 `json:"remaining"`
	PercentUsed   float64 `json:"percent_used"`
	IsOverBudget  bool    `json:"is_over_budget"`
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
