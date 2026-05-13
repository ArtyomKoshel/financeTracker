/**
 * Budget service — API-обёртка для цели, бюджета, лимитов, долгов, банок
 */
import api from '@/api/client';
import { getCurrentMonth } from '@/shared/utils/format';
import type { DashboardData, MonthlyBudget, CategoryBudget, CompletedGoal, Goal, GoalSavingsPlan } from '@/types';

export interface Debt {
  id: number;
  name: string;
  total_amount: number;
  paid_amount: number;
  remaining: number;
  currency: string;
  due_date: string | null;
  monthly_payment: number | null;
  type: string;
  is_active: boolean;
}

export interface Envelope {
  id: number;
  name: string;
  allocated: number;
  spent: number;
  remaining: number;
  month: string;
  category_id: number | null;
}

class BudgetService {
  async getDashboard(): Promise<DashboardData> {
    return api.getDashboard();
  }

  async getGoals(): Promise<Goal[]> {
    return api.getGoals();
  }

  async createGoal(data: { name: string; target_amount: number; target_date: string; currency?: string }): Promise<unknown> {
    return api.createGoal(data);
  }

  async updateGoal(data: { id: number; name: string; target_amount: number; target_date: string; currency?: string }): Promise<unknown> {
    return api.updateGoal(data);
  }

  async deleteGoal(id: number): Promise<unknown> {
    return api.deleteGoal(id);
  }

  async getCompletedGoals(): Promise<CompletedGoal[]> {
    return api.getCompletedGoals();
  }

  async getMonthlyBudget(month?: string): Promise<MonthlyBudget> {
    return api.getMonthlyBudget(month ?? getCurrentMonth());
  }

  async getCategoryBudgets(month: string): Promise<CategoryBudget[]> {
    return api.getCategoryBudgets(month);
  }

  async setCategoryBudget(data: {
    id?: number;
    category_id?: number;
    month?: string;
    limit_amount: number;
    alert_percent?: number;
    is_recurring?: boolean;
    is_essential?: boolean;
  }): Promise<unknown> {
    return api.setCategoryBudget(data);
  }

  async deleteCategoryBudget(id: number): Promise<{ success: boolean }> {
    return api.deleteCategoryBudget(id);
  }

  async getDebts(): Promise<Debt[]> {
    return api.getDebts();
  }

  async getEnvelopes(month?: string): Promise<Envelope[]> {
    return api.getEnvelopes(month ?? getCurrentMonth());
  }

  async createDebt(data: { name: string; total_amount: number; currency?: string; due_date?: string; monthly_payment?: number; type?: string }): Promise<unknown> {
    return api.createDebt(data);
  }

  async updateDebt(data: { id: number; paid_amount?: number; monthly_payment?: number; is_active?: boolean }): Promise<unknown> {
    return api.updateDebt(data);
  }

  async deleteDebt(id: number): Promise<{ deleted: boolean }> {
    return api.deleteDebt(id);
  }

  async createEnvelope(data: { name: string; allocated: number; month: string; category_id?: number }): Promise<unknown> {
    return api.createEnvelope(data);
  }

  async updateEnvelope(data: { id: number; allocated?: number; spent?: number }): Promise<unknown> {
    return api.updateEnvelope(data);
  }

  async deleteEnvelope(id: number): Promise<{ deleted: boolean }> {
    return api.deleteEnvelope(id);
  }

  async getGoalSavingsPlan(): Promise<{ goals: GoalSavingsPlan[]; total_monthly: number }> {
    return api.getGoalSavingsPlan();
  }

  async copyBudgetsToNextMonth(fromMonth: string): Promise<{ copied: number; to_month: string }> {
    return api.copyBudgetsToNextMonth(fromMonth);
  }

  async getCategories(): ReturnType<typeof api.getCategories> {
    return api.getCategories();
  }
}

export const budgetService = new BudgetService();
