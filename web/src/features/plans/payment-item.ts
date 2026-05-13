/**
 * Payment item template (для PaymentReminder)
 */
import { formatMoney } from '@/shared/utils/format';
import type { PaymentReminder } from '@/types';

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

function getMonthName(monthStr: string): string {
  const [, month] = monthStr.split('-');
  return MONTH_NAMES[parseInt(month) - 1] ?? '';
}

export interface PaymentItemOptions {
  showPayButton?: boolean;
}

/**
 * Render overdue payment item HTML
 */
export function overduePaymentItemHtml(r: PaymentReminder): string {
  const p = r.payment;
  return `
    <div class="payment-item overdue">
      <div class="payment-info">
        <span class="payment-name">${p.name}</span>
        <span class="payment-date overdue-date">Просрочен ${Math.abs(r.days_until)} дн. назад</span>
      </div>
      <div class="payment-actions">
        <span class="payment-amount">${p.is_variable ? '~' : ''}${formatMoney(p.amount)}</span>
        <button class="btn-small btn-success" data-pay="${p.id}" data-amount="${p.amount}" data-variable="${p.is_variable}" data-name="${p.name}" data-currency="${p.currency || 'BYN'}">
          ✓ Оплачено
        </button>
      </div>
    </div>
  `;
}

/**
 * Render upcoming payment item HTML
 */
export function upcomingPaymentItemHtml(r: PaymentReminder, options: PaymentItemOptions = {}): string {
  const { showPayButton = true } = options;
  const p = r.payment;
  const dateLabel = r.days_until === 0 ? 'Сегодня' :
    r.is_next_month ? `${getMonthName(r.month)}, ${p.day_of_month} числа` :
    `через ${r.days_until} дн.`;

  const payButton = (!r.is_next_month && showPayButton)
    ? `<button class="btn-small" data-pay="${p.id}" data-amount="${p.amount}" data-variable="${p.is_variable}" data-name="${p.name}" data-currency="${p.currency || 'BYN'}">✓</button>`
    : '';

  return `
    <div class="payment-item ${r.is_next_month ? 'next-month' : ''}">
      <div class="payment-info">
        <span class="payment-name">${p.name}</span>
        <span class="payment-date">${dateLabel}</span>
      </div>
      <div class="payment-actions">
        <span class="payment-amount">${p.is_variable ? '~' : ''}${formatMoney(p.amount)}</span>
        ${payButton}
      </div>
    </div>
  `;
}
