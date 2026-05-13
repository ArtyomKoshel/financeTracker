package service

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"finance-tracker/internal/domain"
)

func TestTransactionService_Validate(t *testing.T) {
	tests := []struct {
		name       string
		amount     float64
		txType     string
		config     *domain.SalaryConfig
		wantValid  bool
		wantHasMsg bool
	}{
		{
			name:   "valid advance",
			amount: 160000,
			txType: "advance",
			config: &domain.SalaryConfig{
				GrossSalary:      320000,
				ExpectedAdvance:  160650,
				TolerancePercent: 5,
			},
			wantValid:  true,
			wantHasMsg: true,
		},
		{
			name:   "advance too low",
			amount: 100000,
			txType: "advance",
			config: &domain.SalaryConfig{
				GrossSalary:      320000,
				ExpectedAdvance:  160650,
				TolerancePercent: 5,
			},
			wantValid:  false,
			wantHasMsg: true,
		},
		{
			name:   "valid bonus",
			amount: 50000,
			txType: "bonus",
			config: &domain.SalaryConfig{
				TolerancePercent: 5,
			},
			wantValid:  true,
			wantHasMsg: true,
		},
		{
			name:   "valid year bonus",
			amount: 380000,
			txType: "year_bonus",
			config: &domain.SalaryConfig{
				TolerancePercent: 5,
			},
			wantValid:  true,
			wantHasMsg: true,
		},
		{
			name:   "year bonus too high",
			amount: 500000,
			txType: "year_bonus",
			config: &domain.SalaryConfig{
				TolerancePercent: 5,
			},
			wantValid:  false,
			wantHasMsg: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			settingsRepo := &MockSettingsRepoWithConfig{config: tt.config}
			txRepo := &MockTransactionRepository{}
			paymentRepo := &MockPaymentRepository{}
			currencySvc := &MockCurrencyService{}

			svc := NewTransactionService(txRepo, paymentRepo, settingsRepo, currencySvc)

			result, err := svc.Validate(context.Background(), tt.amount, tt.txType)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if result.IsValid != tt.wantValid {
				t.Errorf("IsValid = %v, want %v", result.IsValid, tt.wantValid)
			}

			if tt.wantHasMsg && result.Message == "" {
				t.Error("Message should not be empty")
			}

			if result.Actual != tt.amount {
				t.Errorf("Actual = %v, want %v", result.Actual, tt.amount)
			}
		})
	}
}

func TestTransactionService_Create_Validation(t *testing.T) {
	tests := []struct {
		name    string
		req     CreateTransactionRequest
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid request",
			req: CreateTransactionRequest{
				Date:     "2025-01-15",
				Amount:   1000,
				Currency: "BYN",
				Type:     "expense",
			},
			wantErr: false,
		},
		{
			name: "invalid amount - zero",
			req: CreateTransactionRequest{
				Date:     "2025-01-15",
				Amount:   0,
				Currency: "BYN",
				Type:     "expense",
			},
			wantErr: true,
			errMsg:  "amount must be greater than 0",
		},
		{
			name: "invalid amount - negative",
			req: CreateTransactionRequest{
				Date:     "2025-01-15",
				Amount:   -100,
				Currency: "BYN",
				Type:     "expense",
			},
			wantErr: true,
			errMsg:  "amount must be greater than 0",
		},
		{
			name: "invalid date format",
			req: CreateTransactionRequest{
				Date:     "15-01-2025",
				Amount:   1000,
				Currency: "BYN",
				Type:     "expense",
			},
			wantErr: true,
			errMsg:  "invalid date format",
		},
		{
			name: "invalid transaction type",
			req: CreateTransactionRequest{
				Date:     "2025-01-15",
				Amount:   1000,
				Currency: "BYN",
				Type:     "invalid_type",
			},
			wantErr: true,
			errMsg:  "invalid transaction type",
		},
		{
			name: "unsupported currency",
			req: CreateTransactionRequest{
				Date:     "2025-01-15",
				Amount:   1000,
				Currency: "JPY",
				Type:     "expense",
			},
			wantErr: true,
			errMsg:  "unsupported currency",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			txRepo := &MockTransactionRepository{}
			paymentRepo := &MockPaymentRepository{}
			settingsRepo := &MockSettingsRepoWithConfig{config: &domain.SalaryConfig{}}
			currencySvc := &MockCurrencyService{rates: map[string]float64{"USD": 3.25}}

			svc := NewTransactionService(txRepo, paymentRepo, settingsRepo, currencySvc)

			_, err := svc.Create(context.Background(), tt.req)

			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				} else if !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("error = %v, want containing %v", err, tt.errMsg)
				}
			} else if err != nil {
				t.Errorf("unexpected error: %v", err)
			}
		})
	}
}

// MockSettingsRepoWithConfig mock with salary config
type MockSettingsRepoWithConfig struct {
	MockSettingsRepository
	config *domain.SalaryConfig
}

func (m *MockSettingsRepoWithConfig) GetSalaryConfig(ctx context.Context) (*domain.SalaryConfig, error) {
	return m.config, nil
}

func (m *MockSettingsRepoWithConfig) GetSettings(ctx context.Context) (*domain.Settings, error) {
	return &domain.Settings{
		SalaryConfig: *m.config,
	}, nil
}
