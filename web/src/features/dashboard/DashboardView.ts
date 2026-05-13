/**
 * Dashboard View — слой представления
 * Только рендер в DOM, без API-вызовов
 */
import { $, setHTML, setText, show, hide } from '@/shared/utils/dom';
import { showSkeletons, emptyStateHtml } from '@/shared/components/ui';
import { overduePaymentItemHtml, upcomingPaymentItemHtml } from '@/templates';
import { createHint } from '@/shared/components/hint';
import { formatMoney } from '@/shared/utils/format';
import type {
  DashboardData,
  PaymentReminder,
  CashflowRecommendation,
  AccountItem,
  FinancialHealth,
} from '@/types';

export interface DashboardViewCallbacks {
  onPaymentPaid: (paymentId: number, amount: number, isVariable: boolean, name: string) => Promise<void>;
  onAddQuickSavings: (amount: number) => Promise<void>;
  onWithdrawClick: (maxAmount: number) => void;
}

export function showDashboardSkeletons(): void {
  showSkeletons([
    { id: 'upcomingPayments', count: 3 },
    { id: 'dashboardRecContent', count: 2 },
  ]);
}

export function renderBalance(balanceData: { accounts: AccountItem[]; total_balance: number }): void {
  const total = balanceData.total_balance ?? 0;
  setText($('balanceAmount'), formatMoney(total));
  const accounts = balanceData.accounts ?? [];

  const accountsEl = $('balanceAccounts');
  const syncEl = $('balanceSync');
  if (accountsEl) {
    if (accounts.length > 1) {
      accountsEl.innerHTML = accounts
        .map(a => `<div class="balance-account-row"><span class="balance-account-name">${a.name}</span><span class="balance-account-amount">${formatMoney(a.balance)}</span></div>`)
        .join('');
      accountsEl.style.display = '';
    } else {
      accountsEl.innerHTML = '';
      accountsEl.style.display = 'none';
    }
  }
  if (syncEl) {
    if (accounts.length === 1 && accounts[0].last_sync_date) {
      syncEl.textContent = `Сверка: ${accounts[0].last_sync_date}`;
      syncEl.style.display = '';
    } else {
      syncEl.textContent = '';
      syncEl.style.display = 'none';
    }
  }
}

export function renderMonthSummary(data: DashboardData): void {
  setText($('monthIncome'), formatMoney(data.current_month.total_income));
  setText($('monthExpenses'), formatMoney(data.current_month.expenses));
  setText($('monthSavings'), formatMoney(data.current_month.total_saved));

  const comparison = (data as { comparison?: {
    income_pct?: number;
    expenses_pct?: number;
    savings_pct?: number;
  } }).comparison;

  if (comparison) {
    renderTrendBadge('monthIncome', comparison.income_pct ?? 0, false);
    renderTrendBadge('monthExpenses', comparison.expenses_pct ?? 0, true);
    renderTrendBadge('monthSavings', comparison.savings_pct ?? 0, false);
  }
}

function renderTrendBadge(parentId: string, pct: number, invertColors: boolean): void {
  const parent = $(parentId);
  if (!parent) return;

  // Remove existing badge
  const existing = parent.parentElement?.querySelector('.trend-badge');
  if (existing) existing.remove();

  if (pct === 0) return;

  const isPositive = pct > 0;
  const colorClass = invertColors
    ? (isPositive ? 'trend-up' : 'trend-down')
    : (isPositive ? 'trend-down' : 'trend-up');
  const arrow = isPositive ? '↑' : '↓';

  const badge = document.createElement('span');
  badge.className = `trend-badge ${colorClass}`;
  badge.style.cssText = 'font-size: 0.75rem; margin-left: 4px; font-weight: 600;';
  badge.textContent = `${arrow}${Math.abs(pct).toFixed(0)}%`;
  badge.title = `${isPositive ? '+' : ''}${pct.toFixed(1)}% к прошлому месяцу`;

  parent.parentElement?.appendChild(badge);
}

export function renderPayments(
  reminders: PaymentReminder[],
  callbacks: DashboardViewCallbacks
): void {
  const unpaid = reminders.filter(r => !r.is_paid);
  const overdue = unpaid.filter(r => r.is_overdue);
  const upcoming = unpaid.filter(r => !r.is_overdue);

  const overdueCard = $('overdueCard');
  if (overdue.length > 0) {
    show(overdueCard);
    renderOverduePayments(overdue, callbacks);
  } else {
    hide(overdueCard);
  }

  renderUpcomingPayments(upcoming.slice(0, 3), callbacks);
}

function renderOverduePayments(
  payments: PaymentReminder[],
  callbacks: DashboardViewCallbacks
): void {
  const container = $('overduePayments');
  if (!container) return;

  setHTML(container, payments.map(r => overduePaymentItemHtml(r)).join(''));
  attachPaymentHandlers(container, callbacks);
}

function renderUpcomingPayments(
  payments: PaymentReminder[],
  callbacks: DashboardViewCallbacks
): void {
  const container = $('upcomingPayments');
  if (!container) return;

  if (!payments.length) {
    setHTML(container, emptyStateHtml('Все платежи оплачены', { icon: '✅', variant: 'success', cta: 'Планы', ctaTab: 'plans' }));
    return;
  }
  setHTML(container, payments.map(r => upcomingPaymentItemHtml(r)).join(''));
  attachPaymentHandlers(container, callbacks);
}

function attachPaymentHandlers(
  container: HTMLElement,
  callbacks: DashboardViewCallbacks
): void {
  container.querySelectorAll('[data-pay]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const target = btn as HTMLElement;
      await callbacks.onPaymentPaid(
        parseInt(target.dataset.pay!),
        parseFloat(target.dataset.amount!),
        target.dataset.variable === 'true',
        target.dataset.name!
      );
    });
  });
}

export function renderRecommendations(
  rec: CashflowRecommendation,
  callbacks: Pick<DashboardViewCallbacks, 'onAddQuickSavings'>
): void {
  const container = $('dashboardRecContent');
  if (!container) return;

  const statusIcon = rec.status === 'warning' ? '⚠️' : (rec.status === 'success' ? '✅' : 'ℹ️');
  const statusClass = rec.status === 'warning' ? 'negative' : (rec.status === 'success' ? 'positive' : 'neutral');

  let html = `
    <div class="rec-block">
      <div class="rec-status ${statusClass}">
        <span class="rec-status-icon">${statusIcon}</span>
        <span class="rec-status-text">${rec.message}</span>
      </div>
      <div class="rec-header-info">
        До ${rec.next_income_type} ${rec.next_income_date} (${rec.days_until_income} дн.)
      </div>
      <div class="rec-overview">
        <div class="rec-overview-item">
          <span class="rec-overview-label">Баланс ${createHint('Текущая сумма на счёте')}</span>
          <span class="rec-overview-value">${formatMoney(rec.balance)}</span>
        </div>
        <div class="rec-overview-item">
          <span class="rec-overview-label">На жизнь ${createHint(`Бюджет на базовые расходы до след. дохода. Полный бюджет: ${formatMoney(rec.essential_total || rec.living_budget * 30 / rec.days_until_income)}/мес`)}</span>
          <span class="rec-overview-value">−${formatMoney(rec.living_budget)}</span>
          ${rec.essential_remaining !== undefined ? `<span class="rec-overview-sub ${rec.essential_remaining > 0 ? 'positive' : 'negative'}">Осталось: ${formatMoney(rec.essential_remaining)}</span>` : ''}
        </div>
        <div class="rec-overview-item">
          <span class="rec-overview-label">Платежи ${createHint('Сумма обязательных плановых платежей до следующего дохода')}</span>
          <span class="rec-overview-value ${rec.total_payments > 0 ? 'negative' : ''}">−${formatMoney(rec.total_payments)}</span>
        </div>
        <div class="rec-overview-item">
          <span class="rec-overview-label">В день ${createHint('Осталось на жизнь / дней до дохода')}</span>
          <span class="rec-overview-value ${(rec.daily_budget || 0) > 0 ? 'positive' : 'negative'}">
            ${(rec.daily_budget || 0) < 0 ? '' : '~'}${formatMoney(rec.daily_budget || 0)}
          </span>
          ${(rec.daily_budget || 0) < 0 ? '<span class="rec-overview-sub negative">Перерасход!</span>' : ''}
        </div>
        <div class="rec-overview-item ${rec.free_funds >= 0 ? 'result' : 'deficit'}">
          <span class="rec-overview-label">Свободно ${createHint('Баланс - На жизнь - Платежи')}</span>
          <span class="rec-overview-value ${rec.free_funds >= 0 ? 'positive' : 'negative'}">${formatMoney(rec.free_funds)}</span>
        </div>
      </div>`;

  if (rec.suggested_savings > 0) {
    html += `
      <div class="rec-savings-suggestion">
        <span>Отложить ${rec.savings_percent}%: ${createHint(`Рекомендуемые накопления = ${rec.savings_percent}% от свободных средств`)}</span>
        <strong>${formatMoney(rec.suggested_savings)}</strong>
        <button class="btn btn-sm btn-success" id="addQuickSavingsBtn">Отложить</button>
      </div>`;
  }

  if (rec.payments_list?.length) {
    html += `
      <div class="rec-payments-summary">
        <span class="rec-payments-count">${rec.payments_list.length} платежей до ${rec.next_income_type}</span>
      </div>`;
  }

  setHTML(container, html + '</div>');

  const savingsBtn = container.querySelector('#addQuickSavingsBtn');
  if (savingsBtn && rec.suggested_savings > 0) {
    savingsBtn.addEventListener('click', () => callbacks.onAddQuickSavings(rec.suggested_savings));
  }
}

export function renderRecommendationsError(): void {
  const container = $('dashboardRecContent');
  if (container) setHTML(container, '<p class="empty-state">Не удалось загрузить рекомендации</p>');
}

export function renderHealthScore(
  health: FinancialHealth,
  callbacks: Pick<DashboardViewCallbacks, 'onWithdrawClick'>
): void {
  const container = $('healthScoreContainer');
  if (!container) return;

  const n = (v: number | undefined, def = 0) => v ?? def;
  const statusColors: Record<string, string> = {
    excellent: '#22c55e',
    good: '#84cc16',
    warning: '#eab308',
    critical: '#ef4444',
  };
  const statusIcons: Record<string, string> = {
    excellent: '🌟',
    good: '👍',
    warning: '⚠️',
    critical: '🚨',
  };

  const color = statusColors[health.status] || '#808080';
  const icon = statusIcons[health.status] || '📊';

  const healthExt = health as FinancialHealth & {
    first_goal_savings?: number;
    first_goal_savings_usd?: number;
    first_goal_progress?: number;
  };
  const hasSingleGoal = healthExt.first_goal_savings !== undefined;
  const displaySavings = hasSingleGoal ? n(healthExt.first_goal_savings) : n(health.total_savings);
  const displaySavingsUsd = hasSingleGoal ? n(healthExt.first_goal_savings_usd) : n(health.total_savings_usd);
  const displayProgress = hasSingleGoal ? n(healthExt.first_goal_progress) : n(health.goal_progress);
  const savingsSection = (displaySavingsUsd > 0 || displaySavings > 0) ? `
    <div class="health-savings-section">
      <div class="savings-header">
        <span class="savings-icon">🏦</span>
        <span class="savings-title">Копилка${hasSingleGoal && health.goal_name ? `: ${health.goal_name}` : ' (всего)'}</span>
      </div>
      <div class="savings-amount">
        <span class="savings-value">${formatMoney(displaySavings)}</span>
        <span class="savings-usd">(~${displaySavingsUsd.toFixed(0)} $)</span>
      </div>
      <div class="savings-info">
        <span class="savings-days ${n(health.savings_days) >= 90 ? 'positive' : n(health.savings_days) >= 30 ? '' : 'negative'}">
          Подушка на ${n(health.savings_days)} дней
        </span>
        ${displayProgress > 0 ? `<span class="savings-progress">${displayProgress.toFixed(0)}% цели</span>` : ''}
      </div>
      <button class="btn btn-sm btn-outline" id="withdrawSavingsBtn">💸 Снять с копилки</button>
    </div>
  ` : '';

  const overBudgetHtml = health.over_budget_list?.length ? `
    <div class="health-over-budget">
      <div class="over-budget-header">
        <span class="over-budget-icon">⚠️</span>
        <span class="over-budget-title">Превышенные бюджеты (${n(health.over_budget_count)})</span>
      </div>
      <div class="over-budget-list">
        ${health.over_budget_list.map((b: { category_name: string; over_amount: number; over_percent?: number }) => `
          <div class="over-budget-item">
            <span class="over-budget-category">${b.category_name}</span>
            <span class="over-budget-amount negative">+${formatMoney(b.over_amount)} (${n(b.over_percent).toFixed(0)}%)</span>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  const html = `
    <div class="health-score-card">
      <div class="health-score-header">
        <span class="health-score-title">Финансовое здоровье</span>
        <span class="health-score-icon">${icon}</span>
      </div>
      <div class="health-score-gauge">
        <svg viewBox="0 0 100 60" class="health-gauge-svg">
          <path d="M10 55 A 40 40 0 0 1 90 55" fill="none" stroke="#333" stroke-width="8" stroke-linecap="round"/>
          <path d="M10 55 A 40 40 0 0 1 90 55" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
                stroke-dasharray="${n(health.health_score) * 1.26} 126"/>
        </svg>
        <div class="health-score-value" style="color: ${color}">${n(health.health_score)}</div>
      </div>
      <div class="health-score-message">${health.message ?? ''}</div>
      ${savingsSection}
      <div class="health-metrics">
        <div class="health-metric">
          <span class="metric-label">Накопления/мес</span>
          <span class="metric-value ${n(health.savings_rate) >= 20 ? 'positive' : n(health.savings_rate) >= 10 ? '' : 'negative'}">${n(health.savings_rate).toFixed(1)}%</span>
        </div>
        <div class="health-metric">
          <span class="metric-label">Расходы/Доход</span>
          <span class="metric-value ${n(health.expense_to_income) <= 80 ? 'positive' : n(health.expense_to_income) <= 95 ? '' : 'negative'}">${n(health.expense_to_income).toFixed(1)}%</span>
        </div>
        <div class="health-metric">
          <span class="metric-label">Баланс (дни)</span>
          <span class="metric-value ${n(health.emergency_fund_days) >= 30 ? 'positive' : n(health.emergency_fund_days) >= 14 ? '' : 'negative'}">${n(health.emergency_fund_days)}</span>
        </div>
        <div class="health-metric">
          <span class="metric-label">Тренд расходов</span>
          <span class="metric-value ${n(health.expense_growth) <= 0 ? 'positive' : n(health.expense_growth) <= 15 ? '' : 'negative'}">${n(health.expense_growth) > 0 ? '+' : ''}${n(health.expense_growth).toFixed(1)}%</span>
        </div>
      </div>
      ${overBudgetHtml}
    </div>
  `;

  setHTML(container, html);

  const withdrawBtn = container.querySelector('#withdrawSavingsBtn');
  if (withdrawBtn && n(health.total_savings) > 0) {
    withdrawBtn.addEventListener('click', () => callbacks.onWithdrawClick(n(health.total_savings)));
  }
}

export function applyDesktopLayout(): void {
  const dashboardTab = document.getElementById('tab-dashboard');
  if (!dashboardTab) return;

  if (window.innerWidth >= 768) {
    dashboardTab.classList.add('dashboard-desktop');
  } else {
    dashboardTab.classList.remove('dashboard-desktop');
  }
}
