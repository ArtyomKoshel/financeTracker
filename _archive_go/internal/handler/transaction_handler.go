package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"finance-tracker/internal/domain"
	"finance-tracker/internal/service"
)

// TransactionHandler обработчик транзакций
type TransactionHandler struct {
	*BaseHandler
	txService service.TransactionService
}

// NewTransactionHandler создаёт обработчик транзакций
func NewTransactionHandler(base *BaseHandler, txService service.TransactionService) *TransactionHandler {
	return &TransactionHandler{
		BaseHandler: base,
		txService:   txService,
	}
}

// GetAll возвращает все транзакции
func (h *TransactionHandler) GetAll(w http.ResponseWriter, r *http.Request) {
	transactions, err := h.txService.List(r.Context(), domain.TransactionFilter{})
	h.JSONResponse(w, transactions, err)
}

// GetByMonth возвращает транзакции за месяц
func (h *TransactionHandler) GetByMonth(w http.ResponseWriter, r *http.Request) {
	month := r.URL.Query().Get("month")
	if month == "" {
		month = time.Now().Format("2006-01")
	}

	transactions, err := h.txService.GetByMonth(r.Context(), month)
	h.JSONResponse(w, transactions, err)
}

// Create создаёт новую транзакцию
func (h *TransactionHandler) Create(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.JSONResponse(w, nil, fmt.Errorf("method not allowed"))
		return
	}

	var req service.CreateTransactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	result, err := h.txService.Create(r.Context(), req)
	if err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	h.NotifyUpdate("transactions")
	h.NotifyUpdate("balance")
	h.NotifyUpdate("dashboard")

	// Возвращаем полный результат с возможным предупреждением о бюджете
	h.JSONResponse(w, result, nil)
}

// Delete удаляет транзакцию
func (h *TransactionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		h.JSONResponse(w, nil, fmt.Errorf("method not allowed"))
		return
	}

	idStr := r.URL.Query().Get("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		h.JSONResponse(w, nil, fmt.Errorf("invalid id"))
		return
	}

	err = h.txService.Delete(r.Context(), id)
	if err == nil {
		h.NotifyUpdate("transactions")
		h.NotifyUpdate("balance")
		h.NotifyUpdate("dashboard")
	}

	h.JSONResponse(w, map[string]bool{"deleted": err == nil}, err)
}

// Validate проверяет правильность выплаты
func (h *TransactionHandler) Validate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Amount float64 `json:"amount"`
		Type   string  `json:"type"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	result, err := h.txService.Validate(r.Context(), req.Amount, req.Type)
	h.JSONResponse(w, result, err)
}
