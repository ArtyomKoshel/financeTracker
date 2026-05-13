/**
 * Card UI component
 * Обёртка .card с header и content
 */

export interface CardOptions {
  title: string;
  headerAction?: string;  // HTML для кнопки/ссылки в header (например "Все", "Обновить")
  headerActionId?: string;
  headerActionTab?: string;
  headerActionTrigger?: string;
  className?: string;
}

/**
 * Render card HTML
 */
export function cardHtml(content: string, options: CardOptions): string {
  const {
    title,
    headerAction,
    headerActionId,
    headerActionTab,
    headerActionTrigger,
    className = '',
  } = options;

  let actionHtml = '';
  if (headerAction) {
    if (headerActionTab) {
      actionHtml = `<button type="button" class="btn-text" data-tab="${headerActionTab}">${headerAction}</button>`;
    } else if (headerActionTrigger) {
      actionHtml = `<button type="button" class="btn-text" data-trigger="${headerActionTrigger}">${headerAction}</button>`;
    } else if (headerActionId) {
      actionHtml = `<button type="button" class="btn-text" id="${headerActionId}">${headerAction}</button>`;
    } else {
      actionHtml = `<span class="btn-text">${headerAction}</span>`;
    }
  }

  const cardClass = className ? `card ${className}` : 'card';
  return `
    <div class="${cardClass}">
      <div class="card-header">
        <h3>${title}</h3>
        ${actionHtml}
      </div>
      ${content}
    </div>
  `;
}
