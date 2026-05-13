package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"finance-tracker/internal/domain"
	"finance-tracker/internal/repository"
	"finance-tracker/internal/service"
)

// AdminHandler обработчик административных функций
type AdminHandler struct {
	*BaseHandler
	userRepo repository.UserRepository
	txRepo   repository.TransactionRepository
	auth     *service.AuthService
}

// NewAdminHandler создаёт обработчик админки
func NewAdminHandler(base *BaseHandler, userRepo repository.UserRepository, txRepo repository.TransactionRepository, auth *service.AuthService) *AdminHandler {
	return &AdminHandler{
		BaseHandler: base,
		userRepo:    userRepo,
		txRepo:      txRepo,
		auth:        auth,
	}
}

// AdminMe возвращает текущего админа (для проверки доступа к /admin)
func (h *AdminHandler) AdminMe(w http.ResponseWriter, r *http.Request) {
	// Вызывается после AuthMiddleware — контекст уже проверен
	// AdminOnlyMiddleware проверяет is_admin для /api/admin/*
	// Для /api/admin/me передаём успешный ответ
	h.JSONResponse(w, map[string]bool{"is_admin": true}, nil)
}

// CreateClient создаёт нового клиента
func (h *AdminHandler) CreateClient(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.ErrorResponse(w, err, http.StatusBadRequest)
		return
	}

	user := &domain.User{
		Email:        req.Email,
		PasswordHash: h.auth.HashPassword(req.Password),
		Name:         req.Name,
		IsActive:     true,
	}

	if err := h.userRepo.Create(r.Context(), user); err != nil {
		h.ErrorResponse(w, err, http.StatusInternalServerError)
		return
	}

	h.JSONResponse(w, user, nil)
}

// ListClients возвращает список всех клиентов со статистикой
func (h *AdminHandler) ListClients(w http.ResponseWriter, r *http.Request) {
	users, err := h.userRepo.List(r.Context())
	if err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	result := make([]domain.ClientWithStats, 0, len(users))
	for _, u := range users {
		count, _ := h.txRepo.CountByClientID(r.Context(), u.ID)
		result = append(result, domain.ClientWithStats{
			User:             u,
			TransactionCount: count,
		})
	}
	h.JSONResponse(w, result, nil)
}

// GetClient возвращает клиента по ID
func (h *AdminHandler) GetClient(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDFromPath(r.URL.Path, "/api/admin/clients/")
	if err != nil {
		http.Error(w, `{"success":false,"error":"Invalid client ID"}`, http.StatusBadRequest)
		return
	}

	user, err := h.userRepo.GetByID(r.Context(), id)
	if err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	count, _ := h.txRepo.CountByClientID(r.Context(), id)
	h.JSONResponse(w, domain.ClientWithStats{User: *user, TransactionCount: count}, nil)
}

// UpdateClient обновляет клиента
func (h *AdminHandler) UpdateClient(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDFromPath(r.URL.Path, "/api/admin/clients/")
	if err != nil {
		http.Error(w, `{"success":false,"error":"Invalid client ID"}`, http.StatusBadRequest)
		return
	}

	user, err := h.userRepo.GetByID(r.Context(), id)
	if err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
		IsActive *bool  `json:"is_active"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.ErrorResponse(w, err, http.StatusBadRequest)
		return
	}

	if req.Email != "" {
		user.Email = req.Email
	}
	if req.Name != "" {
		user.Name = req.Name
	}
	if req.Password != "" {
		user.PasswordHash = h.auth.HashPassword(req.Password)
	}
	if req.IsActive != nil {
		user.IsActive = *req.IsActive
	}

	if err := h.userRepo.Update(r.Context(), user); err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	user.PasswordHash = ""
	h.JSONResponse(w, user, nil)
}

// Impersonate выдаёт JWT от имени клиента
func (h *AdminHandler) Impersonate(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	prefix := "/api/admin/clients/"
	suffix := "/impersonate"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		http.Error(w, `{"success":false,"error":"Invalid path"}`, http.StatusBadRequest)
		return
	}
	idStr := strings.TrimPrefix(strings.TrimSuffix(path, suffix), prefix)
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, `{"success":false,"error":"Invalid client ID"}`, http.StatusBadRequest)
		return
	}

	user, err := h.userRepo.GetByID(r.Context(), id)
	if err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	// Генерируем токен как для клиента (is_admin=false)
	token, err := h.auth.GenerateTokenForUser(user.ID, false)
	if err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	h.JSONResponse(w, map[string]string{"token": token}, nil)
}

// parseIDFromPath извлекает ID из пути вида /api/admin/clients/123 или /api/admin/clients/123/impersonate
func parseIDFromPath(path, prefix string) (int64, error) {
	if !strings.HasPrefix(path, prefix) {
		return 0, errors.New("invalid id")
	}
	rest := strings.TrimPrefix(path, prefix)
	// Убираем /impersonate если есть
	if idx := strings.Index(rest, "/"); idx >= 0 {
		rest = rest[:idx]
	}
	id, err := strconv.ParseInt(rest, 10, 64)
	if err != nil {
		return 0, errors.New("invalid id")
	}
	return id, nil
}
