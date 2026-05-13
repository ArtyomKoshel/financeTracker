package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"finance-tracker/internal/repository"
)

// CurrencyServiceImpl реализация сервиса валют
type CurrencyServiceImpl struct {
	settingsRepo repository.SettingsRepository
	httpClient   *http.Client
}

// NewCurrencyService создаёт новый сервис валют
func NewCurrencyService(settingsRepo repository.SettingsRepository) *CurrencyServiceImpl {
	return &CurrencyServiceImpl{
		settingsRepo: settingsRepo,
		httpClient:   &http.Client{Timeout: 10 * time.Second},
	}
}

// DefaultRates курсы по умолчанию
var DefaultRates = map[string]float64{
	"RUB": 0.034,
	"EUR": 3.55,
	"USD": 3.25,
}

// Convert конвертирует сумму из одной валюты в другую
func (s *CurrencyServiceImpl) Convert(ctx context.Context, amount float64, from, to string) (float64, error) {
	if from == to {
		return amount, nil
	}

	// Конвертируем через BYN как базовую валюту
	amountBYN := amount
	if from != "BYN" {
		rate, err := s.GetRate(ctx, from)
		if err != nil {
			return 0, err
		}
		amountBYN = amount * rate
	}

	if to == "BYN" {
		return amountBYN, nil
	}

	rateTo, err := s.GetRate(ctx, to)
	if err != nil {
		return 0, err
	}

	return amountBYN / rateTo, nil
}

// GetRate получает курс валюты к BYN
func (s *CurrencyServiceImpl) GetRate(ctx context.Context, currency string) (float64, error) {
	if currency == "BYN" {
		return 1.0, nil
	}

	// Ключи хранятся в нижнем регистре (usd_rate, eur_rate, rub_rate)
	key := fmt.Sprintf("%s_rate", strings.ToLower(currency))
	rateStr, err := s.settingsRepo.Get(ctx, key)
	if err != nil || rateStr == "" {
		// Возвращаем дефолтный курс
		if rate, ok := DefaultRates[currency]; ok {
			return rate, nil
		}
		return 1.0, nil
	}

	var rate float64
	if _, err := fmt.Sscanf(rateStr, "%f", &rate); err != nil || rate == 0 {
		if rate, ok := DefaultRates[currency]; ok {
			return rate, nil
		}
		return 1.0, nil
	}

	return rate, nil
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

// FetchNBRBRates получает курсы с API Национального банка РБ
func (s *CurrencyServiceImpl) FetchNBRBRates(ctx context.Context) (map[string]float64, error) {
	rates := make(map[string]float64)

	currencies := map[string]int{
		"USD": 431,
		"EUR": 451,
		"RUB": 456,
	}

	for currency, id := range currencies {
		url := fmt.Sprintf("https://api.nbrb.by/exrates/rates/%d?parammode=0", id)

		req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
		if err != nil {
			continue
		}

		resp, err := s.httpClient.Do(req)
		if err != nil {
			continue
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			continue
		}

		var rate NBRBRate
		if err := json.Unmarshal(body, &rate); err != nil {
			continue
		}

		actualRate := rate.CurOfficialRate / float64(rate.CurScale)
		rates[currency] = actualRate
	}

	return rates, nil
}

// UpdateRatesFromNBRB обновляет курсы из NBRB и сохраняет в БД
func (s *CurrencyServiceImpl) UpdateRatesFromNBRB(ctx context.Context) (map[string]float64, error) {
	rates, err := s.FetchNBRBRates(ctx)
	if err != nil {
		return nil, fmt.Errorf("не удалось получить курсы: %w", err)
	}

	if len(rates) == 0 {
		return nil, fmt.Errorf("курсы не получены")
	}

	// Сохраняем в БД
	if usd, ok := rates["USD"]; ok {
		s.settingsRepo.Set(ctx, "usd_rate", fmt.Sprintf("%.4f", usd))
	}
	if eur, ok := rates["EUR"]; ok {
		s.settingsRepo.Set(ctx, "eur_rate", fmt.Sprintf("%.4f", eur))
	}
	if rub, ok := rates["RUB"]; ok {
		s.settingsRepo.Set(ctx, "rub_rate", fmt.Sprintf("%.6f", rub))
	}

	// Сохраняем дату обновления
	s.settingsRepo.Set(ctx, "rates_updated", time.Now().Format("2006-01-02 15:04"))

	return rates, nil
}
