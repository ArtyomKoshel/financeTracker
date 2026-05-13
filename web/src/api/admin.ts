/**
 * Admin API — отдельный модуль для админ-панели.
 * Не зависит от основного api client (избегаем проблем с бандлингом/кэшем).
 */
import type {
  AdminClientWithStats,
  AdminDashboardStats,
  AdminUser,
  ExternalApiLog,
} from './client';

const baseUrl = '/api/admin';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string>),
    },
  });

  if (res.status === 401) {
    localStorage.removeItem('auth_token');
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }

  if (!res.ok) throw new Error(`API error ${res.status}`);

  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return json.data as T;
}

export async function adminMe(): Promise<{ is_admin: boolean; user_id?: number }> {
  return request<{ is_admin: boolean; user_id?: number }>('/me');
}

export async function adminDashboard(): Promise<AdminDashboardStats> {
  return request<AdminDashboardStats>('/dashboard');
}

export interface AdminChartsData {
  labels: string[];
  users: number[];
  transactions: number[];
}

export async function adminCharts(months = 6): Promise<AdminChartsData> {
  return request<AdminChartsData>(`/charts?months=${months}`);
}

export async function adminListClients(): Promise<AdminClientWithStats[]> {
  return request<AdminClientWithStats[]>('/clients');
}

export async function adminCreateClient(data: {
  email: string;
  password: string;
  name: string;
}): Promise<AdminUser> {
  return request<AdminUser>('/clients', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function adminGetClient(id: number): Promise<AdminClientWithStats> {
  return request<AdminClientWithStats>(`/clients/${id}`);
}

export async function adminUpdateClient(
  id: number,
  data: {
    email?: string;
    password?: string;
    name?: string;
    is_active?: boolean;
    experimental_features?: string[];
  }
): Promise<AdminUser> {
  return request<AdminUser>(`/clients/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export interface ActivityLogEntry {
  id: number;
  user_id: number;
  user_email?: string;
  user_name?: string;
  action: string;
  ip?: string;
  user_agent?: string;
  details?: Record<string, unknown>;
  created_at: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  per_page: number;
  last_page: number;
}

export interface ActivityLogsResponse {
  data: ActivityLogEntry[];
  meta: PaginationMeta;
  action_types: string[];
}

export interface ApiLogsMetrics {
  total_24h: number;
  success_24h: number;
  errors_24h: number;
  success_rate_24h: number | null;
  avg_duration_ms: number | null;
}

export interface ApiLogsResponse {
  data: ExternalApiLog[];
  meta: PaginationMeta;
  metrics: ApiLogsMetrics;
}

export async function adminActivityLogs(params?: {
  userId?: number;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  perPage?: number;
}): Promise<ActivityLogsResponse> {
  const q = new URLSearchParams();
  if (params?.userId) q.set('user_id', String(params.userId));
  if (params?.action) q.set('action', params.action);
  if (params?.dateFrom) q.set('date_from', params.dateFrom);
  if (params?.dateTo) q.set('date_to', params.dateTo);
  if (params?.search) q.set('search', params.search);
  if (params?.page) q.set('page', String(params.page));
  if (params?.perPage) q.set('per_page', String(params.perPage));
  const qs = q.toString();
  return request<ActivityLogsResponse>(`/activity-logs${qs ? '?' + qs : ''}`);
}

export async function adminExternalApiLogs(params?: {
  clientId?: number;
  service?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
}): Promise<ApiLogsResponse> {
  const q = new URLSearchParams();
  if (params?.clientId) q.set('client_id', String(params.clientId));
  if (params?.service) q.set('service', params.service);
  if (params?.dateFrom) q.set('date_from', params.dateFrom);
  if (params?.dateTo) q.set('date_to', params.dateTo);
  if (params?.page) q.set('page', String(params.page));
  if (params?.perPage) q.set('per_page', String(params.perPage));
  const qs = q.toString();
  return request<ApiLogsResponse>(`/external-api-logs${qs ? '?' + qs : ''}`);
}

export async function adminImpersonate(id: number): Promise<{ token: string }> {
  return request<{ token: string }>(`/clients/${id}/impersonate`, {
    method: 'POST',
  });
}

// Push notifications
export async function adminPushSend(data: {
  title: string;
  body: string;
  target: 'all' | 'user';
  user_id?: number;
}): Promise<{ sent: number }> {
  return request<{ sent: number }>('/push/send', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface PushCampaign {
  id: number;
  title: string;
  body: string;
  target: string;
  target_user_id: number | null;
  scheduled_at: string | null;
  sent_at: string | null;
  sent_count: number;
  created_at: string;
}

export async function adminPushCampaigns(): Promise<{ campaigns: PushCampaign[] }> {
  return request<{ campaigns: PushCampaign[] }>('/push/campaigns');
}

export async function adminPushCreateCampaign(data: {
  title: string;
  body: string;
  target: 'all' | 'user';
  user_id?: number;
  scheduled_at?: string;
}): Promise<{ id: number; scheduled_at?: string }> {
  return request<{ id: number; scheduled_at?: string }>('/push/campaigns', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Categorization rules (global, admin-managed)
export interface AdminCategorizationRule {
  id: number;
  name: string | null;
  merchant_pattern: string;
  conditions: unknown;
  category_name: string | null;
  result_income_type: string | null;
  is_auto: boolean;
  priority: number;
  times_applied: number;
  last_used_at: string | null;
  applied: number;
  accepted: number;
  accuracy_percent: number | null;
  status: 'auto' | 'suggestion' | 'review' | 'candidate';
}

export interface AdminRuleCandidate {
  merchant: string;
  merchant_normalized: string;
  category_name: string;
  total_mappings: number;
  unique_clients: number;
  consistency_percent: number;
}

export async function adminCategorizationRules(): Promise<{ rules: AdminCategorizationRule[] }> {
  return request<{ rules: AdminCategorizationRule[] }>('/categorization-rules');
}

export async function adminCategorizationRuleCandidates(
  minMappings = 5,
  minConsistency = 70
): Promise<{ candidates: AdminRuleCandidate[] }> {
  return request<{ candidates: AdminRuleCandidate[] }>(
    `/categorization-rules/candidates?min_mappings=${minMappings}&min_consistency=${minConsistency}`
  );
}

export async function adminCategorizationRuleStats(
  id: number
): Promise<{
  rule: Record<string, unknown>;
  applied: number;
  accepted: number;
  rejected: number;
  accuracy_percent: number | null;
  unique_clients: number;
  rejected_breakdown: Array<{ category_name: string; count: number }>;
}> {
  return request(`/categorization-rules/${id}/stats`);
}

export async function adminCategorizationRuleCreate(data: {
  name?: string;
  merchant_pattern?: string;
  conditions?: unknown;
  category_id?: number;
  category_name?: string;
  result_income_type?: string;
  is_auto?: boolean;
  priority?: number;
}): Promise<{ id: number }> {
  return request<{ id: number }>('/categorization-rules', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function adminCategorizationRuleUpdate(
  id: number,
  data: {
    name?: string;
    merchant_pattern?: string;
    conditions?: unknown;
    category_id?: number;
    category_name?: string;
    result_income_type?: string;
    is_auto?: boolean;
    priority?: number;
  }
): Promise<{ id: number }> {
  return request<{ id: number }>(`/categorization-rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function adminCategorizationRuleDelete(id: number): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/categorization-rules/${id}`, {
    method: 'DELETE',
  });
}

export interface BankReceiptStats {
  imports_30d: number;
  imports_90d: number;
  tx_created_30d: number;
  tx_created_90d: number;
  active_users_30d: number;
  top_users_90d: Array<{ client_id: number; email: string | null; imports_count: number; tx_count: number }>;
}

export interface AiMetrics {
  period_days: number;
  total_requests: number;
  success_count: number;
  error_count: number;
  success_rate: number | null;
  avg_duration_ms: number;
  max_duration_ms: number | null;
  by_service: Array<{ service: string; total: number; success: number; errors: number; avg_ms: number }>;
}

export interface TopMapping {
  merchant: string;
  merchant_normalized: string;
  category_id: number | null;
  category_name: string | null;
  client_count: number;
  category_variants: number;
}

export async function adminBankReceiptStats(): Promise<BankReceiptStats> {
  return request<BankReceiptStats>('/bank-receipt-stats');
}

export async function adminAiMetrics(days = 7): Promise<AiMetrics> {
  return request<AiMetrics>(`/ai-metrics?days=${days}`);
}

export async function adminTopMappings(limit = 20): Promise<TopMapping[]> {
  return request<TopMapping[]>(`/top-mappings?limit=${limit}`);
}
