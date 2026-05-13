package main

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"time"
)

type Handlers struct {
	storage *Storage
	hub     *Hub
}

func NewHandlers(storage *Storage, hub *Hub) *Handlers {
	return &Handlers{storage: storage, hub: hub}
}

// notifyUpdate отправляет уведомление об обновлении данных
func (h *Handlers) notifyUpdate(target string) {
	if h.hub != nil {
		h.hub.BroadcastUpdate(target)
	}
}

// APIResponse стандартный ответ API
type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func (h *Handlers) jsonResponse(w http.ResponseWriter, data interface{}, err error) {
	w.Header().Set("Content-Type", "application/json")

	resp := APIResponse{Success: err == nil}
	if err != nil {
		resp.Error = err.Error()
		w.WriteHeader(http.StatusBadRequest)
	} else {
		resp.Data = data
	}

	if encErr := json.NewEncoder(w).Encode(resp); encErr != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

// GetDashboard данные для главной страницы
func (h *Handlers) GetDashboard(w http.ResponseWriter, r *http.Request) {
	data := &DashboardData{}

	// Курс USD
	usdRateStr, _ := h.storage.GetSetting("usd_rate")
	fmt.Sscanf(usdRateStr, "%f", &data.USDRate)
	if data.USDRate == 0 {
		data.USDRate = 96.5
	}

	// Цель
	goal, _ := h.storage.GetActiveGoal()
	data.Goal = goal

	if goal != nil {
		// Обновляем прогресс
		h.storage.UpdateGoalProgress(data.USDRate)
		goal, _ = h.storage.GetActiveGoal()
		data.Goal = goal

		// Прогресс в процентах
		if goal.TargetAmount > 0 {
			data.ProgressPercent = (goal.CurrentAmount / goal.TargetAmount) * 100
		}

		// Дней до цели
		data.DaysRemaining = int(time.Until(goal.TargetDate).Hours() / 24)
		if data.DaysRemaining < 0 {
			data.DaysRemaining = 0
		}

		// Сколько нужно откладывать в месяц (в USD)
		monthsRemaining := float64(data.DaysRemaining) / 30.0
		if monthsRemaining > 0 {
			remaining := goal.TargetAmount - goal.CurrentAmount
			data.MonthlyTarget = remaining / monthsRemaining
		}
	}

	// Накопления
	data.TotalSavedRUB, _ = h.storage.GetTotalSavings()
	data.TotalSavedUSD = data.TotalSavedRUB / data.USDRate

	// Текущий месяц
	currentMonth := time.Now().Format("2006-01")
	summary, _ := h.storage.GetMonthSummary(currentMonth)
	if summary != nil {
		data.CurrentMonth = *summary
	}

	// Последние транзакции
	data.RecentTransactions, _ = h.storage.GetRecentTransactions(10)

	h.jsonResponse(w, data, nil)
}

// validCurrencies список поддерживаемых валют
var validCurrencies = map[string]bool{
	"BYN": true, "RUB": true, "EUR": true, "USD": true, "GBP": true, "PLN": true,
}

// validTransactionTypes список поддерживаемых типов транзакций
var validTransactionTypes = map[string]bool{
	"advance": true, "salary": true, "bonus": true, "early_pay": true,
	"year_bonus": true, "vacation": true, "other": true, "expense": true, "savings": true,
}

// AddTransaction добавить транзакцию
func (h *Handlers) AddTransaction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.jsonResponse(w, nil, fmt.Errorf("method not allowed"))
		return
	}

	var req struct {
		Date               string  `json:"date"`
		Amount             float64 `json:"amount"`
		Currency           string  `json:"currency"`
		Type               string  `json:"type"`
		CategoryID         *int64  `json:"category_id"`
		RecurringPaymentID *int64  `json:"recurring_payment_id"`
		Description        string  `json:"description"`
		Month              string  `json:"month"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	// Валидация суммы
	if req.Amount <= 0 {
		h.jsonResponse(w, nil, fmt.Errorf("amount must be greater than 0"))
		return
	}
	if math.IsNaN(req.Amount) || math.IsInf(req.Amount, 0) {
		h.jsonResponse(w, nil, fmt.Errorf("invalid amount value"))
		return
	}

	// Валидация даты
	date, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		h.jsonResponse(w, nil, fmt.Errorf("invalid date format, use YYYY-MM-DD"))
		return
	}

	// Валидация типа транзакции
	if !validTransactionTypes[req.Type] {
		h.jsonResponse(w, nil, fmt.Errorf("invalid transaction type: %s", req.Type))
		return
	}

	// Если месяц не указан, берём из даты
	month := req.Month
	if month == "" {
		month = date.Format("2006-01")
	}

	// Конвертация в базовую валюту (BYN)
	currency := req.Currency
	if currency == "" {
		currency = "BYN"
	}

	// Валидация валюты
	if !validCurrencies[currency] {
		h.jsonResponse(w, nil, fmt.Errorf("unsupported currency: %s", currency))
		return
	}

	originalAmount := req.Amount
	amountBYN := req.Amount

	if currency != "BYN" {
		rate := h.getCurrencyRate(currency)
		amountBYN = req.Amount * rate
	}

	// Если указан recurring_payment_id, но не указан category_id,
	// берём категорию из обязательного платежа
	categoryID := req.CategoryID
	if req.RecurringPaymentID != nil && categoryID == nil {
		payment, err := h.storage.GetRecurringPaymentByID(*req.RecurringPaymentID)
		if err == nil && payment != nil && payment.CategoryID != nil {
			categoryID = payment.CategoryID
		}
	}

	t := &Transaction{
		Date:               date,
		Amount:             amountBYN,
		OriginalAmount:     originalAmount,
		Currency:           currency,
		Type:               TransactionType(req.Type),
		CategoryID:         categoryID,
		RecurringPaymentID: req.RecurringPaymentID,
		Description:        req.Description,
		Month:              month,
		AccountID:          1, // Основной счёт
	}

	if err := h.storage.AddTransaction(t); err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	// Уведомляем об обновлении
	h.notifyUpdate("transactions")
	h.notifyUpdate("balance")
	h.notifyUpdate("dashboard")

	h.jsonResponse(w, t, nil)
}

// getCurrencyRate получить курс валюты к BYN
func (h *Handlers) getCurrencyRate(currency string) float64 {
	var rateStr string
	var rate float64

	switch currency {
	case "RUB":
		rateStr, _ = h.storage.GetSetting("rub_rate")
	case "EUR":
		rateStr, _ = h.storage.GetSetting("eur_rate")
	case "USD":
		rateStr, _ = h.storage.GetSetting("usd_rate")
	default:
		return 1.0
	}

	fmt.Sscanf(rateStr, "%f", &rate)
	if rate == 0 {
		// Дефолтные курсы
		switch currency {
		case "RUB":
			return 0.034
		case "EUR":
			return 3.55
		case "USD":
			return 3.25
		}
	}
	return rate
}

// NBRBRate структура ответа от API NBRB
type NBRBRate struct {
	CurID           int     `json:"Cur_ID"`
	Date            string  `json:"Date"`
	CurAbbreviation string  `json:"Cur_Abbreviation"`
	CurScale        int     `json:"Cur_Scale"`
	CurName         string  `json:"Cur_Name"`
	CurOfficialRate float64 `json:"Cur_OfficialRate"`
}

// FetchNBRBRates получить курсы с API Национального банка РБ
func (h *Handlers) FetchNBRBRates() (map[string]float64, error) {
	rates := make(map[string]float64)

	// Курсы валют на NBRB API
	// USD: ID 431, EUR: ID 451, RUB (за 100): ID 456
	currencies := map[string]int{
		"USD": 431,
		"EUR": 451,
		"RUB": 456,
	}

	client := &http.Client{Timeout: 10 * time.Second}

	for currency, id := range currencies {
		url := fmt.Sprintf("https://api.nbrb.by/exrates/rates/%d?parammode=0", id)
		
		resp, err := client.Get(url)
		if err != nil {
			continue
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close() // Close immediately, not deferred in loop
		if err != nil {
			continue
		}

		var rate NBRBRate
		if err := json.Unmarshal(body, &rate); err != nil {
			continue
		}

		// Для RUB курс указан за 100 рублей, нужно разделить
		actualRate := rate.CurOfficialRate / float64(rate.CurScale)
		rates[currency] = actualRate
	}

	return rates, nil
}

// UpdateRatesFromNBRB обновить курсы с NBRB
func (h *Handlers) UpdateRatesFromNBRB(w http.ResponseWriter, r *http.Request) {
	rates, err := h.FetchNBRBRates()
	if err != nil {
		h.jsonResponse(w, nil, fmt.Errorf("не удалось получить курсы: %v", err))
		return
	}

	if len(rates) == 0 {
		h.jsonResponse(w, nil, fmt.Errorf("курсы не получены"))
		return
	}

	// Сохраняем в БД
	if usd, ok := rates["USD"]; ok {
		h.storage.SetSetting("usd_rate", fmt.Sprintf("%.4f", usd))
	}
	if eur, ok := rates["EUR"]; ok {
		h.storage.SetSetting("eur_rate", fmt.Sprintf("%.4f", eur))
	}
	if rub, ok := rates["RUB"]; ok {
		h.storage.SetSetting("rub_rate", fmt.Sprintf("%.6f", rub))
	}

	// Сохраняем дату обновления
	h.storage.SetSetting("rates_updated", time.Now().Format("2006-01-02 15:04"))

	h.jsonResponse(w, map[string]interface{}{
		"rates":   rates,
		"updated": time.Now().Format("2006-01-02 15:04"),
	}, nil)
}

// GetCurrentRates получить текущие курсы
func (h *Handlers) GetCurrentRates(w http.ResponseWriter, r *http.Request) {
	rubRate, _ := h.storage.GetSetting("rub_rate")
	eurRate, _ := h.storage.GetSetting("eur_rate")
	usdRate, _ := h.storage.GetSetting("usd_rate")
	updated, _ := h.storage.GetSetting("rates_updated")

	h.jsonResponse(w, map[string]interface{}{
		"RUB":     rubRate,
		"EUR":     eurRate,
		"USD":     usdRate,
		"updated": updated,
	}, nil)
}

// GetTransactions получить транзакции
func (h *Handlers) GetTransactions(w http.ResponseWriter, r *http.Request) {
	transactions, err := h.storage.GetAllTransactions()
	h.jsonResponse(w, transactions, err)
}

// DeleteTransaction удалить транзакцию (только текущий месяц)
func (h *Handlers) DeleteTransaction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		h.jsonResponse(w, nil, fmt.Errorf("method not allowed"))
		return
	}

	idStr := r.URL.Query().Get("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		h.jsonResponse(w, nil, fmt.Errorf("invalid id"))
		return
	}

	// Проверяем, что транзакция из текущего месяца
	tx, err := h.storage.GetTransactionByID(id)
	if err != nil {
		h.jsonResponse(w, nil, fmt.Errorf("транзакция не найдена"))
		return
	}

	currentMonth := time.Now().Format("2006-01")
	txMonth := tx.Date.Format("2006-01")
	if txMonth != currentMonth {
		h.jsonResponse(w, nil, fmt.Errorf("можно удалять только операции текущего месяца"))
		return
	}

	err = h.storage.DeleteTransaction(id)
	if err == nil {
		h.notifyUpdate("transactions")
		h.notifyUpdate("balance")
		h.notifyUpdate("dashboard")
	}
	h.jsonResponse(w, map[string]bool{"deleted": true}, err)
}

// ValidatePayment проверить правильность выплаты
func (h *Handlers) ValidatePayment(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Amount float64 `json:"amount"`
		Type   string  `json:"type"` // advance, salary, bonus
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	config, _ := h.storage.GetSalaryConfig()
	result := &ValidationResult{
		Actual: req.Amount,
	}

	tolerance := config.TolerancePercent / 100.0

	switch req.Type {
	case "advance":
		// Аванс должен быть около expected_advance
		expected := config.ExpectedAdvance
		result.ExpectedMin = expected * (1 - tolerance)
		result.ExpectedMax = expected * (1 + tolerance)

	case "salary":
		// Зарплата = (Оклад - НДФЛ) - Аванс + возможная премия
		// Примерно от 70k до 250k в зависимости от премии и отработанных дней
		netSalary := config.GrossSalary * (1 - config.NDFLRate)
		minSalary := netSalary - config.ExpectedAdvance - 50000 // минимум без премии
		maxSalary := netSalary - config.ExpectedAdvance + 150000 // с хорошей премией
		result.ExpectedMin = math.Max(minSalary, 50000)
		result.ExpectedMax = maxSalary

	case "bonus":
		// Премия обычно от 15k до 110k (без годового бонуса)
		result.ExpectedMin = 15000
		result.ExpectedMax = 120000

	case "year_bonus":
		// Годовой бонус обычно 350k-400k
		result.ExpectedMin = 300000
		result.ExpectedMax = 450000

	default:
		result.ExpectedMin = 0
		result.ExpectedMax = math.MaxFloat64
	}

	result.IsValid = req.Amount >= result.ExpectedMin && req.Amount <= result.ExpectedMax
	result.Difference = req.Amount - (result.ExpectedMin+result.ExpectedMax)/2

	if result.IsValid {
		result.Message = "✓ Сумма в пределах ожидаемого диапазона"
	} else if req.Amount < result.ExpectedMin {
		result.Message = fmt.Sprintf("⚠ Сумма меньше ожидаемой на %.0f ₽", result.ExpectedMin-req.Amount)
	} else {
		result.Message = fmt.Sprintf("⚠ Сумма больше ожидаемой на %.0f ₽", req.Amount-result.ExpectedMax)
	}

	h.jsonResponse(w, result, nil)
}

// CreateGoal создать цель
func (h *Handlers) CreateGoal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.jsonResponse(w, nil, fmt.Errorf("method not allowed"))
		return
	}

	var req struct {
		Name         string  `json:"name"`
		TargetAmount float64 `json:"target_amount"`
		TargetDate   string  `json:"target_date"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	targetDate, err := time.Parse("2006-01-02", req.TargetDate)
	if err != nil {
		h.jsonResponse(w, nil, fmt.Errorf("invalid date format"))
		return
	}

	goal := &Goal{
		Name:         req.Name,
		TargetAmount: req.TargetAmount,
		TargetDate:   targetDate,
		IsActive:     true,
	}

	if err := h.storage.CreateGoal(goal); err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	h.jsonResponse(w, goal, nil)
}

// UpdateSettings обновить настройки
func (h *Handlers) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.jsonResponse(w, nil, fmt.Errorf("method not allowed"))
		return
	}

	var req map[string]string
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	for key, value := range req {
		h.storage.SetSetting(key, value)
	}

	h.jsonResponse(w, map[string]bool{"updated": true}, nil)
}

// GetSettings получить настройки
func (h *Handlers) GetSettings(w http.ResponseWriter, r *http.Request) {
	config, err := h.storage.GetSalaryConfig()
	if err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	rubRate, _ := h.storage.GetSetting("rub_rate")
	eurRate, _ := h.storage.GetSetting("eur_rate")
	usdRate, _ := h.storage.GetSetting("usd_rate")
	advanceDay, _ := h.storage.GetSetting("advance_day")
	salaryDay, _ := h.storage.GetSetting("salary_day")
	savingsPercent, _ := h.storage.GetSetting("savings_percent")
	minLiving, _ := h.storage.GetSetting("min_living_budget")
	ratesUpdated, _ := h.storage.GetSetting("rates_updated")

	h.jsonResponse(w, map[string]interface{}{
		"salary_config":      config,
		"rub_rate":           rubRate,
		"eur_rate":           eurRate,
		"usd_rate":           usdRate,
		"advance_day":        advanceDay,
		"salary_day":         salaryDay,
		"savings_percent":    savingsPercent,
		"min_living_budget":  minLiving,
		"rates_updated":      ratesUpdated,
	}, nil)
}

// GetMonthSummary сводка за месяц
func (h *Handlers) GetMonthSummary(w http.ResponseWriter, r *http.Request) {
	month := r.URL.Query().Get("month")
	if month == "" {
		month = time.Now().Format("2006-01")
	}

	summary, err := h.storage.GetMonthSummary(month)
	h.jsonResponse(w, summary, err)
}

// === Recurring Payments ===

// GetRecurringPayments получить плановые платежи
func (h *Handlers) GetRecurringPayments(w http.ResponseWriter, r *http.Request) {
	payments, err := h.storage.GetRecurringPayments()
	h.jsonResponse(w, payments, err)
}

// AddRecurringPayment добавить плановый платёж
func (h *Handlers) AddRecurringPayment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.jsonResponse(w, nil, fmt.Errorf("method not allowed"))
		return
	}

	var req struct {
		Name        string  `json:"name"`
		Amount      float64 `json:"amount"`
		Currency    string  `json:"currency"`
		DayOfMonth  int     `json:"day_of_month"`
		Category    string  `json:"category"`
		CategoryID  *int64  `json:"category_id"`
		IsVariable  bool    `json:"is_variable"`
		Description string  `json:"description"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.jsonResponse(w, nil, err)
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
		rate := h.getCurrencyRate(req.Currency)
		amountBYN = req.Amount * rate
	}

	payment := &RecurringPayment{
		Name:           req.Name,
		Amount:         amountBYN,
		OriginalAmount: originalAmount,
		Currency:       req.Currency,
		DayOfMonth:     req.DayOfMonth,
		Category:       req.Category,
		CategoryID:     req.CategoryID,
		IsVariable:     req.IsVariable,
		Description:    req.Description,
	}

	if err := h.storage.AddRecurringPayment(payment); err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	h.jsonResponse(w, payment, nil)
}

// DeleteRecurringPayment удалить плановый платёж
func (h *Handlers) DeleteRecurringPayment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		h.jsonResponse(w, nil, fmt.Errorf("method not allowed"))
		return
	}

	idStr := r.URL.Query().Get("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		h.jsonResponse(w, nil, fmt.Errorf("invalid id"))
		return
	}

	err = h.storage.DeleteRecurringPayment(id)
	h.jsonResponse(w, map[string]bool{"deleted": true}, err)
}

// MarkPaymentPaid отметить платёж как оплаченный
func (h *Handlers) MarkPaymentPaid(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.jsonResponse(w, nil, fmt.Errorf("method not allowed"))
		return
	}

	var req struct {
		PaymentID int64   `json:"payment_id"`
		Amount    float64 `json:"amount"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	month := time.Now().Format("2006-01")
	err := h.storage.MarkPaymentPaid(req.PaymentID, month, req.Amount)
	h.jsonResponse(w, map[string]bool{"marked": true}, err)
}

// GetPaymentReminders получить напоминания о платежах
func (h *Handlers) GetPaymentReminders(w http.ResponseWriter, r *http.Request) {
	month := time.Now().Format("2006-01")
	today := time.Now().Day()

	reminders, err := h.storage.GetPaymentReminders(month, today)
	h.jsonResponse(w, reminders, err)
}

// CalculateBudgetPlan рассчитать план распределения дохода
func (h *Handlers) CalculateBudgetPlan(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Income float64 `json:"income"`
		Type   string  `json:"type"` // advance или salary
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	// Получаем настройки
	usdRateStr, _ := h.storage.GetSetting("usd_rate")
	var usdRate float64
	fmt.Sscanf(usdRateStr, "%f", &usdRate)
	if usdRate == 0 {
		usdRate = 96.5
	}

	advanceDayStr, _ := h.storage.GetSetting("advance_day")
	salaryDayStr, _ := h.storage.GetSetting("salary_day")
	savingsPercentStr, _ := h.storage.GetSetting("savings_percent")
	minLivingStr, _ := h.storage.GetSetting("min_living_budget")

	var advanceDay, salaryDay int
	var savingsPercent, minLiving float64
	fmt.Sscanf(advanceDayStr, "%d", &advanceDay)
	fmt.Sscanf(salaryDayStr, "%d", &salaryDay)
	fmt.Sscanf(savingsPercentStr, "%f", &savingsPercent)
	fmt.Sscanf(minLivingStr, "%f", &minLiving)

	if advanceDay == 0 {
		advanceDay = 30
	}
	if salaryDay == 0 {
		salaryDay = 15
	}
	if savingsPercent == 0 {
		savingsPercent = 20
	}
	if minLiving == 0 {
		minLiving = 50000
	}

	// Получаем платежи
	month := time.Now().Format("2006-01")
	today := time.Now().Day()
	reminders, _ := h.storage.GetPaymentReminders(month, today)

	// Фильтруем неоплаченные платежи, которые нужно оплатить скоро
	var pendingPayments []PaymentReminder
	var totalPayments float64

	for _, r := range reminders {
		if !r.IsPaid {
			// Для аванса показываем платежи с 25 по 15 след. месяца
			// Для зарплаты показываем платежи с 10 по 30
			shouldShow := false
			if req.Type == "advance" {
				// После аванса (30) нужно платить: рассрочки 25-числа уже прошли, 
				// показываем платежи до 15 числа след. месяца
				shouldShow = r.Payment.DayOfMonth >= 1 && r.Payment.DayOfMonth <= 15
			} else {
				// После зарплаты (15) показываем платежи до конца месяца
				shouldShow = r.Payment.DayOfMonth >= 15 && r.Payment.DayOfMonth <= 31
			}

			if shouldShow || r.IsOverdue {
				pendingPayments = append(pendingPayments, r)
				if r.Payment.Category == "essential" {
					totalPayments += r.Payment.Amount
				}
			}
		}
	}

	// Расчёт дней до следующего дохода
	var daysUntilNext int
	if req.Type == "advance" {
		// После аванса (30) до зарплаты (15)
		daysUntilNext = 15
	} else {
		// После зарплаты (15) до аванса (30)
		daysUntilNext = 15
	}

	// Рассчитываем цель накоплений
	goal, _ := h.storage.GetActiveGoal()
	var suggestedSavings float64

	if goal != nil {
		// Сколько нужно откладывать в месяц для достижения цели
		daysRemaining := int(time.Until(goal.TargetDate).Hours() / 24)
		if daysRemaining > 0 {
			monthsRemaining := float64(daysRemaining) / 30.0
			remaining := goal.TargetAmount - goal.CurrentAmount
			monthlyTarget := remaining / monthsRemaining * usdRate // в рублях
			// Делим на 2, т.к. 2 выплаты в месяц
			suggestedSavings = monthlyTarget / 2
		}
	}

	// Минимум - процент от дохода
	minSavings := req.Income * savingsPercent / 100
	if suggestedSavings < minSavings {
		suggestedSavings = minSavings
	}

	// Остаток на жизнь
	remaining := req.Income - totalPayments - suggestedSavings

	// Если остаётся меньше минимума, корректируем накопления
	if remaining < minLiving {
		suggestedSavings = req.Income - totalPayments - minLiving
		if suggestedSavings < 0 {
			suggestedSavings = 0
		}
		remaining = req.Income - totalPayments - suggestedSavings
	}

	// Бюджет на день
	dailyBudget := remaining / float64(daysUntilNext)

	// Формируем рекомендацию
	var message string
	if totalPayments > 0 {
		message = fmt.Sprintf("💳 Оплати обязательные платежи: %.0f ₽\n", totalPayments)
	}
	if suggestedSavings > 0 {
		message += fmt.Sprintf("🏦 Отложи в копилку: %.0f ₽\n", suggestedSavings)
	}
	message += fmt.Sprintf("💵 На жизнь: %.0f ₽ (~%.0f ₽/день)", remaining, dailyBudget)

	plan := &BudgetPlan{
		Income:           req.Income,
		Payments:         pendingPayments,
		TotalPayments:    totalPayments,
		SuggestedSavings: suggestedSavings,
		Remaining:        remaining,
		DaysUntilNext:    daysUntilNext,
		DailyBudget:      dailyBudget,
		Message:          message,
	}

	h.jsonResponse(w, plan, nil)
}

// === Balance / Account Handlers ===

// GetBalance получить текущий баланс
func (h *Handlers) GetBalance(w http.ResponseWriter, r *http.Request) {
	account, err := h.storage.GetMainAccount()
	if err != nil {
		h.jsonResponse(w, nil, err)
		return
	}
	h.jsonResponse(w, account, nil)
}

// SyncBalance сверить баланс с реальным
func (h *Handlers) SyncBalance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.jsonResponse(w, nil, fmt.Errorf("method not allowed"))
		return
	}

	var req struct {
		ActualBalance float64 `json:"actual_balance"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	diff, err := h.storage.SyncBalance(req.ActualBalance)
	if err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	account, _ := h.storage.GetMainAccount()
	h.jsonResponse(w, map[string]interface{}{
		"account":    account,
		"difference": diff,
	}, nil)
}

// SetInitialBalance установить начальный баланс
func (h *Handlers) SetInitialBalance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.jsonResponse(w, nil, fmt.Errorf("method not allowed"))
		return
	}

	var req struct {
		Balance float64 `json:"balance"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	err := h.storage.SetBalance(req.Balance)
	if err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	// Отметить как сверенный
	h.storage.SyncBalance(req.Balance)

	account, _ := h.storage.GetMainAccount()
	h.jsonResponse(w, account, nil)
}

// === Categories Handlers ===

// GetCategories получить все категории
func (h *Handlers) GetCategories(w http.ResponseWriter, r *http.Request) {
	includeInactive := r.URL.Query().Get("include_inactive") == "true"
	
	var categories []CategoryWithSubs
	var err error
	
	if includeInactive {
		categories, err = h.storage.GetAllCategoriesIncludingInactive()
	} else {
		categories, err = h.storage.GetCategories()
	}
	
	if err != nil {
		h.jsonResponse(w, nil, err)
		return
	}
	h.jsonResponse(w, categories, nil)
}

// GetCategoriesFlat получить категории плоским списком
func (h *Handlers) GetCategoriesFlat(w http.ResponseWriter, r *http.Request) {
	categories, err := h.storage.GetAllCategoriesFlat()
	if err != nil {
		h.jsonResponse(w, nil, err)
		return
	}
	h.jsonResponse(w, categories, nil)
}

// === Analytics Handlers ===

// GetAnalytics получить данные аналитики
func (h *Handlers) GetAnalytics(w http.ResponseWriter, r *http.Request) {
	month := r.URL.Query().Get("month")
	if month == "" {
		month = time.Now().Format("2006-01")
	}

	// Расходы по категориям
	byCategory, err := h.storage.GetExpensesByCategory(month)
	if err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	// Сводка за месяц
	summary, err := h.storage.GetMonthSummary(month)
	if err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	// Тренд за 6 месяцев
	trend, err := h.storage.GetMonthlyTrend(6)
	if err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	analytics := &AnalyticsData{
		TotalIncome:   summary.TotalIncome,
		TotalExpenses: summary.Expenses,
		TotalSavings:  summary.TotalSaved,
		ByCategory:    byCategory,
		MonthlyTrend:  trend,
	}

	h.jsonResponse(w, analytics, nil)
}

// GetExpensesByCategory получить расходы по категориям
func (h *Handlers) GetExpensesByCategory(w http.ResponseWriter, r *http.Request) {
	month := r.URL.Query().Get("month")
	if month == "" {
		month = time.Now().Format("2006-01")
	}

	expenses, err := h.storage.GetExpensesByCategory(month)
	if err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	h.jsonResponse(w, expenses, nil)
}

// GetMonthlyBudget получить месячный бюджет
func (h *Handlers) GetMonthlyBudget(w http.ResponseWriter, r *http.Request) {
	month := r.URL.Query().Get("month")
	if month == "" {
		month = time.Now().Format("2006-01")
	}

	summary, err := h.storage.GetMonthSummary(month)
	if err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	// Плановые платежи
	totalPayments, _ := h.storage.GetTotalMonthlyPayments()

	budget := &MonthlyBudget{
		Month:         month,
		TotalIncome:   summary.TotalIncome,
		TotalPayments: totalPayments,
		TotalSavings:  summary.TotalSaved,
		TotalExpenses: summary.Expenses,
		Remaining:     summary.TotalIncome - summary.Expenses - summary.TotalSaved,
	}

	if budget.TotalIncome > 0 {
		budget.SavingsRate = (budget.TotalSavings / budget.TotalIncome) * 100
	}

	h.jsonResponse(w, budget, nil)
}

// GetTransactionsByMonth получить транзакции за месяц
func (h *Handlers) GetTransactionsByMonth(w http.ResponseWriter, r *http.Request) {
	month := r.URL.Query().Get("month")
	if month == "" {
		month = time.Now().Format("2006-01")
	}

	transactions, err := h.storage.GetTransactionsByMonth(month)
	if err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	// Ensure we return empty array, not null
	if transactions == nil {
		transactions = []Transaction{}
	}

	h.jsonResponse(w, transactions, nil)
}

// GetIncomeRecommendation рассчитать финансовые рекомендации
// Cashflow-логика: горизонт от сегодня до следующего дохода (ЗП/аванс)
// Баланс → На жизнь до дохода → Платежи до дохода → Свободно
func (h *Handlers) GetIncomeRecommendation(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	currentDay := now.Day()
	daysInMonth := time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()

	// Получить баланс
	account, err := h.storage.GetMainAccount()
	if err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	// Получить настройки
	minLivingStr, _ := h.storage.GetSetting("min_living_budget")
	advanceDayStr, _ := h.storage.GetSetting("advance_day")
	salaryDayStr, _ := h.storage.GetSetting("salary_day")
	savingsPercentStr, _ := h.storage.GetSetting("savings_percent")

	minLiving, _ := strconv.ParseFloat(minLivingStr, 64)
	advanceDay, _ := strconv.Atoi(advanceDayStr)
	salaryDay, _ := strconv.Atoi(salaryDayStr)
	savingsPercent, _ := strconv.ParseFloat(savingsPercentStr, 64)

	if minLiving == 0 {
		minLiving = 1500
	}
	if advanceDay == 0 {
		advanceDay = 30
	}
	if salaryDay == 0 {
		salaryDay = 15
	}
	if savingsPercent == 0 {
		savingsPercent = 20
	}

	// ========== CASHFLOW АЛГОРИТМ ==========
	//
	// 1. Определить дату следующего дохода (ЗП или аванс)
	// 2. Рассчитать дней до дохода
	// 3. НА ЖИЗНЬ = (min_living / 30) × дней_до_дохода
	// 4. ПЛАТЕЖИ = все неоплаченные до даты дохода
	// 5. СВОБОДНО = Баланс - На жизнь - Платежи

	// Определить следующий доход
	var nextIncomeDate time.Time
	var nextIncomeType string
	var daysUntilIncome int

	if salaryDay < advanceDay {
		// Порядок: ЗП (15) → Аванс (30)
		if currentDay < salaryDay {
			// Ждём ЗП в этом месяце
			nextIncomeDate = time.Date(now.Year(), now.Month(), salaryDay, 0, 0, 0, 0, time.UTC)
			nextIncomeType = "ЗП"
			daysUntilIncome = salaryDay - currentDay
		} else if currentDay < advanceDay {
			// Ждём аванс в этом месяце
			nextIncomeDate = time.Date(now.Year(), now.Month(), advanceDay, 0, 0, 0, 0, time.UTC)
			nextIncomeType = "аванс"
			daysUntilIncome = advanceDay - currentDay
		} else {
			// Ждём ЗП в следующем месяце
			nextIncomeDate = time.Date(now.Year(), now.Month()+1, salaryDay, 0, 0, 0, 0, time.UTC)
			nextIncomeType = "ЗП"
			daysUntilIncome = (daysInMonth - currentDay) + salaryDay
		}
	} else {
		// Порядок: Аванс → ЗП (например 1 и 15)
		if currentDay < advanceDay {
			nextIncomeDate = time.Date(now.Year(), now.Month(), advanceDay, 0, 0, 0, 0, time.UTC)
			nextIncomeType = "аванс"
			daysUntilIncome = advanceDay - currentDay
		} else if currentDay < salaryDay {
			nextIncomeDate = time.Date(now.Year(), now.Month(), salaryDay, 0, 0, 0, 0, time.UTC)
			nextIncomeType = "ЗП"
			daysUntilIncome = salaryDay - currentDay
		} else {
			nextIncomeDate = time.Date(now.Year(), now.Month()+1, advanceDay, 0, 0, 0, 0, time.UTC)
			nextIncomeType = "аванс"
			daysUntilIncome = (daysInMonth - currentDay) + advanceDay
		}
	}

	if daysUntilIncome < 1 {
		daysUntilIncome = 1
	}

	// Рассчитать бюджет на жизнь до дохода
	// minLiving - это месячный минимум, делим на 30 и умножаем на дни
	livingBudget := (minLiving / 30.0) * float64(daysUntilIncome)

	// Получить все платежи до даты дохода
	paymentReminders, totalPayments, err := h.storage.GetPaymentsUntilDate(nextIncomeDate)
	if err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	// Преобразовать в список для JSON
	var paymentsList []map[string]interface{}
	for _, r := range paymentReminders {
		paymentsList = append(paymentsList, map[string]interface{}{
			"name":         r.Payment.Name,
			"amount":       r.Payment.Amount,
			"due_date":     r.DueDate,
			"days_until":   r.DaysUntil,
			"is_next_month": r.IsNextMonth,
		})
	}

	// Рассчитать свободные средства
	balance := account.Balance
	freeFunds := balance - livingBudget - totalPayments

	// Рассчитать рекомендуемые накопления (% от свободных средств)
	suggestedSavings := 0.0
	if freeFunds > 0 {
		suggestedSavings = freeFunds * (savingsPercent / 100)
	}

	// Формируем сообщение
	var message string
	var status string

	if freeFunds < 0 {
		message = fmt.Sprintf("Дефицит %.0f BYN до %s", -freeFunds, nextIncomeType)
		status = "warning"
	} else if suggestedSavings > 0 {
		message = fmt.Sprintf("Можно отложить %.0f BYN (%.0f%%)", suggestedSavings, savingsPercent)
		status = "success"
	} else {
		message = "Свободных средств нет"
		status = "info"
	}

	// Проверить цель накоплений
	goal, _ := h.storage.GetActiveGoal()
	var goalInfo map[string]interface{}
	if goal != nil {
		remaining := goal.TargetAmount - goal.CurrentAmount
		if remaining > 0 {
			goalInfo = map[string]interface{}{
				"name":    goal.Name,
				"current": goal.CurrentAmount,
				"target":  goal.TargetAmount,
			}
		}
	}

	// Ответ с cashflow-данными
	response := map[string]interface{}{
		// Основные показатели
		"balance":           balance,          // Баланс
		"living_budget":     livingBudget,     // На жизнь до дохода
		"total_payments":    totalPayments,    // Платежи до дохода
		"free_funds":        freeFunds,        // Свободно
		"suggested_savings": suggestedSavings, // Рекомендуем отложить (% от свободных)
		"savings_percent":   savingsPercent,   // % накоплений (из настроек)

		// Информация о следующем доходе
		"next_income_date":   nextIncomeDate.Format("02.01"),
		"next_income_type":   nextIncomeType,
		"days_until_income":  daysUntilIncome,

		// Дополнительно
		"min_living_monthly": minLiving,     // Минимум в месяц (настройка)
		"payments_list":      paymentsList,  // Список платежей до дохода
		"goal":               goalInfo,      // Цель накоплений

		// Сообщение
		"message": message,
		"status":  status,
	}

	h.jsonResponse(w, response, nil)
}

// ===== CRUD для категорий =====

// GetCategoriesHandler получить все категории
func (h *Handlers) GetCategoriesHandler(w http.ResponseWriter, r *http.Request) {
	// Параметр includeInactive для показа неактивных
	includeInactive := r.URL.Query().Get("include_inactive") == "true"

	var categories []CategoryWithSubs
	var err error

	if includeInactive {
		categories, err = h.storage.GetAllCategoriesIncludingInactive()
	} else {
		categories, err = h.storage.GetCategories()
	}

	h.jsonResponse(w, categories, err)
}

// AddCategoryHandler добавить категорию
func (h *Handlers) AddCategoryHandler(w http.ResponseWriter, r *http.Request) {
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
		h.jsonResponse(w, nil, fmt.Errorf("invalid request: %w", err))
		return
	}

	if req.Name == "" {
		h.jsonResponse(w, nil, fmt.Errorf("название категории обязательно"))
		return
	}

	category := &Category{
		Name:     req.Name,
		ParentID: req.ParentID,
		Icon:     req.Icon,
		Color:    req.Color,
	}

	if err := h.storage.AddCategory(category); err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	// Уведомляем об обновлении категорий
	h.notifyUpdate("categories")

	h.jsonResponse(w, category, nil)
}

// UpdateCategoryHandler обновить категорию
func (h *Handlers) UpdateCategoryHandler(w http.ResponseWriter, r *http.Request) {
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
		h.jsonResponse(w, nil, fmt.Errorf("invalid request: %w", err))
		return
	}

	if req.ID == 0 {
		h.jsonResponse(w, nil, fmt.Errorf("ID категории обязателен"))
		return
	}

	category := &Category{
		ID:    req.ID,
		Name:  req.Name,
		Icon:  req.Icon,
		Color: req.Color,
	}

	if err := h.storage.UpdateCategory(category); err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	// Уведомляем об обновлении категорий
	h.notifyUpdate("categories")

	h.jsonResponse(w, category, nil)
}

// DeleteCategoryHandler удалить категорию (soft delete)
func (h *Handlers) DeleteCategoryHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete && r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		// Попробуем из body
		var req struct {
			ID int64 `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			idStr = fmt.Sprintf("%d", req.ID)
		}
	}

	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id == 0 {
		h.jsonResponse(w, nil, fmt.Errorf("ID категории обязателен"))
		return
	}

	if err := h.storage.DeleteCategory(id); err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	// Уведомляем об обновлении категорий
	h.notifyUpdate("categories")

	h.jsonResponse(w, map[string]string{"status": "deleted"}, nil)
}

// RestoreCategoryHandler восстановить категорию
func (h *Handlers) RestoreCategoryHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ID int64 `json:"id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.jsonResponse(w, nil, fmt.Errorf("invalid request: %w", err))
		return
	}

	if req.ID == 0 {
		h.jsonResponse(w, nil, fmt.Errorf("ID категории обязателен"))
		return
	}

	if err := h.storage.RestoreCategory(req.ID); err != nil {
		h.jsonResponse(w, nil, err)
		return
	}

	// Уведомляем об обновлении категорий
	h.notifyUpdate("categories")

	h.jsonResponse(w, map[string]string{"status": "restored"}, nil)
}
