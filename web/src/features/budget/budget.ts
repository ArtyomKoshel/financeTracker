/**
 * Budget Page — оркестрация
 * Связывает Service (данные) и View (отображение)
 */
import { BasePage } from '@/pages/base';
import { budgetService } from '@/features/budget/budget.service';
import { toast } from '@/shared/components/toast';
import { modal } from '@/shared/components/modal';
import { getCurrentMonth, formatMoney } from '@/shared/utils/format';
import { $ } from '@/shared/utils/dom';
import { store } from '@/store';
import * as BudgetView from '@/features/budget/BudgetView';
import type { BudgetViewCallbacks } from '@/features/budget/BudgetView';
import type { CategoryWithSubs, CategoryBudget } from '@/types';

declare const TomSelect: any;

export class BudgetPage extends BasePage {
  private categories: CategoryWithSubs[] = [];
  private categoryBudgets: CategoryBudget[] = [];

  constructor() {
    super('budget');
  }

  init(): void {
    super.init();
    this.setupGoalForm();
    this.setupBudgetButton();
    this.setupDebtButton();
    this.setupEnvelopeButton();
  }

  private setupGoalForm(): void {
    const goalForm = $<HTMLFormElement>('goalForm');
    goalForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleGoalSubmit();
    });

    $('openGoalModalBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.openGoalModal();
    });
  }

  private setupBudgetButton(): void {
    $('openAddBudgetModalBtn')?.addEventListener('click', () => this.openAddBudgetModal());
  }

  private setupDebtButton(): void {
    $('openAddDebtModalBtn')?.addEventListener('click', () => this.openAddDebtModal());
  }

  private setupEnvelopeButton(): void {
    $('openAddEnvelopeModalBtn')?.addEventListener('click', () => this.openAddEnvelopeModal());
  }

  async load(): Promise<void> {
    BudgetView.showBudgetSkeletons();
    BudgetView.applyDesktopLayout();

    const callbacks: BudgetViewCallbacks = {
      onEditGoal: (id) => this.openEditGoalModal(id),
      onDeleteGoal: (id) => this.deleteGoal(id),
      onCompleteGoal: (id) => this.completeGoal(id),
      onDebtPay: (id) => this.openPayDebtModal(id),
      onDebtDelete: (id) => this.deleteDebt(id),
      onEnvelopeDelete: (id) => this.deleteEnvelope(id),
      onBudgetEdit: (b) => this.openEditBudgetModal(b),
      onBudgetDelete: (id) => this.deleteCategoryBudget(id),
      onCopyBudgetsToNextMonth: () => this.copyBudgetsToNextMonth(),
    };

    try {
      this.categories = store.get('categories') || await budgetService.getCategories();
      const currentMonth = getCurrentMonth();

      const results = await Promise.allSettled([
        budgetService.getDashboard(),
        budgetService.getMonthlyBudget(currentMonth),
        budgetService.getDebts(),
        budgetService.getEnvelopes(currentMonth),
        budgetService.getCategoryBudgets(currentMonth),
        budgetService.getCompletedGoals(),
      ]);

      const dashboard = results[0].status === 'fulfilled' ? results[0].value : null;
      const budget = results[1].status === 'fulfilled' ? results[1].value : null;
      const debts = results[2].status === 'fulfilled' ? results[2].value : [];
      const envelopes = results[3].status === 'fulfilled' ? results[3].value : [];
      const categoryBudgets = results[4].status === 'fulfilled' ? results[4].value : [];
      const completedGoals = results[5].status === 'fulfilled' ? results[5].value : [];

      if (results.some(r => r.status === 'rejected')) {
        toast.warning('Часть данных не загрузилась');
      }

      this.categoryBudgets = Array.isArray(categoryBudgets) ? categoryBudgets : [];

      BudgetView.renderGoal(dashboard || BudgetView.emptyDashboard, callbacks);
      BudgetView.renderBudget(budget || { month: currentMonth, total_income: 0, total_payments: 0, total_savings: 0, total_expenses: 0, remaining: 0, savings_rate: 0 });
      BudgetView.renderCompletedGoals(Array.isArray(completedGoals) ? completedGoals : []);
      BudgetView.renderDebts(Array.isArray(debts) ? debts : [], callbacks);
      BudgetView.renderEnvelopes(Array.isArray(envelopes) ? envelopes : [], callbacks);
      BudgetView.renderCategoryBudgets(this.categoryBudgets, callbacks);

      // Load savings plan
      this.loadSavingsPlan();
    } catch (e) {
      console.error('Budget error:', e);
      toast.error('Ошибка загрузки бюджета');
    }
  }

  private async loadSavingsPlan(): Promise<void> {
    const container = $('savingsPlanContent');
    if (!container) return;

    try {
      const result = await budgetService.getGoalSavingsPlan();
      const plans = result?.goals;
      if (!plans?.length) {
        container.innerHTML = '<p class="empty-state">Нет активных целей</p>';
        return;
      }

      container.innerHTML = plans.map((p) => {
        const progress = p.target_amount > 0 ? Math.min(100, (p.current_amount / p.target_amount) * 100) : 0;
        const statusIcon = p.is_on_track ? '✅' : '⚠️';
        const statusText = p.is_on_track ? 'В графике' : 'Отстаёте';

        return `
          <div class="savings-plan-item">
            <div class="savings-plan-header">
              <span class="savings-plan-name">${p.goal_name}</span>
              <span class="savings-plan-status">${statusIcon} ${statusText}</span>
            </div>
            <div class="progress-bar-container">
              <div class="progress-bar" style="width:${progress.toFixed(1)}%"></div>
            </div>
            <div class="savings-plan-details">
              <span>${formatMoney(p.current_amount)} / ${formatMoney(p.target_amount)}</span>
              <span>Нужно: <strong>${formatMoney(p.monthly_amount)}</strong>/мес.</span>
              <span>Осталось: ${p.months_left} мес.</span>
            </div>
          </div>
        `;
      }).join('');
    } catch {
      container.innerHTML = '<p class="empty-state">Не удалось загрузить план накоплений</p>';
    }
  }

  private openGoalModal(): void {
    ($<HTMLInputElement>('goalIdInput'))!.value = '';
    ($<HTMLInputElement>('goalNameInput'))!.value = '';
    ($<HTMLInputElement>('goalAmount'))!.value = '';
    const currencySelect = $<HTMLSelectElement>('goalCurrency');
    if (currencySelect) currencySelect.value = 'BYN';
    const dateInput = $<HTMLInputElement>('goalDate');
    if (dateInput) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 180);
      dateInput.value = futureDate.toISOString().split('T')[0];
    }
    window.openModal('goalModal');
  }

  private async openEditGoalModal(id: number): Promise<void> {
    const dashboard = await budgetService.getDashboard();
    const g = (dashboard as { goals?: Array<{ id: number; name: string; target_amount: number; target_date: string; currency?: string }> }).goals?.find(x => x.id === id)
      ?? (dashboard.goal?.id === id ? dashboard.goal : null);
    if (!g) {
      toast.error('Цель не найдена');
      return;
    }
    ($<HTMLInputElement>('goalIdInput'))!.value = String(g.id);
    ($<HTMLInputElement>('goalNameInput'))!.value = g.name;
    ($<HTMLInputElement>('goalAmount'))!.value = String(g.target_amount);
    const currencySelect = $<HTMLSelectElement>('goalCurrency');
    if (currencySelect) currencySelect.value = (g as { currency?: string }).currency || 'BYN';
    ($<HTMLInputElement>('goalDate'))!.value = g.target_date;
    window.openModal('goalModal');
  }

  private async completeGoal(id: number): Promise<void> {
    try {
      if (!(await modal.confirm('Завершить цель и добавить в историю? Вы сможете создать новую цель.', 'Завершить цель'))) return;
      await this.deactivateGoal(id, 'Цель добавлена в историю');
    } finally {
      modal.closeAll();
    }
  }

  private async deleteGoal(id: number): Promise<void> {
    try {
      if (!(await modal.confirm('Удалить цель? Прогресс накоплений сохранится в транзакциях.', 'Удалить цель'))) return;
      await this.deactivateGoal(id, 'Цель удалена');
    } finally {
      modal.closeAll();
    }
  }

  private async deactivateGoal(id: number, successMessage: string): Promise<void> {
    try {
      await budgetService.deleteGoal(id);
      toast.success(successMessage);
      await this.load();
    } catch {
      toast.error('Ошибка при сохранении');
      await this.load();
    }
  }

  private async handleGoalSubmit(): Promise<void> {
    const idStr = ($<HTMLInputElement>('goalIdInput'))?.value || '';
    const name = ($<HTMLInputElement>('goalNameInput'))?.value || '';
    const targetAmount = parseFloat(($<HTMLInputElement>('goalAmount'))?.value || '0');
    const targetDate = ($<HTMLInputElement>('goalDate'))?.value || '';
    const currency = ($<HTMLSelectElement>('goalCurrency'))?.value || 'BYN';

    try {
      if (idStr) {
        await budgetService.updateGoal({ id: parseInt(idStr), name, target_amount: targetAmount, target_date: targetDate, currency });
        window.closeModal('goalModal');
        toast.success('Цель обновлена');
      } else {
        await budgetService.createGoal({ name, target_amount: targetAmount, target_date: targetDate, currency });
        window.closeModal('goalModal');
        toast.success('Цель создана');
      }
      await this.load();
    } catch {
      toast.error(idStr ? 'Ошибка при обновлении цели' : 'Ошибка при создании цели');
    }
  }

  private openAddDebtModal(): void {
    const existingModal = $('addDebtModal');
    existingModal?.remove();

    const modalHtml = `
      <div id="addDebtModal" class="modal show">
        <div class="modal-content modal-small">
          <div class="modal-header">
            <h3>💳 Добавить долг</h3>
            <button class="btn-close modal-close" aria-label="Закрыть">×</button>
          </div>
          <form id="addDebtForm">
            <div class="form-group">
              <label>Название</label>
              <input type="text" id="debtNameInput" placeholder="Кредит, займ..." required>
            </div>
            <div class="form-group">
              <label>Сумма (BYN)</label>
              <input type="number" id="debtAmountInput" step="0.01" min="0" placeholder="0" required>
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-secondary modal-cancel">Отмена</button>
              <button type="submit" class="btn btn-primary">Добавить</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const overlay = $('addDebtModal');
    const form = $<HTMLFormElement>('addDebtForm');
    const nameInput = $<HTMLInputElement>('debtNameInput');

    const closeModal = () => overlay?.remove();

    overlay?.querySelector('.modal-close')?.addEventListener('click', closeModal);
    overlay?.querySelector('.modal-cancel')?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = nameInput?.value?.trim();
      const amount = parseFloat(($<HTMLInputElement>('debtAmountInput'))?.value || '0');
      if (!name || isNaN(amount) || amount <= 0) {
        toast.error('Заполните обязательные поля');
        return;
      }
      closeModal();
      try {
        await budgetService.createDebt({ name, total_amount: amount });
        toast.success('Долг добавлен');
        await this.load();
      } catch {
        toast.error('Ошибка');
      }
    });

    setTimeout(() => nameInput?.focus(), 100);
  }

  private openAddEnvelopeModal(): void {
    const existingModal = $('addEnvelopeModal');
    existingModal?.remove();

    const modalHtml = `
      <div id="addEnvelopeModal" class="modal show">
        <div class="modal-content modal-small">
          <div class="modal-header">
            <h3>📦 Добавить банку</h3>
            <button class="btn-close modal-close" aria-label="Закрыть">×</button>
          </div>
          <form id="addEnvelopeForm">
            <div class="form-group">
              <label>Название</label>
              <input type="text" id="envelopeNameInput" placeholder="Банка на..." required>
            </div>
            <div class="form-group">
              <label>Сумма (BYN)</label>
              <input type="number" id="envelopeAmountInput" step="0.01" min="0" placeholder="0" required>
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-secondary modal-cancel">Отмена</button>
              <button type="submit" class="btn btn-primary">Добавить</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const overlay = $('addEnvelopeModal');
    const form = $<HTMLFormElement>('addEnvelopeForm');
    const nameInput = $<HTMLInputElement>('envelopeNameInput');

    const closeModal = () => overlay?.remove();

    overlay?.querySelector('.modal-close')?.addEventListener('click', closeModal);
    overlay?.querySelector('.modal-cancel')?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = nameInput?.value?.trim();
      const amount = parseFloat(($<HTMLInputElement>('envelopeAmountInput'))?.value || '0');
      if (!name || isNaN(amount) || amount <= 0) {
        toast.error('Заполните обязательные поля');
        return;
      }
      closeModal();
      try {
        await budgetService.createEnvelope({ name, allocated: amount, month: getCurrentMonth() });
        toast.success('Банка добавлена');
        await this.load();
      } catch {
        toast.error('Ошибка');
      }
    });

    setTimeout(() => nameInput?.focus(), 100);
  }

  private async openPayDebtModal(debtId: number): Promise<void> {
    const paidStr = await modal.prompt(
      { label: 'Сколько погашено? (BYN)', type: 'number', placeholder: '0' },
      'Погашение долга'
    );
    if (paidStr === null) return;
    const paid = parseFloat(paidStr);
    if (isNaN(paid) || paid < 0) {
      toast.error('Некорректная сумма');
      return;
    }
    try {
      const debts = await budgetService.getDebts();
      const d = debts.find(x => x.id === debtId);
      if (!d) return;
      await budgetService.updateDebt({ id: debtId, paid_amount: d.paid_amount + paid });
      toast.success('Погашение учтено');
      await this.load();
    } catch {
      toast.error('Ошибка');
    }
  }

  private async deleteDebt(id: number): Promise<void> {
    if (!(await modal.confirm('Удалить долг?', 'Удалить долг'))) return;
    try {
      await budgetService.deleteDebt(id);
      toast.success('Долг удалён');
      await this.load();
    } catch {
      toast.error('Ошибка');
    }
  }

  private async deleteEnvelope(id: number): Promise<void> {
    if (!(await modal.confirm('Удалить банку?', 'Удалить банку'))) return;
    try {
      await budgetService.deleteEnvelope(id);
      toast.success('Банка удалена');
      await this.load();
    } catch {
      toast.error('Ошибка');
    }
  }

  private async openAddBudgetModal(): Promise<void> {
    if (!this.categories?.length) {
      try {
        this.categories = await budgetService.getCategories();
      } catch {
        toast.error('Ошибка загрузки категорий');
        return;
      }
    }

    const existingCategoryIds = new Set(this.categoryBudgets?.map(b => b.category_id) || []);
    const availableCategories = this.flattenCategories().filter(c => !existingCategoryIds.has(c.id));

    if (!availableCategories.length) {
      toast.info('Все категории уже имеют лимит');
      return;
    }

    const existingModal = $('budgetModal');
    existingModal?.remove();

    const modalHtml = `
      <div id="budgetModal" class="modal show">
        <div class="modal-content">
          <div class="modal-header">
            <h3>📊 Добавить лимит</h3>
            <button class="btn-close modal-close" aria-label="Закрыть">×</button>
          </div>
          <form id="budgetForm">
            <div class="form-group">
              <label>Категория</label>
              <select id="budgetCategorySelect" required>
                <option value="">Выберите категорию</option>
                ${availableCategories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Лимит (BYN)</label>
              <input type="number" id="budgetLimitInput" step="0.01" min="0" placeholder="500" required>
            </div>
            <div class="form-group">
              <label>Порог предупреждения (%)</label>
              <input type="number" id="budgetAlertInput" min="50" max="100" value="80">
              <small class="hint">Уведомление при достижении этого процента</small>
            </div>
            <div class="form-check">
              <input type="checkbox" id="budgetRecurringInput" checked>
              <label for="budgetRecurringInput">🔄 Повторять каждый месяц</label>
            </div>
            <div class="form-check">
              <input type="checkbox" id="budgetEssentialInput">
              <label for="budgetEssentialInput">💰 Базовые расходы</label>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Добавить лимит</button>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = $('budgetModal');
    const form = $<HTMLFormElement>('budgetForm');
    const categorySelect = $<HTMLSelectElement>('budgetCategorySelect');

    let tomSelect: any = null;
    if (categorySelect && typeof TomSelect !== 'undefined') {
      tomSelect = new TomSelect(categorySelect, {
        create: false,
        sortField: { field: 'text', direction: 'asc' },
        placeholder: 'Поиск категории...',
      });
    }

    const closeModal = () => {
      tomSelect?.destroy();
      modal?.remove();
    };

    modal?.querySelector('.modal-close')?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleBudgetSubmit();
      closeModal();
    });
  }

  private async handleBudgetSubmit(): Promise<void> {
    const categoryId = parseInt(($<HTMLSelectElement>('budgetCategorySelect'))?.value || '0');
    const limitAmount = parseFloat(($<HTMLInputElement>('budgetLimitInput'))?.value || '0');
    const alertPercent = parseFloat(($<HTMLInputElement>('budgetAlertInput'))?.value || '80');
    const isRecurring = ($<HTMLInputElement>('budgetRecurringInput'))?.checked ?? true;
    const isEssential = ($<HTMLInputElement>('budgetEssentialInput'))?.checked ?? false;

    if (!categoryId || !limitAmount) {
      toast.error('Заполните все поля');
      return;
    }

    try {
      await budgetService.setCategoryBudget({
        category_id: categoryId,
        month: getCurrentMonth(),
        limit_amount: limitAmount,
        alert_percent: alertPercent,
        is_recurring: isRecurring,
        is_essential: isEssential,
      });
      toast.success('Лимит добавлен');
      await this.load();
    } catch {
      toast.error('Ошибка при добавлении лимита');
    }
  }

  private openEditBudgetModal(budget: CategoryBudget): void {
    const existingModal = $('budgetEditModal');
    existingModal?.remove();

    const modalHtml = `
      <div id="budgetEditModal" class="modal show">
        <div class="modal-content">
          <div class="modal-header">
            <h3>✏️ Редактировать лимит</h3>
            <button class="btn-close modal-close" aria-label="Закрыть">×</button>
          </div>
          <form id="budgetEditForm">
            <input type="hidden" id="editBudgetId" value="${budget.id}">
            <div class="form-group">
              <label>Категория</label>
              <div class="budget-category-display">
                <span class="budget-icon">${budget.category_icon}</span>
                <span class="budget-name">${budget.category_name}</span>
              </div>
            </div>
            <div class="form-group">
              <label>Лимит (BYN)</label>
              <input type="number" id="editBudgetLimitInput" step="0.01" min="0" value="${budget.limit_amount}" required>
            </div>
            <div class="form-group">
              <label>Порог предупреждения (%)</label>
              <input type="number" id="editBudgetAlertInput" min="50" max="100" value="${budget.alert_percent}">
            </div>
            <div class="form-check">
              <input type="checkbox" id="editBudgetRecurringInput" ${budget.is_recurring ? 'checked' : ''}>
              <label for="editBudgetRecurringInput">🔄 Повторять каждый месяц</label>
            </div>
            <div class="form-check">
              <input type="checkbox" id="editBudgetEssentialInput" ${budget.is_essential ? 'checked' : ''}>
              <label for="editBudgetEssentialInput">💰 Базовые расходы</label>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Сохранить</button>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = $('budgetEditModal');
    const form = $<HTMLFormElement>('budgetEditForm');

    modal?.querySelector('.modal-close')?.addEventListener('click', () => modal?.remove());
    modal?.addEventListener('click', (e) => { if (e.target === modal) modal?.remove(); });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleBudgetEditSubmit();
      modal?.remove();
    });
  }

  private async handleBudgetEditSubmit(): Promise<void> {
    const id = parseInt(($<HTMLInputElement>('editBudgetId'))?.value || '0');
    const limitAmount = parseFloat(($<HTMLInputElement>('editBudgetLimitInput'))?.value || '0');
    const alertPercent = parseFloat(($<HTMLInputElement>('editBudgetAlertInput'))?.value || '80');
    const isRecurring = ($<HTMLInputElement>('editBudgetRecurringInput'))?.checked ?? false;
    const isEssential = ($<HTMLInputElement>('editBudgetEssentialInput'))?.checked ?? false;

    if (!id || !limitAmount) {
      toast.error('Заполните все поля');
      return;
    }

    try {
      await budgetService.setCategoryBudget({
        id,
        limit_amount: limitAmount,
        alert_percent: alertPercent,
        is_recurring: isRecurring,
        is_essential: isEssential,
      });
      toast.success('Лимит обновлён');
      await this.load();
    } catch {
      toast.error('Ошибка при обновлении');
    }
  }

  private async deleteCategoryBudget(id: number): Promise<void> {
    if (!(await modal.confirm('Удалить лимит для этой категории?', 'Удалить лимит'))) return;
    try {
      await budgetService.deleteCategoryBudget(id);
      toast.success('Лимит удалён');
      await this.load();
    } catch {
      toast.error('Ошибка при удалении');
    }
  }

  private async copyBudgetsToNextMonth(): Promise<void> {
    const currentMonth = getCurrentMonth();
    const nextDate = new Date(currentMonth + '-01');
    nextDate.setMonth(nextDate.getMonth() + 1);
    const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;

    if (!(await modal.confirm(`Скопировать все лимиты текущего месяца в ${nextMonth}?`, 'Применить шаблон'))) return;

    try {
      const result = await budgetService.copyBudgetsToNextMonth(currentMonth);
      toast.success(`Скопировано лимитов: ${result.copied} → ${result.to_month}`);
    } catch {
      toast.error('Ошибка при копировании');
    }
  }

  private flattenCategories(): Array<{ id: number; name: string; icon: string }> {
    const result: Array<{ id: number; name: string; icon: string }> = [];
    if (!this.categories?.length) return result;
    for (const cat of this.categories) {
      result.push({ id: cat.id, name: cat.name, icon: cat.icon || '📦' });
      if (cat.subcategories) {
        for (const sub of cat.subcategories) {
          result.push({ id: sub.id, name: `${cat.name} → ${sub.name}`, icon: sub.icon || '📁' });
        }
      }
    }
    return result;
  }

  destroy(): void {
    $('budgetModal')?.remove();
    $('budgetEditModal')?.remove();
    super.destroy();
  }
}

export const budgetPage = new BudgetPage();
