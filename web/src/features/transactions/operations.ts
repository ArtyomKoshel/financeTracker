/**
 * Operations (Transactions) page module
 */
import { BasePage } from '@/pages/base';
import { toast } from '@/shared/components/toast';
import { modal } from '@/shared/components/modal';
import { createTransactionForm, TransactionFormData } from '@/features/transactions/transaction-form';
import { createFilterBar } from '@/shared/components/filter-bar';
import { createTransactionList } from '@/features/transactions/transaction-list';
import { scrollTo, debounce, $ } from '@/shared/utils/dom';
import { formatMoney } from '@/shared/utils/format';
import { isEnabled } from '@/shared/utils/features';
import * as OperationsView from '@/features/transactions/OperationsView';
import type { Transaction, TransactionTemplate } from '@/types';
import transactionService from '@/features/transactions/transaction.service';
import categoryService from '@/shared/services/category.service';
import { dashboardService } from '@/features/dashboard/dashboard.service';
import { plansService } from '@/features/plans/plans.service';
import { budgetService } from '@/features/budget/budget.service';

export class OperationsPage extends BasePage {
  private transactionForm: ReturnType<typeof createTransactionForm> | null = null;
  private filterBar: ReturnType<typeof createFilterBar> | null = null;
  private transactionList: ReturnType<typeof createTransactionList> | null = null;
  private currentPage = 1;
  private loadTransactionsDebounced: () => void;
  private loadRequestId = 0;
  private bulkMode = false;
  private selectedIds: Set<number> = new Set();
  private templates: TransactionTemplate[] = [];

  constructor() {
    super('operations');
    this.loadTransactionsDebounced = debounce(() => this.loadTransactions(), 150);
  }

  private templatesLoaded = false;
  private tagsLoaded = false;

  init(): void {
    super.init();
    this.initComponents();
    this.initExportButton();
    this.initBulkMode();
    OperationsView.applyDesktopLayout();
  }

  protected onActivate(): void {
    if (!this.templatesLoaded) {
      this.templatesLoaded = true;
      this.loadTemplates();
    }
    if (!this.tagsLoaded) {
      this.tagsLoaded = true;
      this.loadTags();
    }
  }

  private async loadTags(): Promise<void> {
    try {
      const tags = await transactionService.getTags();
      if (this.filterBar && tags.length > 0) {
        this.filterBar.setTags(tags);
      }
    } catch {
      // non-critical
    }
  }

  private initComponents(): void {
    // Transaction Form
    const formContainer = document.getElementById('transactionFormContainer');
    if (formContainer) {
      this.transactionForm = createTransactionForm(formContainer, {
        onSubmit: (data) => this.handleSubmit(data),
        onLoadCategories: () => categoryService.getAll(),
        onLoadPayments: () => plansService.getPayments(),
        onLoadGoals: () => budgetService.getGoals(),
        onLoadAccounts: async () => {
          const res = await dashboardService.getBalance();
          return res.accounts ?? [];
        },
      });
    }

    // Filter Bar
    const filterContainer = document.getElementById('filterBarContainer');
    if (filterContainer) {
      this.filterBar = createFilterBar(filterContainer, {
        onChange: () => {
          this.currentPage = 1;
          this.loadTransactionsDebounced();
        },
        showImportFilter: isEnabled('bank_receipt_import'),
      });
    }

    const listContainer = document.getElementById('transactionListContainer');
    if (listContainer) {
      this.transactionList = createTransactionList(listContainer, {
        onDelete: (id) => this.deleteTransaction(id),
        onSelect: (transaction) => this.showTransactionDetails(transaction),
        onPageChange: (page) => {
          this.currentPage = page;
          this.loadTransactions();
        },
      });
    }
  }

  // --- Export CSV ---
  private initExportButton(): void {
    $('exportCsvBtn')?.addEventListener('click', async () => {
      try {
        const filters = this.filterBar?.getFilters();
        const params: Parameters<typeof transactionService.exportCsv>[0] = {};
        if (filters) {
          if (filters.year && filters.year !== 'all' && filters.month && filters.month !== 'all') {
            const monthStr = String(parseInt(filters.month) + 1).padStart(2, '0');
            params.month = `${filters.year}-${monthStr}`;
          } else if (filters.year && filters.year !== 'all') {
            params.year = filters.year;
          }
          if (filters.type && filters.type !== 'all') params.type = filters.type;
          if (filters.search) params.search = filters.search;
          if (filters.source) params.source = filters.source;
          if (filters.tag) params.tag = filters.tag;
        }
        await transactionService.exportCsv(params);
        toast.success('Файл экспортирован');
      } catch {
        toast.error('Ошибка экспорта');
      }
    });
  }

  // --- Bulk Operations ---
  private initBulkMode(): void {
    $('toggleBulkModeBtn')?.addEventListener('click', () => this.toggleBulkMode());
    $('bulkCancelBtn')?.addEventListener('click', () => this.toggleBulkMode(false));
    $('bulkDeleteBtn')?.addEventListener('click', () => this.bulkDelete());
    $('bulkCategoryBtn')?.addEventListener('click', () => this.bulkChangeCategory());
  }

  private toggleBulkMode(force?: boolean): void {
    this.bulkMode = force !== undefined ? force : !this.bulkMode;
    this.selectedIds.clear();
    this.updateBulkUI();

    const listContainer = document.getElementById('transactionListContainer');
    if (listContainer) {
      listContainer.classList.toggle('bulk-mode', this.bulkMode);
    }

    // Show/hide toolbar
    const toolbar = $('bulkToolbar');
    if (toolbar) toolbar.style.display = this.bulkMode ? 'flex' : 'none';

    const btn = $('toggleBulkModeBtn');
    if (btn) btn.textContent = this.bulkMode ? '✕ Отмена' : '☑ Выбрать';

    // Add/remove checkboxes
    this.renderBulkCheckboxes();
  }

  private renderBulkCheckboxes(): void {
    const listEl = document.querySelector('#transactionListContainer .transactions-list');
    if (!listEl) return;

    const items = listEl.querySelectorAll('.transaction-item');
    items.forEach(item => {
      const existing = item.querySelector('.bulk-checkbox');
      if (this.bulkMode) {
        if (!existing) {
          const id = parseInt((item as HTMLElement).dataset.id || '0');
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'bulk-checkbox';
          cb.dataset.txId = String(id);
          cb.addEventListener('change', () => {
            if (cb.checked) this.selectedIds.add(id);
            else this.selectedIds.delete(id);
            this.updateBulkUI();
          });
          item.insertBefore(cb, item.firstChild);
        }
      } else {
        existing?.remove();
      }
    });
  }

  private updateBulkUI(): void {
    const countEl = $('bulkCount');
    if (countEl) countEl.textContent = `${this.selectedIds.size} выбрано`;

    const deleteBtn = $<HTMLButtonElement>('bulkDeleteBtn');
    const catBtn = $<HTMLButtonElement>('bulkCategoryBtn');
    if (deleteBtn) deleteBtn.disabled = this.selectedIds.size === 0;
    if (catBtn) catBtn.disabled = this.selectedIds.size === 0;
  }

  private async bulkDelete(): Promise<void> {
    if (this.selectedIds.size === 0) return;
    if (!(await modal.confirm(`Удалить ${this.selectedIds.size} операций?`, 'Массовое удаление'))) return;

    try {
      await transactionService.bulkDelete([...this.selectedIds]);
      toast.success(`Удалено: ${this.selectedIds.size}`);
      this.toggleBulkMode(false);
      await this.loadTransactions();
    } catch {
      toast.error('Ошибка при массовом удалении');
    }
  }

  private async bulkChangeCategory(): Promise<void> {
    if (this.selectedIds.size === 0) return;

    const categories = await categoryService.getAll();
    const catOptions = categories.flatMap(c => {
      const res = [`<option value="${c.id}">${c.icon || ''} ${c.name}</option>`];
      if (c.subcategories) {
        for (const s of c.subcategories) {
          res.push(`<option value="${s.id}">  └ ${s.icon || ''} ${s.name}</option>`);
        }
      }
      return res;
    }).join('');

    const existing = $('bulkCategoryModal');
    existing?.remove();

    document.body.insertAdjacentHTML('beforeend', `
      <div id="bulkCategoryModal" class="modal show">
        <div class="modal-content modal-small">
          <div class="modal-header">
            <h3>📂 Сменить категорию</h3>
            <button class="btn-close modal-close" aria-label="Закрыть">×</button>
          </div>
          <form id="bulkCategoryForm">
            <div class="form-group">
              <label>Выберите категорию для ${this.selectedIds.size} операций</label>
              <select id="bulkCategorySelect">
                ${catOptions}
              </select>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Применить</button>
          </form>
        </div>
      </div>
    `);

    const modalEl = $('bulkCategoryModal');
    const form = $<HTMLFormElement>('bulkCategoryForm');
    const closeModal = () => modalEl?.remove();

    modalEl?.querySelector('.modal-close')?.addEventListener('click', closeModal);
    modalEl?.addEventListener('click', (e) => { if (e.target === modalEl) closeModal(); });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const categoryId = parseInt(($<HTMLSelectElement>('bulkCategorySelect'))?.value || '0');
      if (!categoryId) return;
      closeModal();

      try {
        await transactionService.bulkUpdateCategory([...this.selectedIds], categoryId);
        toast.success('Категория обновлена');
        this.toggleBulkMode(false);
        await this.loadTransactions();
      } catch {
        toast.error('Ошибка при смене категории');
      }
    });
  }

  // --- Templates ---
  private async loadTemplates(): Promise<void> {
    try {
      this.templates = await transactionService.getTemplates();
      this.renderTemplates();
    } catch {
      // ignore
    }
  }

  private renderTemplates(): void {
    if (!this.templates.length) return;

    const formContainer = document.getElementById('transactionFormContainer');
    if (!formContainer) return;

    let templatesEl = formContainer.querySelector('.templates-bar');
    if (!templatesEl) {
      templatesEl = document.createElement('div');
      templatesEl.className = 'templates-bar';
      formContainer.insertBefore(templatesEl, formContainer.firstChild);
    }

    templatesEl.innerHTML = `
      <span class="templates-label">⚡ Шаблоны:</span>
      ${this.templates.map(t => `
        <button class="template-chip" data-template-id="${t.id}" title="${t.name}${t.amount ? ' — ' + formatMoney(t.amount) : ''}">
          ${t.category_icon || '📌'} ${t.name}
        </button>
      `).join('')}
    `;

    templatesEl.querySelectorAll('[data-template-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt((btn as HTMLElement).dataset.templateId || '0');
        this.applyTemplate(id);
      });
    });
  }

  private applyTemplate(id: number): void {
    const t = this.templates.find(x => x.id === id);
    if (!t) return;

    if (t.type) {
      this.transactionForm?.setType(t.type);
    }
    if (t.amount) {
      this.transactionForm?.setTypeAndAmount(t.type || 'expense', t.amount);
    }

    // Set description via DOM
    const descInput = document.querySelector<HTMLInputElement>('.tx-description');
    if (descInput && t.description) descInput.value = t.description;

    toast.info(`Шаблон «${t.name}» применён`);
  }

  async load(): Promise<void> {
    await this.loadTransactions();
  }

  private async handleSubmit(data: TransactionFormData): Promise<void> {
    const tempId = -Date.now();
    const tempTx: Transaction = {
      id: tempId,
      date: new Date().toISOString().slice(0, 10),
      amount: data.type === 'expense' || data.type === 'savings' ? -Math.abs(data.amount) : Math.abs(data.amount),
      original_amount: data.amount,
      currency: (data.currency as Transaction['currency']) || 'BYN',
      type: data.type as Transaction['type'],
      category_id: data.category_id,
      category_name: data.category_name || '',
      category_icon: '⏳',
      account_id: 1,
      description: data.description || '',
      month: new Date().toISOString().slice(0, 7),
      is_validated: false,
      created_at: new Date().toISOString(),
    };

    this.transactionList?.prependTransaction(tempTx);
    toast.success('Операция добавлена');

    try {
      const result = await transactionService.createRaw(data);

      if (result.budget_warning) {
        const warning = result.budget_warning;
        if (warning.percent >= 100) {
          toast.error(`${warning.category_icon} ${warning.message}`);
        } else {
          toast.warning(`${warning.category_icon} ${warning.message}`);
        }
      }

      await this.loadTransactions();
    } catch (e) {
      if ((e as Error & { offlineQueued?: boolean }).offlineQueued) {
        toast.success('Сохранено офлайн. Синхронизируется позже.');
        return;
      }
      this.transactionList?.removeTransaction(tempId);
      toast.error('Ошибка при добавлении');
    }
  }

  private async loadTransactions(): Promise<void> {
    if (!this.transactionList) return;

    const requestId = ++this.loadRequestId;
    this.transactionList.setLoading(true);

    try {
      const filters = this.filterBar?.getFilters() || { year: 'all', month: 'all', type: '', search: '', source: '', tag: '' };

      const apiFilters: { month?: string; year?: string; type?: string; search?: string; source?: string; tag?: string } = {};

      if (filters.year !== 'all' && filters.month !== 'all') {
        const monthStr = String(parseInt(filters.month) + 1).padStart(2, '0');
        apiFilters.month = `${filters.year}-${monthStr}`;
      } else if (filters.year !== 'all') {
        apiFilters.year = filters.year;
      }

      if (filters.type) apiFilters.type = filters.type;
      if (filters.search) apiFilters.search = filters.search;
      if (filters.source) apiFilters.source = filters.source;
      if (filters.tag) apiFilters.tag = filters.tag;

      const result = await transactionService.getFiltered(this.currentPage, 30, apiFilters);

      if (requestId !== this.loadRequestId) return;

      this.transactionList.setPagedData(result.data ?? [], result.meta);

      if (this.bulkMode) {
        setTimeout(() => this.renderBulkCheckboxes(), 50);
      }
    } catch (e) {
      if (requestId !== this.loadRequestId) return;
      console.error('Load transactions error:', e);
      this.transactionList.setTransactions([]);
    }
  }

  private async deleteTransaction(id: number): Promise<void> {
    if (!(await modal.confirm('Удалить операцию?', 'Подтверждение'))) return;

    const previous = this.transactionList?.getTransactions?.() ?? [];
    this.transactionList?.removeTransaction(id);
    toast.success('Операция удалена');
    OperationsView.clearTransactionDetails();

    try {
      await transactionService.delete(id);
    } catch (e) {
      if ((e as Error & { offlineQueued?: boolean }).offlineQueued) {
        toast.success('Удаление в очереди. Синхронизируется позже.');
        return;
      }
      this.transactionList?.setTransactions(previous);
      toast.error('Ошибка при удалении');
    }
  }

  private showTransactionDetails(transaction: Transaction): void {
    if (window.innerWidth < 768) return;

    OperationsView.renderTransactionDetails(
      transaction,
      (id) => this.editTransaction(id),
      (id) => this.deleteTransaction(id)
    );

    document.getElementById('editTransactionTagsBtn')?.addEventListener('click', () => {
      this.editTransactionTags(transaction);
    });
  }

  private async editTransactionTags(transaction: Transaction): Promise<void> {
    const current = (transaction.tags ?? []).map(t => t.name).join(', ');
    const input = await modal.prompt(
      { label: 'Теги (через запятую)', type: 'text', defaultValue: current, placeholder: 'работа, питание, отпуск' },
      'Теги операции'
    );
    if (input === null) return;

    const tagNames = input.split(',').map(s => s.trim()).filter(Boolean);
    try {
      const updated = await transactionService.syncTags(transaction.id, tagNames);
      transaction.tags = updated;
      this.showTransactionDetails(transaction);
      // Reload tags in filter bar
      this.tagsLoaded = false;
      this.loadTags();
      toast.success('Теги обновлены');
    } catch {
      toast.error('Ошибка сохранения тегов');
    }
  }

  private editTransaction(_id: number): void {
    toast.info('Редактирование в разработке');
  }

  // Quick action for dashboard integration
  setTypeAndFocus(type: string): void {
    this.transactionForm?.setType(type);
    const container = document.getElementById('transactionFormContainer');
    scrollTo(container);
  }

  setTypeAmountAndFocus(type: string, amount: number): void {
    this.transactionForm?.setTypeAndAmount(type, amount);
    const container = document.getElementById('transactionFormContainer');
    scrollTo(container);
  }

  destroy(): void {
    this.transactionForm?.destroy();
    this.filterBar?.destroy();
    this.transactionList?.destroy();
    super.destroy();
  }
}

export const operationsPage = new OperationsPage();
