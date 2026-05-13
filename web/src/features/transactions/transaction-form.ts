/**
 * Transaction Form Component
 */
import { formatMoney, getToday } from '@/shared/utils/format';
import { debounce } from '@/shared/utils/dom';
import { store } from '@/store';
import { api } from '@/api/client';
import type { CategoryWithSubs, RecurringPayment, Currency } from '@/types';

// Tom Select type declaration
declare const TomSelect: any;

// Fixed types (not configurable)
const FIXED_TYPES = {
  expense: [{ value: 'expense', label: '💴 Расход', currency: 'BYN' as Currency }],
  savings: [
    { value: 'savings', label: '🏦 В копилку', currency: 'BYN' as Currency },
    { value: 'savings_withdrawal', label: '💸 Снять с копилки', currency: 'BYN' as Currency },
  ],
  transfer: [{ value: 'transfer', label: '↔️ Перевод', currency: 'BYN' as Currency }],
};

function getTransactionTypes(): { income: { value: string; label: string; currency: Currency }[]; expense: typeof FIXED_TYPES.expense; savings: typeof FIXED_TYPES.savings; transfer: typeof FIXED_TYPES.transfer } {
  const incomeTypes = store.get('incomeTypes') || [];
  const income = incomeTypes.map(t => ({
    value: t.code,
    label: `${t.icon} ${t.label}`,
    currency: (t.default_currency || 'BYN') as Currency,
  }));
  return { income, expense: FIXED_TYPES.expense, savings: FIXED_TYPES.savings, transfer: FIXED_TYPES.transfer };
}

const CURRENCIES: Currency[] = ['BYN', 'RUB', 'EUR', 'USD'];

export interface TransactionSplitData {
  category_id: number;
  amount: number;
  description?: string;
}

export interface TransactionFormData {
  date: string;
  amount: number;
  currency: string;
  type: string;
  category_id?: number;
  recurring_payment_id?: number;
  goal_id?: number;
  account_id?: number;
  transfer_to_account_id?: number;
  description: string;
  splits?: TransactionSplitData[];
  category_name?: string;
}

export interface GoalItem {
  id: number;
  name: string;
  target_amount: number;
  currency?: string;
  target_date: string;
}

export interface AccountItem {
  id: number;
  name: string;
  balance: number;
}

export interface TransactionFormOptions {
  onSubmit: (data: TransactionFormData) => Promise<void>;
  onLoadCategories?: () => Promise<CategoryWithSubs[]>;
  onLoadPayments?: () => Promise<RecurringPayment[]>;
  onLoadGoals?: () => Promise<GoalItem[]>;
  onLoadAccounts?: () => Promise<AccountItem[]>;
}

export function createTransactionForm(
  container: HTMLElement,
  options: TransactionFormOptions
): {
  reset: () => void;
  setType: (type: string) => void;
  setTypeAndAmount: (type: string, amount: number) => void;
  setCategories: (categories: CategoryWithSubs[]) => void;
  setPayments: (payments: RecurringPayment[]) => void;
  destroy: () => void;
} {
  let categories: CategoryWithSubs[] = [];
  let payments: RecurringPayment[] = [];
  let goals: GoalItem[] = [];
  let accounts: AccountItem[] = [];

  const TRANSACTION_TYPES = getTransactionTypes();

  // Create form HTML
  const wrapper = document.createElement('div');
  wrapper.className = 'card';
  wrapper.innerHTML = `
    <div class="card-header">
      <h3>➕ Новая операция</h3>
    </div>
    <form class="form transaction-form">
      <div class="form-row">
        <div class="form-group">
          <label>Тип</label>
          <select class="tx-type">
            <optgroup label="Доходы">
              ${TRANSACTION_TYPES.income.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
            </optgroup>
            <optgroup label="Расходы">
              ${TRANSACTION_TYPES.expense.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
            </optgroup>
            <optgroup label="Накопления">
              ${TRANSACTION_TYPES.savings.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
            </optgroup>
            <optgroup label="Переводы">
              ${TRANSACTION_TYPES.transfer.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
            </optgroup>
          </select>
        </div>
        <div class="form-group">
          <label>Дата</label>
          <input type="date" class="tx-date" required>
        </div>
      </div>

      <div class="form-group category-group" style="display: none;">
        <div class="category-label-row">
          <label>Категория</label>
          <button type="button" class="btn-text tx-split-toggle" title="Разделить расход по категориям">📊 Разделить</button>
        </div>
        <select class="tx-category" placeholder="Поиск категории...">
          <option value="">Без категории</option>
        </select>
      </div>

      <div class="form-group payment-group" style="display: none;">
        <label>Плановый платёж</label>
        <select class="tx-payment">
          <option value="">— Обычный расход —</option>
        </select>
        <small class="hint">Выберите если это оплата планового платежа</small>
      </div>

      <div class="form-group goal-group" style="display: none;">
        <label>Цель</label>
        <select class="tx-goal" required>
          <option value="">Выберите цель</option>
        </select>
        <small class="hint">В какую копилку положить или снять</small>
      </div>

      <div class="form-group savings-account-group" style="display: none;">
        <label class="savings-account-label">На счёт</label>
        <select class="tx-savings-account">
          <option value="">Основной</option>
        </select>
        <small class="hint savings-account-hint">Куда зачислить снятые средства</small>
      </div>

      <div class="form-group account-group" style="display: none;">
        <label>Счёт</label>
        <select class="tx-account">
          <option value="">Основной</option>
        </select>
      </div>

      <div class="form-group transfer-group" style="display: none;">
        <label>Со счёта</label>
        <select class="tx-transfer-from">
          <option value="">Выберите счёт</option>
        </select>
        <label class="mt-2">На счёт</label>
        <select class="tx-transfer-to">
          <option value="">Выберите счёт</option>
        </select>
      </div>

      <div class="form-group">
        <label>Сумма</label>
        <div class="input-with-currency">
          <input type="number" class="tx-amount" placeholder="0" step="0.01" required>
          <select class="tx-currency">
            ${CURRENCIES.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <small class="conversion-hint hint"></small>
      </div>

      <div class="split-section" style="display:none">
        <div class="split-header">
          <label>📊 Разделение по категориям</label>
          <button type="button" class="btn-text split-add-btn">+ Добавить</button>
        </div>
        <div class="split-rows"></div>
        <small class="split-remaining hint"></small>
      </div>

      <div class="form-group">
        <label>Описание</label>
        <input type="text" class="tx-description" placeholder="Комментарий (опционально)">
        <small class="category-suggestion hint" style="display:none; cursor:pointer; color:var(--primary)"></small>
      </div>

      <button type="submit" class="btn btn-primary btn-block">Добавить</button>
    </form>
  `;

  container.appendChild(wrapper);

  // Get elements
  const form = wrapper.querySelector('form')!;
  const typeSelect = wrapper.querySelector<HTMLSelectElement>('.tx-type')!;
  const dateInput = wrapper.querySelector<HTMLInputElement>('.tx-date')!;
  const categoryGroup = wrapper.querySelector<HTMLElement>('.category-group')!;
  const categorySelectEl = wrapper.querySelector<HTMLSelectElement>('.tx-category')!;
  const paymentGroup = wrapper.querySelector<HTMLElement>('.payment-group')!;
  const paymentSelect = wrapper.querySelector<HTMLSelectElement>('.tx-payment')!;
  const goalGroup = wrapper.querySelector<HTMLElement>('.goal-group')!;
  const goalSelect = wrapper.querySelector<HTMLSelectElement>('.tx-goal')!;
  const accountGroup = wrapper.querySelector<HTMLElement>('.account-group')!;
  const accountSelect = wrapper.querySelector<HTMLSelectElement>('.tx-account')!;
  const savingsAccountSelect = wrapper.querySelector<HTMLSelectElement>('.tx-savings-account')!;
  const transferGroup = wrapper.querySelector<HTMLElement>('.transfer-group')!;
  const transferFromSelect = wrapper.querySelector<HTMLSelectElement>('.tx-transfer-from')!;
  const transferToSelect = wrapper.querySelector<HTMLSelectElement>('.tx-transfer-to')!;
  const amountInput = wrapper.querySelector<HTMLInputElement>('.tx-amount')!;
  const currencySelect = wrapper.querySelector<HTMLSelectElement>('.tx-currency')!;
  const conversionHint = wrapper.querySelector<HTMLElement>('.conversion-hint')!;
  const descInput = wrapper.querySelector<HTMLInputElement>('.tx-description')!;

  // Split transaction state
  let splitEnabled = false;
  const splitSection = wrapper.querySelector<HTMLElement>('.split-section')!;
  const splitRowsContainer = wrapper.querySelector<HTMLElement>('.split-rows')!;
  const splitRemainingEl = wrapper.querySelector<HTMLElement>('.split-remaining')!;
  const splitToggleBtn = wrapper.querySelector<HTMLButtonElement>('.tx-split-toggle')!;
  const splitAddBtn = wrapper.querySelector<HTMLButtonElement>('.split-add-btn')!;

  const toggleSplit = () => {
    splitEnabled = !splitEnabled;
    splitSection.style.display = splitEnabled ? 'block' : 'none';
    splitToggleBtn.textContent = splitEnabled ? '✕ Отменить разделение' : '📊 Разделить';
    if (splitEnabled && splitRowsContainer.children.length === 0) {
      addSplitRow();
      addSplitRow();
    }
    if (!splitEnabled) {
      splitRowsContainer.innerHTML = '';
    }
  };

  const buildCategoryOptionsHtml = (): string => {
    let html = '<option value="">Без категории</option>';
    for (const cat of categories) {
      if (cat.subcategories?.length) {
        for (const sub of cat.subcategories) {
          html += `<option value="${sub.id}">${sub.icon || cat.icon || ''} ${cat.name} → ${sub.name}</option>`;
        }
      } else {
        html += `<option value="${cat.id}">${cat.icon || ''} ${cat.name}</option>`;
      }
    }
    return html;
  };

  const addSplitRow = () => {
    const row = document.createElement('div');
    row.className = 'split-row';
    row.innerHTML = `
      <select class="split-category">${buildCategoryOptionsHtml()}</select>
      <input type="number" class="split-amount" placeholder="Сумма" step="0.01" min="0">
      <input type="text" class="split-desc" placeholder="Описание">
      <button type="button" class="btn-icon split-remove" title="Убрать">✕</button>
    `;
    row.querySelector('.split-remove')?.addEventListener('click', () => {
      row.remove();
      updateSplitRemaining();
    });
    row.querySelector('.split-amount')?.addEventListener('input', updateSplitRemaining);
    splitRowsContainer.appendChild(row);
    updateSplitRemaining();
  };

  const updateSplitRemaining = () => {
    const total = parseFloat(amountInput.value) || 0;
    let splitSum = 0;
    splitRowsContainer.querySelectorAll('.split-amount').forEach(input => {
      splitSum += parseFloat((input as HTMLInputElement).value) || 0;
    });
    const remaining = total - splitSum;
    splitRemainingEl.textContent = remaining === 0
      ? '✅ Сумма полностью распределена'
      : `Осталось распределить: ${formatMoney(remaining)}`;
    splitRemainingEl.style.color = remaining === 0 ? 'var(--success)' : remaining < 0 ? 'var(--danger)' : '';
  };

  const getSplits = (): TransactionSplitData[] => {
    const splits: TransactionSplitData[] = [];
    splitRowsContainer.querySelectorAll('.split-row').forEach(row => {
      const categoryId = parseInt((row.querySelector('.split-category') as HTMLSelectElement)?.value || '0');
      const amount = parseFloat((row.querySelector('.split-amount') as HTMLInputElement)?.value || '0');
      const description = (row.querySelector('.split-desc') as HTMLInputElement)?.value || '';
      if (categoryId && amount > 0) {
        splits.push({ category_id: categoryId, amount, description });
      }
    });
    return splits;
  };

  splitToggleBtn?.addEventListener('click', toggleSplit);
  splitAddBtn?.addEventListener('click', addSplitRow);

  // Set default date
  dateInput.value = getToday();

  // Initialize Tom Select for categories
  let tomSelect: any = null;
  if (typeof TomSelect !== 'undefined') {
    tomSelect = new TomSelect(categorySelectEl, {
      create: false,
      sortField: { field: 'text', direction: 'asc' },
      placeholder: 'Поиск категории...',
      render: {
        option: (data: any, _escape: any) => {
          return `<div class="option">${data.text}</div>`;
        },
        item: (data: any, _escape: any) => {
          return `<div class="item">${data.text}</div>`;
        },
      },
    });
  }

  // Update conversion hint
  const updateConversionHint = () => {
    const amount = parseFloat(amountInput.value) || 0;
    const currency = currencySelect.value;

    if (currency !== 'BYN' && amount > 0) {
      const byn = store.convertToBYN(amount, currency);
      conversionHint.textContent = '≈ ' + formatMoney(byn);
    } else {
      conversionHint.textContent = '';
    }
  };

  // Handle type change
  const onTypeChange = async () => {
    const type = typeSelect.value;
    const isExpense = type === 'expense';
    const isSavings = type === 'savings' || type === 'savings_withdrawal';
    const isTransfer = type === 'transfer';
    const isIncomeOrExpense = !isSavings && !isTransfer;

    categoryGroup.style.display = isExpense ? 'block' : 'none';
    paymentGroup.style.display = isExpense ? 'block' : 'none';
    goalGroup.style.display = isSavings ? 'block' : 'none';
    accountGroup.style.display = isIncomeOrExpense && accounts.length > 1 ? 'block' : 'none';
    transferGroup.style.display = isTransfer ? 'block' : 'none';

    if (isSavings && options.onLoadGoals) {
      goals = await options.onLoadGoals();
      populateGoals();
    }
    if ((isIncomeOrExpense || isTransfer || isSavings) && options.onLoadAccounts) {
      const res = await options.onLoadAccounts();
      accounts = res ?? [];
      populateAccounts();
      if (isTransfer) populateTransferSelects();
      if (isSavings) populateSavingsAccount();
    }

    const savingsAccountGroup = wrapper.querySelector<HTMLElement>('.savings-account-group')!;
    const savingsAccountLabel = wrapper.querySelector<HTMLElement>('.savings-account-label')!;
    const savingsAccountHint = wrapper.querySelector<HTMLElement>('.savings-account-hint')!;
    if (type === 'savings_withdrawal') {
      savingsAccountGroup.style.display = accounts.length > 1 ? 'block' : 'none';
      if (savingsAccountLabel) savingsAccountLabel.textContent = 'На счёт';
      if (savingsAccountHint) savingsAccountHint.textContent = 'Куда зачислить снятые средства';
    } else if (type === 'savings') {
      savingsAccountGroup.style.display = accounts.length > 1 ? 'block' : 'none';
      if (savingsAccountLabel) savingsAccountLabel.textContent = 'Со счёта';
      if (savingsAccountHint) savingsAccountHint.textContent = 'С какого счёта списать';
    } else {
      savingsAccountGroup.style.display = 'none';
    }

    // Set default currency based on type
    const types = getTransactionTypes();
    const typeConfig = [...types.income, ...types.expense, ...types.savings, ...types.transfer]
      .find(t => t.value === type);
    if (typeConfig) {
      currencySelect.value = typeConfig.currency;
    }

    // Load payments for expense type
    if (isExpense && options.onLoadPayments) {
      payments = await options.onLoadPayments();
      populatePayments();
    }

    paymentSelect.value = '';
    goalSelect.value = '';
    goalSelect.required = isSavings && goals.length > 0;
    updateConversionHint();
  };

  const populateAccounts = () => {
    accountSelect.innerHTML = '<option value="">Основной</option>';
    for (const a of accounts) {
      const opt = document.createElement('option');
      opt.value = String(a.id);
      opt.textContent = `${a.name} (${a.balance.toFixed(2)} Br)`;
      accountSelect.appendChild(opt);
    }
  };

  const populateSavingsAccount = () => {
    const sel = wrapper.querySelector<HTMLSelectElement>('.tx-savings-account')!;
    sel.innerHTML = '<option value="">Основной</option>';
    for (const a of accounts) {
      const opt = document.createElement('option');
      opt.value = String(a.id);
      opt.textContent = `${a.name} (${a.balance.toFixed(2)} Br)`;
      sel.appendChild(opt);
    }
  };

  const populateTransferSelects = () => {
    transferFromSelect.innerHTML = '<option value="">Выберите счёт</option>';
    transferToSelect.innerHTML = '<option value="">Выберите счёт</option>';
    for (const a of accounts) {
      const opt1 = document.createElement('option');
      opt1.value = String(a.id);
      opt1.textContent = `${a.name} (${a.balance.toFixed(2)} Br)`;
      transferFromSelect.appendChild(opt1);
      const opt2 = document.createElement('option');
      opt2.value = String(a.id);
      opt2.textContent = `${a.name} (${a.balance.toFixed(2)} Br)`;
      transferToSelect.appendChild(opt2);
    }
  };

  // Populate goals
  const populateGoals = () => {
    goalSelect.innerHTML = '<option value="">Выберите цель</option>';
    for (const g of goals) {
      const opt = document.createElement('option');
      opt.value = String(g.id);
      opt.textContent = `${g.name} (${g.target_amount} ${g.currency || 'BYN'})`;
      goalSelect.appendChild(opt);
    }
    if (goals.length === 0) {
      const hint = document.createElement('option');
      hint.value = '';
      hint.textContent = '— Нет целей. Создайте в разделе Бюджет —';
      hint.disabled = true;
      goalSelect.appendChild(hint);
    }
    goalSelect.required = goals.length > 0;
  };

  // Populate categories
  const populateCategories = () => {
    // Clear existing options
    if (tomSelect) {
      tomSelect.clear();
      tomSelect.clearOptions();
      tomSelect.addOption({ value: '', text: 'Без категории' });
    } else {
      categorySelectEl.innerHTML = '<option value="">Без категории</option>';
    }

    for (const cat of categories) {
      if (cat.subcategories?.length) {
        for (const sub of cat.subcategories) {
          const text = `${sub.icon || cat.icon || ''} ${cat.name} → ${sub.name}`;
          if (tomSelect) {
            tomSelect.addOption({ value: String(sub.id), text: text.trim() });
          } else {
            const opt = document.createElement('option');
            opt.value = String(sub.id);
            opt.textContent = text.trim();
            categorySelectEl.appendChild(opt);
          }
        }
      } else {
        const text = `${cat.icon || ''} ${cat.name}`;
        if (tomSelect) {
          tomSelect.addOption({ value: String(cat.id), text: text.trim() });
        } else {
          const opt = document.createElement('option');
          opt.value = String(cat.id);
          opt.textContent = text.trim();
          categorySelectEl.appendChild(opt);
        }
      }
    }
  };

  // Populate payments
  const populatePayments = () => {
    paymentSelect.innerHTML = '<option value="">— Обычный расход —</option>';

    for (const p of payments) {
      const opt = document.createElement('option');
      opt.value = String(p.id);
      opt.textContent = `${p.name} (${p.is_variable ? '~' : ''}${formatMoney(p.amount)})`;
      opt.dataset.amount = String(p.original_amount || p.amount);
      opt.dataset.currency = p.currency || 'BYN';
      opt.dataset.name = p.name;
      opt.dataset.isVariable = String(p.is_variable);
      opt.dataset.categoryId = p.category_id ? String(p.category_id) : '';
      paymentSelect.appendChild(opt);
    }
  };

  // Handle payment selection
  const onPaymentSelect = () => {
    const option = paymentSelect.options[paymentSelect.selectedIndex];
    if (!option.value) return;

    const amount = parseFloat(option.dataset.amount || '0');
    const currency = option.dataset.currency || 'BYN';
    const name = option.dataset.name || '';
    const categoryId = option.dataset.categoryId || '';

    amountInput.value = amount.toFixed(2);
    currencySelect.value = currency;
    descInput.value = name;
    if (categoryId) {
      if (tomSelect) {
        tomSelect.setValue(categoryId);
      } else {
        categorySelectEl.value = categoryId;
      }
    }

    if (option.dataset.isVariable === 'true') {
      amountInput.focus();
      amountInput.select();
    }

    updateConversionHint();
  };

  // Handle submit
  const onSubmit = async (e: Event) => {
    e.preventDefault();

    const type = typeSelect.value;
    const categoryValue = tomSelect ? tomSelect.getValue() : categorySelectEl.value;
    const splits = splitEnabled ? getSplits() : undefined;
    const data: TransactionFormData = {
      date: dateInput.value || getToday(),
      amount: parseFloat(amountInput.value) || 0,
      currency: currencySelect.value,
      type,
      category_id: splits?.length ? undefined : (categoryValue ? parseInt(categoryValue) : undefined),
      recurring_payment_id: paymentSelect.value ? parseInt(paymentSelect.value) : undefined,
      goal_id: goalSelect.value ? parseInt(goalSelect.value) : undefined,
      account_id: accountSelect.value ? parseInt(accountSelect.value) : undefined,
      transfer_to_account_id: type === 'transfer' && transferToSelect.value ? parseInt(transferToSelect.value) : undefined,
      description: descInput.value,
      splits,
    };
    if (type === 'transfer') {
      data.account_id = transferFromSelect.value ? parseInt(transferFromSelect.value) : undefined;
    } else if (type === 'savings' || type === 'savings_withdrawal') {
      data.account_id = savingsAccountSelect?.value ? parseInt(savingsAccountSelect.value) : undefined;
    }

    await options.onSubmit(data);
  };

  // Category suggestion on description input
  const categorySuggestionEl = wrapper.querySelector<HTMLElement>('.category-suggestion')!;
  const suggestCategoryFromDescription = debounce(async () => {
    const desc = descInput.value.trim();
    const type = typeSelect.value;
    if (type !== 'expense' || desc.length < 3) {
      categorySuggestionEl.style.display = 'none';
      return;
    }
    try {
      const result = await api.suggestCategory(desc);
      if (result.suggestion) {
        const s = result.suggestion;
        categorySuggestionEl.textContent = `${s.category_icon} Подсказка: ${s.category_name}`;
        categorySuggestionEl.style.display = 'block';
        categorySuggestionEl.onclick = () => {
          if (tomSelect) {
            tomSelect.setValue(String(s.category_id));
          } else {
            categorySelectEl.value = String(s.category_id);
          }
          categorySuggestionEl.style.display = 'none';
        };
      } else {
        categorySuggestionEl.style.display = 'none';
      }
    } catch {
      categorySuggestionEl.style.display = 'none';
    }
  }, 400);

  // Event listeners
  typeSelect.addEventListener('change', onTypeChange);
  currencySelect.addEventListener('change', updateConversionHint);
  amountInput.addEventListener('input', () => {
    updateConversionHint();
    if (splitEnabled) updateSplitRemaining();
  });
  descInput.addEventListener('input', suggestCategoryFromDescription);
  paymentSelect.addEventListener('change', onPaymentSelect);
  form.addEventListener('submit', onSubmit);

  // Load initial categories
  if (options.onLoadCategories) {
    options.onLoadCategories().then(cats => {
      categories = cats;
      populateCategories();
    });
  }

  // Return API
  return {
    reset: () => {
      form.reset();
      dateInput.value = getToday();
      if (tomSelect) {
        tomSelect.clear();
      }
      onTypeChange();
    },
    setType: (type: string) => {
      typeSelect.value = type;
      onTypeChange();
    },
    setTypeAndAmount: (type: string, amount: number) => {
      typeSelect.value = type;
      amountInput.value = amount.toFixed(2);
      onTypeChange();
      updateConversionHint();
    },
    setCategories: (cats: CategoryWithSubs[]) => {
      categories = cats;
      populateCategories();
    },
    setPayments: (pmts: RecurringPayment[]) => {
      payments = pmts;
      populatePayments();
    },
    destroy: () => {
      typeSelect.removeEventListener('change', onTypeChange);
      currencySelect.removeEventListener('change', updateConversionHint);
      amountInput.removeEventListener('input', updateConversionHint);
      descInput.removeEventListener('input', suggestCategoryFromDescription);
      paymentSelect.removeEventListener('change', onPaymentSelect);
      form.removeEventListener('submit', onSubmit);
      if (tomSelect) {
        tomSelect.destroy();
      }
      wrapper.remove();
    },
  };
}
