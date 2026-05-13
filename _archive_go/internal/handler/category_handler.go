package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"finance-tracker/internal/domain"
	"finance-tracker/internal/repository"
)

// CategoryHandler обработчик категорий
type CategoryHandler struct {
	*BaseHandler
	categoryRepo repository.CategoryRepository
}

// NewCategoryHandler создаёт обработчик категорий
func NewCategoryHandler(base *BaseHandler, categoryRepo repository.CategoryRepository) *CategoryHandler {
	return &CategoryHandler{
		BaseHandler:  base,
		categoryRepo: categoryRepo,
	}
}

// GetAll возвращает все категории
func (h *CategoryHandler) GetAll(w http.ResponseWriter, r *http.Request) {
	includeInactive := r.URL.Query().Get("include_inactive") == "true"
	categories, err := h.categoryRepo.GetAll(r.Context(), includeInactive)
	h.JSONResponse(w, categories, err)
}

// Create создаёт новую категорию
func (h *CategoryHandler) Create(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Name     string `json:"name"`
		ParentID *int64 `json:"parent_id"`
		Icon     string `json:"icon"`
		Color    string `json:"color"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.JSONResponse(w, nil, fmt.Errorf("invalid request: %w", err))
		return
	}

	if req.Name == "" {
		h.JSONResponse(w, nil, fmt.Errorf("название категории обязательно"))
		return
	}

	// Валидация parent_id (проверка на циклы)
	if req.ParentID != nil {
		if err := h.categoryRepo.ValidateParentID(r.Context(), 0, req.ParentID); err != nil {
			h.JSONResponse(w, nil, err)
			return
		}
	}

	category := &domain.Category{
		Name:     req.Name,
		ParentID: req.ParentID,
		Icon:     req.Icon,
		Color:    req.Color,
	}

	if err := h.categoryRepo.Create(r.Context(), category); err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	h.NotifyUpdate("categories")
	h.JSONResponse(w, category, nil)
}

// Update обновляет категорию
func (h *CategoryHandler) Update(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ID    int64  `json:"id"`
		Name  string `json:"name"`
		Icon  string `json:"icon"`
		Color string `json:"color"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.JSONResponse(w, nil, fmt.Errorf("invalid request: %w", err))
		return
	}

	if req.ID == 0 {
		h.JSONResponse(w, nil, fmt.Errorf("ID категории обязателен"))
		return
	}

	category := &domain.Category{
		ID:    req.ID,
		Name:  req.Name,
		Icon:  req.Icon,
		Color: req.Color,
	}

	if err := h.categoryRepo.Update(r.Context(), category); err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	h.NotifyUpdate("categories")
	h.JSONResponse(w, category, nil)
}

// Delete удаляет категорию (soft delete)
func (h *CategoryHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete && r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		var req struct {
			ID int64 `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			idStr = fmt.Sprintf("%d", req.ID)
		}
	}

	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id == 0 {
		h.JSONResponse(w, nil, fmt.Errorf("ID категории обязателен"))
		return
	}

	// Проверка, используется ли категория в транзакциях
	isUsed, err := h.categoryRepo.IsUsed(r.Context(), id)
	if err != nil {
		h.JSONResponse(w, nil, err)
		return
	}
	if isUsed {
		h.JSONResponse(w, nil, fmt.Errorf("категория используется в транзакциях и не может быть удалена"))
		return
	}

	if err := h.categoryRepo.Delete(r.Context(), id); err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	h.NotifyUpdate("categories")
	h.JSONResponse(w, map[string]string{"status": "deleted"}, nil)
}

// Restore восстанавливает категорию
func (h *CategoryHandler) Restore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ID int64 `json:"id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.JSONResponse(w, nil, fmt.Errorf("invalid request: %w", err))
		return
	}

	if req.ID == 0 {
		h.JSONResponse(w, nil, fmt.Errorf("ID категории обязателен"))
		return
	}

	if err := h.categoryRepo.Restore(r.Context(), req.ID); err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	h.NotifyUpdate("categories")
	h.JSONResponse(w, map[string]string{"status": "restored"}, nil)
}
