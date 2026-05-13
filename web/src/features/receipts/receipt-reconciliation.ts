import { store } from '@/store';
import { $ } from '@/shared/utils/dom';
import type { BankReceiptPreviewRow } from '@/api/experimental';

interface UpdateParams {
  allRows: BankReceiptPreviewRow[];
  selectedRows: BankReceiptPreviewRow[];
}

function fmt(n: number): string {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function createReconciliation(container: HTMLElement): {
  update(params: UpdateParams): void;
  show(): void;
  hide(): void;
  destroy(): void;
} {
  let lastParams: UpdateParams | null = null;
  let bankBalanceListener: ((e: Event) => void) | null = null;
  let inputEl: HTMLInputElement | null = null;

  function sumByType(rows: BankReceiptPreviewRow[], type: 'expense' | 'income'): number {
    return rows
      .filter(r => (type === 'income' ? r.type === 'income' : r.type !== 'income'))
      .reduce((s, r) => s + r.amount, 0);
  }

  function renderResult(projected: number): void {
    const resultEl = $('bankReceiptReconciliationResult');
    if (!resultEl) return;

    const bankInput = $<HTMLInputElement>('bankReceiptBankBalance');
    const rawVal = bankInput?.value?.trim() ?? '';

    if (!rawVal) {
      resultEl.innerHTML = `<span style="color:var(--text-secondary)">Введите баланс из банка для сверки</span>`;
      return;
    }

    const bankBalance = parseFloat(rawVal.replace(',', '.'));
    if (isNaN(bankBalance)) {
      resultEl.innerHTML = `<span style="color:var(--text-secondary)">Введите корректное число</span>`;
      return;
    }

    const discrepancy = projected - bankBalance;
    const abs = Math.abs(discrepancy);
    let icon: string;
    let color: string;

    if (abs < 0.01) {
      icon = '✅';
      color = 'var(--success,#27ae60)';
    } else if (abs < 100) {
      icon = '⚠️';
      color = 'var(--warning,#f39c12)';
    } else {
      icon = '❌';
      color = 'var(--danger,#e74c3c)';
    }

    const sign = discrepancy >= 0 ? '+' : '';
    resultEl.innerHTML = `<span style="color:${color}">${icon} Расхождение: <b>${sign}${fmt(discrepancy)} Br</b></span>`;
  }

  function update(params: UpdateParams): void {
    lastParams = params;

    const statsEl = $('bankReceiptReconciliationStats');
    if (!statsEl) return;

    const allExpenses = sumByType(params.allRows, 'expense');
    const allIncome = sumByType(params.allRows, 'income');
    const selectedExpenses = sumByType(params.selectedRows, 'expense');
    const selectedIncome = sumByType(params.selectedRows, 'income');
    const gap = allExpenses - selectedExpenses;

    const balanceData = store.get('balance');
    const appBalance = balanceData?.total_balance ?? 0;
    const projected = appBalance + selectedIncome - selectedExpenses;

    const selectedCount = params.selectedRows.filter(r => r.type !== 'income').length;
    const totalExpenseCount = params.allRows.filter(r => r.type !== 'income').length;

    statsEl.innerHTML = `
      <div style="line-height:1.7">
        <div>Итого по выписке: <b>−${fmt(allExpenses)} Br</b> расходов · <b>+${fmt(allIncome)} Br</b> доходов</div>
        <div>Покрыто импортом: <b>−${fmt(selectedExpenses)} Br</b> (${selectedCount} из ${totalExpenseCount} транзакций)</div>
        <div>Не покрыто: <b>${fmt(gap)} Br</b></div>
      </div>
      <div style="margin-top:12px;display:flex;gap:16px;flex-wrap:wrap;align-items:baseline">
        <span>Баланс в приложении: <b>${fmt(appBalance)} Br</b></span>
        <span>→ Прогноз: <b>${fmt(projected)} Br</b></span>
      </div>
      <div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <label for="bankReceiptBankBalance">Баланс в банке:</label>
        <input type="number" id="bankReceiptBankBalance" step="0.01" placeholder="0.00" style="width:140px" class="form-control form-control-sm" />
      </div>
      <div id="bankReceiptReconciliationResult" style="margin-top:10px"></div>
    `;

    inputEl = $<HTMLInputElement>('bankReceiptBankBalance');
    if (inputEl && !bankBalanceListener) {
      bankBalanceListener = () => {
        if (!lastParams) return;
        const selExp = sumByType(lastParams.selectedRows, 'expense');
        const selInc = sumByType(lastParams.selectedRows, 'income');
        const bal = store.get('balance')?.total_balance ?? 0;
        renderResult(bal + selInc - selExp);
      };
      inputEl.addEventListener('input', bankBalanceListener);
    }

    renderResult(projected);
  }

  function show(): void {
    container.style.display = '';
  }

  function hide(): void {
    container.style.display = 'none';
  }

  function destroy(): void {
    if (inputEl && bankBalanceListener) {
      inputEl.removeEventListener('input', bankBalanceListener);
    }
    bankBalanceListener = null;
    inputEl = null;
    lastParams = null;
    container.innerHTML = '';
  }

  return { update, show, hide, destroy };
}
