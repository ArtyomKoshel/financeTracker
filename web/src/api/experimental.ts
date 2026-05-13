/**
 * API клиент для экспериментальных функций.
 * Изолированный модуль — не влияет на основной API.
 */
import { toast } from '@/shared/components/toast';

export interface BankReceiptPreviewRow {
  id: string;
  bank_merchant_name: string;
  raw_description?: string | null;
  amount: number;
  currency?: string;
  date: string;
  time?: string | null;
  type?: 'expense' | 'income';
  category_id: number | null;
  category_name: string | null;
  income_type?: string | null;
  action: 'create' | 'exists' | 'skip';
  existing_transaction_id?: number;
  existing_transaction_description?: string | null;
  existing_transaction_type?: string | null;
  confidence?: string | null;
  from_mapping?: boolean;
  from_rule?: boolean;
  rule_id?: number;
  is_auto?: boolean;
  suggested_recurring_payment_id?: number;
  suggested_recurring_payment_name?: string;
  suggested_recurring_payment_amount?: number;
  suggested_recurring_payment_day?: number;
  splits?: Array<{ category_id: number; amount: number; description?: string }>;
}

export interface BankReceiptApplyRow {
  id: string;
  amount: number;
  currency?: string;
  date: string;
  type: 'expense' | 'income';
  category_id: number | null;
  income_type?: string;
  bank_merchant_name: string;
  raw_description?: string | null;
  selected: boolean;
  action: string;
  user_confirmed?: boolean;
  rule_id?: number;
  suggested_category_id?: number;
  suggested_income_type?: string;
  recurring_payment_id?: number;
  splits?: Array<{ category_id: number; amount: number; description?: string }>;
}

export interface BankReceiptMatchStats {
  exists: number;
  batch_learned: number;
  mapped: number;
  similar: number;
  ai_suggested: number;
  manual: number;
  rule: number;
}

export interface BankReceiptPreviewResponse {
  rows: BankReceiptPreviewRow[];
  match_stats?: BankReceiptMatchStats;
  warning?: string;
  file_hash?: string;
  pages_count?: number;
}

export interface BankReceiptImport {
  id: number;
  filename: string | null;
  file_hash: string | null;
  pages_count: number;
  rows_found: number;
  rows_created: number;
  rows_skipped: number;
  created_at: string;
}

export interface ImportRule {
  id: number;
  name: string | null;
  merchant_pattern: string;
  conditions: ImportRuleConditions | null;
  category_id: number | null;
  category_name: string | null;
  category_icon: string | null;
  result_income_type: string | null;
  is_auto: boolean;
  priority: number;
  times_applied: number;
  last_used_at: string | null;
}

export interface ImportRuleConditions {
  logic: 'AND' | 'OR';
  rules: ImportRuleCondition[];
}

export interface ImportRuleCondition {
  field: 'merchant' | 'description' | 'amount' | 'type';
  operator: 'contains' | 'not_contains' | 'equals' | 'starts_with' | 'gt' | 'lt' | 'gte' | 'lte' | 'in';
  value: string | number;
}

export interface PreviewSummary {
  expenses_total: number;
  income_total: number;
  net: number;
  categories: Array<{
    id: number;
    name: string;
    icon: string;
    color: string;
    amount: number;
    percent: number;
  }>;
  budget_warnings: Array<{
    category_icon: string;
    message: string;
    percent: number;
  }>;
  uncategorized_count: number;
}

const baseUrl = '/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(options.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${baseUrl}${endpoint}`, { headers, redirect: 'manual' as RequestRedirect, ...options });
  if (res.status === 302 || res.status === 301) {
    const loc = res.headers.get('Location') || '';
    if (loc.includes('login') || loc.includes('Login')) {
      localStorage.removeItem('auth_token');
      toast.error('Сессия истекла. Войдите снова.');
      setTimeout(() => { window.location.href = '/login.html'; }, 800);
    }
    throw new Error('Сервер перенаправил на другую страницу. Возможно, требуется авторизация.');
  }
  if (res.status === 401) {
    localStorage.removeItem('auth_token');
    toast.error('Сессия истекла. Войдите снова.');
    setTimeout(() => { window.location.href = '/login.html'; }, 800);
    throw new Error('Unauthorized');
  }
  if (res.status === 403) {
    throw new Error('Функция недоступна');
  }

  const contentType = res.headers.get('Content-Type') ?? '';
  const text = await res.text();
  if (!contentType.includes('application/json')) {
    const msg = res.status >= 400
      ? `Ошибка ${res.status}: сервер вернул некорректный ответ. Проверьте, что API доступен.`
      : 'Сервер вернул некорректный ответ. Проверьте настройки API.';
    throw new Error(msg);
  }
  let data: { success?: boolean; error?: string; data?: T; message?: string; errors?: Record<string, string[]> };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Сервер вернул некорректный JSON. Проверьте, что API доступен и маршрут настроен.');
  }
  if (!data.success) {
    const err = data.error || data.message || 'Ошибка';
    const errDetails = data.errors ? Object.values(data.errors).flat().join('; ') : '';
    throw new Error(errDetails ? `${err}: ${errDetails}` : err);
  }
  return data.data as T;
}

export async function bankReceiptPreviewCsv(
  csvContent: string,
  filename?: string
): Promise<BankReceiptPreviewResponse> {
  return request('/experimental/bank-receipts/preview-csv', {
    method: 'POST',
    body: JSON.stringify({
      csv: csvContent,
      filename: filename ?? null,
    }),
  });
}

export async function bankReceiptPreview(
  imageBase64OrPages: string | Array<{ base64: string; mime?: string }>,
  mime = 'image/jpeg',
  filename?: string
): Promise<BankReceiptPreviewResponse> {
  let body: Record<string, unknown>;
  if (typeof imageBase64OrPages === 'string') {
    body = { image_base64: imageBase64OrPages, mime, filename };
  } else {
    body = {
      pages: imageBase64OrPages.map((p) => ({ base64: p.base64, mime: p.mime ?? 'image/png' })),
      filename,
    };
  }
  return request('/experimental/bank-receipts/preview', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function bankReceiptApply(
  rows: BankReceiptApplyRow[],
  accountId?: number,
  meta?: { filename?: string; file_hash?: string; pages_count?: number }
): Promise<{ created: number; mappings_saved: number; import_id: number | null }> {
  return request('/experimental/bank-receipts/apply', {
    method: 'POST',
    body: JSON.stringify({
      rows,
      account_id: accountId ?? null,
      filename: meta?.filename,
      file_hash: meta?.file_hash,
      pages_count: meta?.pages_count,
    }),
  });
}

export async function bankReceiptPreviewSummary(
  rows: Array<{ amount: number; date: string; type: string; category_id: number | null; splits?: Array<{ category_id: number; amount: number }> }>
): Promise<PreviewSummary> {
  return request('/experimental/bank-receipts/preview-summary', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  });
}

export async function getBankReceiptMappings(): Promise<Array<{ id: number; bank_merchant_name: string; category_id: number; category_name: string }>> {
  return request('/experimental/bank-receipts/mappings');
}

export async function getBankReceiptImports(): Promise<BankReceiptImport[]> {
  return request('/experimental/bank-receipts/imports');
}

export async function deleteBankReceiptImport(id: number): Promise<{ deleted: number }> {
  return request(`/experimental/bank-receipts/imports/${id}`, { method: 'DELETE' });
}

export async function getImportRules(): Promise<ImportRule[]> {
  return request('/experimental/bank-receipts/rules');
}

export async function createImportRule(data: {
  name?: string;
  merchant_pattern?: string;
  conditions?: ImportRuleConditions;
  category_id?: number;
  result_income_type?: string;
  is_auto?: boolean;
  priority?: number;
}): Promise<{ id: number }> {
  return request('/experimental/bank-receipts/rules', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateImportRule(id: number, data: {
  name?: string;
  merchant_pattern?: string;
  conditions?: ImportRuleConditions;
  category_id?: number;
  result_income_type?: string;
  is_auto?: boolean;
  priority?: number;
}): Promise<{ id: number }> {
  return request(`/experimental/bank-receipts/rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteImportRule(id: number): Promise<{ deleted: boolean }> {
  return request(`/experimental/bank-receipts/rules/${id}`, { method: 'DELETE' });
}
