package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"finance-tracker/internal/service"
)

// GoalHandler обработчик целей
type GoalHandler struct {
	*BaseHandler
	goalSvc service.GoalService
}

// NewGoalHandler создаёт обработчик целей
func NewGoalHandler(base *BaseHandler, goalSvc service.GoalService) *GoalHandler {
	return &GoalHandler{
		BaseHandler: base,
		goalSvc:     goalSvc,
	}
}

// Create создаёт новую цель
func (h *GoalHandler) Create(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.JSONResponse(w, nil, fmt.Errorf("method not allowed"))
		return
	}

	var req struct {
		Name         string  `json:"name"`
		TargetAmount float64 `json:"target_amount"`
		TargetDate   string  `json:"target_date"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	goal, err := h.goalSvc.Create(r.Context(), req.Name, req.TargetAmount, req.TargetDate)
	h.JSONResponse(w, goal, err)
}

// GetActive возвращает активную цель
func (h *GoalHandler) GetActive(w http.ResponseWriter, r *http.Request) {
	goal, err := h.goalSvc.GetActive(r.Context())
	h.JSONResponse(w, goal, err)
}
