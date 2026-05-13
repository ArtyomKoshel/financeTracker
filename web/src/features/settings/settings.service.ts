import api from '@/api/client';
import type { AiUsage, AccountItem, Settings } from '@/types';
import type { IncomeTypeItem } from '@/store';

class SettingsService {
  async getSettings(): Promise<Settings> {
    return api.getSettings();
  }

  async updateSettings(data: Record<string, string>): Promise<unknown> {
    return api.updateSettings(data);
  }

  async updateRates(): Promise<unknown> {
    return api.updateRatesFromNBRB();
  }

  async getAiUsage(): Promise<AiUsage> {
    return api.getAiUsage();
  }

  async refreshAiUsage(): Promise<AiUsage> {
    return api.refreshAiUsage();
  }

  async getTaxSummary(from: string, to: string): Promise<{ total_income: number; tax_usn: number; tax_self_employed: number; by_month: { month: string; income: number }[] }> {
    return api.getTaxSummary(from, to);
  }

  async getAccounts(): Promise<{ accounts: AccountItem[] }> {
    return api.getAccounts();
  }

  async createAccount(data: { name: string }): Promise<unknown> {
    return api.createAccount(data);
  }

  async updateAccount(data: { id: number; name: string }): Promise<unknown> {
    return api.updateAccount(data);
  }

  async deleteAccount(id: number): Promise<unknown> {
    return api.deleteAccount(id);
  }

  async getIncomeTypes(): Promise<IncomeTypeItem[]> {
    return api.getIncomeTypes();
  }

  async createIncomeType(data: { code: string; label: string; icon: string }): Promise<unknown> {
    return api.createIncomeType(data);
  }

  async updateIncomeType(data: { id: number; label: string; icon: string }): Promise<unknown> {
    return api.updateIncomeType(data);
  }

  async deleteIncomeType(id: number): Promise<unknown> {
    return api.deleteIncomeType(id);
  }

  async getVapidPublic(): Promise<{ publicKey: string }> {
    return api.getVapidPublic();
  }

  async generateTelegramCode(): Promise<{ code?: string; ttl?: number; already_linked?: boolean }> {
    return api.generateTelegramCode();
  }

  async unlinkTelegram(): Promise<unknown> {
    return api.unlinkTelegram();
  }
}

export const settingsService = new SettingsService();
