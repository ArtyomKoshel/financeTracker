package currency

import (
	"fmt"
)

// Converter утилиты конвертации валют
type Converter struct {
	rates map[string]float64
}

// NewConverter создаёт новый конвертер с курсами
func NewConverter(rates map[string]float64) *Converter {
	return &Converter{rates: rates}
}

// DefaultRates курсы по умолчанию (к BYN)
var DefaultRates = map[string]float64{
	"BYN": 1.0,
	"RUB": 0.034,
	"EUR": 3.55,
	"USD": 3.25,
	"GBP": 4.10,
	"PLN": 0.82,
}

// SupportedCurrencies список поддерживаемых валют
var SupportedCurrencies = []string{"BYN", "RUB", "EUR", "USD", "GBP", "PLN"}

// IsSupported проверяет, поддерживается ли валюта
func IsSupported(currency string) bool {
	for _, c := range SupportedCurrencies {
		if c == currency {
			return true
		}
	}
	return false
}

// Convert конвертирует сумму через базовую валюту BYN
func (c *Converter) Convert(amount float64, from, to string) (float64, error) {
	if from == to {
		return amount, nil
	}

	fromRate, ok := c.rates[from]
	if !ok {
		fromRate, ok = DefaultRates[from]
		if !ok {
			return 0, fmt.Errorf("unsupported currency: %s", from)
		}
	}

	toRate, ok := c.rates[to]
	if !ok {
		toRate, ok = DefaultRates[to]
		if !ok {
			return 0, fmt.Errorf("unsupported currency: %s", to)
		}
	}

	// Конвертируем через BYN
	amountBYN := amount * fromRate
	result := amountBYN / toRate

	return result, nil
}

// ToBYN конвертирует сумму в BYN
func (c *Converter) ToBYN(amount float64, currency string) (float64, error) {
	return c.Convert(amount, currency, "BYN")
}

// FromBYN конвертирует сумму из BYN
func (c *Converter) FromBYN(amount float64, currency string) (float64, error) {
	return c.Convert(amount, "BYN", currency)
}

// GetRate возвращает курс валюты к BYN
func (c *Converter) GetRate(currency string) (float64, bool) {
	if rate, ok := c.rates[currency]; ok {
		return rate, true
	}
	if rate, ok := DefaultRates[currency]; ok {
		return rate, true
	}
	return 0, false
}

// SetRate устанавливает курс валюты
func (c *Converter) SetRate(currency string, rate float64) {
	c.rates[currency] = rate
}

// FormatMoney форматирует сумму с валютой
func FormatMoney(amount float64, currency string) string {
	symbol := GetCurrencySymbol(currency)
	return fmt.Sprintf("%.2f %s", amount, symbol)
}

// GetCurrencySymbol возвращает символ валюты
func GetCurrencySymbol(currency string) string {
	symbols := map[string]string{
		"BYN": "BYN",
		"RUB": "₽",
		"EUR": "€",
		"USD": "$",
		"GBP": "£",
		"PLN": "zł",
	}
	if s, ok := symbols[currency]; ok {
		return s
	}
	return currency
}
