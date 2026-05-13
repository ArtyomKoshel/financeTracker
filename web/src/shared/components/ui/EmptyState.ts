/**
 * EmptyState UI component
 * Иконка + текст + опциональная CTA кнопка
 */

export interface EmptyStateOptions {
  icon?: string;
  cta?: string;
  ctaTab?: string;
  ctaTrigger?: string;
  variant?: 'default' | 'success' | 'error';
}

/**
 * Render empty state HTML
 */
export function emptyStateHtml(message: string, options?: EmptyStateOptions): string {
  const { icon = '📋', cta, ctaTab, ctaTrigger, variant = 'default' } = options ?? {};
  const variantClass = variant !== 'default' ? ` empty-state-${variant}` : '';
  let ctaHtml = '';
  if (cta && ctaTab) {
    ctaHtml = `<button class="btn btn-sm btn-primary empty-state-cta" data-tab="${ctaTab}">${cta}</button>`;
  } else if (cta && ctaTrigger) {
    ctaHtml = `<button class="btn btn-sm btn-primary empty-state-cta" data-trigger="${ctaTrigger}">${cta}</button>`;
  } else if (cta) {
    ctaHtml = `<span class="empty-state-cta">${cta}</span>`;
  }
  return `
    <div class="empty-state${variantClass}">
      <span class="empty-state-icon" aria-hidden="true">${icon}</span>
      <span>${message}</span>
      ${ctaHtml}
    </div>
  `;
}
