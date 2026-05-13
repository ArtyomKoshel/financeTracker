/**
 * Payment Form Modal Component
 */
import type { CategoryWithSubs, Currency } from '@/types';

// Declare TomSelect as global (loaded via CDN)
declare const TomSelect: any;

const CURRENCIES: Currency[] = ['BYN', 'RUB', 'EUR', 'USD'];

export interface PaymentFormData {
  name: string;
  amount: number;
  currency: string;
  day_of_month: number;
  due_date?: string;
  category: 'essential' | 'optional';
  category_id?: number;
  is_variable: boolean;
  is_one_time: boolean;
  is_subscription?: boolean;
  cancel_by_date?: string;
  is_income?: boolean;
  is_auto_debit?: boolean;
}

export interface PaymentFormOptions {
  onSubmit: (data: PaymentFormData) => Promise<void>;
  onClose?: () => void;
}

export function createPaymentFormModal(options: PaymentFormOptions): {
  open: (categories: CategoryWithSubs[]) => void;
  close: () => void;
  destroy: () => void;
} {
  let categories: CategoryWithSubs[] = [];
  let tomSelectInstance: any = null;

  // Create modal HTML
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>📅 Новый плановый платёж</h3>
        <button class="btn-close modal-close" aria-label="Закрыть">×</button>
      </div>
      <form class="payment-form">
        <div class="form-group">
          <label>Название</label>
          <input type="text" class="pay-name" placeholder="Аренда квартиры" required>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Сумма</label>
            <div class="input-with-currency">
              <input type="number" class="pay-amount" step="0.01" required>
              <select class="pay-currency">
                ${CURRENCIES.map(c => `<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group pay-day-group">
            <label>День месяца</label>
            <input type="number" class="pay-day" min="1" max="31" required>
          </div>
          <div class="form-group pay-date-group" style="display: none;">
            <label>Дата платежа</label>
            <input type="date" class="pay-due-date">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Тип</label>
            <select class="pay-type">
              <option value="essential">Обязательный</option>
              <option value="optional">Опциональный</option>
            </select>
          </div>
          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" class="pay-variable">
              Сумма примерная
            </label>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" class="pay-income">
              Доход (зарплата, аванс)
            </label>
          </div>
          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" class="pay-one-time">
              Разовый платёж
            </label>
          </div>
          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" class="pay-subscription">
              Подписка
            </label>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" class="pay-auto-debit">
              Авто-списание (списывается банком автоматически)
            </label>
          </div>
        </div>
        <div class="form-group pay-cancel-date-group" style="display: none;">
          <label>Отменить до (дата)</label>
          <input type="date" class="pay-cancel-by-date">
        </div>
        <div class="form-group">
          <label>Категория расходов</label>
          <select class="pay-category-id">
            <option value="">— Без категории —</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Добавить</button>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  // Get elements
  const form = modal.querySelector<HTMLFormElement>('.payment-form')!;
  const closeBtn = modal.querySelector<HTMLButtonElement>('.modal-close')!;
  const nameInput = modal.querySelector<HTMLInputElement>('.pay-name')!;
  const amountInput = modal.querySelector<HTMLInputElement>('.pay-amount')!;
  const currencySelect = modal.querySelector<HTMLSelectElement>('.pay-currency')!;
  const dayGroup = modal.querySelector<HTMLElement>('.pay-day-group')!;
  const dayInput = modal.querySelector<HTMLInputElement>('.pay-day')!;
  const dateGroup = modal.querySelector<HTMLElement>('.pay-date-group')!;
  const dueDateInput = modal.querySelector<HTMLInputElement>('.pay-due-date')!;
  const typeSelect = modal.querySelector<HTMLSelectElement>('.pay-type')!;
  const variableCheck = modal.querySelector<HTMLInputElement>('.pay-variable')!;
  const incomeCheck = modal.querySelector<HTMLInputElement>('.pay-income')!;
  const oneTimeCheck = modal.querySelector<HTMLInputElement>('.pay-one-time')!;
  const subscriptionCheck = modal.querySelector<HTMLInputElement>('.pay-subscription')!;
  const autoDebitCheck = modal.querySelector<HTMLInputElement>('.pay-auto-debit')!;
  const cancelDateGroup = modal.querySelector<HTMLElement>('.pay-cancel-date-group')!;
  const cancelDateInput = modal.querySelector<HTMLInputElement>('.pay-cancel-by-date')!;
  const categorySelect = modal.querySelector<HTMLSelectElement>('.pay-category-id')!;

  subscriptionCheck.addEventListener('change', () => {
    cancelDateGroup.style.display = subscriptionCheck.checked ? 'block' : 'none';
  });

  // Toggle between day_of_month and due_date based on one-time checkbox
  const toggleDateInput = () => {
    if (oneTimeCheck.checked) {
      dayGroup.style.display = 'none';
      dayInput.required = false;
      dateGroup.style.display = 'block';
      dueDateInput.required = true;
      // Set default date to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      dueDateInput.value = tomorrow.toISOString().split('T')[0];
    } else {
      dayGroup.style.display = 'block';
      dayInput.required = true;
      dateGroup.style.display = 'none';
      dueDateInput.required = false;
    }
  };

  // Build flat list of categories with subcategories
  const buildCategoryOptions = (): Array<{ value: string; text: string; optgroup?: string }> => {
    const opts: Array<{ value: string; text: string; optgroup?: string }> = [
      { value: '', text: '— Без категории —' }
    ];
    
    for (const cat of categories) {
      const catLabel = cat.icon ? `${cat.icon} ${cat.name}` : cat.name;
      opts.push({ value: String(cat.id), text: catLabel });
      
      // Add subcategories
      if (cat.subcategories && cat.subcategories.length > 0) {
        for (const sub of cat.subcategories) {
          const subLabel = sub.icon ? `${sub.icon} ${sub.name}` : sub.name;
          opts.push({
            value: String(sub.id),
            text: `  └ ${subLabel}`,
            optgroup: catLabel,
          });
        }
      }
    }
    return opts;
  };

  // Initialize Tom Select
  const initTomSelect = () => {
    // Destroy previous instance if exists
    if (tomSelectInstance) {
      tomSelectInstance.destroy();
      tomSelectInstance = null;
    }

    const opts = buildCategoryOptions();
    
    // Clear and populate base select
    categorySelect.innerHTML = opts.map(o => 
      `<option value="${o.value}">${o.text}</option>`
    ).join('');

    // Init Tom Select
    tomSelectInstance = new TomSelect(categorySelect, {
      create: false,
      allowEmptyOption: true,
      render: {
        option: (data: any, escape: (s: string) => string) => {
          const isSubcategory = data.text.startsWith('  └');
          return `<div class="${isSubcategory ? 'ts-subcategory' : ''}">${escape(data.text)}</div>`;
        },
        item: (data: any, escape: (s: string) => string) => {
          // Remove indent prefix for selected item display
          const text = data.text.replace('  └ ', '');
          return `<div>${escape(text)}</div>`;
        },
      },
    });
  };

  // Close modal
  const close = () => {
    modal.classList.remove('show');
    form.reset();
    if (tomSelectInstance) {
      tomSelectInstance.clear();
    }
    toggleDateInput(); // Reset to default state
    options.onClose?.();
  };

  // Open modal
  const open = (cats: CategoryWithSubs[]) => {
    categories = cats;
    initTomSelect();
    toggleDateInput();
    cancelDateGroup.style.display = subscriptionCheck.checked ? 'block' : 'none';
    modal.classList.add('show');
  };

  // Handle submit
  const onSubmit = async (e: Event) => {
    e.preventDefault();

    const isOneTime = oneTimeCheck.checked;
    
    // Get category from Tom Select or fallback to select
    const categoryValue = tomSelectInstance 
      ? tomSelectInstance.getValue() 
      : categorySelect.value;

    const data: PaymentFormData = {
      name: nameInput.value,
      amount: parseFloat(amountInput.value) || 0,
      currency: currencySelect.value,
      day_of_month: isOneTime ? 0 : (parseInt(dayInput.value) || 1),
      due_date: isOneTime ? dueDateInput.value : undefined,
      category: typeSelect.value as 'essential' | 'optional',
      category_id: categoryValue ? parseInt(categoryValue) : undefined,
      is_variable: variableCheck.checked,
      is_one_time: isOneTime,
      is_subscription: subscriptionCheck.checked,
      cancel_by_date: subscriptionCheck.checked && cancelDateInput.value ? cancelDateInput.value : undefined,
      is_income: incomeCheck.checked,
      is_auto_debit: autoDebitCheck.checked,
    };

    await options.onSubmit(data);
    close();
  };

  // Handle overlay click
  const onOverlayClick = (e: Event) => {
    if (e.target === modal) {
      close();
    }
  };

  // Event listeners
  form.addEventListener('submit', onSubmit);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', onOverlayClick);
  oneTimeCheck.addEventListener('change', toggleDateInput);

  return {
    open,
    close,
    destroy: () => {
      if (tomSelectInstance) {
        tomSelectInstance.destroy();
        tomSelectInstance = null;
      }
      form.removeEventListener('submit', onSubmit);
      closeBtn.removeEventListener('click', close);
      modal.removeEventListener('click', onOverlayClick);
      oneTimeCheck.removeEventListener('change', toggleDateInput);
      modal.remove();
    },
  };
}
