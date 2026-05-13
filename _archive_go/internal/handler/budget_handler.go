package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"finance-tracker/internal/service"
)

// BudgetHandler обработчик бюджета
type BudgetHandler struct {
	*BaseHandler
	budgetSvc service.BudgetService
}

// NewBudgetHandler создаёт обработчик бюджета
func NewBudgetHandler(base *BaseHandler, budgetSvc service.BudgetService) *BudgetHandler {
	return &BudgetHandler{
		BaseHandler: base,
		budgetSvc:   budgetSvc,
	}
}

// GetCashflow возвращает cashflow-рекомендацию
func (h *BudgetHandler) GetCashflow(w http.ResponseWriter, r *http.Request) {
	cashflow, err := h.budgetSvc.CalculateCashflow(r.Context())
	if err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	// Формируем расширенный ответ
	var paymentsList []map[string]interface{}
	for _, p := range cashflow.PaymentsList {
		paymentsList = append(paymentsList, map[string]interface{}{
			"name":          p.Payment.Name,
			"amount":        p.Payment.Amount,
			"due_date":      p.DueDate,
			"days_until":    p.DaysUntil,
			"is_next_month": p.IsNextMonth,
		})
	}

	// Сообщение
	var message, status string
	if cashflow.FreeFunds < 0 {
		message = fmt.Sprintf("Дефицит %.0f BYN до %s", -cashflow.FreeFunds, cashflow.NextIncomeType)
		status = "warning"
	} else if cashflow.SuggestedSavings > 0 {
		message = fmt.Sprintf("Можно отложить %.0f BYN (%.0f%%)", cashflow.SuggestedSavings, cashflow.SavingsPercent)
		status = "success"
	} else {
		message = "Свободных средств нет"
		status = "info"
	}

	response := map[string]interface{}{
		"balance":           cashflow.Balance,
		"living_budget":     cashflow.LivingBudget,
		"total_payments":    cashflow.TotalPayments,
		"free_funds":        cashflow.FreeFunds,
		"suggested_savings": cashflow.SuggestedSavings,
		"savings_percent":   cashflow.SavingsPercent,
		"next_income_date":  cashflow.NextIncomeDate,
		"next_income_type":  cashflow.NextIncomeType,
		"days_until_income": cashflow.DaysUntilIncome,
		"payments_list":     paymentsList,
		"message":           message,
		"status":            status,
	}

	h.JSONResponse(w, response, nil)
}

// CalculatePlan рассчитывает план распределения дохода
func (h *BudgetHandler) CalculatePlan(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Income float64 `json:"income"`
		Type   string  `json:"type"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	plan, err := h.budgetSvc.CalculateBudgetPlan(r.Context(), req.Income, req.Type)
	h.JSONResponse(w, plan, err)
}

// GetMonthly возвращает месячный бюджет
func (h *BudgetHandler) GetMonthly(w http.ResponseWriter, r *http.Request) {
	month := r.URL.Query().Get("month")
	if month == "" {
		month = time.Now().Format("2006-01")
	}

	budget, err := h.budgetSvc.GetMonthlyBudget(r.Context(), month)
	h.JSONResponse(w, budget, err)
}
