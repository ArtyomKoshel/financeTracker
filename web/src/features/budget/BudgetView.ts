/**
 * Budget View — слой представления
 * Только рендер в DOM, без API-вызовов
 * Desktop: 2-3 column layout для категорий + envelope + debts
 */
import { $, setHTML } from '@/shared/utils/dom';
import { showSkeletons, emptyStateHtml } from '@/shared/components/ui';
import { formatMoney } from '@/shared/utils/format';
import type { DashboardData, CategoryBudget, MonthlyBudget, Currency } from '@/types';
import type { CompletedGoal } from '@/types';
import type { Debt, Envelope } from '@/features/budget/budget.service';

export interface BudgetViewCallbacks {
  onEditGoal: (id: number) => void;
  onDeleteGoal: (id: number) => void;
  onCompleteGoal?: (id: number) => void;
  onDebtPay: (id: number) => void;
  onDebtDelete: (id: number) => void;
  onEnvelopeDelete: (id: number) => void;
  onBudgetEdit: (budget: CategoryBudget) => void;
  onBudgetDelete: (id: number) => void;
  onCopyBudgetsToNextMonth: () => void;
}

const emptyDashboard: DashboardData = {
  current_month: { month: '', total_income: 0, total_bonus: 0, total_saved: 0, expenses: 0 },
  goal: undefined,
  progress_percent: 0,
  days_remaining: 0,
  monthly_target: 0,
  recent_transactions: [],
  usd_rate: 0,
  total_saved_rub: 0,
  total_saved_usd: 0,
};

export function showBudgetSkeletons(): void {
  showSkeletons([
    { id: 'planGoalContent', count: 1 },
    { id: 'completedGoalsList', count: 2 },
    { id: 'debtsList', count: 2 },
    { id: 'envelopesList', count: 2 },
    { id: 'categoryBudgetsList', count: 3 },
  ]);
}

function renderSingleGoal(
  g: { id: number; name: string; target_amount: number; current_amount: number; currency?: string; progress_percent?: number; days_remaining?: number; monthly_target?: number }
): string {
  const currency: Currency = (g.currency || 'BYN') as Currency;
  const progress = g.progress_percent ?? 0;
  const daysRemaining = g.days_remaining ?? 0;
  const monthlyTarget = g.monthly_target ?? 0;
  const isReached = progress >= 100;
  const progressBarClass = isReached ? 'goal-progress-bar reached' : 'goal-progress-bar';
  const metaHtml = isReached
    ? `<div class="goal-reached-badge">
        <span>🎉 Цель достигнута!</span>
        <button type="button" class="btn btn-sm btn-outline" data-complete-goal="${g.id}" title="Перенести в историю и создать новую цель">Завершить и добавить в историю</button>
      </div>`
    : `
      <div class="goal-meta">
        <div class="meta-item">
          <span class="meta-value">${daysRemaining}</span>
          <span class="meta-label">дней осталось</span>
        </div>
        <div class="meta-item">
          <span class="meta-value">${formatMoney(monthlyTarget, currency)}</span>
          <span class="meta-label">нужно в месяц</span>
        </div>
      </div>
    `;
  return `
    <div class="goal-detail ${isReached ? 'goal-reached' : ''}" data-goal-id="${g.id}">
      <div class="goal-main">
        <div class="goal-header-row">
          <span class="goal-title">${g.name}</span>
          <div class="goal-actions">
            <button type="button" class="btn-icon edit" data-edit-goal="${g.id}" title="Редактировать">✏️</button>
            <button type="button" class="btn-icon delete" data-delete-goal="${g.id}" title="Удалить">🗑</button>
          </div>
        </div>
        <div class="goal-progress-wrap">
          <div class="${progressBarClass}">
            <div class="goal-progress-fill" style="width: ${Math.min(progress, 100)}%"></div>
          </div>
        </div>
        <div class="goal-numbers">
          <span>${formatMoney(g.current_amount, currency)} из ${formatMoney(g.target_amount, currency)}</span>
          <span class="${isReached ? 'positive' : ''}">${progress.toFixed(1)}%</span>
        </div>
      </div>
      ${metaHtml}
    </div>
  `;
}

export function renderGoal(
  dashboard: DashboardData,
  callbacks: Pick<BudgetViewCallbacks, 'onEditGoal' | 'onDeleteGoal' | 'onCompleteGoal'>
): void {
  const goalContent = $('planGoalContent');
  if (!goalContent) return;

  const goals = dashboard.goals ?? (dashboard.goal ? [{
    id: dashboard.goal.id,
    name: dashboard.goal.name,
    target_amount: dashboard.goal.target_amount,
    current_amount: dashboard.goal.current_amount,
    currency: (dashboard.goal as { currency?: string }).currency,
    progress_percent: dashboard.progress_percent,
    days_remaining: dashboard.days_remaining,
    monthly_target: dashboard.monthly_target,
  }] : []);

  if (goals.length > 0) {
    const html = goals.map((g) => renderSingleGoal(g)).join('');
    setHTML(goalContent, html);
    goalContent.querySelectorAll('[data-edit-goal]').forEach(btn => {
      btn.addEventListener('click', () => callbacks.onEditGoal(Number((btn as HTMLElement).dataset.editGoal)));
    });
    goalContent.querySelectorAll('[data-delete-goal]').forEach(btn => {
      btn.addEventListener('click', () => callbacks.onDeleteGoal(Number((btn as HTMLElement).dataset.deleteGoal!)));
    });
    goalContent.querySelectorAll('[data-complete-goal]').forEach(btn => {
      const el = btn as HTMLElement;
      const id = Number(el.dataset.completeGoal!);
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        (callbacks.onCompleteGoal ?? callbacks.onDeleteGoal)(id);
      });
    });
  } else {
    setHTML(goalContent, '<div class="empty-goal"><p>Цель не установлена</p><p class="empty-goal-hint">Нажмите «Установить» чтобы добавить цель накоплений</p></div>');
  }

  const headerBtn = $('openGoalModalBtn');
  if (headerBtn) headerBtn.textContent = goals.length > 0 ? '+ Добавить' : 'Установить';
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function renderCompletedGoals(goals: CompletedGoal[]): void {
  const container = $('completedGoalsList');
  if (!container) return;

  if (!goals?.length) {
    setHTML(container, emptyStateHtml('Нет завершённых целей', { icon: '📋' }));
    return;
  }

  const html = goals.map((g) => {
    const currency: Currency = (g.currency || 'BYN') as Currency;
    return `
      <div class="completed-goal-item">
        <div class="completed-goal-info">
          <span class="completed-goal-name">${g.name}</span>
          <span class="completed-goal-meta">${formatMoney(g.current_amount, currency)} из ${formatMoney(g.target_amount, currency)} · ${g.percent.toFixed(0)}%</span>
        </div>
        <div class="completed-goal-right">
          <span class="completed-goal-date">${g.completed_at ? formatDateFull(g.completed_at) : '—'}</span>
        </div>
      </div>
    `;
  }).join('');

  setHTML(container, html);
}

export function renderBudget(budget: MonthlyBudget): void {
  const n = (v: number | undefined, def = 0) => v ?? def;
  const container = $('budgetOverview');
  if (!container) return;
  const remainingClass = n(budget.remaining) >= 0 ? 'positive' : 'negative';
  setHTML(container, `
    <div class="budget-row">
      <span>Доход <span class="hint-icon" data-hint="Сумма всех доходов за месяц" title="Доход">❓</span></span>
      <span class="amount positive" id="budgetIncome">${formatMoney(n(budget.total_income))}</span>
    </div>
    <div class="budget-row">
      <span>Оплачено платежей <span class="hint-icon" data-hint="Сумма оплаченных плановых платежей" title="Платежи">❓</span></span>
      <span class="amount negative" id="budgetPayments">-${formatMoney(n(budget.total_payments))}</span>
    </div>
    <div class="budget-row">
      <span>Накоплено <span class="hint-icon" data-hint="Сумма переводов в копилку" title="Накопления">❓</span></span>
      <span class="amount neutral" id="budgetSavings">${formatMoney(n(budget.total_savings))}</span>
    </div>
    <div class="budget-row">
      <span>Прочие расходы <span class="hint-icon" data-hint="Расходы не по плановым платежам" title="Расходы">❓</span></span>
      <span class="amount negative" id="budgetExpenses">-${formatMoney(n(budget.total_expenses))}</span>
    </div>
    <div class="budget-row total">
      <span>Остаток <span class="hint-icon" data-hint="Доход - Платежи - Накопления - Расходы" title="Остаток">❓</span></span>
      <span class="amount ${remainingClass}" id="budgetRemaining">${formatMoney(n(budget.remaining))}</span>
    </div>
  `);
}

export function renderDebts(
  debts: Debt[],
  callbacks: Pick<BudgetViewCallbacks, 'onDebtPay' | 'onDebtDelete'>
): void {
  const container = $('debtsList');
  if (!container) return;
  const active = debts.filter(d => d.is_active);
  if (!active.length) {
    setHTML(container, emptyStateHtml('Нет долгов', { icon: '💳', cta: 'Добавить долг', ctaTrigger: 'openAddDebtModalBtn' }));
    return;
  }
  const html = active.map(d => {
    const progress = d.total_amount > 0 ? Math.min(100, (d.paid_amount / d.total_amount) * 100) : 0;
    const progressColor = progress >= 80 ? 'var(--success)' : progress >= 50 ? 'var(--primary)' : 'var(--warning)';
    return `
    <div class="debt-item">
      <div class="debt-info">
        <span class="debt-name">${d.name}</span>
        <div class="debt-progress">
          <div class="budget-progress-bar">
            <div class="budget-progress-fill" style="width: ${progress}%; background: ${progressColor}"></div>
          </div>
        </div>
        <span class="debt-meta">Выплачено ${formatMoney(d.paid_amount, (d.currency || 'BYN') as Currency)} из ${formatMoney(d.total_amount, (d.currency || 'BYN') as Currency)} (${progress.toFixed(0)}%)${d.due_date ? ` • до ${d.due_date}` : ''}</span>
      </div>
      <div class="debt-actions">
        <button class="btn-small" data-debt-pay="${d.id}">Погасить</button>
        <button class="btn-icon delete" data-debt-delete="${d.id}">🗑</button>
      </div>
    </div>
  `;
  }).join('');
  setHTML(container, html);
  container.querySelectorAll('[data-debt-pay]').forEach(btn => {
    btn.addEventListener('click', () => callbacks.onDebtPay(parseInt((btn as HTMLElement).dataset.debtPay!)));
  });
  container.querySelectorAll('[data-debt-delete]').forEach(btn => {
    btn.addEventListener('click', () => callbacks.onDebtDelete(parseInt((btn as HTMLElement).dataset.debtDelete!)));
  });
}

export function renderEnvelopes(
  envelopes: Envelope[],
  callbacks: Pick<BudgetViewCallbacks, 'onEnvelopeDelete'>
): void {
  const container = $('envelopesList');
  if (!container) return;
  if (!envelopes.length) {
    setHTML(container, emptyStateHtml('Нет банок на этот месяц', { icon: '🏦', cta: 'Добавить банку', ctaTrigger: 'openAddEnvelopeModalBtn' }));
    return;
  }
  const html = envelopes.map(e => {
    const progress = e.allocated > 0 ? Math.min(100, (e.spent / e.allocated) * 100) : 0;
    const progressColor = progress >= 100 ? 'var(--danger)' : progress >= 80 ? 'var(--warning)' : 'var(--primary)';
    return `
    <div class="envelope-item">
      <div class="envelope-info">
        <span class="envelope-name">${e.name}</span>
        <div class="envelope-progress">
          <div class="budget-progress-bar">
            <div class="budget-progress-fill" style="width: ${Math.min(progress, 100)}%; background: ${progressColor}"></div>
          </div>
        </div>
        <span class="envelope-meta">${formatMoney(e.spent)} / ${formatMoney(e.allocated)} • остаток ${formatMoney(e.remaining)} (${progress.toFixed(0)}%)</span>
      </div>
      <button class="btn-icon delete" data-envelope-delete="${e.id}">🗑</button>
    </div>
  `;
  }).join('');
  setHTML(container, html);
  container.querySelectorAll('[data-envelope-delete]').forEach(btn => {
    btn.addEventListener('click', () => callbacks.onEnvelopeDelete(parseInt((btn as HTMLElement).dataset.envelopeDelete!)));
  });
}

export function renderCategoryBudgets(
  categoryBudgets: CategoryBudget[],
  callbacks: Pick<BudgetViewCallbacks, 'onBudgetEdit' | 'onBudgetDelete' | 'onCopyBudgetsToNextMonth'>
): void {
  const container = $('categoryBudgetsList');
  if (!container) return;

  if (!categoryBudgets.length) {
    setHTML(container, emptyStateHtml('Нет лимитов на этот месяц', { icon: '📊', cta: 'Добавить лимит', ctaTrigger: 'openAddBudgetModalBtn' }));
    return;
  }

  const n = (v: number | undefined, def = 0) => v ?? def;
  const html = categoryBudgets.map(b => {
    const percentUsed = n(b.percent_used);
    const alertPercent = n(b.alert_percent);
    const progressColor = b.is_exceeded ? 'var(--danger)' : percentUsed >= alertPercent ? 'var(--warning)' : 'var(--primary)';
    const statusClass = b.is_exceeded ? 'exceeded' : percentUsed >= alertPercent ? 'warning' : '';
    const recurringBadge = b.is_recurring ? '<span class="badge recurring" title="Повторяется каждый месяц">🔄</span>' : '';
    const essentialBadge = b.is_essential ? '<span class="badge essential" title="Базовые расходы">💰</span>' : '';

    return `
      <div class="budget-item ${statusClass}">
        <div class="budget-header">
          <div class="budget-category">
            <span class="budget-icon">${b.category_icon ?? '📦'}</span>
            <span class="budget-name">${b.category_name ?? 'Категория'}</span>
            ${recurringBadge}${essentialBadge}
          </div>
          <div class="budget-actions">
            <button class="btn-icon edit" data-edit-budget="${b.id}" title="Редактировать">✏️</button>
            <button class="btn-icon delete" data-delete-budget="${b.id}" title="Удалить">🗑️</button>
          </div>
        </div>
        <div class="budget-progress">
          <div class="budget-progress-bar">
            <div class="budget-progress-fill" style="width: ${Math.min(percentUsed, 100)}%; background: ${progressColor}"></div>
          </div>
        </div>
        <div class="budget-amounts">
          <span class="budget-spent">${formatMoney(n(b.spent_amount))}</span>
          <span class="budget-limit">из ${formatMoney(n(b.limit_amount))}</span>
          <span class="budget-percent ${statusClass}">${percentUsed.toFixed(0)}%</span>
        </div>
      </div>
    `;
  }).join('');

  const copyBtnHtml = `
    <div class="budget-copy-bar">
      <button class="btn btn-outline btn-sm" id="copyBudgetsToNextMonthBtn" title="Скопировать все лимиты на следующий месяц">
        📋 Применить к следующему месяцу
      </button>
    </div>
  `;

  setHTML(container, html + copyBtnHtml);
  container.querySelectorAll('[data-delete-budget]').forEach(btn => {
    btn.addEventListener('click', () => callbacks.onBudgetDelete(parseInt((btn as HTMLElement).dataset.deleteBudget!)));
  });
  container.querySelectorAll('[data-edit-budget]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt((btn as HTMLElement).dataset.editBudget!);
      const budget = categoryBudgets.find(b => b.id === id);
      if (budget) callbacks.onBudgetEdit(budget);
    });
  });
  $('copyBudgetsToNextMonthBtn')?.addEventListener('click', () => callbacks.onCopyBudgetsToNextMonth());
}

export function applyDesktopLayout(): void {
  const budgetTab = $('tab-budget');
  if (!budgetTab) return;

  if (window.innerWidth >= 768) {
    budgetTab.classList.add('budget-desktop');
  } else {
    budgetTab.classList.remove('budget-desktop');
  }
}

export { emptyDashboard };
