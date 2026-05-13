package domain

// Account счёт/кошелёк
type Account struct {
	ID             int64   `json:"id"`
	ClientID       int64   `json:"client_id"`        // ID клиента (мультитенантность)
	Name           string  `json:"name"`             // "Основной счёт"
	Balance        float64 `json:"balance"`          // Текущий баланс в BYN
	LastSyncDate   string  `json:"last_sync_date"`   // Последняя сверка
	LastSyncAmount float64 `json:"last_sync_amount"` // Сумма при последней сверке
}
