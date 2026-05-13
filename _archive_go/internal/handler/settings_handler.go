package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"finance-tracker/internal/repository"
	"finance-tracker/internal/service"
)

// SettingsHandler обработчик настроек
type SettingsHandler struct {
	*BaseHandler
	settingsRepo repository.SettingsRepository
	currencySvc  service.CurrencyService
}

// NewSettingsHandler создаёт обработчик настроек
func NewSettingsHandler(base *BaseHandler, settingsRepo repository.SettingsRepository, currencySvc service.CurrencyService) *SettingsHandler {
	return &SettingsHandler{
		BaseHandler:  base,
		settingsRepo: settingsRepo,
		currencySvc:  currencySvc,
	}
}

// Get возвращает все настройки
func (h *SettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	config, err := h.settingsRepo.GetSalaryConfig(ctx)
	if err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	rubRate, _ := h.settingsRepo.Get(ctx, "rub_rate")
	eurRate, _ := h.settingsRepo.Get(ctx, "eur_rate")
	usdRate, _ := h.settingsRepo.Get(ctx, "usd_rate")
	advanceDay, _ := h.settingsRepo.Get(ctx, "advance_day")
	salaryDay, _ := h.settingsRepo.Get(ctx, "salary_day")
	savingsPercent, _ := h.settingsRepo.Get(ctx, "savings_percent")
	minLiving, _ := h.settingsRepo.Get(ctx, "min_living_budget")
	ratesUpdated, _ := h.settingsRepo.Get(ctx, "rates_updated")

	h.JSONResponse(w, map[string]interface{}{
		"salary_config":     config,
		"rub_rate":          rubRate,
		"eur_rate":          eurRate,
		"usd_rate":          usdRate,
		"advance_day":       advanceDay,
		"salary_day":        salaryDay,
		"savings_percent":   savingsPercent,
		"min_living_budget": minLiving,
		"rates_updated":     ratesUpdated,
	}, nil)
}

// Update обновляет настройки
func (h *SettingsHandler) Update(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.JSONResponse(w, nil, fmt.Errorf("method not allowed"))
		return
	}

	var req map[string]string
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	// Валидация значений
	for key, value := range req {
		if err := h.validateSetting(key, value); err != nil {
			h.JSONResponse(w, nil, err)
			return
		}
	}

	ctx := r.Context()
	for key, value := range req {
		h.settingsRepo.Set(ctx, key, value)
	}

	h.JSONResponse(w, map[string]bool{"updated": true}, nil)
}

// validateSetting проверяет корректность значения настройки
func (h *SettingsHandler) validateSetting(key, value string) error {
	switch key {
	case "advance_day", "salary_day":
		day, err := strconv.Atoi(value)
		if err != nil {
			return fmt.Errorf("%s: некорректное значение дня", key)
		}
		if day < 1 || day > 31 {
			return fmt.Errorf("%s: день должен быть от 1 до 31", key)
		}
	case "savings_percent":
		percent, err := strconv.ParseFloat(value, 64)
		if err != nil {
			return fmt.Errorf("savings_percent: некорректное значение процента")
		}
		if percent < 0 || percent > 100 {
			return fmt.Errorf("savings_percent: процент должен быть от 0 до 100")
		}
	case "min_living_budget":
		budget, err := strconv.ParseFloat(value, 64)
		if err != nil {
			return fmt.Errorf("min_living_budget: некорректное значение")
		}
		if budget < 0 {
			return fmt.Errorf("min_living_budget: значение не может быть отрицательным")
		}
	case "rub_rate", "eur_rate", "usd_rate":
		rate, err := strconv.ParseFloat(value, 64)
		if err != nil {
			return fmt.Errorf("%s: некорректный курс валюты", key)
		}
		if rate <= 0 {
			return fmt.Errorf("%s: курс должен быть положительным числом", key)
		}
	case "gross_salary", "expected_advance":
		amount, err := strconv.ParseFloat(value, 64)
		if err != nil {
			return fmt.Errorf("%s: некорректное значение", key)
		}
		if amount < 0 {
			return fmt.Errorf("%s: значение не может быть отрицательным", key)
		}
	case "tolerance_percent":
		percent, err := strconv.ParseFloat(value, 64)
		if err != nil {
			return fmt.Errorf("tolerance_percent: некорректное значение")
		}
		if percent < 0 || percent > 50 {
			return fmt.Errorf("tolerance_percent: процент должен быть от 0 до 50")
		}
	}
	return nil
}

// GetRates возвращает текущие курсы валют
func (h *SettingsHandler) GetRates(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	rubRate, _ := h.settingsRepo.Get(ctx, "rub_rate")
	eurRate, _ := h.settingsRepo.Get(ctx, "eur_rate")
	usdRate, _ := h.settingsRepo.Get(ctx, "usd_rate")
	updated, _ := h.settingsRepo.Get(ctx, "rates_updated")

	h.JSONResponse(w, map[string]interface{}{
		"RUB":     rubRate,
		"EUR":     eurRate,
		"USD":     usdRate,
		"updated": updated,
	}, nil)
}

// UpdateRatesFromNBRB обновляет курсы из NBRB
func (h *SettingsHandler) UpdateRatesFromNBRB(w http.ResponseWriter, r *http.Request) {
	rates, err := h.currencySvc.UpdateRatesFromNBRB(r.Context())
	if err != nil {
		h.JSONResponse(w, nil, err)
		return
	}

	h.JSONResponse(w, map[string]interface{}{
		"rates":   rates,
		"updated": time.Now().Format("2006-01-02 15:04"),
	}, nil)
}
