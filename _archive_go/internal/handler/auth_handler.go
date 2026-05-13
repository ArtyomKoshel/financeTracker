package handler

import (
	"encoding/json"
	"net/http"

	"finance-tracker/internal/domain"
	"finance-tracker/internal/service"
)

// AuthHandler обработчик авторизации
type AuthHandler struct {
	*BaseHandler
	authService *service.AuthService
}

// NewAuthHandler создаёт обработчик авторизации
func NewAuthHandler(base *BaseHandler, authService *service.AuthService) *AuthHandler {
	return &AuthHandler{
		BaseHandler: base,
		authService: authService,
	}
}

// Login обрабатывает вход пользователя
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req domain.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.ErrorResponse(w, err, http.StatusBadRequest)
		return
	}

	resp, err := h.authService.Login(r.Context(), req)
	if err != nil {
		h.ErrorResponse(w, err, http.StatusUnauthorized)
		return
	}

	h.JSONResponse(w, resp, nil)
}
