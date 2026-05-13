import type { Currency } from '@/types';

/**
 * Currency symbols
 */
const CURRENCY_SYMBOLS: Record<Currency, string> = {
  BYN: 'Br',
  RUB: '₽',
  EUR: '€',
  USD: '$',
  GBP: '£',
  PLN: 'zł',
};

/**
 * Format money with currency symbol
 */
export function formatMoney(amount: number, currency: Currency = 'BYN'): string {
  const num = typeof amount === 'number' && !Number.isNaN(amount) ? amount : 0;
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
  
  return `${formatted} ${symbol}`;
}

/**
 * Format money with BYN as default
 */
export function formatBYN(amount: number): string {
  return formatMoney(amount, 'BYN');
}

/**
 * Format date as "DD мес."
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Format date with time as "DD мес. HH:MM" (24-hour format)
 */
export function formatDateTime(dateStr: string, timeStr?: string): string {
  const date = new Date(dateStr);
  const dateFormatted = date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
  
  // Use timeStr (created_at) for actual time if provided
  if (timeStr) {
    const timeDate = new Date(timeStr);
    const timeFormatted = timeDate.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${dateFormatted} ${timeFormatted}`;
  }
  
  return dateFormatted;
}

/**
 * Format date as DD.MM
 */
export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  });
}

/**
 * Format month as "Январь 2025"
 */
export function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Format month as "Янв 2025"
 */
export function formatMonthShort(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('ru-RU', {
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format percent
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format number with thousand separators
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

/**
 * Get current month in YYYY-MM format (local timezone)
 */
export function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get today's date in YYYY-MM-DD format (local timezone)
 */
export function getToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse YYYY-MM-DD to Date
 */
export function parseDate(dateStr: string): Date {
  return new Date(dateStr);
}

/**
 * Get days remaining until date
 */
export function getDaysRemaining(targetDate: string): number {
  const target = new Date(targetDate);
  const today = new Date();
  const diff = target.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
