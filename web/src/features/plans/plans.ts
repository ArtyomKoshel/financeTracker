/**
 * Plans Page — оркестрация
 * Связывает Service (данные) и View (отображение)
 */
import { BasePage } from '@/pages/base';
import { plansService } from '@/features/plans/plans.service';
import { toast } from '@/shared/components/toast';
import { modal } from '@/shared/components/modal';
import { createPaymentFormModal } from '@/features/plans/payment-form';
import { formatMoney, getToday, getCurrentMonth } from '@/shared/utils/format';
import { $ } from '@/shared/utils/dom';
import { store } from '@/store';
import * as PlansView from '@/features/plans/PlansView';
import type { PlansViewCallbacks } from '@/features/plans/PlansView';
import type { PaymentReminder, RecurringPayment, CategoryWithSubs } from '@/types';

declare const TomSelect: any;

export class PlansPage extends BasePage {
  private categories: CategoryWithSubs[] = [];
  private paymentModal: ReturnType<typeof createPaymentFormModal> | null = null;
  private lastReminders: PaymentReminder[] = [];

  constructor() {
    super('plans');
  }

  init(): void {
    super.init();
    this.initPaymentModal();
    this.setupCalendarToggle();
    this.setupSubscriptionDetection();
  }

  private setupCalendarToggle(): void {
    const btn = $('toggleCalendarBtn');
    btn?.addEventListener('click', () => {
      const cal = $('paymentCalendar');
      if (cal?.classList.contains('collapsed')) {
        cal.classList.remove('collapsed');
        btn.textContent = '−';
      } else {
        cal?.classList.add('collapsed');
        btn.textContent = '+';
      }
    });
  }

  private initPaymentModal(): void {
    this.paymentModal = createPaymentFormModal({
      onSubmit: async (data) => {
        const tempPayment: RecurringPayment = {
          id: -Date.now(),
          name: data.name,
          amount: data.amount,
          original_amount: data.amount,
          currency: (data.currency as RecurringPayment['currency']) || 'BYN',
          day_of_month: data.day_of_month || 1,
          due_date: data.due_date || '',
          category: data.category || 'optional',
          category_id: data.category_id,
          is_variable: !!data.is_variable,
          is_one_time: !!data.is_one_time,
          is_active: true,
          description: '',
        };
        const tempReminder: PaymentReminder = {
          payment: tempPayment,
          due_date: tempPayment.due_date || new Date().toISOString().slice(0, 10),
          month: getCurrentMonth(),
          days_until: 0,
          is_paid: false,
          is_overdue: false,
          is_next_month: false,
        };
        this.lastReminders = [tempReminder, ...this.lastReminders];
        PlansView.renderPayments(this.lastReminders, this.getCallbacks());
        toast.success('Платёж добавлен');

        try {
          await plansService.createPayment(data);
          await this.load();
        } catch (e) {
          if ((e as Error & { offlineQueued?: boolean }).offlineQueued) {
            toast.success('Платёж сохранён офлайн');
            return;
          }
          this.lastReminders = this.lastReminders.filter(r => r.payment.id !== tempPayment.id);
          PlansView.renderPayments(this.lastReminders, this.getCallbacks());
          toast.error('Ошибка при добавлении платежа');
        }
      },
    });
  }

  private setupSubscriptionDetection(): void {
    $('detectSubscriptionsBtn')?.addEventListener('click', async () => {
      const container = $('detectedSubscriptionsList');
      if (!container) return;

      container.innerHTML = '<p class="empty-state">⏳ Анализируем транзакции...</p>';

      try {
        const subs = await plansService.detectSubscriptions();
        if (!subs?.length) {
          container.innerHTML = '<p class="empty-state">✅ Повторяющиеся платежи не обнаружены</p>';
          return;
        }

        container.innerHTML = subs.map(s => `
          <div class="detected-sub-item">
            <div class="detected-sub-info">
              <span class="detected-sub-name">${s.description || 'Без описания'}</span>
              <span class="detected-sub-details">
                ${formatMoney(s.amount)} · ${s.occurrences}× за 3 мес. · ~${s.estimated_day} числа
              </span>
            </div>
            <button class="btn btn-sm btn-primary detected-sub-add" data-desc="${s.description}" data-amount="${s.amount}" data-day="${s.estimated_day}">
              + В плановые
            </button>
          </div>
        `).join('');

        // Bind add buttons
        container.querySelectorAll('.detected-sub-add').forEach(btn => {
          btn.addEventListener('click', () => {
            const el = btn as HTMLElement;
            const name = el.dataset.desc || '';
            const amount = parseFloat(el.dataset.amount || '0');
            const day = parseInt(el.dataset.day || '1');

            // Pre-fill payment modal
            this.paymentModal?.open(this.categories);

            // Set values after modal opens
            setTimeout(() => {
              const nameInput = document.querySelector<HTMLInputElement>('.pay-name');
              const amountInput = document.querySelector<HTMLInputElement>('.pay-amount');
              const dayInput = document.querySelector<HTMLInputElement>('.pay-day');
              const subscriptionCheck = document.querySelector<HTMLInputElement>('.pay-subscription');
              if (nameInput) nameInput.value = name;
              if (amountInput) amountInput.value = amount.toFixed(2);
              if (dayInput) dayInput.value = String(day);
              if (subscriptionCheck) subscriptionCheck.checked = true;
            }, 100);

            toast.info(`Заполнено из обнаруженной подписки «${name}»`);
          });
        });
      } catch {
        container.innerHTML = '<p class="empty-state error">Ошибка при поиске подписок</p>';
      }
    });
  }

  private getCallbacks(): PlansViewCallbacks {
    return {
      onPay: (id, amount, isVariable, name, currency) => this.markPaymentPaid(id, amount, isVariable, name, currency),
      onEditPayment: (id) => this.openEditPaymentModal(id),
      onDeletePayment: (id) => this.deletePayment(id),
    };
  }

  async load(): Promise<void> {
    PlansView.showPlansSkeletons();
    PlansView.applyDesktopLayout();

    try {
      this.categories = store.get('categories') || await plansService.getCategories();

      const [reminders, calendar, subReminders] = await Promise.all([
        plansService.getPaymentReminders(),
        plansService.getPaymentCalendar(60),
        plansService.getSubscriptionReminders(),
      ]);
      this.lastReminders = reminders;
      PlansView.renderPayments(reminders, this.getCallbacks());
      PlansView.renderCalendar(calendar);
      PlansView.renderSubscriptionReminders(subReminders);
    } catch (e) {
      console.error('Plans error:', e);
      toast.error('Ошибка загрузки планов');
    }
  }

  private markPaymentPaid(paymentId: number, amount: number, isVariable: boolean, paymentName: string, currency: string = 'BYN'): void {
    if (isVariable) {
      this.openVariableAmountModal(paymentId, amount, paymentName, currency);
      return;
    }
    this.processPayment(paymentId, amount, paymentName, currency);
  }

  private openVariableAmountModal(paymentId: number, defaultAmount: number, paymentName: string, currency: string): void {
    const existingModal = $('variableAmountModal');
    existingModal?.remove();

    const modalHtml = `
      <div id="variableAmountModal" class="modal show">
        <div class="modal-content">
          <div class="modal-header">
            <h3>💳 Оплата платежа</h3>
            <button class="btn-close modal-close" aria-label="Закрыть">×</button>
          </div>
          <form id="variableAmountForm">
            <div class="form-group">
              <label>Платёж</label>
              <div class="payment-name-display">${paymentName}</div>
            </div>
            <div class="form-group">
              <label>Фактическая сумма (${currency})</label>
              <input type="number" id="variableAmountInput" step="0.01" min="0" value="${defaultAmount.toFixed(2)}" required autofocus>
              <small class="hint">Ожидаемая сумма: ${formatMoney(defaultAmount)}</small>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Оплатить</button>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = $('variableAmountModal');
    const form = $<HTMLFormElement>('variableAmountForm');
    const input = $<HTMLInputElement>('variableAmountInput');

    setTimeout(() => {
      input?.focus();
      input?.select();
    }, 100);

    const closeModal = () => modal?.remove();

    modal?.querySelector('.modal-close')?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const finalAmount = parseFloat(input?.value || '0');
      if (isNaN(finalAmount) || finalAmount <= 0) {
        toast.error('Некорректная сумма');
        return;
      }
      closeModal();
      await this.processPayment(paymentId, finalAmount, paymentName, currency);
    });
  }

  private async processPayment(paymentId: number, amount: number, paymentName: string, currency: string): Promise<void> {
    try {
      const result = await plansService.createTransaction({
        date: getToday(),
        amount: amount,
        currency: currency,
        type: 'expense',
        recurring_payment_id: paymentId,
        description: paymentName,
      });
      toast.success('Платёж оплачен');

      if (result.budget_warning) {
        const warning = result.budget_warning;
        if (warning.percent >= 100) {
          toast.error(`${warning.category_icon} ${warning.message}`);
        } else {
          toast.warning(`${warning.category_icon} ${warning.message}`);
        }
      }

      await this.load();
    } catch (e) {
      toast.error('Ошибка при оплате');
    }
  }

  private async deletePayment(id: number): Promise<void> {
    if (!(await modal.confirm('Удалить плановый платёж?', 'Удалить платёж'))) return;

    const previous = [...this.lastReminders];
    this.lastReminders = previous.filter(r => r.payment.id !== id);
    PlansView.renderPayments(this.lastReminders, this.getCallbacks());
    toast.success('Платёж удалён');

    try {
      await plansService.deletePayment(id);
    } catch (e) {
      if ((e as Error & { offlineQueued?: boolean }).offlineQueued) {
        toast.success('Удаление в очереди');
        return;
      }
      this.lastReminders = previous;
      PlansView.renderPayments(previous, this.getCallbacks());
      toast.error('Ошибка при удалении');
    }
  }

  private async openEditPaymentModal(id: number): Promise<void> {
    const payments = await plansService.getPayments();
    const p = payments.find(x => x.id === id) ?? this.lastReminders.find(r => r.payment.id === id)?.payment;
    if (!p) {
      toast.error('Платёж не найден');
      return;
    }

    if (!this.categories || this.categories.length === 0) {
      this.categories = await plansService.getCategories();
    }

    const existingModal = $('editPaymentModal');
    existingModal?.remove();

    const categoryOptions = this.flattenCategories().map(c =>
      `<option value="${c.id}" ${p.category_id === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`
    ).join('');

    const modalHtml = `
      <div id="editPaymentModal" class="modal show">
        <div class="modal-content">
          <div class="modal-header">
            <h3>✏️ Редактировать платёж</h3>
            <button class="btn-close modal-close" aria-label="Закрыть">×</button>
          </div>
          <form id="editPaymentForm">
            <input type="hidden" id="editPaymentId" value="${p.id}">
            <div class="form-group">
              <label>Название</label>
              <input type="text" id="editPaymentName" value="${p.name}" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Сумма</label>
                <input type="number" id="editPaymentAmount" step="0.01" value="${p.original_amount || p.amount}" required>
              </div>
              <div class="form-group">
                <label>Валюта</label>
                <select id="editPaymentCurrency">
                  <option value="BYN" ${p.currency === 'BYN' ? 'selected' : ''}>BYN</option>
                  <option value="RUB" ${p.currency === 'RUB' ? 'selected' : ''}>RUB</option>
                  <option value="USD" ${p.currency === 'USD' ? 'selected' : ''}>USD</option>
                  <option value="EUR" ${p.currency === 'EUR' ? 'selected' : ''}>EUR</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>Категория расходов</label>
              <select id="editPaymentCategoryId">
                <option value="">Без категории</option>
                ${categoryOptions}
              </select>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>День месяца</label>
                <input type="number" id="editPaymentDay" min="1" max="31" value="${p.day_of_month}" ${p.is_one_time ? 'disabled' : ''}>
              </div>
              <div class="form-group">
                <label>Тип</label>
                <select id="editPaymentCategory">
                  <option value="essential" ${p.category === 'essential' ? 'selected' : ''}>Обязательный</option>
                  <option value="optional" ${p.category === 'optional' ? 'selected' : ''}>Опциональный</option>
                </select>
              </div>
            </div>
            <div class="form-check">
              <input type="checkbox" id="editPaymentIncome" ${p.is_income ? 'checked' : ''}>
              <label for="editPaymentIncome">Доход (зарплата, аванс)</label>
            </div>
            <div class="form-check">
              <input type="checkbox" id="editPaymentOneTime" ${p.is_one_time ? 'checked' : ''}>
              <label for="editPaymentOneTime">Разовый платёж</label>
            </div>
            <div class="form-check">
              <input type="checkbox" id="editPaymentSubscription" ${p.is_subscription ? 'checked' : ''}>
              <label for="editPaymentSubscription">Подписка</label>
            </div>
            <div class="form-group" id="editCancelByDateGroup" style="${p.is_subscription ? '' : 'display:none'}">
              <label>Отменить до</label>
              <input type="date" id="editPaymentCancelByDate" value="${p.cancel_by_date || ''}">
            </div>
            <div class="form-group" id="editDueDateGroup" style="${p.is_one_time ? '' : 'display:none'}">
              <label>Дата платежа</label>
              <input type="date" id="editPaymentDueDate" value="${p.due_date || ''}">
            </div>
            <div class="form-check">
              <input type="checkbox" id="editPaymentAutoDebit" ${p.is_auto_debit ? 'checked' : ''}>
              <label for="editPaymentAutoDebit">Авто-списание (списывается банком)</label>
            </div>
            <div class="form-check">
              <input type="checkbox" id="editPaymentVariable" ${p.is_variable ? 'checked' : ''}>
              <label for="editPaymentVariable">Переменная сумма</label>
            </div>
            <div class="form-group">
              <label>Описание</label>
              <input type="text" id="editPaymentDescription" value="${p.description || ''}">
            </div>
            <button type="submit" class="btn btn-primary btn-block">Сохранить</button>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = $('editPaymentModal');
    const form = $<HTMLFormElement>('editPaymentForm');
    const categorySelect = $<HTMLSelectElement>('editPaymentCategoryId');
    const oneTimeCheck = $<HTMLInputElement>('editPaymentOneTime');
    const subscriptionCheck = $<HTMLInputElement>('editPaymentSubscription');
    const cancelByDateGroup = $('editCancelByDateGroup');
    const dueDateGroup = $('editDueDateGroup');
    const dayInput = $<HTMLInputElement>('editPaymentDay');

    subscriptionCheck?.addEventListener('change', () => {
      if (cancelByDateGroup) cancelByDateGroup.style.display = subscriptionCheck.checked ? '' : 'none';
    });

    let tomSelect: any = null;
    if (categorySelect && typeof TomSelect !== 'undefined') {
      tomSelect = new TomSelect(categorySelect, {
        create: false,
        sortField: { field: 'text', direction: 'asc' },
        placeholder: 'Поиск категории...',
      });
    }

    oneTimeCheck?.addEventListener('change', () => {
      if (dueDateGroup && dayInput) {
        dueDateGroup.style.display = oneTimeCheck.checked ? '' : 'none';
        dayInput.disabled = oneTimeCheck.checked;
      }
    });

    const closeModal = () => {
      tomSelect?.destroy();
      modal?.remove();
    };

    modal?.querySelector('.modal-close')?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleEditPaymentSubmit();
      closeModal();
    });
  }

  private async handleEditPaymentSubmit(): Promise<void> {
    const id = parseInt(($<HTMLInputElement>('editPaymentId'))?.value || '0');
    const name = ($<HTMLInputElement>('editPaymentName'))?.value || '';
    const amount = parseFloat(($<HTMLInputElement>('editPaymentAmount'))?.value || '0');
    const currency = ($<HTMLSelectElement>('editPaymentCurrency'))?.value || 'BYN';
    const categoryId = parseInt(($<HTMLSelectElement>('editPaymentCategoryId'))?.value || '0') || undefined;
    const dayOfMonth = parseInt(($<HTMLInputElement>('editPaymentDay'))?.value || '1');
    const category = ($<HTMLSelectElement>('editPaymentCategory'))?.value || 'essential';
    const isOneTime = ($<HTMLInputElement>('editPaymentOneTime'))?.checked || false;
    const isSubscription = ($<HTMLInputElement>('editPaymentSubscription'))?.checked || false;
    const cancelByDate = ($<HTMLInputElement>('editPaymentCancelByDate'))?.value || '';
    const dueDate = ($<HTMLInputElement>('editPaymentDueDate'))?.value || '';
    const isVariable = ($<HTMLInputElement>('editPaymentVariable'))?.checked || false;
    const isAutoDebit = ($<HTMLInputElement>('editPaymentAutoDebit'))?.checked || false;
    const isIncome = ($<HTMLInputElement>('editPaymentIncome'))?.checked || false;
    const description = ($<HTMLInputElement>('editPaymentDescription'))?.value || '';

    if (!name || !amount) {
      toast.error('Заполните обязательные поля');
      return;
    }

    try {
      await plansService.updatePayment({
        id,
        name,
        amount,
        is_income: isIncome,
        currency,
        day_of_month: dayOfMonth,
        due_date: isOneTime ? dueDate : undefined,
        category,
        category_id: categoryId,
        is_variable: isVariable,
        is_auto_debit: isAutoDebit,
        is_one_time: isOneTime,
        is_subscription: isSubscription,
        cancel_by_date: isSubscription ? cancelByDate : undefined,
        description,
      });
      toast.success('Платёж обновлён');
      await this.load();
    } catch (e) {
      toast.error('Ошибка при обновлении');
    }
  }

  openAddPaymentModal(): void {
    this.paymentModal?.open(this.categories);
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
    this.paymentModal?.destroy();
    super.destroy();
  }
}

export const plansPage = new PlansPage();
