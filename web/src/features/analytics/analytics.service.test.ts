import { describe, it, expect } from 'vitest';
import { analyticsService } from './analytics.service';
import type { AnalyticsData } from '@/types';

describe('AnalyticsService', () => {
  describe('calculateSavingsRate', () => {
    it('calculates savings rate correctly', () => {
      expect(analyticsService.calculateSavingsRate(10000, 2000)).toBe(20);
      expect(analyticsService.calculateSavingsRate(5000, 1500)).toBe(30);
    });

    it('returns 0 when income is 0', () => {
      expect(analyticsService.calculateSavingsRate(0, 100)).toBe(0);
    });

    it('returns 0 when savings is 0', () => {
      expect(analyticsService.calculateSavingsRate(10000, 0)).toBe(0);
    });
  });

  describe('getExpenseBreakdown', () => {
    it('calculates percentages correctly', () => {
      const analytics: AnalyticsData = {
        total_income: 10000,
        total_expenses: 5000,
        total_savings: 2000,
        by_category: [
          { category_id: 1, category_name: 'Food', icon: '🍕', color: '#FF0000', amount: 2500, percent: 50 },
          { category_id: 2, category_name: 'Transport', icon: '🚗', color: '#00FF00', amount: 1500, percent: 30 },
          { category_id: 3, category_name: 'Other', icon: '📦', color: '#0000FF', amount: 1000, percent: 20 },
        ],
        monthly_trend: [],
      };

      const breakdown = analyticsService.getExpenseBreakdown(analytics);

      expect(breakdown.get('Food')).toBe(50);
      expect(breakdown.get('Transport')).toBe(30);
      expect(breakdown.get('Other')).toBe(20);
    });

    it('handles empty expenses', () => {
      const analytics: AnalyticsData = {
        total_income: 10000,
        total_expenses: 0,
        total_savings: 2000,
        by_category: [],
        monthly_trend: [],
      };

      const breakdown = analyticsService.getExpenseBreakdown(analytics);
      expect(breakdown.size).toBe(0);
    });
  });

  describe('getTrendDirection', () => {
    it('returns up for increasing trend', () => {
      expect(analyticsService.getTrendDirection([100, 110, 130, 160])).toBe('up');
    });

    it('returns down for decreasing trend', () => {
      expect(analyticsService.getTrendDirection([160, 130, 110, 100])).toBe('down');
    });

    it('returns stable for flat trend', () => {
      expect(analyticsService.getTrendDirection([100, 100, 100, 100])).toBe('stable');
    });

    it('returns stable for short arrays', () => {
      expect(analyticsService.getTrendDirection([100])).toBe('stable');
      expect(analyticsService.getTrendDirection([])).toBe('stable');
    });
  });
});
