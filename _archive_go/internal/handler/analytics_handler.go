package handler

import (
	"net/http"
	"strconv"
	"time"

	"finance-tracker/internal/service"
)

// AnalyticsHandler обработчик аналитики
type AnalyticsHandler struct {
	*BaseHandler
	analyticsSvc service.AnalyticsService
}

// NewAnalyticsHandler создаёт обработчик аналитики
func NewAnalyticsHandler(base *BaseHandler, analyticsSvc service.AnalyticsService) *AnalyticsHandler {
	return &AnalyticsHandler{
		BaseHandler:  base,
		analyticsSvc: analyticsSvc,
	}
}

// Get возвращает данные аналитики
func (h *AnalyticsHandler) Get(w http.ResponseWriter, r *http.Request) {
	month := r.URL.Query().Get("month")
	if month == "" {
		month = time.Now().Format("2006-01")
	}

	data, err := h.analyticsSvc.GetAnalytics(r.Context(), month)
	h.JSONResponse(w, data, err)
}

// GetByCategory возвращает расходы по категориям
func (h *AnalyticsHandler) GetByCategory(w http.ResponseWriter, r *http.Request) {
	month := r.URL.Query().Get("month")
	if month == "" {
		month = time.Now().Format("2006-01")
	}

	expenses, err := h.analyticsSvc.GetExpensesByCategory(r.Context(), month)
	h.JSONResponse(w, expenses, err)
}

// GetYearly возвращает годовую аналитику
func (h *AnalyticsHandler) GetYearly(w http.ResponseWriter, r *http.Request) {
	yearStr := r.URL.Query().Get("year")
	year := time.Now().Year()
	if yearStr != "" {
		if y, err := strconv.Atoi(yearStr); err == nil {
			year = y
		}
	}

	data, err := h.analyticsSvc.GetYearlyAnalytics(r.Context(), year)
	h.JSONResponse(w, data, err)
}

// CompareMonths возвращает сравнение двух месяцев
func (h *AnalyticsHandler) CompareMonths(w http.ResponseWriter, r *http.Request) {
	month1 := r.URL.Query().Get("month1")
	month2 := r.URL.Query().Get("month2")
	
	if month1 == "" || month2 == "" {
		h.JSONResponse(w, nil, nil)
		return
	}

	comparison, err := h.analyticsSvc.CompareMonths(r.Context(), month1, month2)
	h.JSONResponse(w, comparison, err)
}

// GetCategoryTrend возвращает тренд по категории
func (h *AnalyticsHandler) GetCategoryTrend(w http.ResponseWriter, r *http.Request) {
	categoryIDStr := r.URL.Query().Get("category_id")
	categoryID, err := strconv.ParseInt(categoryIDStr, 10, 64)
	if err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	monthsStr := r.URL.Query().Get("months")
	months := 6
	if monthsStr != "" {
		if m, err := strconv.Atoi(monthsStr); err == nil && m > 0 {
			months = m
		}
	}

	trend, err := h.analyticsSvc.GetCategoryTrend(r.Context(), categoryID, months)
	h.JSONResponse(w, trend, err)
}
