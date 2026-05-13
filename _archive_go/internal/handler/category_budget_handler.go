package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"finance-tracker/internal/domain"
	"finance-tracker/internal/service"
)

// CategoryBudgetHandler обработчик бюджетов категорий
type CategoryBudgetHandler struct {
	*BaseHandler
	budgetSvc service.CategoryBudgetService
}

// NewCategoryBudgetHandler создаёт обработчик бюджетов категорий
func NewCategoryBudgetHandler(base *BaseHandler, budgetSvc service.CategoryBudgetService) *CategoryBudgetHandler {
	return &CategoryBudgetHandler{
		BaseHandler: base,
		budgetSvc:   budgetSvc,
	}
}

// GetByMonth возвращает все бюджеты за месяц
func (h *CategoryBudgetHandler) GetByMonth(w http.ResponseWriter, r *http.Request) {
	month := r.URL.Query().Get("month")
	if month == "" {
		month = time.Now().Format("2006-01")
	}

	budgets, err := h.budgetSvc.GetByMonth(r.Context(), month)
	h.JSONResponse(w, budgets, err)
}

// SetBudget создаёт или обновляет бюджет категории
func (h *CategoryBudgetHandler) SetBudget(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID           int64   `json:"id"`
		CategoryID   int64   `json:"category_id"`
		Month        string  `json:"month"`
		LimitAmount  float64 `json:"limit_amount"`
		AlertPercent float64 `json:"alert_percent"`
		IsRecurring  bool    `json:"is_recurring"`
		IsEssential  bool    `json:"is_essential"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	if req.Month == "" {
		req.Month = time.Now().Format("2006-01")
	}

	var budget *domain.CategoryBudget
	var err error

	// Если передан ID - обновляем, иначе создаём
	if req.ID > 0 {
		budget, err = h.budgetSvc.UpdateBudget(r.Context(), req.ID, req.LimitAmount, req.AlertPercent, req.IsRecurring, req.IsEssential)
	} else {
		budget, err = h.budgetSvc.SetBudget(r.Context(), req.CategoryID, req.Month, req.LimitAmount, req.AlertPercent, req.IsRecurring, req.IsEssential)
	}
	
	if err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	// Уведомляем клиентов об изменении
	h.NotifyUpdate("budgets")
	h.JSONResponse(w, budget, nil)
}

// DeleteBudget удаляет бюджет
func (h *CategoryBudgetHandler) DeleteBudget(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	err = h.budgetSvc.DeleteBudget(r.Context(), id)
	if err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	h.NotifyUpdate("budgets")
	h.JSONResponse(w, map[string]bool{"success": true}, nil)
}
