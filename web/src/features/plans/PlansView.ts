/**
 * Plans View — слой представления
 * Только рендер в DOM, без API-вызовов
 * Desktop: grid layout для карточек целей и платежей
 */
import { $, setHTML } from '@/shared/utils/dom';
import { showSkeletons, emptyStateHtml } from '@/shared/components/ui';
import { formatMoney, formatDate, getToday } from '@/shared/utils/format';
import type { PaymentReminder, PaymentCalendar } from '@/types';
import type { SubscriptionReminder } from '@/features/plans/plans.service';

export interface PlansViewCallbacks {
  onPay: (paymentId: number, amount: number, isVariable: boolean, name: string, currency: string) => void;
  onEditPayment: (id: number) => void;
  onDeletePayment: (id: number) => void;
}

function getMonthName(monthStr: string): string {
  const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const [, month] = monthStr.split('-');
  return months[parseInt(month) - 1];
}

export function showPlansSkeletons(): void {
  showSkeletons([
    { id: 'paymentCalendar', count: 3 },
    { id: 'subscriptionRemindersList', count: 2 },
    { id: 'recurringPayments', count: 4 },
  ]);
}

export function renderCalendar(calendar: PaymentCalendar): void {
  const container = $('paymentCalendar');
  if (!container) return;

  const entries = Object.entries(calendar).filter(([, items]) => items.length > 0);
  if (entries.length === 0) {
    setHTML(container, emptyStateHtml('Нет предстоящих платежей', { icon: '📅', cta: 'Добавить платёж', ctaTrigger: 'openAddPaymentModalBtn' }));
    return;
  }

  const today = getToday();
  const html = entries.map(([dateStr, items]) => {
    const isToday = dateStr === today;
    const isPast = dateStr < today;
    const dayClass = isToday ? 'calendar-day today' : isPast ? 'calendar-day past' : 'calendar-day';
    const unpaidCount = items.filter(i => !i.is_paid).length;

    const itemsHtml = items.map(item => {
      const paidBadge = item.is_paid ? '<span class="calendar-paid">✓</span>' : '';
      return `
        <div class="calendar-item ${item.is_paid ? 'paid' : ''}">
          <span class="calendar-item-name">${item.payment.name}</span>
          <span class="calendar-item-amount">${item.payment.is_variable ? '~' : ''}${formatMoney(item.payment.amount, item.payment.currency)}</span>
          ${paidBadge}
        </div>
      `;
    }).join('');

    return `
      <div class="${dayClass}" data-date="${dateStr}">
        <div class="calendar-date-header">
          <span class="calendar-date">${formatDate(dateStr)}</span>
          ${isToday ? '<span class="calendar-today-badge">Сегодня</span>' : ''}
          ${unpaidCount > 0 ? `<span class="calendar-unpaid-count">${unpaidCount} к оплате</span>` : ''}
        </div>
        <div class="calendar-items">${itemsHtml}</div>
      </div>
    `;
  }).join('');

  setHTML(container, `<div class="calendar-list">${html}</div>`);
}

export function renderPayments(
  reminders: PaymentReminder[],
  callbacks: PlansViewCallbacks
): void {
  const container = $('recurringPayments');
  if (!container) return;

  if (!reminders || reminders.length === 0) {
    setHTML(container, emptyStateHtml('Нет плановых платежей', { icon: '📅', cta: 'Добавить платёж', ctaTrigger: 'openAddPaymentModalBtn' }));
    return;
  }

  const html = reminders.map(r => {
    const p = r.payment;
    let statusClass = '';
    let statusBadge = '';

    if (r.is_next_month) {
      statusClass = 'next-month';
      statusBadge = `<span class="status-badge next-month">${getMonthName(r.month)}</span>`;
    } else if (r.is_paid) {
      statusClass = 'paid';
      statusBadge = '<span class="status-badge paid">✓ Оплачено</span>';
    } else if (r.is_overdue) {
      statusClass = 'overdue';
      statusBadge = '<span class="status-badge overdue">⚠️ Просрочен</span>';
    } else if (r.days_until <= 3 && !r.is_next_month) {
      statusClass = 'soon';
      statusBadge = `<span class="status-badge soon">Через ${r.days_until} дн.</span>`;
    }

    const actionBtn = (r.is_paid || r.is_next_month) ? '' : `
      <button class="btn-small ${r.is_overdue ? 'btn-success' : ''}" 
              data-pay="${p.id}" data-amount="${p.amount}" 
              data-variable="${p.is_variable}" data-name="${p.name}"
              data-currency="${p.currency || 'BYN'}">
        ✓ Оплатить
      </button>
    `;

    const oneTimeLabel = p.is_one_time ? ' • Разовый' : '';
    const autoDebitLabel = p.is_auto_debit ? '<span class="badge-auto-debit">🤖 Авто</span>' : '';

    let dateInfo: string;
    if (p.is_one_time && p.due_date) {
      dateInfo = formatDate(p.due_date);
    } else {
      const monthInfo = r.is_next_month ? `${getMonthName(r.month)}, ` : '';
      dateInfo = `${monthInfo}${p.day_of_month} числа`;
    }

    return `
      <div class="payment-item ${statusClass}">
        <div class="payment-info">
          <span class="payment-name">${p.name} ${autoDebitLabel} ${statusBadge}</span>
          <span class="payment-date">${dateInfo} • ${p.category === 'essential' ? 'Обязательный' : 'Опциональный'}${oneTimeLabel}</span>
        </div>
        <div class="payment-actions">
          <span class="payment-amount">${p.is_variable ? '~' : ''}${formatMoney(p.amount)}</span>
          ${actionBtn}
          <button class="btn-icon edit" data-edit-payment="${p.id}">✏️</button>
          <button class="btn-icon delete" data-delete-payment="${p.id}">🗑</button>
        </div>
      </div>
    `;
  }).join('');

  setHTML(container, html);

  container.querySelectorAll('[data-pay]').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = btn as HTMLElement;
      callbacks.onPay(
        parseInt(el.dataset.pay!),
        parseFloat(el.dataset.amount!),
        el.dataset.variable === 'true',
        el.dataset.name!,
        el.dataset.currency || 'BYN'
      );
    });
  });

  container.querySelectorAll('[data-delete-payment]').forEach(btn => {
    btn.addEventListener('click', () => callbacks.onDeletePayment(parseInt((btn as HTMLElement).dataset.deletePayment!)));
  });

  container.querySelectorAll('[data-edit-payment]').forEach(btn => {
    btn.addEventListener('click', () => callbacks.onEditPayment(parseInt((btn as HTMLElement).dataset.editPayment!)));
  });
}

export function renderSubscriptionReminders(items: SubscriptionReminder[]): void {
  const container = $('subscriptionRemindersList');
  if (!container) return;
  if (!items.length) {
    setHTML(container, emptyStateHtml('Нет подписок с датой отмены', { icon: '🔄' }));
    return;
  }
  const html = items.map(r => `
    <div class="payment-item">
      <div class="payment-info">
        <span class="payment-name">${r.payment.name}</span>
        <span class="payment-date">Отменить до ${r.cancel_by_date} (через ${r.days_until} дн.)</span>
      </div>
      <span class="payment-amount">${formatMoney(r.payment.amount)}</span>
    </div>
  `).join('');
  setHTML(container, html);
}

export function applyDesktopLayout(): void {
  const plansTab = $('tab-plans');
  if (!plansTab) return;

  if (window.innerWidth >= 768) {
    plansTab.classList.add('plans-desktop');
  } else {
    plansTab.classList.remove('plans-desktop');
  }
}
