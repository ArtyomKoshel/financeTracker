// Transaction types
export type TransactionType =
  | 'advance'
  | 'salary'
  | 'bonus'
  | 'early_pay'
  | 'year_bonus'
  | 'vacation'
  | 'other'
  | 'expense'
  | 'savings'
  | 'savings_withdrawal'
  | 'correction'
  | 'transfer';

export type Currency = 'BYN' | 'RUB' | 'EUR' | 'USD' | 'GBP' | 'PLN';

export interface TransactionTemplate {
  id: number;
  name: string;
  type: string;
  amount?: number;
  currency: Currency;
  category_id?: number;
  category_name?: string;
  category_icon?: string;
  description?: string;
  sort_order: number;
}

export interface TransactionSplit {
  id: number;
  category_id: number;
  category_name: string;
  category_icon: string;
  amount: number;
  description: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Transaction {
  id: number;
  date: string;
  amount: number;
  original_amount: number;
  currency: Currency;
  exchange_rate?: number;
  type: TransactionType;
  category_id?: number;
  category_name: string;
  category_icon: string;
  account_id?: number;
  account_name?: string;
  transfer_to_account_id?: number;
  transfer_to_account_name?: string;
  recurring_payment_id?: number;
  goal_id?: number;
  description: string;
  month: string;
  is_validated: boolean;
  created_at: string;
  source?: string;
  import_id?: number;
  splits?: TransactionSplit[];
  tags?: Tag[];
}

// Category types
export interface Category {
  id: number;
  name: string;
  parent_id?: number;
  icon: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

export interface CategoryWithSubs extends Category {
  subcategories: Category[];
}

export interface ExpenseByCategory {
  category_id: number;
  category_name: string;
  icon: string;
  color: string;
  amount: number;
  percent: number;
}

// Payment types
export interface RecurringPayment {
  id: number;
  name: string;
  amount: number;
  original_amount: number;
  currency: Currency;
  day_of_month: number;
  due_date: string;
  category: 'essential' | 'optional';
  category_id?: number;
  is_variable: boolean;
  is_one_time: boolean;
  is_subscription?: boolean;
  is_auto_debit?: boolean;
  cancel_by_date?: string;
  is_active: boolean;
  is_income?: boolean;
  description: string;
}

export interface PaymentReminder {
  payment: RecurringPayment;
  due_date: string;
  month: string;
  days_until: number;
  is_paid: boolean;
  is_overdue: boolean;
  is_next_month: boolean;
}

export interface CalendarDayItem {
  payment: RecurringPayment;
  due_date: string;
  is_paid: boolean;
}

/** Календарь: дата -> массив платежей на эту дату */
export type PaymentCalendar = Record<string, CalendarDayItem[]>;

// Goal types
export interface Goal {
  id: number;
  name: string;
  target_amount: number;
  target_date: string;
  current_amount: number;
  currency?: string;
  is_active: boolean;
  created_at: string;
}

export interface CompletedGoal {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string;
  currency?: string;
  percent: number;
  is_active: false;
  completed_at?: string;
}

// Account types
export interface Account {
  id: number;
  name: string;
  balance: number;
  last_sync_date?: string;
  last_sync_amount?: number;
}

export interface AccountItem {
  id: number;
  name: string;
  balance: number;
  currency?: string;
  last_sync_date?: string;
  last_sync_amount?: number;
  sort_order?: number;
}

export interface BalanceResponse {
  accounts: AccountItem[];
  total_balance: number;
}

// Analytics types
export interface MonthSummary {
  month: string;
  total_income: number;
  total_bonus: number;
  total_saved: number;
  expenses: number;
}

export interface AnalyticsData {
  total_income: number;
  total_expenses: number;
  total_savings: number;
  by_category: ExpenseByCategory[];
  monthly_trend: MonthSummary[];
}

// Budget types
export interface CashflowRecommendation {
  balance: number;
  living_budget: number;
  total_payments: number;
  free_funds: number;
  suggested_savings: number;
  savings_percent: number;
  next_income_date: string;
  next_income_type: 'ЗП' | 'аванс';
  days_until_income: number;
  payments_list: PaymentListItem[];
  message: string;
  status: 'success' | 'warning' | 'info';
  // Новые метрики для отслеживания прогресса трат
  essential_spent: number;      // Потрачено из базовых бюджетов
  essential_remaining: number;  // Осталось на жизнь (план - факт)
  daily_budget: number;         // Бюджет в день
  essential_total: number;      // Полный месячный бюджет (для подсказки)
}

export interface PaymentListItem {
  name: string;
  amount: number;
  due_date: string;
  days_until: number;
  is_next_month: boolean;
}

export interface BudgetPlan {
  income: number;
  payments: PaymentReminder[];
  total_payments: number;
  suggested_savings: number;
  remaining: number;
  days_until_next: number;
  daily_budget: number;
  message: string;
}

export interface MonthlyBudget {
  month: string;
  total_income: number;
  total_payments: number;
  total_savings: number;
  total_expenses: number;
  remaining: number;
  savings_rate: number;
}

// Dashboard types
export interface DashboardGoal {
  id: number;
  name: string;
  target_amount: number;
  target_date: string;
  current_amount: number;
  currency?: string;
  is_active: boolean;
  progress_percent?: number;
  days_remaining?: number;
  monthly_target?: number;
}

export interface DashboardData {
  goals?: DashboardGoal[];
  goal?: Goal;
  progress_percent: number;
  days_remaining: number;
  monthly_target: number;
  current_month: MonthSummary;
  recent_transactions: Transaction[];
  usd_rate: number;
  total_saved_rub: number;
  total_saved_usd: number;
}

// Settings types
export interface SalaryConfig {
  gross_salary: number;      // Чистая ЗП на руки (после налогов)
  expected_advance: number;  // Ожидаемый аванс
  tolerance_percent: number; // Допустимое отклонение в %
}

export interface AiUsage {
  provider: string;
  limit_requests: number | null;
  remaining_requests: number | null;
  limit_tokens: number | null;
  remaining_tokens: number | null;
  reset_requests: string | null;
  reset_tokens: string | null;
  updated_at: string | null;
}

export interface EmailParsedTransaction {
  date: string;
  amount: number;
  currency: string;
  description: string;
  type: 'income' | 'expense';
}

export interface TaxMonthEntry {
  month: string;
  income: number;
  count: number;
}

export interface TaxSummary {
  date_from: string;
  date_to: string;
  total_income: number;
  tax_usn: number;
  tax_self_employed: number;
  rate_usn: number;
  rate_self_employed: number;
  by_month: TaxMonthEntry[];
}

export interface Settings {
  salary_config: SalaryConfig;
  rub_rate: string;
  eur_rate: string;
  usd_rate: string;
  advance_day: string;
  salary_day: string;
  savings_percent: string;
  min_living_budget: string;
  rates_updated: string;
  push_overdue?: string;
  push_upcoming?: string;
  push_upcoming_days?: string;
  auto_savings_percent?: string;
  auto_savings_goal_id?: string;
  [key: string]: unknown;
}

// Validation types
export interface ValidationResult {
  is_valid: boolean;
  expected_min: number;
  expected_max: number;
  actual: number;
  difference: number;
  message: string;
}

// Category Budget types
export interface CategoryBudget {
  id: number;
  category_id: number;
  category_name: string;
  category_icon: string;
  month: string;
  limit_amount: number;
  spent_amount: number;
  alert_percent: number;
  is_exceeded: boolean;
  percent_used: number;
  is_recurring: boolean;
  is_essential: boolean;  // Базовые расходы - влияет на "На жизнь" в Cashflow
}

export interface BudgetWarning {
  category_id: number;
  category_name: string;
  category_icon: string;
  limit_amount: number;
  spent_amount: number;
  percent: number;
  message: string;
}

// Yearly Analytics types
export interface YearlyAnalytics {
  year: number;
  total_income: number;
  total_expenses: number;
  total_savings: number;
  avg_monthly_income: number;
  avg_monthly_expenses: number;
  by_category: ExpenseByCategory[];
  monthly_data: MonthSummary[];
}

// Month Comparison types
export interface MonthComparison {
  month1: string;
  month2: string;
  income_diff: number;
  expenses_diff: number;
  categories: CategoryComparison[];
  // Итоги по плановым платежам
  planned_month1: number;
  planned_month2: number;
  planned_diff: number;
  // Итоги по прочим расходам
  other_month1: number;
  other_month2: number;
  other_diff: number;
}

export interface CategoryComparison {
  category_id: number;
  category_name: string;
  category_icon: string;
  month1_amount: number;
  month2_amount: number;
  difference: number;
  percent_change: number;
  is_planned: boolean;
}

// Category Trend types
export interface CategoryTrend {
  category_id: number;
  category_name: string;
  category_icon: string;
  monthly_data: MonthAmount[];
  average: number;
  max: number;
  min: number;
}

export interface MonthAmount {
  month: string;
  amount: number;
}

// Over budget category info
export interface OverBudgetInfo {
  category_name: string;  // Название категории
  budget_amount: number;  // Бюджет
  spent_amount: number;   // Потрачено
  over_amount: number;    // Превышение
  over_percent: number;   // % превышения
}

// Financial Health metrics for AI recommendations
export interface FinancialHealth {
  // Base metrics
  savings_rate: number;        // % накоплений от дохода
  expense_to_income: number;   // % расходов от дохода
  emergency_fund_days: number; // На сколько дней хватит баланса

  // Копилка (подушка безопасности)
  total_savings: number;       // Сумма в копилке (BYN)
  total_savings_usd: number;   // Сумма в копилке (USD)
  savings_days: number;        // На сколько дней хватит копилки
  goal_name: string;           // Название цели
  goal_progress: number;       // Прогресс цели %

  // Trends
  income_growth: number;       // Изменение дохода %
  expense_growth: number;      // Изменение расходов %
  savings_growth: number;      // Изменение накоплений %

  // Risks
  over_budget_count: number;       // Сколько категорий превышено
  over_budget_list: OverBudgetInfo[];  // Список превышенных категорий
  upcoming_payments: number;       // Платежи в ближайшие 7 дней
  payment_coverage: number;        // Баланс / Платежи до ЗП

  // Behavior
  daily_spending_avg: number;  // Средние траты в день
  burn_rate: number;           // Скорость трат (Br/день)
  days_until_zero: number;     // При текущем burn rate

  // Forecast
  predicted_end_of_month: number; // Прогноз баланса на конец месяца

  // Cashflow
  cashflow_free: number;       // Свободно до ЗП
  cashflow_deficit: boolean;   // Есть дефицит?

  // Overall scoring
  health_score: number;        // 0-100
  status: 'excellent' | 'good' | 'warning' | 'critical';
  message: string;
}

// Categorization suggestion
export interface CategorySuggestion {
  category_id: number;
  category_name: string;
  category_icon: string;
  confidence: number;
  source: 'rule' | 'history';
}

// Detected subscription
export interface DetectedSubscription {
  description: string;
  amount: number;
  currency: Currency;
  occurrences: number;
  first_seen: string;
  last_seen: string;
  estimated_day: number | null;
  confidence: number;
}

// Net Worth Snapshot
export interface NetWorthSnapshot {
  month: string;
  total_balance: number;
  total_savings: number;
  total_debt: number;
  net_worth: number;
}

// Forecast Scenario
export interface ForecastMonth {
  month: string;
  income: number;
  expenses: number;
  planned_payments: number;
  savings?: number;
  balance_start?: number;
  balance_end: number;
}

export interface ForecastScenarios {
  base: ForecastMonth[];
  best: ForecastMonth[];
  worst: ForecastMonth[];
}

// Goal savings plan
export interface GoalSavingsPlan {
  goal_id: number;
  goal_name: string;
  target_amount: number;
  current_amount: number;
  currency: Currency;
  remaining: number;
  target_date: string;
  months_left: number;
  monthly_amount: number;
  progress: number;
  is_on_track: boolean;
}

// Calendar types
export interface CalendarEvent {
  id: number;
  client_id?: number;
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  is_all_day: boolean;
  color?: string | null;
  recurrence_rule?: string | null;
  source?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ParsedCalendarEvent {
  title: string;
  start_at: string;
  end_at: string | null;
  is_all_day: boolean;
}

export interface CalendarPaymentItem {
  kind: 'payment';
  id: string;
  title: string;
  start_at: string;
  amount: number;
  currency: Currency;
  is_paid: boolean;
  is_variable: boolean;
  payment_id: number;
}

export interface CalendarEventItem {
  kind: 'event';
  id: number;
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  is_all_day: boolean;
  color?: string | null;
  recurrence_rule?: string | null;
  source?: string;
}

export type CalendarItem = CalendarEventItem | CalendarPaymentItem;

// Notes types
export interface NoteLabel {
  id: number;
  name: string;
  color: string;
}

export interface NoteFolder {
  id: number;
  parent_id?: number | null;
  name: string;
  color?: string;
  sort_order: number;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  summary?: string;
  action_items?: string[];
  suggested_labels?: string[];
  analyzed_at?: string;
  folder_id?: number;
  folder?: { id: number; name: string; color?: string } | null;
  is_pinned?: boolean;
  color?: string;
  sort_order?: number;
  labels: NoteLabel[];
  created_at: string;
  updated_at?: string;
}

export interface NoteSuggestion {
  note_id: number;
  note_title: string;
  relevance: number;
  preview: string;
}

export interface SuggestNoteResponse {
  suggestions: NoteSuggestion[];
  suggested_label?: string;
}

// Search types
export interface SearchResultTransaction {
  id: number;
  date: string;
  amount: number;
  currency: Currency;
  type: TransactionType;
  description: string;
  category_name: string;
  category_icon: string;
  account_name: string;
}

export interface SearchResultCategory {
  id: number;
  name: string;
  icon: string;
  color: string;
}

export interface SearchResultNote {
  id: number;
  title: string;
  summary: string | null;
  created_at: string;
}

export interface SearchResults {
  transactions: SearchResultTransaction[];
  categories: SearchResultCategory[];
  notes: SearchResultNote[];
}

// API Response types
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
