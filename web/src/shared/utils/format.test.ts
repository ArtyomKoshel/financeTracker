import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  formatBYN,
  formatDate,
  formatDateShort,
  formatMonth,
  formatPercent,
  formatNumber,
  getCurrentMonth,
  getToday,
  getDaysRemaining,
} from './format';

describe('formatMoney', () => {
  it('formats BYN correctly', () => {
    expect(formatMoney(1234.56, 'BYN')).toMatch(/1[\s ]234,56 BYN/);
  });

  it('formats USD correctly', () => {
    expect(formatMoney(1000, 'USD')).toMatch(/1[\s ]000,00 \$/);
  });

  it('formats RUB correctly', () => {
    expect(formatMoney(50000, 'RUB')).toMatch(/50[\s ]000,00 ₽/);
  });

  it('formats EUR correctly', () => {
    expect(formatMoney(500, 'EUR')).toMatch(/500,00 €/);
  });
});

describe('formatBYN', () => {
  it('formats as BYN', () => {
    expect(formatBYN(1000)).toMatch(/1[\s ]000,00 BYN/);
  });
});

describe('formatDate', () => {
  it('formats date as DD.MM.YYYY', () => {
    const result = formatDate('2025-01-15');
    expect(result).toBe('15.01.2025');
  });
});

describe('formatDateShort', () => {
  it('formats date as DD.MM', () => {
    const result = formatDateShort('2025-01-15');
    expect(result).toBe('15.01');
  });
});

describe('formatMonth', () => {
  it('formats month correctly', () => {
    const result = formatMonth('2025-01');
    expect(result.toLowerCase()).toContain('январ');
    expect(result).toContain('2025');
  });
});

describe('formatPercent', () => {
  it('formats percent with default decimals', () => {
    expect(formatPercent(25.567)).toBe('25.6%');
  });

  it('formats percent with custom decimals', () => {
    expect(formatPercent(25.567, 2)).toBe('25.57%');
  });

  it('formats percent with zero decimals', () => {
    expect(formatPercent(25.567, 0)).toBe('26%');
  });
});

describe('formatNumber', () => {
  it('formats number with thousand separators', () => {
    const result = formatNumber(1234567);
    expect(result).toMatch(/1[\s ]234[\s ]567/);
  });
});

describe('getCurrentMonth', () => {
  it('returns current month in YYYY-MM format', () => {
    const result = getCurrentMonth();
    expect(result).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('getToday', () => {
  it('returns today in YYYY-MM-DD format', () => {
    const result = getToday();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('getDaysRemaining', () => {
  it('calculates days remaining correctly', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const result = getDaysRemaining(futureDate.toISOString().slice(0, 10));
    expect(result).toBeGreaterThanOrEqual(9);
    expect(result).toBeLessThanOrEqual(11);
  });

  it('returns negative for past dates', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const result = getDaysRemaining(pastDate.toISOString().slice(0, 10));
    expect(result).toBeLessThan(0);
  });
});
