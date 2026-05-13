import api from '@/api/client';
import type { AnalyticsData, YearlyAnalytics, MonthComparison, CategoryTrend, NetWorthSnapshot, ForecastScenarios } from '@/types';

export interface ForecastItem {
  month: string;
  income: number;
  expenses?: number;
  planned_payments?: number;
  balance_end: number;
}

export interface Recommendation {
  type: string;
  message: string;
  suggestion: string;
}

class AnalyticsService {
  calculateSavingsRate(income: number, savings: number): number {
    if (income <= 0 || savings <= 0) return 0;
    return Math.round((savings / income) * 100);
  }

  getExpenseBreakdown(analytics: AnalyticsData): Map<string, number> {
    const map = new Map<string, number>();
    for (const cat of analytics.by_category) {
      map.set(cat.category_name, cat.percent);
    }
    return map;
  }

  getTrendDirection(values: number[]): 'up' | 'down' | 'stable' {
    if (values.length < 2) return 'stable';
    const first = values[0];
    const last = values[values.length - 1];
    const diff = last - first;
    const threshold = first * 0.05;
    if (diff > threshold) return 'up';
    if (diff < -threshold) return 'down';
    return 'stable';
  }

  async getForecast(months = 3): Promise<ForecastItem[]> {
    return api.getForecastLegacy(months);
  }

  async getRecommendations(): Promise<Recommendation[]> {
    return api.getRecommendations();
  }

  async getAnalytics(month?: string): Promise<AnalyticsData> {
    return api.getAnalytics(month);
  }

  async getYearlyAnalytics(year?: number): Promise<YearlyAnalytics> {
    return api.getYearlyAnalytics(year);
  }

  async compareMonths(month1: string, month2: string): Promise<MonthComparison> {
    return api.compareMonths(month1, month2);
  }

  async getCategoryTrend(categoryId: number, months?: number): Promise<CategoryTrend> {
    return api.getCategoryTrend(categoryId, months);
  }

  async getMonthlyReportHtml(month: string): Promise<string> {
    return api.getMonthlyReportHtml(month);
  }

  async getForecastScenarios(months = 3): Promise<ForecastScenarios> {
    return api.getForecastScenarios(months);
  }

  async getSpendingVelocity() {
    return api.getSpendingVelocity();
  }

  async getTopGrowthCategories(limit = 5) {
    return api.getTopGrowthCategories(limit);
  }

  async getNetWorthHistory(months = 12): Promise<NetWorthSnapshot[]> {
    return api.getNetWorthHistory(months);
  }

  async createTransaction(data: Parameters<typeof api.createTransaction>[0]) {
    return api.createTransaction(data);
  }
}

export const analyticsService = new AnalyticsService();
