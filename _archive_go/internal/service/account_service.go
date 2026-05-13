package service

import (
	"context"
	"fmt"
	"time"

	"finance-tracker/internal/domain"
	"finance-tracker/internal/repository"
)

// AccountServiceImpl реализация сервиса счетов
type AccountServiceImpl struct {
	accountRepo repository.AccountRepository
	txRepo      repository.TransactionRepository
}

// NewAccountService создаёт новый сервис счетов
func NewAccountService(
	accountRepo repository.AccountRepository,
	txRepo repository.TransactionRepository,
) *AccountServiceImpl {
	return &AccountServiceImpl{
		accountRepo: accountRepo,
		txRepo:      txRepo,
	}
}

// GetMainAccount возвращает основной счёт
func (s *AccountServiceImpl) GetMainAccount(ctx context.Context) (*domain.Account, error) {
	return s.accountRepo.GetMainAccount(ctx)
}

// GetBalance возвращает текущий баланс
func (s *AccountServiceImpl) GetBalance(ctx context.Context) (float64, error) {
	return s.accountRepo.GetBalance(ctx)
}

// SetBalance устанавливает баланс
func (s *AccountServiceImpl) SetBalance(ctx context.Context, balance float64) error {
	return s.accountRepo.SetBalance(ctx, 1, balance)
}

// SyncBalance сверяет баланс и создаёт корректирующую транзакцию
func (s *AccountServiceImpl) SyncBalance(ctx context.Context, actualBalance float64) (*SyncBalanceResult, error) {
	// Получить текущий баланс
	currentAccount, err := s.accountRepo.GetMainAccount(ctx)
	if err != nil {
		return nil, fmt.Errorf("get account: %w", err)
	}

	diff := actualBalance - currentAccount.Balance

	// Если есть разница - создаём корректирующую транзакцию
	if diff != 0 {
		now := time.Now()

		description := "Сверка баланса"
		if diff > 0 {
			description = fmt.Sprintf("Сверка баланса (+%.2f Br)", diff)
		} else {
			description = fmt.Sprintf("Сверка баланса (%.2f Br)", diff)
		}

		// Создаём транзакцию типа correction
		// Amount = diff (положительная или отрицательная)
		// Транзакция автоматически изменит баланс
		tx := &domain.Transaction{
			Date:           now,
			Amount:         diff, // Разница (может быть + или -)
			OriginalAmount: diff,
			Currency:       "BYN",
			Type:           domain.TypeCorrection,
			Description:    description,
			Month:          now.Format("2006-01"),
			AccountID:      1,
		}

		if err := s.txRepo.Create(ctx, tx); err != nil {
			return nil, fmt.Errorf("create correction transaction: %w", err)
		}

		// Обновляем только дату и сумму сверки (баланс уже изменён транзакцией)
		if err := s.accountRepo.UpdateSyncInfo(ctx, 1, actualBalance); err != nil {
			return nil, fmt.Errorf("update sync info: %w", err)
		}
	} else {
		// Разницы нет, просто обновляем дату сверки
		if err := s.accountRepo.UpdateSyncInfo(ctx, 1, actualBalance); err != nil {
			return nil, fmt.Errorf("update sync info: %w", err)
		}
	}

	// Получить обновлённый счёт
	account, err := s.accountRepo.GetMainAccount(ctx)
	if err != nil {
		return nil, fmt.Errorf("get updated account: %w", err)
	}

	return &SyncBalanceResult{
		Account:    account,
		Difference: diff,
	}, nil
}
