/**
 * Hint tooltip component
 * Usage: <span class="hint-icon" data-hint="Текст подсказки">❓</span>
 */

// Hint texts for different fields
export const HINTS = {
  // Dashboard / Cashflow
  balance: 'Фактическая сумма на вашем счёте. Обновляется автоматически при добавлении операций или вручную через "Сверить".',
  
  cashflow_living_budget: 'Минимальная сумма на базовые расходы (еда, транспорт). Берётся из Настроек → "Минимум на жизнь".',
  
  cashflow_payments: 'Сумма обязательных плановых платежей до следующего дохода. Берётся из раздела "Плановые платежи" с категорией "Обязательный".',
  
  cashflow_free: 'Свободные средства = Баланс - Платежи - Минимум на жизнь - Накопления. Эти деньги можно тратить без риска.',
  
  cashflow_savings: 'Рекомендуемая сумма для накоплений. Рассчитывается как % от свободных средств (из Настроек).',
  
  // Plans page
  budget_income: 'Сумма всех доходов за текущий месяц (зарплата, аванс, бонусы, прочее). Без учёта коррекций баланса.',
  
  budget_payments: 'Сумма всех оплаченных плановых платежей за месяц.',
  
  budget_savings: 'Сумма переводов в копилку за месяц.',
  
  budget_expenses: 'Сумма всех расходов за месяц (кроме плановых платежей).',
  
  budget_remaining: 'Остаток = Доходы - Платежи - Накопления - Расходы. Показывает сколько осталось от заработанного.',
  
  // Category budgets
  category_budget: 'Лимит расходов на категорию за месяц. При превышении вы получите предупреждение.',
  
  category_budget_recurring: 'Если включено, бюджет автоматически копируется в следующий месяц с тем же лимитом.',
  
  alert_percent: 'При достижении этого % от лимита вы получите предупреждение. По умолчанию 80%.',
  
  // Analytics
  analytics_income: 'Сумма доходов за период. Не включает коррекции баланса.',
  
  analytics_expenses: 'Сумма всех расходов за период по категориям.',
  
  analytics_balance: 'Разница между доходами и расходами за период. Показывает прибыль или убыток.',
} as const;

/**
 * Create a hint icon element
 */
export function createHintIcon(hintKey: keyof typeof HINTS): string {
  const text = HINTS[hintKey];
  return `<span class="hint-icon" data-hint="${escapeHtml(text)}" title="${escapeHtml(text)}">❓</span>`;
}

/**
 * Create hint with custom text
 */
export function createHint(text: string): string {
  return `<span class="hint-icon" data-hint="${escapeHtml(text)}" title="${escapeHtml(text)}">❓</span>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Initialize tooltips - call once on app start
 */
export function initHints(): void {
  // Add event delegation for hint icons
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('hint-icon')) {
      e.stopPropagation();
      showHintTooltip(target);
    }
  });

  // Close tooltip on click outside
  document.addEventListener('click', () => {
    hideHintTooltip();
  });
}

let activeTooltip: HTMLElement | null = null;

function showHintTooltip(icon: HTMLElement): void {
  hideHintTooltip();
  
  const text = icon.dataset.hint;
  if (!text) return;

  const tooltip = document.createElement('div');
  tooltip.className = 'hint-tooltip';
  tooltip.textContent = text;
  
  document.body.appendChild(tooltip);
  
  // Position tooltip
  const rect = icon.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  
  let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
  let top = rect.bottom + 8;
  
  // Keep within viewport
  if (left < 10) left = 10;
  if (left + tooltipRect.width > window.innerWidth - 10) {
    left = window.innerWidth - tooltipRect.width - 10;
  }
  if (top + tooltipRect.height > window.innerHeight - 10) {
    top = rect.top - tooltipRect.height - 8;
  }
  
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.classList.add('show');
  
  activeTooltip = tooltip;
}

function hideHintTooltip(): void {
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
}
