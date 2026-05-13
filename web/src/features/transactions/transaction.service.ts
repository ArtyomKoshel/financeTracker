import api, { TransactionResult } from '@/api/client';
import { store } from '@/store';
import type { Transaction, TransactionType, Currency, TransactionTemplate, Tag } from '@/types';

export interface CreateTransactionParams {
  date: string;
  amount: number;
  currency?: Currency;
  type: TransactionType;
  categoryId?: number;
  recurringPaymentId?: number;
  description?: string;
  month?: string;
}

/**
 * Transaction service for business logic
 */
class TransactionService {
  /**
   * Get all transactions (paginated)
   */
  async getAll(page = 1, perPage = 50): Promise<{ data: Transaction[]; meta: { total: number; page: number; per_page: number; last_page: number } }> {
    return api.getTransactions(page, perPage);
  }

  /**
   * Get transactions by month (paginated)
   */
  async getByMonth(month: string, page = 1, perPage = 100): Promise<{ data: Transaction[]; meta: { total: number; page: number; per_page: number; last_page: number } }> {
    return api.getTransactionsByMonth(month, page, perPage);
  }

  /**
   * Create a new transaction
   */
  async create(params: CreateTransactionParams): Promise<TransactionResult> {
    return api.createTransaction({
      date: params.date,
      amount: params.amount,
      currency: params.currency,
      type: params.type,
      category_id: params.categoryId,
      recurring_payment_id: params.recurringPaymentId,
      description: params.description,
      month: params.month,
    });
  }

  /**
   * Delete a transaction
   */
  async delete(id: number): Promise<boolean> {
    const result = await api.deleteTransaction(id);
    return result.deleted;
  }

  /**
   * Validate a payment amount
   */
  async validate(amount: number, type: TransactionType) {
    return api.validatePayment(amount, type);
  }

  async getFiltered(page: number, perPage: number, filters: Parameters<typeof api.getTransactions>[2]): Promise<{ data: Transaction[]; meta: { total: number; page: number; per_page: number; last_page: number } }> {
    return api.getTransactions(page, perPage, filters);
  }

  async createRaw(data: Parameters<typeof api.createTransaction>[0]): Promise<TransactionResult> {
    return api.createTransaction(data);
  }

  async getTags(): Promise<Tag[]> {
    return api.getTags();
  }

  async getTemplates(): Promise<TransactionTemplate[]> {
    return api.getTransactionTemplates();
  }

  async exportCsv(params: Parameters<typeof api.exportTransactionsCsv>[0]): Promise<void> {
    return api.exportTransactionsCsv(params);
  }

  async bulkDelete(ids: number[]): Promise<unknown> {
    return api.bulkDeleteTransactions(ids);
  }

  async bulkUpdateCategory(ids: number[], categoryId: number): Promise<unknown> {
    return api.bulkUpdateTransactions(ids, categoryId);
  }

  async syncTags(transactionId: number, tagNames: string[]): Promise<Tag[]> {
    return api.syncTransactionTags(transactionId, tagNames);
  }

  isIncome(type: TransactionType): boolean {
    return !['expense', 'savings', 'savings_withdrawal', 'correction'].includes(type);
  }

  getTypeLabel(type: TransactionType): string {
    return store.getTypeLabel(type);
  }
}

export const transactionService = new TransactionService();
export default transactionService;
