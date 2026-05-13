/**
 * Global application state management
 */
import type { CategoryWithSubs, AccountItem, Settings, PaymentReminder } from '@/types';

export interface IncomeTypeItem {
  id: number;
  code: string;
  label: string;
  icon: string;
  default_currency: string;
  sort_order: number;
  is_salary_related: boolean;
}

export interface BalanceData {
  accounts: AccountItem[];
  total_balance: number;
}

// State types
interface AppState {
  categories: CategoryWithSubs[];
  currencyRates: Record<string, number>;
  currentTab: string;
  account: BalanceData | null;
  settings: Settings | null;
  isLoading: boolean;
  incomeTypes: IncomeTypeItem[];
  experimentalFeatures: string[];
  balance: BalanceData | null;
  reminders: PaymentReminder[] | null;
  me?: { id: number; email: string; name: string; experimental_features?: string[] };
  telegramLinked: boolean;
}

// Initial state
const initialState: AppState = {
  categories: [],
  currencyRates: { BYN: 1, RUB: 0.034, EUR: 3.55, USD: 3.25 },
  currentTab: 'dashboard',
  account: null,
  settings: null,
  isLoading: false,
  incomeTypes: [],
  experimentalFeatures: [],
  balance: null,
  reminders: null,
  me: undefined,
  telegramLinked: false,
};

// State store
class Store {
  private state: AppState = { ...initialState };
  private listeners: Map<string, Set<() => void>> = new Map();

  get<K extends keyof AppState>(key: K): AppState[K] {
    return this.state[key];
  }

  set<K extends keyof AppState>(key: K, value: AppState[K]): void {
    this.state[key] = value;
    this.notify(key);
  }

  update<K extends keyof AppState>(key: K, updater: (prev: AppState[K]) => AppState[K]): void {
    this.state[key] = updater(this.state[key]);
    this.notify(key);
  }

  subscribe(key: string, listener: () => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);
    return () => this.listeners.get(key)?.delete(listener);
  }

  private notify(key: string): void {
    this.listeners.get(key)?.forEach(listener => listener());
    this.listeners.get('*')?.forEach(listener => listener());
  }

  // Helper methods
  getCurrencyRate(currency: string): number {
    return this.state.currencyRates[currency] || 1;
  }

  convertToBYN(amount: number, currency: string): number {
    return amount * this.getCurrencyRate(currency);
  }

  /** Подпись типа: доходы из incomeTypes (БД), системные — expense/savings/savings_withdrawal/correction/transfer */
  getTypeLabel(type: string): string {
    const system: Record<string, string> = {
      expense: '💴 Расход',
      savings: '🏦 В копилку',
      savings_withdrawal: '💸 Снято с копилки',
      correction: '⚖️ Сверка',
      transfer: '↔️ Перевод',
    };
    if (system[type]) return system[type];
    const t = this.state.incomeTypes.find(x => x.code === type);
    if (t) return `${t.icon} ${t.label}`;
    return `📦 ${type}`;
  }
}

export const store = new Store();
export default store;
