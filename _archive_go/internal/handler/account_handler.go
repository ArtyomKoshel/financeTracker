package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"finance-tracker/internal/service"
)

// AccountHandler обработчик счетов
type AccountHandler struct {
	*BaseHandler
	accountSvc service.AccountService
}

// NewAccountHandler создаёт обработчик счетов
func NewAccountHandler(base *BaseHandler, accountSvc service.AccountService) *AccountHandler {
	return &AccountHandler{
		BaseHandler: base,
		accountSvc:  accountSvc,
	}
}

// GetBalance возвращает текущий баланс
func (h *AccountHandler) GetBalance(w http.ResponseWriter, r *http.Request) {
	account, err := h.accountSvc.GetMainAccount(r.Context())
	h.JSONResponse(w, account, err)
}

// SyncBalance сверяет баланс
func (h *AccountHandler) SyncBalance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.JSONResponse(w, nil, fmt.Errorf("method not allowed"))
		return
	}

	var req struct {
		ActualBalance float64 `json:"actual_balance"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	result, err := h.accountSvc.SyncBalance(r.Context(), req.ActualBalance)
	if err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	// Notify about updates
	h.NotifyUpdate("transactions")
	h.NotifyUpdate("balance")

	h.JSONResponse(w, result, nil)
}

// SetInitialBalance устанавливает начальный баланс
func (h *AccountHandler) SetInitialBalance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.JSONResponse(w, nil, fmt.Errorf("method not allowed"))
		return
	}

	var req struct {
		Balance float64 `json:"balance"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	ctx := r.Context()

	if err := h.accountSvc.SetBalance(ctx, req.Balance); err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	// Sync balance для установки даты сверки
	h.accountSvc.SyncBalance(ctx, req.Balance)

	account, _ := h.accountSvc.GetMainAccount(ctx)
	h.JSONResponse(w, account, nil)
}
