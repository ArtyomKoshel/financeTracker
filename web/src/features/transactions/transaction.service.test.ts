import { describe, it, expect } from 'vitest';
import { transactionService } from './transaction.service';

describe('TransactionService', () => {
  describe('isIncome', () => {
    it('returns true for income types', () => {
      expect(transactionService.isIncome('advance')).toBe(true);
      expect(transactionService.isIncome('salary')).toBe(true);
      expect(transactionService.isIncome('bonus')).toBe(true);
      expect(transactionService.isIncome('early_pay')).toBe(true);
      expect(transactionService.isIncome('year_bonus')).toBe(true);
      expect(transactionService.isIncome('vacation')).toBe(true);
      expect(transactionService.isIncome('other')).toBe(true);
    });

    it('returns false for non-income types', () => {
      expect(transactionService.isIncome('expense')).toBe(false);
      expect(transactionService.isIncome('savings')).toBe(false);
      expect(transactionService.isIncome('correction')).toBe(false);
    });
  });

  describe('getTypeLabel', () => {
    it('returns correct labels', () => {
      expect(transactionService.getTypeLabel('advance')).toBe('Аванс');
      expect(transactionService.getTypeLabel('salary')).toBe('Зарплата');
      expect(transactionService.getTypeLabel('bonus')).toBe('Премия');
      expect(transactionService.getTypeLabel('expense')).toBe('Расход');
      expect(transactionService.getTypeLabel('savings')).toBe('Накопления');
      expect(transactionService.getTypeLabel('correction')).toBe('Сверка баланса');
    });
  });
});
