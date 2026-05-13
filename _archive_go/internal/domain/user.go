package domain

import "time"

// User представляет клиента системы
type User struct {
	ID             int64     `json:"id"`
	Email          string    `json:"email"`
	PasswordHash   string    `json:"-"` // не отдаём в JSON
	Name           string    `json:"name"`
	IsActive       bool      `json:"is_active"`
	IsAdmin        bool      `json:"is_admin"`
	LastLoginAt    string    `json:"last_login_at,omitempty"`
	LastActivityAt string   `json:"last_activity_at,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

// LoginRequest запрос на вход
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginResponse ответ при успешном входе
type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

// ClientWithStats клиент со статистикой для админ-панели
type ClientWithStats struct {
	User             User `json:"user"`
	TransactionCount int  `json:"transaction_count"`
}
