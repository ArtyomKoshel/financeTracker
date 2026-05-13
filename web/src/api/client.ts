import type { IncomeTypeItem } from '@/store';
import type {
  APIResponse,
  Transaction,
  CategoryWithSubs,
  RecurringPayment,
  PaymentReminder,
  PaymentCalendar,
  DashboardData,
  AnalyticsData,
  CashflowRecommendation,
  BudgetPlan,
  MonthlyBudget,
  MonthSummary,
  Account,
  AccountItem,
  Settings,
  ValidationResult,
  Goal,
  CompletedGoal,
  CategoryBudget,
  BudgetWarning,
  YearlyAnalytics,
  MonthComparison,
  FinancialHealth,
  CategoryTrend,
  TransactionTemplate,
  CategorySuggestion,
  DetectedSubscription,
  NetWorthSnapshot,
  ForecastMonth,
  ForecastScenarios,
  GoalSavingsPlan,
  CalendarEvent,
  ParsedCalendarEvent,
  Note,
  NoteFolder,
  NoteLabel,
  SuggestNoteResponse,
  SearchResults,
  AiUsage,
  TaxSummary,
  EmailParsedTransaction,
} from '@/types';
import { offlineService } from '@/shared/services/offline.service';
import { syncService } from '@/shared/services/sync.service';

// Transaction result with optional budget warning
export interface TransactionResult {
  transaction: Transaction;
  budget_warning?: BudgetWarning;
}

/** Глобальный обработчик ошибок API (например, для toast) */
export type ApiErrorHandler = (error: Error, status?: number) => void;

const CACHEABLE_ENDPOINTS = new Set([
  '/bootstrap', '/dashboard', '/categories', '/income-types',
  '/payments', '/payments/reminders', '/budgets', '/budget/monthly',
  '/goals', '/goals/completed', '/goals/savings-plan', '/settings',
  '/rates', '/health', '/notes', '/notes/folders', '/notes/labels',
  '/debts', '/envelopes', '/accounts', '/balance', '/analytics',
  '/analytics/year', '/forecast', '/recommendations',
  '/transaction-templates', '/me',
]);

const MUTATION_DESCRIPTIONS: Record<string, string> = {
  'POST /transactions': 'Создание транзакции',
  'DELETE /transactions/:id': 'Удаление транзакции',
  'POST /payments': 'Создание платежа',
  'PUT /payments/:id': 'Обновление платежа',
  'DELETE /payments/:id': 'Удаление платежа',
  'POST /goals': 'Создание цели',
  'PUT /goals/:id': 'Обновление цели',
  'DELETE /goals/:id': 'Удаление цели',
  'POST /notes': 'Создание заметки',
  'PUT /notes': 'Обновление заметки',
  'DELETE /notes': 'Удаление заметки',
  'POST /calendar': 'Создание события',
  'PUT /calendar': 'Обновление события',
  'DELETE /calendar': 'Удаление события',
  'POST /categories': 'Создание категории',
  'POST /debts': 'Создание долга',
  'PUT /debts/:id': 'Обновление долга',
  'DELETE /debts/:id': 'Удаление долга',
  'POST /envelopes': 'Создание конверта',
  'PUT /envelopes/:id': 'Обновление конверта',
  'DELETE /envelopes/:id': 'Удаление конверта',
  'POST /settings': 'Обновление настроек',
  'POST /budgets': 'Обновление бюджета',
  'DELETE /budgets/:id': 'Удаление бюджета',
};

function getMutationDescription(method: string, endpoint: string): string {
  const base = endpoint.split('?')[0].replace(/\/\d+$/, '');
  return MUTATION_DESCRIPTIONS[`${method} ${base}`] ?? `${method} ${base}`;
}

function isCacheableEndpoint(endpoint: string): boolean {
  const base = endpoint.split('?')[0];
  return CACHEABLE_ENDPOINTS.has(base);
}

const QUEUEABLE_METHODS = new Set(['POST', 'PUT', 'DELETE']);
const NON_QUEUEABLE_ENDPOINTS = ['/auth/', '/push/', '/balance/sync', '/ai/', '/batch'];

function isQueueable(method: string, endpoint: string): boolean {
  if (!QUEUEABLE_METHODS.has(method)) return false;
  return !NON_QUEUEABLE_ENDPOINTS.some(p => endpoint.includes(p));
}

/**
 * Base API client with offline support
 */
class APIClient {
  private baseUrl = '/api';
  private onError: ApiErrorHandler | null = null;

  setErrorHandler(handler: ApiErrorHandler | null): void {
    this.onError = handler;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const method = (options.method ?? 'GET').toUpperCase();
    const url = `${this.baseUrl}${endpoint}`;
    
    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    // Offline: serve from cache for GET, queue mutations for writes
    if (!offlineService.isOnline) {
      if (method === 'GET') {
        return this.serveCached<T>(endpoint);
      }
      if (isQueueable(method, endpoint)) {
        await syncService.queueMutation(
          method,
          endpoint,
          options.body as string | null,
          getMutationDescription(method, endpoint),
        );
        const offlineErr = new Error('offline_queued');
        (offlineErr as Error & { offlineQueued: boolean }).offlineQueued = true;
        throw offlineErr;
      }
      throw new Error('Нет соединения с сервером');
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        redirect: 'manual',
      });

      if (response.status === 301 || response.status === 302) {
        const loc = response.headers.get('Location') ?? '';
        if (loc.includes('login') || loc.includes('Login')) {
          localStorage.removeItem('auth_token');
          window.location.href = '/login.html';
          throw new Error('Unauthorized');
        }
      }

      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        window.location.href = '/login.html';
        throw new Error('Unauthorized');
      }

      if (response.status === 429) {
        const err = new Error('Слишком много запросов. Подождите минуту.');
        this.onError?.(err, 429);
        throw err;
      }

      const text = await response.text();
      let result: APIResponse<T>;
      try {
        result = JSON.parse(text);
      } catch {
        const preview = text.slice(0, 200).replace(/\s+/g, ' ');
        const err = new Error(
          response.ok
            ? `Invalid response (not JSON): ${preview}`
            : `Server error ${response.status}: ${preview}`
        );
        this.onError?.(err, response.status);
        throw err;
      }

      if (!result.success) {
        const msg = result.error || (response.status >= 500 ? 'Ошибка сервера' : 'Unknown error');
        const err = new Error(msg);
        this.onError?.(err, response.status);
        throw err;
      }

      const data = result.data as T;

      if (method === 'GET' && isCacheableEndpoint(endpoint)) {
        void offlineService.cacheResponse(endpoint, data);
      }

      return data;
    } catch (err) {
      if ((err as Error).message === 'Unauthorized') throw err;

      if (err instanceof TypeError || (err as Error).message === 'Failed to fetch') {
        offlineService['setOnline'](false);

        if (method === 'GET') {
          return this.serveCached<T>(endpoint);
        }
        if (isQueueable(method, endpoint)) {
          await syncService.queueMutation(
            method,
            endpoint,
            options.body as string | null,
            getMutationDescription(method, endpoint),
          );
          const offlineErr = new Error('offline_queued');
          (offlineErr as Error & { offlineQueued: boolean }).offlineQueued = true;
          throw offlineErr;
        }
      }

      throw err;
    }
  }

  private async serveCached<T>(endpoint: string): Promise<T> {
    const cached = await offlineService.getCachedAnyAge<T>(endpoint);
    if (cached !== null) return cached;
    throw new Error('Нет соединения. Данные недоступны офлайн.');
  }

  // Bootstrap — один запрос вместо 5–7 при старте
  async getBootstrap(): Promise<{
    me: { id: number; email: string; name: string; experimental_features: string[] };
    balance: Account;
    accounts?: AccountItem[];
    total_balance?: number;
    categories: CategoryWithSubs[];
    income_types: IncomeTypeItem[];
    rates: { RUB: string; EUR: string; USD: string; updated: string };
    reminders: PaymentReminder[];
    theme?: string | null;
    telegram_linked?: boolean;
  }> {
    return this.request('/bootstrap');
  }

  // Dashboard
  async getDashboard(): Promise<DashboardData> {
    return this.request<DashboardData>('/dashboard');
  }

  // Transactions
  async getTransactions(page = 1, perPage = 50, filters: { month?: string; year?: string; type?: string; search?: string; source?: string; tag?: string } = {}): Promise<{ data: Transaction[]; meta: { total: number; page: number; per_page: number; last_page: number } }> {
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    if (filters.month) params.set('month', filters.month);
    if (filters.year) params.set('year', filters.year);
    if (filters.type) params.set('type', filters.type);
    if (filters.search) params.set('search', filters.search);
    if (filters.source) params.set('source', filters.source);
    if (filters.tag) params.set('tag', filters.tag);
    return this.request(`/transactions?${params.toString()}`);
  }

  async getTransactionsByMonth(month: string, page = 1, perPage = 100): Promise<{ data: Transaction[]; meta: { total: number; page: number; per_page: number; last_page: number } }> {
    return this.request(`/transactions/month?month=${encodeURIComponent(month)}&page=${page}&per_page=${perPage}`);
  }

  async createTransaction(data: {
    date: string;
    amount: number;
    currency?: string;
    type: string;
    category_id?: number;
    recurring_payment_id?: number;
    goal_id?: number;
    account_id?: number;
    transfer_to_account_id?: number;
    description?: string;
    month?: string;
    source?: string;
    splits?: Array<{ category_id: number; amount: number; description?: string }>;
  }): Promise<TransactionResult> {
    return this.request<TransactionResult>('/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteTransaction(id: number): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(`/transactions/${id}`, {
      method: 'DELETE',
    });
  }

  // Export CSV
  async exportTransactionsCsv(params?: { month?: string; year?: string; from?: string; to?: string; type?: string; search?: string; source?: string; tag?: string }): Promise<void> {
    const query = new URLSearchParams();
    if (params?.month)  query.set('month',  params.month);
    if (params?.year)   query.set('year',   params.year);
    if (params?.from)   query.set('from',   params.from);
    if (params?.to)     query.set('to',     params.to);
    if (params?.type)   query.set('type',   params.type);
    if (params?.search) query.set('search', params.search);
    if (params?.source) query.set('source', params.source);
    if (params?.tag)    query.set('tag',    params.tag);
    const url = `${this.baseUrl}/transactions/export?${query.toString()}`;
    const token = localStorage.getItem('auth_token');
    const response = await fetch(url, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = response.headers.get('Content-Disposition')?.match(/filename="?(.+?)"?$/)?.[1] || 'transactions.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  // Bulk operations
  async bulkDeleteTransactions(ids: number[]): Promise<{ deleted: number }> {
    return this.request<{ deleted: number }>('/transactions/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  async bulkUpdateTransactions(ids: number[], categoryId: number): Promise<{ updated: number }> {
    return this.request<{ updated: number }>('/transactions/bulk-update', {
      method: 'POST',
      body: JSON.stringify({ ids, category_id: categoryId }),
    });
  }

  // Transaction Templates
  async getTransactionTemplates(): Promise<TransactionTemplate[]> {
    return this.request<TransactionTemplate[]>('/transaction-templates');
  }

  async createTransactionTemplate(data: { name: string; type: string; amount?: number; currency?: string; category_id?: number; description?: string }): Promise<TransactionTemplate> {
    return this.request<TransactionTemplate>('/transaction-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTransactionTemplate(data: { id: number; name?: string; type?: string; amount?: number; currency?: string; category_id?: number; description?: string }): Promise<{ updated: boolean }> {
    const { id, ...rest } = data;
    return this.request<{ updated: boolean }>(`/transaction-templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(rest),
    });
  }

  async deleteTransactionTemplate(id: number): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(`/transaction-templates/${id}`, {
      method: 'DELETE',
    });
  }

  async validatePayment(amount: number, type: string): Promise<ValidationResult> {
    return this.request<ValidationResult>('/validate', {
      method: 'POST',
      body: JSON.stringify({ amount, type }),
    });
  }

  // Categories
  async getCategories(includeInactive = false): Promise<CategoryWithSubs[]> {
    const params = includeInactive ? '?include_inactive=true' : '';
    return this.request<CategoryWithSubs[]>(`/categories${params}`);
  }

  async createCategory(data: {
    name: string;
    parent_id?: number;
    icon?: string;
    color?: string;
  }): Promise<CategoryWithSubs> {
    return this.request<CategoryWithSubs>('/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCategory(data: {
    id: number;
    name: string;
    icon?: string;
    color?: string;
  }): Promise<CategoryWithSubs> {
    const { id, ...rest } = data;
    return this.request<CategoryWithSubs>(`/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(rest),
    });
  }

  async deleteCategory(id: number): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/categories/${id}`, {
      method: 'DELETE',
    });
  }

  async restoreCategory(id: number): Promise<{ status: string }> {
    return this.request<{ status: string }>('/categories/restore', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  }

  // Payments
  async getPayments(): Promise<RecurringPayment[]> {
    return this.request<RecurringPayment[]>('/payments');
  }

  async createPayment(data: {
    name: string;
    amount: number;
    currency?: string;
    day_of_month: number;
    due_date?: string;
    category?: string;
    category_id?: number;
    is_variable?: boolean;
    is_one_time?: boolean;
    is_subscription?: boolean;
    cancel_by_date?: string;
    is_income?: boolean;
    description?: string;
  }): Promise<RecurringPayment> {
    return this.request<RecurringPayment>('/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePayment(data: {
    id: number;
    name: string;
    amount: number;
    currency: string;
    day_of_month: number;
    due_date?: string;
    category: string;
    category_id?: number;
    is_variable?: boolean;
    is_one_time?: boolean;
    is_subscription?: boolean;
    is_auto_debit?: boolean;
    cancel_by_date?: string;
    is_income?: boolean;
    description?: string;
  }): Promise<RecurringPayment> {
    const { id, ...rest } = data;
    return this.request<RecurringPayment>(`/payments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(rest),
    });
  }

  async deletePayment(id: number): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(`/payments/${id}`, {
      method: 'DELETE',
    });
  }

  async getPaymentReminders(): Promise<PaymentReminder[]> {
    return this.request<PaymentReminder[]>('/payments/reminders');
  }

  async getSubscriptionReminders(): Promise<Array<{ payment: RecurringPayment; cancel_by_date: string; days_until: number }>> {
    return this.request('/payments/subscription-reminders');
  }

  async getPaymentCalendar(days = 60): Promise<PaymentCalendar> {
    return this.request<PaymentCalendar>(`/payments/calendar?days=${days}`);
  }

  async getPaymentCalendarByRange(from: string, to: string): Promise<PaymentCalendar> {
    return this.request<PaymentCalendar>(
      `/payments/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
  }

  // Budget
  async getCashflowRecommendation(): Promise<CashflowRecommendation> {
    return this.request<CashflowRecommendation>('/income-recommendation');
  }

  async getForecastLegacy(months = 3): Promise<ForecastMonth[]> {
    return this.request<ForecastMonth[]>(`/forecast?months=${months}`);
  }

  async getRecommendations(): Promise<Array<{ type: string; message: string; suggestion: string }>> {
    return this.request('/recommendations');
  }

  async getDebts(): Promise<Array<{
    id: number;
    name: string;
    total_amount: number;
    paid_amount: number;
    remaining: number;
    currency: string;
    due_date: string | null;
    monthly_payment: number | null;
    type: string;
    is_active: boolean;
  }>> {
    return this.request('/debts');
  }

  async createDebt(data: {
    name: string;
    total_amount: number;
    currency?: string;
    due_date?: string;
    monthly_payment?: number;
    type?: string;
  }): Promise<unknown> {
    return this.request('/debts', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateDebt(data: { id: number; paid_amount?: number; monthly_payment?: number; is_active?: boolean }): Promise<unknown> {
    const { id, ...rest } = data;
    return this.request(`/debts/${id}`, { method: 'PUT', body: JSON.stringify(rest) });
  }

  async deleteDebt(id: number): Promise<{ deleted: boolean }> {
    return this.request(`/debts/${id}`, { method: 'DELETE' });
  }

  async getEnvelopes(month?: string): Promise<Array<{
    id: number;
    name: string;
    allocated: number;
    spent: number;
    remaining: number;
    month: string;
    category_id: number | null;
  }>> {
    const params = month ? `?month=${encodeURIComponent(month)}` : '';
    return this.request(`/envelopes${params}`);
  }

  async createEnvelope(data: { name: string; allocated: number; month: string; category_id?: number }): Promise<unknown> {
    return this.request('/envelopes', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateEnvelope(data: { id: number; allocated?: number; spent?: number }): Promise<unknown> {
    const { id, ...rest } = data;
    return this.request(`/envelopes/${id}`, { method: 'PUT', body: JSON.stringify(rest) });
  }

  async deleteEnvelope(id: number): Promise<{ deleted: boolean }> {
    return this.request(`/envelopes/${id}`, { method: 'DELETE' });
  }

  async calculateBudgetPlan(income: number, type: string): Promise<BudgetPlan> {
    return this.request<BudgetPlan>('/budget-plan', {
      method: 'POST',
      body: JSON.stringify({ income, type }),
    });
  }

  async getMonthlyBudget(month?: string): Promise<MonthlyBudget> {
    const params = month ? `?month=${month}` : '';
    return this.request<MonthlyBudget>(`/budget/monthly${params}`);
  }

  async getMonthSummary(month?: string): Promise<MonthSummary> {
    const params = month ? `?month=${month}` : '';
    return this.request<MonthSummary>(`/month-summary${params}`);
  }

  // Analytics
  async getAnalytics(month?: string): Promise<AnalyticsData> {
    const params = month ? `?month=${month}` : '';
    return this.request<AnalyticsData>(`/analytics${params}`);
  }

  async getYearlyAnalytics(year?: number): Promise<YearlyAnalytics> {
    const params = year ? `?year=${year}` : '';
    return this.request<YearlyAnalytics>(`/analytics/year${params}`);
  }

  async compareMonths(month1: string, month2: string): Promise<MonthComparison> {
    return this.request<MonthComparison>(`/analytics/compare?month1=${month1}&month2=${month2}`);
  }

  async getCategoryTrend(categoryId: number, months?: number): Promise<CategoryTrend> {
    const monthsParam = months ? `&months=${months}` : '';
    return this.request<CategoryTrend>(`/analytics/trends?category_id=${categoryId}${monthsParam}`);
  }

  // Account / Balance
  async getBalance(): Promise<{ accounts: AccountItem[]; total_balance: number }> {
    return this.request<{ accounts: AccountItem[]; total_balance: number }>('/balance');
  }

  async getAccounts(): Promise<{ accounts: AccountItem[]; total_balance: number }> {
    return this.request<{ accounts: AccountItem[]; total_balance: number }>('/accounts');
  }

  async createAccount(data: { name: string }): Promise<AccountItem> {
    return this.request<AccountItem>('/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAccount(data: { id: number; name?: string; sort_order?: number }): Promise<AccountItem> {
    const { id, ...rest } = data;
    return this.request<AccountItem>(`/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(rest),
    });
  }

  async deleteAccount(id: number): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(`/accounts/${id}`, {
      method: 'DELETE',
    });
  }

  async setInitialBalance(balance: number): Promise<Account> {
    return this.request<Account>('/balance', {
      method: 'POST',
      body: JSON.stringify({ balance }),
    });
  }

  async syncBalance(actualBalance: number, accountId?: number): Promise<{ account: Account; difference: number }> {
    return this.request<{ account: Account; difference: number }>('/balance/sync', {
      method: 'POST',
      body: JSON.stringify({ actual_balance: actualBalance, account_id: accountId }),
    });
  }

  // AI Usage (Groq rate limits)
  async getAiUsage(): Promise<AiUsage> {
    return this.request<AiUsage>('/ai/usage');
  }

  async refreshAiUsage(): Promise<AiUsage> {
    return this.request<AiUsage>('/ai/usage/refresh', { method: 'POST' });
  }

  // Settings
  async getSettings(): Promise<Settings> {
    return this.request<Settings>('/settings');
  }

  async updateSettings(settings: Record<string, string>): Promise<{ updated: boolean }> {
    return this.request<{ updated: boolean }>('/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }

  // Rates
  async getRates(): Promise<{
    RUB: string;
    EUR: string;
    USD: string;
    updated: string;
  }> {
    return this.request('/rates');
  }

  async updateRatesFromNBRB(): Promise<{
    rates: Record<string, number>;
    updated: string;
  }> {
    return this.request('/rates/update', { method: 'POST' });
  }

  async getRatesAtDate(date: string): Promise<{
    RUB: string;
    EUR: string;
    USD: string;
    updated: string;
  }> {
    return this.request(`/rates/at-date?date=${encodeURIComponent(date)}`);
  }

  // Goals
  async getGoals(): Promise<Goal[]> {
    return this.request('/goals');
  }

  async createGoal(data: {
    name: string;
    target_amount: number;
    target_date: string;
    currency?: string;
  }): Promise<Goal> {
    return this.request<Goal>('/goals', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateGoal(data: {
    id: number;
    name?: string;
    target_amount?: number;
    target_date?: string;
    currency?: string;
    is_active?: boolean;
  }): Promise<Goal> {
    const { id, ...rest } = data;
    return this.request<Goal>(`/goals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(rest),
    });
  }

  async deleteGoal(id: number): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(`/goals/${id}`, {
      method: 'DELETE',
    });
  }

  async getCompletedGoals(): Promise<CompletedGoal[]> {
    return this.request<CompletedGoal[]>('/goals/completed');
  }

  // Income Types (configurable transaction types)
  async getIncomeTypes(): Promise<IncomeTypeItem[]> {
    return this.request<IncomeTypeItem[]>('/income-types');
  }

  async createIncomeType(data: {
    code: string;
    label: string;
    icon?: string;
    default_currency?: string;
    sort_order?: number;
    is_salary_related?: boolean;
  }): Promise<IncomeTypeItem> {
    return this.request<IncomeTypeItem>('/income-types', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateIncomeType(data: {
    id: number;
    code?: string;
    label?: string;
    icon?: string;
    default_currency?: string;
    sort_order?: number;
    is_salary_related?: boolean;
  }): Promise<IncomeTypeItem> {
    const { id, ...rest } = data;
    return this.request<IncomeTypeItem>(`/income-types/${id}`, {
      method: 'PUT',
      body: JSON.stringify(rest),
    });
  }

  async deleteIncomeType(id: number): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(`/income-types/${id}`, {
      method: 'DELETE',
    });
  }

  // Category Budgets
  async getCategoryBudgets(month?: string): Promise<CategoryBudget[]> {
    const params = month ? `?month=${month}` : '';
    return this.request<CategoryBudget[]>(`/budgets${params}`);
  }

  async setCategoryBudget(data: {
    id?: number;
    category_id?: number;
    month?: string;
    limit_amount: number;
    alert_percent?: number;
    is_recurring?: boolean;
    is_essential?: boolean;
  }): Promise<CategoryBudget> {
    return this.request<CategoryBudget>('/budgets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteCategoryBudget(id: number): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/budgets/${id}`, {
      method: 'DELETE',
    });
  }

  async copyBudgetsToNextMonth(fromMonth: string): Promise<{ copied: number; to_month: string }> {
    return this.request<{ copied: number; to_month: string }>('/budgets/copy', {
      method: 'POST',
      body: JSON.stringify({ from_month: fromMonth }),
    });
  }

  // Tags
  async getTags(): Promise<{ id: number; name: string; color: string }[]> {
    return this.request<{ id: number; name: string; color: string }[]>('/tags');
  }

  async createTag(name: string, color?: string): Promise<{ id: number; name: string; color: string }> {
    return this.request<{ id: number; name: string; color: string }>('/tags', {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    });
  }

  async deleteTag(id: number): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/tags/${id}`, { method: 'DELETE' });
  }

  async syncTransactionTags(transactionId: number, tags: string[]): Promise<{ id: number; name: string; color: string }[]> {
    return this.request<{ id: number; name: string; color: string }[]>(`/transactions/${transactionId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tags }),
    });
  }

  // Push notifications
  async getVapidPublic(): Promise<{ publicKey: string }> {
    return this.request<{ publicKey: string }>('/push/vapid');
  }

  async subscribePush(data: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<{ subscribed: boolean }> {
    return this.request<{ subscribed: boolean }>('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: data.endpoint,
        keys: data.keys,
      }),
    });
  }

  async unsubscribePush(endpoint: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>('/push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    });
  }

  // Financial Health
  async getFinancialHealth(): Promise<FinancialHealth> {
    return this.request<FinancialHealth>('/health');
  }

  // Current user info
  async getMe(): Promise<{ id: number; email: string; name: string; experimental_features: string[] }> {
    return this.request('/me');
  }

  // Admin API
  async adminMe(): Promise<{ is_admin: boolean; user_id?: number }> {
    return this.request<{ is_admin: boolean; user_id?: number }>('/admin/me');
  }

  async adminDashboard(): Promise<AdminDashboardStats> {
    return this.request<AdminDashboardStats>('/admin/dashboard');
  }

  async adminListClients(): Promise<AdminClientWithStats[]> {
    return this.request<AdminClientWithStats[]>('/admin/clients');
  }

  async adminCreateClient(data: { email: string; password: string; name: string }): Promise<AdminUser> {
    return this.request<AdminUser>('/admin/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async adminGetClient(id: number): Promise<AdminClientWithStats> {
    return this.request<AdminClientWithStats>(`/admin/clients/${id}`);
  }

  async adminUpdateClient(id: number, data: { email?: string; password?: string; name?: string; is_active?: boolean; experimental_features?: string[] }): Promise<AdminUser> {
    return this.request<AdminUser>(`/admin/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async adminExternalApiLogs(clientId?: number): Promise<ExternalApiLog[]> {
    const params = clientId ? `?client_id=${clientId}` : '';
    return this.request<ExternalApiLog[]>(`/admin/external-api-logs${params}`);
  }

  async adminImpersonate(id: number): Promise<{ token: string }> {
    return this.request<{ token: string }>(`/admin/clients/${id}/impersonate`, {
      method: 'POST',
    });
  }

  // === Sprint 2: New API methods ===

  /** Suggest category based on description */
  async suggestCategory(description: string): Promise<{ suggestion: CategorySuggestion | null }> {
    return this.request<{ suggestion: CategorySuggestion | null }>(`/transactions/suggest-category?description=${encodeURIComponent(description)}`);
  }

  /** Detect potential subscriptions from transaction patterns */
  async detectSubscriptions(): Promise<DetectedSubscription[]> {
    return this.request<DetectedSubscription[]>('/payments/detect-subscriptions');
  }

  /** Get net worth history snapshots */
  async getNetWorthHistory(months = 12): Promise<NetWorthSnapshot[]> {
    return this.request<NetWorthSnapshot[]>(`/health/net-worth-history?months=${months}`);
  }

  /** Get forecast with optional scenarios */
  async getForecast(months = 3): Promise<ForecastMonth[]> {
    return this.request<ForecastMonth[]>(`/forecast?months=${months}`);
  }

  /** Get forecast with best/worst scenarios */
  async getForecastScenarios(months = 3): Promise<ForecastScenarios> {
    return this.request<ForecastScenarios>(`/forecast?months=${months}&scenarios=1`);
  }

  /** Get goal savings plan */
  async getGoalSavingsPlan(): Promise<{ goals: GoalSavingsPlan[]; total_monthly: number }> {
    return this.request<{ goals: GoalSavingsPlan[]; total_monthly: number }>('/goals/savings-plan');
  }

  /** Year-over-year comparison */
  async getYearOverYear(month?: string): Promise<Record<string, unknown>> {
    const params = month ? `?month=${month}` : '';
    return this.request<Record<string, unknown>>(`/analytics/yoy${params}`);
  }

  /** Spending velocity (7-day annualized) */
  async getSpendingVelocity(): Promise<{
    last_7_days: number;
    daily_average_7d: number;
    projected_monthly: number;
    actual_daily_rate: number;
    budget_daily_rate: number;
    velocity_ratio: number;
    on_track: boolean;
  }> {
    return this.request(`/analytics/velocity`);
  }

  /** Top growing expense categories */
  async getTopGrowthCategories(limit = 5): Promise<Array<{
    category_id: number;
    category_name: string;
    icon: string;
    current: number;
    previous: number;
    difference: number;
    percent_change: number;
  }>> {
    return this.request(`/analytics/top-growth?limit=${limit}`);
  }

  // Search
  async search(query: string): Promise<SearchResults> {
    return this.request<SearchResults>(`/search?q=${encodeURIComponent(query)}`);
  }

  // Notes
  async getNotes(params?: { query?: string; folder_id?: number; label_id?: number }): Promise<Note[]> {
    const searchParams = new URLSearchParams();
    if (params?.query) searchParams.set('q', params.query);
    if (params?.folder_id !== undefined) searchParams.set('folder_id', String(params.folder_id));
    if (params?.label_id !== undefined) searchParams.set('label_id', String(params.label_id));
    const qs = searchParams.toString();
    const url = qs ? `/notes?${qs}` : '/notes';
    const res = await this.request<{ data: Note[]; meta: { total: number; page: number; per_page: number; last_page: number } }>(url);
    return res.data ?? [];
  }

  async createNote(data: { title: string; content: string; folder_id?: number; is_pinned?: boolean; color?: string; label_ids?: number[] }): Promise<Note> {
    return this.request<Note>('/notes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateNote(id: number, data: { title?: string; content?: string; folder_id?: number; is_pinned?: boolean; color?: string; label_ids?: number[] }): Promise<Note> {
    return this.request<Note>(`/notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteNote(id: number): Promise<void> {
    await this.request<{ deleted: boolean }>(`/notes/${id}`, {
      method: 'DELETE',
    });
  }

  async analyzeNote(id: number): Promise<{ note: Note; summary: string; action_items: string[] }> {
    const res = await this.request<{ note: Note; analysis: { summary: string; action_items: string[] } }>(`/notes/${id}/analyze`, {
      method: 'POST',
    });
    return {
      note: res.note,
      summary: res.analysis.summary,
      action_items: res.analysis.action_items,
    };
  }

  async formatNoteContent(content: string): Promise<string> {
    const res = await this.request<{ content: string }>('/notes/format', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    return res.content ?? '';
  }

  async suggestNote(content: string): Promise<SuggestNoteResponse> {
    return this.request<SuggestNoteResponse>('/notes/suggest', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async appendToNote(id: number, content: string): Promise<Note> {
    return this.request<Note>(`/notes/${id}/append`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async toggleNotePin(id: number): Promise<Note> {
    return this.request<Note>(`/notes/${id}/pin`, { method: 'POST' });
  }

  async reorderNotes(orderedIds: number[]): Promise<void> {
    await this.request<{ reordered: boolean }>('/notes/reorder', {
      method: 'POST',
      body: JSON.stringify({ ordered_ids: orderedIds }),
    });
  }

  // Note Folders
  async getNoteFolders(): Promise<NoteFolder[]> {
    return this.request<NoteFolder[]>('/notes/folders');
  }

  async createNoteFolder(data: { name: string; color?: string; parent_id?: number }): Promise<NoteFolder> {
    return this.request<NoteFolder>('/notes/folders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateNoteFolder(id: number, data: { name: string; color?: string }): Promise<NoteFolder> {
    return this.request<NoteFolder>(`/notes/folders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteNoteFolder(id: number): Promise<void> {
    await this.request<{ deleted: boolean }>(`/notes/folders/${id}`, {
      method: 'DELETE',
    });
  }

  async reorderNoteFolders(orderedIds: number[]): Promise<void> {
    await this.request<{ reordered: boolean }>('/notes/folders/reorder', {
      method: 'POST',
      body: JSON.stringify({ ordered_ids: orderedIds }),
    });
  }

  // Note Labels
  async getNoteLabels(): Promise<NoteLabel[]> {
    return this.request<NoteLabel[]>('/notes/labels');
  }

  async createNoteLabel(data: { name: string; color: string }): Promise<NoteLabel> {
    return this.request<NoteLabel>('/notes/labels', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteNoteLabel(id: number): Promise<void> {
    await this.request<{ deleted: boolean }>(`/notes/labels/${id}`, {
      method: 'DELETE',
    });
  }

  // Calendar
  async getCalendarEvents(from: string, to: string): Promise<CalendarEvent[]> {
    const res = await this.request<{ data: CalendarEvent[] }>(
      `/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    return res.data;
  }

  async createCalendarEvent(data: {
    title: string;
    description?: string;
    start_at: string;
    end_at?: string;
    is_all_day?: boolean;
    color?: string;
    recurrence_rule?: string;
    source?: 'manual' | 'ai_parsed';
  }): Promise<CalendarEvent> {
    return this.request<CalendarEvent>('/calendar', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCalendarEvent(
    id: number,
    data: {
      title?: string;
      description?: string;
      start_at?: string;
      end_at?: string;
      is_all_day?: boolean;
      color?: string;
      recurrence_rule?: string;
    }
  ): Promise<CalendarEvent> {
    return this.request<CalendarEvent>(`/calendar/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCalendarEvent(id: number): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(`/calendar/${id}`, {
      method: 'DELETE',
    });
  }

  async parseCalendarText(text: string): Promise<ParsedCalendarEvent[]> {
    const res = await this.request<{ events: ParsedCalendarEvent[] }>(
      '/calendar/parse',
      {
        method: 'POST',
        body: JSON.stringify({ text }),
      }
    );
    return res.events;
  }

  // Telegram
  async generateTelegramCode(): Promise<{ code?: string; ttl?: number; already_linked?: boolean; message?: string }> {
    return this.request<{ code?: string; ttl?: number; already_linked?: boolean; message?: string }>(
      '/settings/telegram-link-code',
      { method: 'POST' }
    );
  }

  async unlinkTelegram(): Promise<{ unlinked: boolean }> {
    return this.request<{ unlinked: boolean }>('/settings/telegram-link', {
      method: 'DELETE',
    });
  }

  async getTelegramStatus(): Promise<{ linked: boolean }> {
    return this.request<{ linked: boolean }>('/settings/telegram-status');
  }

  async parseEmailText(text: string): Promise<{ transactions: EmailParsedTransaction[]; count: number }> {
    return this.request<{ transactions: EmailParsedTransaction[]; count: number }>('/email-parse', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  async getTaxSummary(dateFrom: string, dateTo: string): Promise<TaxSummary> {
    return this.request<TaxSummary>(`/tax?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`);
  }

  async getMonthlyReportHtml(month: string): Promise<string> {
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${this.baseUrl}/reports/monthly?month=${encodeURIComponent(month)}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`Report error: ${res.status}`);
    return res.text();
  }
}

// Admin types
export interface AdminDashboardStats {
  total_users: number;
  active_users: number;
  total_transactions: number;
  active_last_7_days: number;
  new_last_30_days: number;
  total_balance: number;
}

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  is_active: boolean;
  is_admin: boolean;
  last_login_at?: string;
  created_at: string;
}

export interface ExternalApiLog {
  id: number;
  client_id: number | null;
  service: string;
  endpoint: string | null;
  method: string;
  status_code: number | null;
  duration_ms: number | null;
  request_meta: Record<string, unknown> | null;
  response_meta: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

export interface AdminClientWithStats {
  user: AdminUser & { experimental_features?: string[] };
  transaction_count: number;
  balance?: number;
}

// Export singleton instance
export const api = new APIClient();

// Export for direct use
export default api;
