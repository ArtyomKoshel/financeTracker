/**
 * Dashboard Service — слой данных (API, store)
 * Только загрузка и сохранение, без рендера
 */
import api from '@/api/client';
import { store } from '@/store';
import type {
  DashboardData,
  PaymentReminder,
  AccountItem,
  CashflowRecommendation,
  FinancialHealth,
} from '@/types';

export interface BalanceData {
  accounts: AccountItem[];
  total_balance: number;
}

export interface DashboardLoadResult {
  dashboard: DashboardData;
  balance: BalanceData;
  reminders: PaymentReminder[];
}

class DashboardService {
  async getDashboard(): Promise<DashboardData> {
    return api.getDashboard();
  }

  async getBalance(): Promise<BalanceData> {
    return api.getBalance();
  }

  async getPaymentReminders(): Promise<PaymentReminder[]> {
    return api.getPaymentReminders();
  }

  async getCashflowRecommendation(): Promise<CashflowRecommendation> {
    return api.getCashflowRecommendation();
  }

  async getFinancialHealth(): Promise<FinancialHealth> {
    return api.getFinancialHealth();
  }

  async compareMonths(prevMonth: string, currentMonth: string): Promise<{ income_diff: number; expenses_diff: number }> {
    return api.compareMonths(prevMonth, currentMonth);
  }

  async createTransaction(data: Parameters<typeof api.createTransaction>[0]) {
    return api.createTransaction(data);
  }

  getCachedBalance(): BalanceData | null {
    return store.get('balance');
  }

  getCachedReminders(): PaymentReminder[] | null {
    return store.get('reminders');
  }

  setCachedBalance(balance: BalanceData): void {
    store.set('balance', balance);
  }

  setCachedReminders(reminders: PaymentReminder[]): void {
    store.set('reminders', reminders);
  }
}

export const dashboardService = new DashboardService();
