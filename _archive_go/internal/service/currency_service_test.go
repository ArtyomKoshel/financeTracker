package service

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"finance-tracker/internal/domain"
)

func TestCurrencyService_GetRate(t *testing.T) {
	tests := []struct {
		name     string
		currency string
		stored   string
		want     float64
	}{
		{
			name:     "BYN always returns 1",
			currency: "BYN",
			stored:   "",
			want:     1.0,
		},
		{
			name:     "USD default rate",
			currency: "USD",
			stored:   "",
			want:     3.25,
		},
		{
			name:     "EUR default rate",
			currency: "EUR",
			stored:   "",
			want:     3.55,
		},
		{
			name:     "RUB default rate",
			currency: "RUB",
			stored:   "",
			want:     0.034,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			settingsRepo := &MockSettingsRepository{settings: &domain.Settings{}}
			svc := NewCurrencyService(settingsRepo)

			got, err := svc.GetRate(context.Background(), tt.currency)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if got != tt.want {
				t.Errorf("GetRate(%s) = %v, want %v", tt.currency, got, tt.want)
			}
		})
	}
}

func TestCurrencyService_Convert(t *testing.T) {
	tests := []struct {
		name   string
		amount float64
		from   string
		to     string
		rates  map[string]float64
		want   float64
	}{
		{
			name:   "same currency",
			amount: 100,
			from:   "BYN",
			to:     "BYN",
			rates:  map[string]float64{},
			want:   100,
		},
		{
			name:   "USD to BYN",
			amount: 100,
			from:   "USD",
			to:     "BYN",
			rates:  map[string]float64{"USD": 3.25},
			want:   325, // 100 * 3.25
		},
		{
			name:   "RUB to BYN",
			amount: 1000,
			from:   "RUB",
			to:     "BYN",
			rates:  map[string]float64{"RUB": 0.034},
			want:   34, // 1000 * 0.034
		},
		{
			name:   "BYN to USD",
			amount: 325,
			from:   "BYN",
			to:     "USD",
			rates:  map[string]float64{"USD": 3.25, "BYN": 1.0},
			want:   100, // 325 / 3.25
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			settingsRepo := &MockSettingsRepositoryWithRates{rates: tt.rates}
			svc := NewCurrencyService(settingsRepo)

			got, err := svc.Convert(context.Background(), tt.amount, tt.from, tt.to)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			// Allow small floating point differences
			diff := got - tt.want
			if diff < -0.01 || diff > 0.01 {
				t.Errorf("Convert(%v, %s, %s) = %v, want %v", tt.amount, tt.from, tt.to, got, tt.want)
			}
		})
	}
}

// MockSettingsRepositoryWithRates mock with custom rates
type MockSettingsRepositoryWithRates struct {
	MockSettingsRepository
	rates map[string]float64
}

func (m *MockSettingsRepositoryWithRates) Get(ctx context.Context, key string) (string, error) {
	// Parse rate key like "usd_rate" -> "USD"
	if len(key) > 5 && key[len(key)-5:] == "_rate" {
		currency := key[:len(key)-5]
		if rate, ok := m.rates[currency]; ok {
			return fmt.Sprintf("%f", rate), nil
		}
		if rate, ok := m.rates[strings.ToUpper(currency)]; ok {
			return fmt.Sprintf("%f", rate), nil
		}
	}
	return "", nil
}
