import { searchService } from '@/shared/services/search.service';
import { debounce } from '@/shared/utils/dom';
import { formatMoney, formatDate } from '@/shared/utils/format';
import type { SearchResults, SearchResultTransaction, SearchResultCategory, SearchResultNote, Currency } from '@/types';

interface SearchItem {
  type: 'transaction' | 'category' | 'note';
  id: number;
  label: string;
  sublabel: string;
  icon: string;
}

class GlobalSearch {
  private overlay: HTMLElement | null = null;
  private input: HTMLInputElement | null = null;
  private resultsList: HTMLElement | null = null;
  private items: SearchItem[] = [];
  private activeIndex = -1;
  private isOpen = false;
  private abortController: AbortController | null = null;

  private debouncedSearch = debounce((...args: unknown[]) => {
    const query = args[0] as string;
    void this.performSearch(query);
  }, 300);

  open(): void {
    if (this.isOpen) {
      this.focus();
      return;
    }

    this.createDOM();
    this.isOpen = true;
    requestAnimationFrame(() => {
      this.overlay?.classList.add('global-search--visible');
      this.input?.focus();
    });
  }

  close(): void {
    if (!this.isOpen) return;

    this.overlay?.classList.remove('global-search--visible');
    setTimeout(() => {
      this.overlay?.remove();
      this.overlay = null;
      this.input = null;
      this.resultsList = null;
      this.items = [];
      this.activeIndex = -1;
      this.isOpen = false;
      this.abortController?.abort();
      this.abortController = null;
    }, 200);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private focus(): void {
    this.input?.focus();
    this.input?.select();
  }

  private createDOM(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = 'global-search';
    this.overlay.innerHTML = `
      <div class="global-search__backdrop"></div>
      <div class="global-search__dialog">
        <div class="global-search__input-wrap">
          <span class="global-search__icon">🔍</span>
          <input class="global-search__input"
                 type="text"
                 placeholder="Поиск транзакций, заметок, категорий..."
                 autocomplete="off"
                 spellcheck="false" />
          <kbd class="global-search__kbd">ESC</kbd>
        </div>
        <div class="global-search__results" role="listbox"></div>
        <div class="global-search__hint">
          <span><kbd>↑↓</kbd> навигация</span>
          <span><kbd>↵</kbd> перейти</span>
          <span><kbd>Esc</kbd> закрыть</span>
        </div>
      </div>
    `;

    this.input = this.overlay.querySelector('.global-search__input');
    this.resultsList = this.overlay.querySelector('.global-search__results');

    this.overlay.querySelector('.global-search__backdrop')!
      .addEventListener('click', () => this.close());

    this.input!.addEventListener('input', () => {
      const q = this.input!.value.trim();
      if (q.length < 2) {
        this.clearResults();
        return;
      }
      this.debouncedSearch(q);
    });

    this.input!.addEventListener('keydown', (e) => this.handleKeydown(e));

    document.body.appendChild(this.overlay);
  }

  private handleKeydown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.moveSelection(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.moveSelection(-1);
        break;
      case 'Enter':
        e.preventDefault();
        this.selectCurrent();
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
    }
  }

  private moveSelection(delta: number): void {
    if (this.items.length === 0) return;

    const newIndex = this.activeIndex + delta;
    if (newIndex < 0 || newIndex >= this.items.length) return;

    this.activeIndex = newIndex;
    this.updateSelectionUI();
  }

  private updateSelectionUI(): void {
    if (!this.resultsList) return;

    const rows = this.resultsList.querySelectorAll('.global-search__item');
    rows.forEach((row, i) => {
      row.classList.toggle('global-search__item--active', i === this.activeIndex);
      if (i === this.activeIndex) {
        row.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  private selectCurrent(): void {
    if (this.activeIndex < 0 || this.activeIndex >= this.items.length) return;

    const item = this.items[this.activeIndex];
    this.close();
    this.navigate(item);
  }

  private navigate(item: SearchItem): void {
    switch (item.type) {
      case 'transaction':
        window.switchTab('operations');
        break;
      case 'category':
        window.switchTab('settings');
        break;
      case 'note':
        window.switchTab('notes');
        break;
    }
  }

  private async performSearch(query: string): Promise<void> {
    this.abortController?.abort();
    this.abortController = new AbortController();

    this.showLoading();

    try {
      const results = await searchService.search(query);
      if (this.input?.value.trim() !== query) return;
      this.renderResults(results);
    } catch {
      if (this.input?.value.trim() === query) {
        this.showEmpty('Ошибка поиска');
      }
    }
  }

  private renderResults(results: SearchResults): void {
    this.items = [];

    results.categories.forEach((cat: SearchResultCategory) => {
      this.items.push({
        type: 'category',
        id: cat.id,
        label: cat.name,
        sublabel: 'Категория',
        icon: cat.icon,
      });
    });

    results.transactions.forEach((tx: SearchResultTransaction) => {
      this.items.push({
        type: 'transaction',
        id: tx.id,
        label: tx.description || `${tx.category_icon} ${tx.category_name}`,
        sublabel: `${formatDate(tx.date)} · ${formatMoney(Math.abs(tx.amount), tx.currency as Currency)}`,
        icon: tx.category_icon || '💳',
      });
    });

    results.notes.forEach((note: SearchResultNote) => {
      this.items.push({
        type: 'note',
        id: note.id,
        label: note.title,
        sublabel: note.summary || 'Заметка',
        icon: '📝',
      });
    });

    if (this.items.length === 0) {
      this.showEmpty('Ничего не найдено');
      return;
    }

    this.activeIndex = 0;

    if (!this.resultsList) return;

    this.resultsList.innerHTML = this.items.map((item, i) => `
      <div class="global-search__item ${i === 0 ? 'global-search__item--active' : ''}"
           role="option"
           data-index="${i}">
        <span class="global-search__item-icon">${item.icon}</span>
        <div class="global-search__item-text">
          <span class="global-search__item-label">${this.escapeHtml(item.label)}</span>
          <span class="global-search__item-sublabel">${this.escapeHtml(item.sublabel)}</span>
        </div>
        <span class="global-search__item-type">${this.typeLabel(item.type)}</span>
      </div>
    `).join('');

    this.resultsList.querySelectorAll('.global-search__item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-index') || '0');
        this.activeIndex = idx;
        this.selectCurrent();
      });

      el.addEventListener('mouseenter', () => {
        const idx = parseInt(el.getAttribute('data-index') || '0');
        this.activeIndex = idx;
        this.updateSelectionUI();
      });
    });
  }

  private clearResults(): void {
    if (this.resultsList) {
      this.resultsList.innerHTML = '';
    }
    this.items = [];
    this.activeIndex = -1;
  }

  private showLoading(): void {
    if (this.resultsList) {
      this.resultsList.innerHTML = `
        <div class="global-search__empty">
          <div class="loading-spinner" style="width:20px;height:20px;margin:0 auto"></div>
        </div>
      `;
    }
  }

  private showEmpty(message: string): void {
    if (this.resultsList) {
      this.resultsList.innerHTML = `
        <div class="global-search__empty">${this.escapeHtml(message)}</div>
      `;
    }
    this.items = [];
    this.activeIndex = -1;
  }

  private typeLabel(type: string): string {
    switch (type) {
      case 'transaction': return 'Операция';
      case 'category': return 'Категория';
      case 'note': return 'Заметка';
      default: return '';
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

export const globalSearch = new GlobalSearch();
