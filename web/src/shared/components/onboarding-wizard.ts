/**
 * Onboarding Wizard — пошаговая настройка для новых пользователей
 * Показывается когда нет транзакций и не было dismissed ранее
 */
import api from '@/api/client';
import { toast } from '@/shared/components/toast';

const STORAGE_KEY = 'onboarding_dismissed';
const CURRENCIES = ['BYN', 'RUB', 'USD', 'EUR', 'PLN'];

type Step = 'welcome' | 'account' | 'income' | 'done';

interface WizardState {
  step: Step;
  accountName: string;
  currency: string;
  balance: number;
  monthlySalary: number;
}

export function shouldShowOnboarding(totalTransactions: number, totalBalance: number): boolean {
  if (localStorage.getItem(STORAGE_KEY)) return false;
  return totalTransactions === 0 && totalBalance === 0;
}

export function dismissOnboarding(): void {
  localStorage.setItem(STORAGE_KEY, '1');
}

export function createOnboardingWizard(onComplete: () => void): void {
  if (document.getElementById('onboardingWizard')) return;

  const state: WizardState = {
    step: 'welcome',
    accountName: 'Основной счёт',
    currency: 'BYN',
    balance: 0,
    monthlySalary: 0,
  };

  const overlay = document.createElement('div');
  overlay.id = 'onboardingWizard';
  overlay.className = 'onboarding-overlay';

  const render = () => {
    overlay.innerHTML = `
      <div class="onboarding-modal">
        ${renderStep(state)}
      </div>
    `;
    bindEvents();
  };

  const bindEvents = () => {
    overlay.querySelector('.ob-skip')?.addEventListener('click', () => {
      dismissOnboarding();
      overlay.remove();
      onComplete();
    });

    overlay.querySelector('.ob-next')?.addEventListener('click', async () => {
      await handleNext();
    });

    overlay.querySelector('.ob-prev')?.addEventListener('click', () => {
      state.step = state.step === 'income' ? 'account' : 'welcome';
      render();
    });
  };

  const handleNext = async () => {
    if (state.step === 'welcome') {
      state.step = 'account';
      render();
      return;
    }

    if (state.step === 'account') {
      const nameEl = overlay.querySelector<HTMLInputElement>('#obAccountName');
      const currEl = overlay.querySelector<HTMLSelectElement>('#obCurrency');
      const balEl = overlay.querySelector<HTMLInputElement>('#obBalance');
      state.accountName = nameEl?.value.trim() || 'Основной счёт';
      state.currency = currEl?.value || 'BYN';
      state.balance = parseFloat(balEl?.value || '0') || 0;
      state.step = 'income';
      render();
      return;
    }

    if (state.step === 'income') {
      const salaryEl = overlay.querySelector<HTMLInputElement>('#obSalary');
      state.monthlySalary = parseFloat(salaryEl?.value || '0') || 0;

      const btn = overlay.querySelector<HTMLButtonElement>('.ob-next');
      if (btn) { btn.disabled = true; btn.textContent = 'Настраиваем…'; }

      try {
        await applyOnboarding(state);
        state.step = 'done';
        render();
      } catch (e) {
        toast.error('Ошибка настройки. Попробуйте позже.');
        if (btn) { btn.disabled = false; btn.textContent = 'Готово'; }
      }
      return;
    }

    if (state.step === 'done') {
      dismissOnboarding();
      overlay.remove();
      onComplete();
    }
  };

  document.body.appendChild(overlay);
  render();
}

async function applyOnboarding(state: WizardState): Promise<void> {
  const accounts = await api.getBalance();
  let accountId: number;

  if (accounts.accounts.length === 0) {
    const created = await api.createAccount({ name: state.accountName });
    accountId = created.id;
  } else {
    accountId = accounts.accounts[0].id;
  }

  if (state.balance > 0) {
    const today = new Date().toISOString().slice(0, 10);
    await api.createTransaction({
      date: today,
      amount: state.balance,
      currency: state.currency as 'BYN' | 'RUB' | 'USD' | 'EUR' | 'PLN',
      type: 'income',
      account_id: accountId,
      description: 'Начальный баланс',
    });
  }

  if (state.monthlySalary > 0) {
    const today = new Date().toISOString().slice(0, 10);
    await api.createTransaction({
      date: today,
      amount: state.monthlySalary,
      currency: state.currency as 'BYN' | 'RUB' | 'USD' | 'EUR' | 'PLN',
      type: 'income',
      account_id: accountId,
      description: 'Зарплата (начальная)',
    });
  }
}

function renderStep(state: WizardState): string {
  const stepDots = (current: number) =>
    `<div class="ob-dots">${[1, 2, 3].map(i =>
      `<span class="ob-dot${i === current ? ' active' : ''}"></span>`).join('')}</div>`;

  if (state.step === 'welcome') {
    return `
      <div class="ob-header">
        <div class="ob-emoji">👋</div>
        <h2>Добро пожаловать!</h2>
        <p class="ob-sub">Давайте настроим приложение за 2 минуты</p>
      </div>
      <div class="ob-body">
        <ul class="ob-features">
          <li>🏦 Счёт и начальный баланс</li>
          <li>💰 Ваш ежемесячный доход</li>
          <li>📊 Готово к учёту финансов</li>
        </ul>
      </div>
      <div class="ob-footer">
        ${stepDots(1)}
        <div class="ob-actions">
          <button class="btn btn-text ob-skip">Пропустить</button>
          <button class="btn btn-primary ob-next">Начать →</button>
        </div>
      </div>
    `;
  }

  if (state.step === 'account') {
    return `
      <div class="ob-header">
        <div class="ob-emoji">🏦</div>
        <h2>Ваш счёт</h2>
        <p class="ob-sub">Укажите название, валюту и текущий баланс</p>
      </div>
      <div class="ob-body">
        <div class="form-group">
          <label>Название счёта</label>
          <input id="obAccountName" class="form-control" type="text" value="${escHtml(state.accountName)}" placeholder="Основной счёт" maxlength="50">
        </div>
        <div class="form-group">
          <label>Валюта</label>
          <select id="obCurrency" class="form-control">
            ${CURRENCIES.map(c => `<option value="${c}"${c === state.currency ? ' selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Текущий баланс</label>
          <input id="obBalance" class="form-control" type="number" step="0.01" min="0"
            value="${state.balance || ''}" placeholder="0.00">
        </div>
      </div>
      <div class="ob-footer">
        ${stepDots(2)}
        <div class="ob-actions">
          <button class="btn btn-secondary ob-prev">← Назад</button>
          <button class="btn btn-primary ob-next">Далее →</button>
        </div>
      </div>
    `;
  }

  if (state.step === 'income') {
    return `
      <div class="ob-header">
        <div class="ob-emoji">💰</div>
        <h2>Ежемесячный доход</h2>
        <p class="ob-sub">Укажите примерную сумму дохода (необязательно)</p>
      </div>
      <div class="ob-body">
        <div class="form-group">
          <label>Зарплата / доход в месяц (${state.currency})</label>
          <input id="obSalary" class="form-control" type="number" step="0.01" min="0"
            value="${state.monthlySalary || ''}" placeholder="0.00">
          <div class="form-hint">Будет добавлена как первая транзакция дохода</div>
        </div>
      </div>
      <div class="ob-footer">
        ${stepDots(3)}
        <div class="ob-actions">
          <button class="btn btn-secondary ob-prev">← Назад</button>
          <button class="btn btn-primary ob-next">Готово</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="ob-header">
      <div class="ob-emoji">🎉</div>
      <h2>Всё готово!</h2>
      <p class="ob-sub">Аккаунт настроен. Начните вести учёт прямо сейчас.</p>
    </div>
    <div class="ob-body">
      <div class="ob-done-list">
        <div class="ob-done-item">✅ Счёт создан</div>
        ${state.monthlySalary > 0 ? '<div class="ob-done-item">✅ Доход добавлен</div>' : ''}
        <div class="ob-done-item">✅ Готов к работе</div>
      </div>
    </div>
    <div class="ob-footer">
      <div class="ob-actions" style="justify-content:center">
        <button class="btn btn-primary ob-next">Перейти к дашборду 🚀</button>
      </div>
    </div>
  `;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
