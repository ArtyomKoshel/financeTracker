import type { BankReceiptPreviewRow } from '@/api/experimental';
import { $ } from '@/shared/utils/dom';

type QuickCategory = { id: number; name: string; icon: string };

export function createKeyboardHandler(params: {
  getVisibleCreateRows: () => BankReceiptPreviewRow[];
  getSelectedIds: () => Set<string>;
  getQuickCategories: () => QuickCategory[];
  callbacks: {
    onToggle: (rowId: string) => void;
    onSetCategory: (rowId: string, categoryId: number) => void;
    onNextUncategorized: () => void;
    onApply: () => void;
    onEscape?: () => boolean;
  };
}): {
  activate(): void;
  deactivate(): void;
  renderLegend(container: HTMLElement): void;
  destroy(): void;
} {
  let focusedIndex = -1;
  let active = false;
  let handler: ((e: KeyboardEvent) => void) | null = null;

  function getCards(): HTMLElement[] {
    const table = $('bankReceiptPreviewTable');
    if (!table) return [];
    return Array.from(table.querySelectorAll<HTMLElement>('.receipt-card--create'));
  }

  function clearFocus(): void {
    const table = $('bankReceiptPreviewTable');
    if (!table) return;
    table.querySelectorAll('.receipt-card--focused').forEach(el => el.classList.remove('receipt-card--focused'));
  }

  function applyFocus(): void {
    clearFocus();
    const cards = getCards();
    if (focusedIndex < 0 || focusedIndex >= cards.length) return;
    cards[focusedIndex].classList.add('receipt-card--focused');
    cards[focusedIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function getFocusedRowId(): string | null {
    const rows = params.getVisibleCreateRows();
    if (focusedIndex < 0 || focusedIndex >= rows.length) return null;
    return rows[focusedIndex].id;
  }

  function onKeydown(e: KeyboardEvent): void {
    if (!active) return;

    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

    const cards = getCards();
    if (cards.length === 0) return;

    switch (e.key) {
      case 'Tab': {
        e.preventDefault();
        if (e.shiftKey) {
          focusedIndex = focusedIndex <= 0 ? cards.length - 1 : focusedIndex - 1;
        } else {
          focusedIndex = focusedIndex >= cards.length - 1 ? 0 : focusedIndex + 1;
        }
        applyFocus();
        break;
      }

      case ' ': {
        e.preventDefault();
        const id = getFocusedRowId();
        if (id) params.callbacks.onToggle(id);
        break;
      }

      case 'Enter': {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          params.callbacks.onApply();
        } else {
          e.preventDefault();
          params.callbacks.onNextUncategorized();
        }
        break;
      }

      case 'Escape': {
        if (params.callbacks.onEscape?.()) break;
        deactivate();
        break;
      }

      default: {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9) {
          const cats = params.getQuickCategories();
          const cat = cats[num - 1];
          const id = getFocusedRowId();
          if (cat && id) {
            params.callbacks.onSetCategory(id, cat.id);
          }
        }
        break;
      }
    }
  }

  function activate(): void {
    if (active) return;
    active = true;
    handler = onKeydown;
    document.addEventListener('keydown', handler);
    const cards = getCards();
    if (cards.length > 0 && focusedIndex < 0) {
      focusedIndex = 0;
    }
    applyFocus();
  }

  function deactivate(): void {
    if (!active) return;
    active = false;
    clearFocus();
    if (handler) {
      document.removeEventListener('keydown', handler);
      handler = null;
    }
  }

  function renderLegend(container: HTMLElement): void {
    const cats = params.getQuickCategories();

    let catsHtml = '';
    cats.slice(0, 9).forEach((c, i) => {
      catsHtml += `<span class="receipt-quick-categories__item"><kbd>${i + 1}</kbd> ${esc(c.icon)} ${esc(c.name)}</span>`;
    });

    container.innerHTML = `
      <div class="receipt-quick-categories__list">
        <span class="receipt-quick-categories__title">Быстрые клавиши:</span>
        <span><kbd>Tab</kbd> — навигация</span>
        <span><kbd>Space</kbd> — выбрать</span>
        <span><kbd>1</kbd>–<kbd>9</kbd> — категория</span>
        <span><kbd>Enter</kbd> — след. без категории</span>
        <span><kbd>Ctrl+Enter</kbd> — применить</span>
      </div>
      ${catsHtml ? `<div class="receipt-quick-categories__cats">${catsHtml}</div>` : ''}
    `;
  }

  function destroy(): void {
    deactivate();
    focusedIndex = -1;
  }

  return { activate, deactivate, renderLegend, destroy };
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
