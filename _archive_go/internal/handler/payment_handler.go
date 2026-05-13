package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"finance-tracker/internal/domain"
	"finance-tracker/internal/repository"
	"finance-tracker/internal/service"
)

// PaymentRepository расширенный интерфейс с напоминаниями
type PaymentRepository interface {
	repository.PaymentRepository
	GetPaymentReminders(ctx context.Context, month string, today int) ([]domain.PaymentReminder, error)
	GetTotalMonthlyPayments(ctx context.Context) (float64, error)
}

// PaymentHandler обработчик платежей
type PaymentHandler struct {
	*BaseHandler
	paymentRepo PaymentRepository
	currencySvc service.CurrencyService
}

// NewPaymentHandler создаёт обработчик платежей
func NewPaymentHandler(base *BaseHandler, paymentRepo PaymentRepository, currencySvc service.CurrencyService) *PaymentHandler {
	return &PaymentHandler{
		BaseHandler: base,
		paymentRepo: paymentRepo,
		currencySvc: currencySvc,
	}
}

// GetAll возвращает все активные платежи
func (h *PaymentHandler) GetAll(w http.ResponseWriter, r *http.Request) {
	payments, err := h.paymentRepo.GetActive(r.Context())
	h.JSONResponse(w, payments, err)
}

// Create создаёт новый платёж
func (h *PaymentHandler) Create(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.JSONResponse(w, nil, fmt.Errorf("method not allowed"))
		return
	}

	var req struct {
		Name        string  `json:"name"`
		Amount      float64 `json:"amount"`
		Currency    string  `json:"currency"`
		DayOfMonth  int     `json:"day_of_month"`
		DueDate     string  `json:"due_date"`
		Category    string  `json:"category"`
		CategoryID  *int64  `json:"category_id"`
		IsVariable  bool    `json:"is_variable"`
		IsOneTime   bool    `json:"is_one_time"`
		Description string  `json:"description"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	if req.Category == "" {
		req.Category = "essential"
	}
	if req.Currency == "" {
		req.Currency = "BYN"
	}

	// Конвертация в BYN
	originalAmount := req.Amount
	amountBYN := req.Amount
	if req.Currency != "BYN" {
		rate, _ := h.currencySvc.GetRate(r.Context(), req.Currency)
		amountBYN = req.Amount * rate
	}

	payment := &domain.RecurringPayment{
		Name:           req.Name,
		Amount:         amountBYN,
		OriginalAmount: originalAmount,
		Currency:       req.Currency,
		DayOfMonth:     req.DayOfMonth,
		DueDate:        req.DueDate,
		Category:       req.Category,
		CategoryID:     req.CategoryID,
		IsVariable:     req.IsVariable,
		IsOneTime:      req.IsOneTime,
		Description:    req.Description,
	}

	if err := h.paymentRepo.Create(r.Context(), payment); err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	h.JSONResponse(w, payment, nil)
}

// Update обновляет платёж
func (h *PaymentHandler) Update(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		h.JSONResponse(w, nil, fmt.Errorf("method not allowed"))
		return
	}

	var req struct {
		ID          int64   `json:"id"`
		Name        string  `json:"name"`
		Amount      float64 `json:"amount"`
		Currency    string  `json:"currency"`
		DayOfMonth  int     `json:"day_of_month"`
		DueDate     string  `json:"due_date"`
		Category    string  `json:"category"`
		CategoryID  *int64  `json:"category_id"`
		IsVariable  bool    `json:"is_variable"`
		IsOneTime   bool    `json:"is_one_time"`
		Description string  `json:"description"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	if req.Category == "" {
		req.Category = "essential"
	}
	if req.Currency == "" {
		req.Currency = "BYN"
	}

	// Конвертация в BYN
	originalAmount := req.Amount
	amountBYN := req.Amount
	if req.Currency != "BYN" {
		rate, _ := h.currencySvc.GetRate(r.Context(), req.Currency)
		amountBYN = req.Amount * rate
	}

	payment := &domain.RecurringPayment{
		ID:             req.ID,
		Name:           req.Name,
		Amount:         amountBYN,
		OriginalAmount: originalAmount,
		Currency:       req.Currency,
		DayOfMonth:     req.DayOfMonth,
		DueDate:        req.DueDate,
		Category:       req.Category,
		CategoryID:     req.CategoryID,
		IsVariable:     req.IsVariable,
		IsOneTime:      req.IsOneTime,
		Description:    req.Description,
		IsActive:       true,
	}

	if err := h.paymentRepo.Update(r.Context(), payment); err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	h.NotifyUpdate("payments")
	h.JSONResponse(w, payment, nil)
}

// Delete удаляет платёж
func (h *PaymentHandler) Delete(w http.ResponseWriter, r *http.Request) {
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

	err = h.paymentRepo.Delete(r.Context(), id)
	h.JSONResponse(w, map[string]bool{"deleted": true}, err)
}

// GetReminders возвращает напоминания о платежах
func (h *PaymentHandler) GetReminders(w http.ResponseWriter, r *http.Request) {
	month := time.Now().Format("2006-01")
	today := time.Now().Day()

	reminders, err := h.paymentRepo.GetPaymentReminders(r.Context(), month, today)
	h.JSONResponse(w, reminders, err)
}
