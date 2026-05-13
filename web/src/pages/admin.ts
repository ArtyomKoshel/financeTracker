import * as adminApi from '@/api/admin';
import type { AdminClientWithStats, AdminDashboardStats, ExternalApiLog } from '@/api/client';
import { modal } from '@/shared/components/modal';

const token = localStorage.getItem('auth_token');
if (!token) {
  window.location.href = '/login.html';
}

async function checkAdmin(): Promise<void> {
  try {
    const me = await adminApi.adminMe();
    currentAdminId = me.user_id ?? null;
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'Unauthorized') {
      window.location.href = '/login.html';
      return;
    }
    // Redirect to client only when forbidden (not admin)
    if (msg.includes('Forbidden') || msg.includes('admin access')) {
      window.location.href = '/';
      return;
    }
    // For other errors (500, network, etc) - show error, don't redirect
    console.error('Admin check failed:', e);
    modal.alert(`Ошибка при проверке прав: ${msg}\n\nПроверьте консоль для деталей.`, 'Ошибка');
    throw e;
  }
}

async function loadClients(): Promise<AdminClientWithStats[]> {
  return adminApi.adminListClients();
}

async function loadDashboard(): Promise<AdminDashboardStats> {
  return adminApi.adminDashboard();
}

async function loadCharts(): Promise<adminApi.AdminChartsData> {
  const months = parseInt(
    (document.getElementById('chartsMonths') as HTMLSelectElement)?.value || '6',
    10
  );
  return adminApi.adminCharts(months);
}

function renderCharts(data: adminApi.AdminChartsData): void {
  const container = document.getElementById('adminCharts');
  if (!container) return;

  const labels = data?.labels ?? [];
  const users = data?.users ?? [];
  const transactions = data?.transactions ?? [];
  if (labels.length === 0) {
    container.innerHTML = '<p class="empty-state">Нет данных за выбранный период</p>';
    return;
  }

  const maxUsers = Math.max(1, ...users);
  const maxTx = Math.max(1, ...transactions);

  const rows = labels.map((label, i) => {
    const u = users[i] ?? 0;
    const t = transactions[i] ?? 0;
    const uPct = (u / maxUsers) * 100;
    const tPct = (t / maxTx) * 100;
    return `
      <div class="admin-chart-row">
        <span class="admin-chart-label">${escapeHtml(label)}</span>
        <div class="admin-chart-bars">
          <div class="admin-chart-bar-wrap" title="Новые пользователи: ${u}">
            <div class="admin-chart-bar admin-chart-bar-users" style="width: ${uPct}%"></div>
            <span class="admin-chart-value">${u}</span>
          </div>
          <div class="admin-chart-bar-wrap" title="Транзакции: ${t}">
            <div class="admin-chart-bar admin-chart-bar-tx" style="width: ${tPct}%"></div>
            <span class="admin-chart-value">${t}</span>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = `
    <div class="admin-charts-legend">
      <span><span class="admin-chart-legend-dot admin-chart-bar-users"></span> Новые пользователи</span>
      <span><span class="admin-chart-legend-dot admin-chart-bar-tx"></span> Транзакции</span>
    </div>
    <div class="admin-charts-rows">${rows.join('')}</div>
  `;
}

function formatMoney(n: number): string {
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' Br';
}

function renderDashboard(stats: AdminDashboardStats): void {
  const set = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  set('statTotalUsers', String(stats.total_users));
  set('statActiveUsers', String(stats.active_users));
  set('statTransactions', String(stats.total_transactions));
  set('statActive7d', String(stats.active_last_7_days));
  set('statNew30d', String(stats.new_last_30_days));
  set('statTotalBalance', formatMoney(stats.total_balance));
}

let currentAdminId: number | null = null;

function formatDate(s: string | undefined): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return s;
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function formatDateTime(s: string | undefined): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return s;
  }
}

let clientNames: Record<number, string> = {};
let lastClients: AdminClientWithStats[] = [];

function filterClients(clients: AdminClientWithStats[]): AdminClientWithStats[] {
  const search = (document.getElementById('clientsSearchInput') as HTMLInputElement)?.value?.toLowerCase().trim() || '';
  const statusFilter = (document.getElementById('clientsStatusFilter') as HTMLSelectElement)?.value || '';
  let result = clients;
  if (search) {
    result = result.filter(
      (c) =>
        c.user.email.toLowerCase().includes(search) ||
        (c.user.name || '').toLowerCase().includes(search)
    );
  }
  if (statusFilter === 'active') result = result.filter((c) => c.user.is_active);
  if (statusFilter === 'inactive') result = result.filter((c) => !c.user.is_active);
  return result;
}

let activityLogsPage = 1;
let apiLogsPage = 1;
let lastActivityLogs: adminApi.ActivityLogEntry[] = [];
let lastApiLogs: ExternalApiLog[] = [];
let loadActivityLogsData: () => Promise<void> = async () => {};
let loadApiLogsData: () => Promise<void> = async () => {};

function getActivityLogsParams() {
  return {
    userId: Number((document.getElementById('activityLogsUserFilter') as HTMLSelectElement)?.value) || undefined,
    action: (document.getElementById('activityLogsActionFilter') as HTMLSelectElement)?.value || undefined,
    dateFrom: (document.getElementById('activityLogsDateFrom') as HTMLInputElement)?.value || undefined,
    dateTo: (document.getElementById('activityLogsDateTo') as HTMLInputElement)?.value || undefined,
    search: (document.getElementById('activityLogsSearch') as HTMLInputElement)?.value || undefined,
    perPage: Number((document.getElementById('activityLogsPerPage') as HTMLSelectElement)?.value) || 50,
    page: activityLogsPage,
  };
}

function getApiLogsParams() {
  return {
    service: (document.getElementById('apiLogsServiceFilter') as HTMLSelectElement)?.value || undefined,
    dateFrom: (document.getElementById('apiLogsDateFrom') as HTMLInputElement)?.value || undefined,
    dateTo: (document.getElementById('apiLogsDateTo') as HTMLInputElement)?.value || undefined,
    perPage: Number((document.getElementById('apiLogsPerPage') as HTMLSelectElement)?.value) || 50,
    page: apiLogsPage,
  };
}

async function loadActivityLogs(): Promise<adminApi.ActivityLogsResponse> {
  return adminApi.adminActivityLogs(getActivityLogsParams());
}

function formatActivityDetails(details: Record<string, unknown> | undefined): string {
  if (!details || Object.keys(details).length === 0) return '—';
  const parts: string[] = [];
  if (details.changes && typeof details.changes === 'object') {
    const ch = details.changes as Record<string, { old?: string; new?: string }>;
    for (const [k, v] of Object.entries(ch)) {
      if (v?.old !== undefined || v?.new !== undefined) {
        parts.push(`${k}: ${v.old ?? '—'} → ${v.new ?? '—'}`);
      }
    }
  }
  if (details.feature) parts.push(`Функция: ${details.feature}`);
  if (details.action) parts.push(`Действие: ${details.action}`);
  if (details.target_email) parts.push(`Клиент: ${details.target_email}`);
  if (details.goal_name) parts.push(`Цель: ${details.goal_name}`);
  if (details.amount_saved !== undefined) parts.push(`Накоплено: ${details.amount_saved}`);
  if (details.created !== undefined) parts.push(`Создано: ${details.created}`);
  if (details.rows_count !== undefined) parts.push(`Строк: ${details.rows_count}`);
  if (details.type) parts.push(`Тип: ${details.type}`);
  if (details.amount !== undefined) parts.push(`Сумма: ${details.amount}`);
  if (details.date) parts.push(`Дата: ${details.date}`);
  if (details.rates && typeof details.rates === 'object') {
    parts.push(`Курсы: ${JSON.stringify(details.rates)}`);
  }
  return parts.length > 0 ? escapeHtml(parts.join(' · ')) : '—';
}

const ACTION_LABELS: Record<string, string> = {
  login: 'Вход', impersonate: 'Вход как клиент', transaction_create: 'Создана операция',
  transaction_delete: 'Удалена операция', goal_complete: 'Цель завершена', goal_create: 'Создана цель',
  settings_update: 'Обновлены настройки', experimental_use: 'Экспериментальная функция',
  payment_create: 'Создан платёж', payment_update: 'Обновлён платёж', payment_delete: 'Удалён платёж',
  account_create: 'Создан счёт', account_update: 'Обновлён счёт', account_delete: 'Удалён счёт',
  balance_sync: 'Синх. баланса', category_create: 'Создана категория', category_update: 'Обновлена категория',
  category_delete: 'Удалена категория', category_restore: 'Восстановлена категория',
  push_subscribe: 'Push подписка', push_unsubscribe: 'Push отписка',
  admin_push_send: 'Адм: push', admin_client_create: 'Адм: создан клиент', admin_client_update: 'Адм: обновлён клиент',
};

function renderPagination(containerId: string, meta: adminApi.PaginationMeta, onPage: (p: number) => void): void {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (meta.last_page <= 1) { el.innerHTML = ''; return; }
  const pages: string[] = [];
  for (let p = 1; p <= meta.last_page; p++) {
    pages.push(`<button class="admin-page-btn${p === meta.page ? ' active' : ''}" data-page="${p}">${p}</button>`);
  }
  el.innerHTML = `<span>Всего: ${meta.total}</span> ${pages.join('')}`;
  el.querySelectorAll('.admin-page-btn').forEach((btn) => {
    btn.addEventListener('click', () => onPage(Number((btn as HTMLElement).dataset.page)));
  });
}

function showLogDetailModal(title: string, details: unknown): void {
  const json = JSON.stringify(details, null, 2);
  modal.alert(`<pre style="white-space:pre-wrap;font-size:12px;max-height:400px;overflow:auto">${escapeHtml(json)}</pre>`, title);
}

function renderActivityLogs(response: adminApi.ActivityLogsResponse): void {
  const tbody = document.getElementById('activityLogsBody')!;
  lastActivityLogs = response.data;

  // Update action type filter
  const actionSel = document.getElementById('activityLogsActionFilter') as HTMLSelectElement;
  if (actionSel && response.action_types.length > 0) {
    const cur = actionSel.value;
    actionSel.innerHTML = '<option value="">Все действия</option>' +
      response.action_types.map((a) => `<option value="${a}"${a === cur ? ' selected' : ''}>${ACTION_LABELS[a] ?? a}</option>`).join('');
  }

  if (response.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Нет логов</td></tr>';
    renderPagination('activityLogsPagination', response.meta, (p) => { activityLogsPage = p; void loadActivityLogsData(); });
    return;
  }

  tbody.innerHTML = response.data.map((log, i) => {
    const clientLabel = log.user_name || log.user_email || `#${log.user_id}`;
    const actionLabel = ACTION_LABELS[log.action] ?? escapeHtml(log.action);
    const detailsHtml = formatActivityDetails(log.details);
    const uaShort = log.user_agent ? escapeHtml(log.user_agent.slice(0, 40) + (log.user_agent.length > 40 ? '…' : '')) : '—';
    return `<tr class="log-row" data-idx="${i}" style="cursor:pointer">
      <td>${formatDateTime(log.created_at)}</td>
      <td>${escapeHtml(clientLabel)}</td>
      <td>${actionLabel}</td>
      <td class="activity-details">${detailsHtml.length > 50 ? detailsHtml.slice(0, 50) + '…' : detailsHtml}</td>
      <td>${escapeHtml(log.ip || '—')}</td>
      <td>${uaShort}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.log-row').forEach((row) => {
    row.addEventListener('click', () => {
      const idx = Number((row as HTMLElement).dataset.idx);
      const log = lastActivityLogs[idx];
      if (log) showLogDetailModal(`Лог #${log.id} — ${log.action}`, { action: log.action, user: log.user_email, ip: log.ip, details: log.details, user_agent: log.user_agent, created_at: log.created_at });
    });
  });

  renderPagination('activityLogsPagination', response.meta, (p) => { activityLogsPage = p; void loadActivityLogsData(); });
}

function populateActivityLogsUserFilter(clients: AdminClientWithStats[]): void {
  const sel = document.getElementById('activityLogsUserFilter') as HTMLSelectElement;
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Все клиенты</option>' + clients
    .map((c) => `<option value="${c.user.id}">${escapeHtml(c.user.name || c.user.email)}</option>`)
    .join('');
  if (current) sel.value = current;
}

async function loadApiLogs(): Promise<adminApi.ApiLogsResponse> {
  return adminApi.adminExternalApiLogs(getApiLogsParams());
}

function renderApiLogs(response: adminApi.ApiLogsResponse): void {
  const tbody = document.getElementById('apiLogsBody')!;
  lastApiLogs = response.data;

  // Render metrics bar (#17)
  const metricsEl = document.getElementById('apiLogsMetrics');
  if (metricsEl) {
    const m = response.metrics;
    const sr = m.success_rate_24h != null ? `${m.success_rate_24h}%` : '—';
    metricsEl.innerHTML = `
      <div class="admin-stat-card"><span class="admin-stat-value">${m.total_24h}</span><span class="admin-stat-label">Запросов/24ч</span></div>
      <div class="admin-stat-card"><span class="admin-stat-value">${sr}</span><span class="admin-stat-label">Успешность</span></div>
      <div class="admin-stat-card"><span class="admin-stat-value" style="color:var(--danger)">${m.errors_24h}</span><span class="admin-stat-label">Ошибок</span></div>
      <div class="admin-stat-card"><span class="admin-stat-value">${m.avg_duration_ms ?? '—'} мс</span><span class="admin-stat-label">Ср. время</span></div>
    `;
  }

  if (response.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Нет логов</td></tr>';
    renderPagination('apiLogsPagination', response.meta, (p) => { apiLogsPage = p; void loadApiLogsData(); });
    return;
  }

  tbody.innerHTML = response.data.map((log, i) => {
    const statusClass = log.status_code && log.status_code >= 200 && log.status_code < 300 ? 'badge-success' : 'badge-danger';
    const statusText = log.status_code ?? (log.error_message ? 'Ошибка' : '—');
    const clientName = log.client_id ? (clientNames[log.client_id] ?? `#${log.client_id}`) : '—';
    const errorShort = log.error_message ? escapeHtml(log.error_message.slice(0, 60) + (log.error_message.length > 60 ? '…' : '')) : '—';
    return `<tr class="log-row" data-idx="${i}" style="cursor:pointer">
      <td>${formatDateTime(log.created_at)}</td>
      <td>${escapeHtml(log.service)}</td>
      <td>${escapeHtml(clientName)}</td>
      <td><span class="badge ${statusClass}">${statusText}</span></td>
      <td>${log.duration_ms ?? '—'}</td>
      <td>${errorShort}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.log-row').forEach((row) => {
    row.addEventListener('click', () => {
      const idx = Number((row as HTMLElement).dataset.idx);
      const log = lastApiLogs[idx];
      if (log) showLogDetailModal(`API лог #${log.id} — ${log.service}`, { service: log.service, endpoint: log.endpoint, status: log.status_code, duration_ms: log.duration_ms, error: log.error_message, request_meta: log.request_meta, response_meta: log.response_meta, created_at: log.created_at });
    });
  });

  renderPagination('apiLogsPagination', response.meta, (p) => { apiLogsPage = p; void loadApiLogsData(); });
}

let clientSortKey = '';
let clientSortAsc = true;

function sortClients(clients: AdminClientWithStats[]): AdminClientWithStats[] {
  if (!clientSortKey) return clients;
  return [...clients].sort((a, b) => {
    let va: string | number = '';
    let vb: string | number = '';
    switch (clientSortKey) {
      case 'email': va = a.user.email; vb = b.user.email; break;
      case 'name': va = a.user.name || ''; vb = b.user.name || ''; break;
      case 'created_at': va = a.user.created_at || ''; vb = b.user.created_at || ''; break;
      case 'last_login_at': va = a.user.last_login_at || ''; vb = b.user.last_login_at || ''; break;
      case 'transaction_count': va = a.transaction_count ?? 0; vb = b.transaction_count ?? 0; break;
      case 'balance': va = a.balance ?? 0; vb = b.balance ?? 0; break;
    }
    const cmp = typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb));
    return clientSortAsc ? cmp : -cmp;
  });
}

function updateSortHeaders(): void {
  document.querySelectorAll('#clientsTable th.sortable').forEach((th) => {
    const key = (th as HTMLElement).dataset.sort ?? '';
    th.classList.toggle('sort-asc', key === clientSortKey && clientSortAsc);
    th.classList.toggle('sort-desc', key === clientSortKey && !clientSortAsc);
  });
}

function renderClients(clients: AdminClientWithStats[], applyFilter = true): void {
  lastClients = clients;
  const filtered = applyFilter ? filterClients(clients) : clients;
  const toRender = sortClients(filtered);
  updateSortHeaders();
  const tbody = document.getElementById('clientsBody')!;
  if (toRender.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="empty-state">' + (clients.length === 0 ? 'Нет клиентов' : 'Ничего не найдено') + '</td></tr>';
    return;
  }

  const isSelf = (id: number) => currentAdminId !== null && id === currentAdminId;

  tbody.innerHTML = toRender
    .map((c) => {
      const u = c.user;
      const status = u.is_active ? 'Активен' : 'Неактивен';
      const statusClass = u.is_active ? 'badge-success' : 'badge-danger';
      const deactivateLabel = u.is_active ? 'Деактивировать' : 'Активировать';
      const self = isSelf(u.id);
      const actionsHtml = self
        ? '<span class="text-muted" title="Это вы">—</span>'
        : `
          <button class="btn btn-sm btn-edit" data-id="${u.id}" title="Редактировать">✏️</button>
          <button class="btn btn-sm btn-toggle-active" data-id="${u.id}" data-active="${u.is_active}" title="${deactivateLabel}">${u.is_active ? '🚫' : '✅'}</button>
          <button class="btn btn-sm btn-impersonate" data-id="${u.id}" title="Войти как клиент">🔑</button>
        `;
      return `
      <tr>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.name || '—')}</td>
        <td>${formatDate(u.created_at)}</td>
        <td>${formatDate(u.last_login_at)}</td>
        <td>${c.transaction_count}</td>
        <td>${formatMoney(c.balance ?? 0)}</td>
        <td><span class="badge ${statusClass}">${status}</span></td>
        <td>${actionsHtml}</td>
      </tr>
    `;
    })
    .join('');
}

const clientModal = document.getElementById('clientModal')!;
const form = document.getElementById('clientForm') as HTMLFormElement;
const clientIdInput = document.getElementById('clientId') as HTMLInputElement;
const clientEmailInput = document.getElementById('clientEmail') as HTMLInputElement;
const clientPasswordInput = document.getElementById(
  'clientPassword'
) as HTMLInputElement;
const clientNameInput = document.getElementById('clientName') as HTMLInputElement;
const clientActiveInput = document.getElementById(
  'clientActive'
) as HTMLInputElement;
const expBankReceiptInput = document.getElementById('expBankReceipt') as HTMLInputElement;
const expNotesInput = document.getElementById('expNotes') as HTMLInputElement;
const expCalendarInput = document.getElementById('expCalendar') as HTMLInputElement;
const expTelegramInput = document.getElementById('expTelegram') as HTMLInputElement;
const expAdvancedAnalyticsInput = document.getElementById('expAdvancedAnalytics') as HTMLInputElement;
const expAutoDebitInput = document.getElementById('expAutoDebit') as HTMLInputElement;
const expAutoSavingsInput = document.getElementById('expAutoSavings') as HTMLInputElement;
const expAiAnalysisInput = document.getElementById('expAiAnalysis') as HTMLInputElement;
const passwordGroup = document.getElementById('passwordGroup')!;
const activeGroup = document.getElementById('activeGroup')!;
const experimentalGroup = document.getElementById('experimentalGroup')!;
const aiProviderGroup = document.getElementById('aiProviderGroup')!;
const modalTitle = document.getElementById('clientModalTitle')!;

function getSelectedAiProvider(): string {
  const checked = clientModal.querySelector<HTMLInputElement>('input[name="ai_provider"]:checked');
  return checked?.value ?? '';
}

function setAiProvider(features: string[]): void {
  const match = features.find(f => f.startsWith('ai_provider:'));
  const value = match ? match.replace('ai_provider:', '') : '';
  const radio = clientModal.querySelector<HTMLInputElement>(`input[name="ai_provider"][value="${value}"]`);
  if (radio) radio.checked = true;
  else (clientModal.querySelector<HTMLInputElement>('input[name="ai_provider"][value=""]'))!.checked = true;
}

function openModal(isEdit: boolean, client?: AdminClientWithStats): void {
  clientModal.classList.add('show');
  if (isEdit && client) {
    modalTitle.textContent = 'Редактировать клиента';
    clientIdInput.value = String(client.user.id);
    clientEmailInput.value = client.user.email;
    clientNameInput.value = client.user.name || '';
    clientActiveInput.checked = client.user.is_active;
    clientPasswordInput.value = '';
    clientPasswordInput.required = false;
    passwordGroup.style.display = 'block';
    activeGroup.style.display = 'block';
    experimentalGroup.style.display = 'block';
    aiProviderGroup.style.display = 'block';
    const features = client.user.experimental_features || [];
    expBankReceiptInput.checked = features.includes('bank_receipt_import');
    expNotesInput.checked = features.includes('notes');
    expCalendarInput.checked = features.includes('calendar');
    expTelegramInput.checked = features.includes('telegram_bot');
    expAdvancedAnalyticsInput.checked = features.includes('advanced_analytics');
    expAutoDebitInput.checked = features.includes('auto_debit');
    expAutoSavingsInput.checked = features.includes('auto_savings');
    expAiAnalysisInput.checked = features.includes('ai_analysis');
    setAiProvider(features);
  } else {
    modalTitle.textContent = 'Новый клиент';
    clientIdInput.value = '';
    form.reset();
    clientPasswordInput.required = true;
    passwordGroup.style.display = 'block';
    activeGroup.style.display = 'none';
    experimentalGroup.style.display = 'block';
    aiProviderGroup.style.display = 'block';
    expBankReceiptInput.checked = false;
    expNotesInput.checked = false;
    expCalendarInput.checked = false;
    expTelegramInput.checked = false;
    expAdvancedAnalyticsInput.checked = false;
    expAutoDebitInput.checked = false;
    expAutoSavingsInput.checked = false;
    expAiAnalysisInput.checked = false;
    setAiProvider([]);
  }
}

function closeModal(): void {
  clientModal.classList.remove('show');
}

clientModal.querySelectorAll('.modal-close').forEach((btn) => {
  btn.addEventListener('click', closeModal);
});
clientModal.addEventListener('click', (e) => {
  if (e.target === clientModal) closeModal();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = clientIdInput.value;
  const isEdit = !!id;

  try {
    if (isEdit) {
      const payload: {
        email?: string;
        password?: string;
        name?: string;
        is_active?: boolean;
        experimental_features?: string[];
      } = {
        email: clientEmailInput.value,
        name: clientNameInput.value || undefined,
        is_active: clientActiveInput.checked,
      };
      if (clientPasswordInput.value) payload.password = clientPasswordInput.value;
      const features: string[] = [];
      if (expBankReceiptInput.checked) features.push('bank_receipt_import');
      if (expNotesInput.checked) features.push('notes');
      if (expCalendarInput.checked) features.push('calendar');
      if (expTelegramInput.checked) features.push('telegram_bot');
      if (expAdvancedAnalyticsInput.checked) features.push('advanced_analytics');
      if (expAutoDebitInput.checked) features.push('auto_debit');
      if (expAutoSavingsInput.checked) features.push('auto_savings');
      if (expAiAnalysisInput.checked) features.push('ai_analysis');
      const aiProvider = getSelectedAiProvider();
      if (aiProvider) features.push(`ai_provider:${aiProvider}`);
      payload.experimental_features = features;
      await adminApi.adminUpdateClient(Number(id), payload);
    } else {
      await adminApi.adminCreateClient({
        email: clientEmailInput.value,
        password: clientPasswordInput.value,
        name: clientNameInput.value || '',
      });
    }
    closeModal();
    const clients = await loadClients();
    renderClients(clients, false);
    populateActivityLogsUserFilter(clients);
  } catch (err) {
    modal.alert((err as Error).message, 'Ошибка');
  }
});

document.getElementById('addClientBtn')!.addEventListener('click', () =>
  openModal(false)
);

document.getElementById('clientsBody')!.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  const editBtn = target.closest('.btn-edit');
  const toggleBtn = target.closest('.btn-toggle-active');
  const impersonateBtn = target.closest('.btn-impersonate');

  if (editBtn) {
    const id = Number(editBtn.getAttribute('data-id'));
    const client = await adminApi.adminGetClient(id);
    openModal(true, client);
  } else if (toggleBtn) {
    const id = Number(toggleBtn.getAttribute('data-id'));
    const isActive = toggleBtn.getAttribute('data-active') === 'true';
    try {
      await adminApi.adminUpdateClient(id, { is_active: !isActive });
      const clients = await loadClients();
      renderClients(clients, false);
    } catch (err) {
      modal.alert((err as Error).message, 'Ошибка');
    }
  } else if (impersonateBtn) {
    const id = Number(impersonateBtn.getAttribute('data-id'));
    try {
      const adminToken = localStorage.getItem('auth_token');
      const { token: newToken } = await adminApi.adminImpersonate(id);
      if (adminToken) localStorage.setItem('auth_token_admin', adminToken);
      localStorage.setItem('auth_token', newToken);
      localStorage.setItem('user_is_admin', '0'); // impersonate = client role
      window.location.href = '/';
    } catch (err) {
      modal.alert((err as Error).message, 'Ошибка');
    }
  }
});

document.getElementById('logoutBtn')!.addEventListener('click', () => {
  localStorage.removeItem('auth_token');
  window.location.href = '/login.html';
});

// ── Tab Router (#20) ───────────────────────────────────────────────────
const TAB_SECTIONS = [
  'adminDashboard', 'adminSectionCharts', 'adminSectionClients',
  'adminSectionPush', 'adminSectionRules', 'adminSectionReceipts',
  'adminSectionActivity', 'adminSectionApiLogs',
] as const;
type TabId = typeof TAB_SECTIONS[number];

function showTab(id: string): void {
  const tabId = (TAB_SECTIONS.includes(id as TabId) ? id : 'adminDashboard') as TabId;
  TAB_SECTIONS.forEach((s) => {
    const el = document.getElementById(s);
    if (el) el.style.display = s === tabId ? '' : 'none';
  });
  document.querySelectorAll('.admin-section-link').forEach((a) => {
    const href = (a as HTMLAnchorElement).getAttribute('href') ?? '';
    a.classList.toggle('active', href === `#${tabId}`);
  });
  localStorage.setItem('admin_active_tab', tabId);
}

document.querySelectorAll('.admin-section-link').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const href = (a as HTMLAnchorElement).getAttribute('href') ?? '';
    const id = href.replace('#', '');
    history.pushState(null, '', href);
    showTab(id);
  });
});

window.addEventListener('popstate', () => {
  showTab(location.hash.replace('#', '') || 'adminDashboard');
});

const initialTab = location.hash.replace('#', '') || localStorage.getItem('admin_active_tab') || 'adminDashboard';
showTab(initialTab);

// ── Auto-refresh (#23) ─────────────────────────────────────────────────
let autoRefreshInterval: ReturnType<typeof setInterval> | null = null;

function setupAutoRefresh(): void {
  const sel = document.getElementById('adminAutoRefresh') as HTMLSelectElement | null;
  if (!sel) return;
  sel.addEventListener('change', () => {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    const secs = Number(sel.value);
    if (secs > 0) {
      autoRefreshInterval = setInterval(() => {
        void loadActivityLogsData();
        void loadApiLogsData();
      }, secs * 1000);
    }
    localStorage.setItem('admin_auto_refresh', sel.value);
  });
  const saved = localStorage.getItem('admin_auto_refresh');
  if (saved) { sel.value = saved; sel.dispatchEvent(new Event('change')); }
}

// ── Hotkeys (#25) ──────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.shiftKey && !e.altKey) {
    const tabMap: Record<string, TabId> = {
      '1': 'adminDashboard', '2': 'adminSectionCharts', '3': 'adminSectionClients',
      '4': 'adminSectionPush', '5': 'adminSectionRules', '6': 'adminSectionReceipts',
      '7': 'adminSectionActivity', '8': 'adminSectionApiLogs',
    };
    if (tabMap[e.key]) {
      e.preventDefault();
      history.pushState(null, '', `#${tabMap[e.key]}`);
      showTab(tabMap[e.key]);
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      const active = localStorage.getItem('admin_active_tab') ?? 'adminDashboard';
      if (active === 'adminSectionActivity') void loadActivityLogsData();
      else if (active === 'adminSectionApiLogs') void loadApiLogsData();
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      const active = localStorage.getItem('admin_active_tab') ?? '';
      if (active === 'adminSectionClients') (document.getElementById('clientsSearchInput') as HTMLInputElement)?.focus();
      else if (active === 'adminSectionActivity') (document.getElementById('activityLogsSearch') as HTMLInputElement)?.focus();
    }
  }
});

// ── Save/restore filters (#26) ─────────────────────────────────────────
function saveFiltersToStorage(): void {
  const perPage1 = (document.getElementById('activityLogsPerPage') as HTMLSelectElement)?.value;
  const perPage2 = (document.getElementById('apiLogsPerPage') as HTMLSelectElement)?.value;
  if (perPage1) localStorage.setItem('admin_activity_per_page', perPage1);
  if (perPage2) localStorage.setItem('admin_api_per_page', perPage2);
}

function restoreFiltersFromStorage(): void {
  const pp1 = localStorage.getItem('admin_activity_per_page');
  const pp2 = localStorage.getItem('admin_api_per_page');
  if (pp1) { const s = document.getElementById('activityLogsPerPage') as HTMLSelectElement; if (s) s.value = pp1; }
  if (pp2) { const s = document.getElementById('apiLogsPerPage') as HTMLSelectElement; if (s) s.value = pp2; }
}

document.getElementById('activityLogsPerPage')?.addEventListener('change', saveFiltersToStorage);
document.getElementById('apiLogsPerPage')?.addEventListener('change', saveFiltersToStorage);

restoreFiltersFromStorage();

checkAdmin().then(async () => {
  setupAutoRefresh();
  const loadChartsData = async () => {
    try {
      const data = await loadCharts();
      renderCharts(data);
    } catch (err) {
      console.error('[Admin] Charts load error:', err);
      const el = document.getElementById('adminCharts');
      if (el) el.innerHTML = '<p class="empty-state">Ошибка загрузки графиков</p>';
    }
  };

  const [dashboard, clients, _charts] = await Promise.all([
    loadDashboard(),
    loadClients(),
    loadChartsData(),
  ]);
  renderDashboard(dashboard);
  clientNames = Object.fromEntries(clients.map((c) => [c.user.id, c.user.name || c.user.email]));
  renderClients(clients, false);
  populateActivityLogsUserFilter(clients);

  document.getElementById('chartsMonths')?.addEventListener('change', loadChartsData);

  const applyClientFilters = () => renderClients(lastClients);
  document.getElementById('clientsSearchInput')?.addEventListener('input', applyClientFilters);
  document.getElementById('clientsStatusFilter')?.addEventListener('change', applyClientFilters);

  document.querySelectorAll('#clientsTable th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const key = (th as HTMLElement).dataset.sort ?? '';
      if (clientSortKey === key) { clientSortAsc = !clientSortAsc; }
      else { clientSortKey = key; clientSortAsc = true; }
      renderClients(lastClients);
    });
  });

  // ── Activity Logs ──────────────────────────────────────────────────
  loadActivityLogsData = async () => {
    try {
      const response = await loadActivityLogs();
      renderActivityLogs(response);
    } catch (err) {
      console.error('[Admin] Activity logs load error:', err);
      document.getElementById('activityLogsBody')!.innerHTML =
        '<tr><td colspan="6" class="empty-state">Ошибка загрузки</td></tr>';
    }
  };

  let activitySearchTimer: ReturnType<typeof setTimeout>;
  const onActivitySearchInput = () => {
    clearTimeout(activitySearchTimer);
    activitySearchTimer = setTimeout(() => { activityLogsPage = 1; void loadActivityLogsData(); }, 300);
  };
  const onActivityFilterChange = () => { activityLogsPage = 1; void loadActivityLogsData(); };

  document.getElementById('refreshActivityLogsBtn')?.addEventListener('click', onActivityFilterChange);
  document.getElementById('activityLogsUserFilter')?.addEventListener('change', onActivityFilterChange);
  document.getElementById('activityLogsActionFilter')?.addEventListener('change', onActivityFilterChange);
  document.getElementById('activityLogsDateFrom')?.addEventListener('change', onActivityFilterChange);
  document.getElementById('activityLogsDateTo')?.addEventListener('change', onActivityFilterChange);
  document.getElementById('activityLogsPerPage')?.addEventListener('change', onActivityFilterChange);
  document.getElementById('activityLogsSearch')?.addEventListener('input', onActivitySearchInput);

  document.getElementById('exportActivityLogsCsvBtn')?.addEventListener('click', () => {
    const headers = ['ID', 'Время', 'Пользователь', 'Действие', 'IP', 'Детали'];
    const rows = lastActivityLogs.map((l) => [
      l.id, l.created_at, l.user_email ?? l.user_id, l.action, l.ip ?? '', JSON.stringify(l.details ?? {}),
    ]);
    downloadCsv('activity-logs.csv', headers, rows);
  });

  // ── API Logs ───────────────────────────────────────────────────────
  loadApiLogsData = async () => {
    try {
      const response = await loadApiLogs();
      renderApiLogs(response);
    } catch (err) {
      document.getElementById('apiLogsBody')!.innerHTML =
        '<tr><td colspan="6" class="empty-state">Ошибка загрузки</td></tr>';
    }
  };

  const onApiFilterChange = () => { apiLogsPage = 1; void loadApiLogsData(); };
  document.getElementById('refreshApiLogsBtn')?.addEventListener('click', onApiFilterChange);
  document.getElementById('apiLogsServiceFilter')?.addEventListener('change', onApiFilterChange);
  document.getElementById('apiLogsDateFrom')?.addEventListener('change', onApiFilterChange);
  document.getElementById('apiLogsDateTo')?.addEventListener('change', onApiFilterChange);
  document.getElementById('apiLogsPerPage')?.addEventListener('change', onApiFilterChange);

  document.getElementById('exportApiLogsCsvBtn')?.addEventListener('click', () => {
    const headers = ['ID', 'Время', 'Сервис', 'Клиент', 'Статус', 'Мс', 'Ошибка'];
    const rows = lastApiLogs.map((l) => [
      l.id, l.created_at, l.service, l.client_id ?? '', l.status_code ?? '', l.duration_ms ?? '', l.error_message ?? '',
    ]);
    downloadCsv('api-logs.csv', headers, rows);
  });

  await Promise.all([loadActivityLogsData(), loadApiLogsData()]);

  document.getElementById('exportClientsCsvBtn')?.addEventListener('click', exportClientsCsv);

  // Push section
  const pushTargetSel = document.getElementById('pushTarget') as HTMLSelectElement;
  const pushUserGroup = document.getElementById('pushUserGroup')!;
  const pushUserIdSel = document.getElementById('pushUserId') as HTMLSelectElement;
  const pushScheduleCb = document.getElementById('pushSchedule') as HTMLInputElement;
  const pushScheduleGroup = document.getElementById('pushScheduleGroup')!;
  const sendPushNowBtn = document.getElementById('sendPushNowBtn')!;
  const schedulePushBtn = document.getElementById('schedulePushBtn')!;

  pushTargetSel?.addEventListener('change', () => {
    pushUserGroup.style.display = pushTargetSel.value === 'user' ? 'block' : 'none';
  });
  pushScheduleCb?.addEventListener('change', () => {
    const show = pushScheduleCb.checked;
    pushScheduleGroup.style.display = show ? 'block' : 'none';
    schedulePushBtn.style.display = show ? 'inline-block' : 'none';
    sendPushNowBtn.style.display = show ? 'none' : 'inline-block';
  });

  function populatePushUserSelect(): void {
    pushUserIdSel.innerHTML = '<option value="">— Выберите —</option>' + lastClients
      .map((c) => `<option value="${c.user.id}">${escapeHtml(c.user.name || c.user.email)} (${escapeHtml(c.user.email)})</option>`)
      .join('');
  }
  populatePushUserSelect();

  async function loadPushCampaigns(): Promise<void> {
    try {
      const { campaigns } = await adminApi.adminPushCampaigns();
      renderPushCampaigns(campaigns);
    } catch (err) {
      document.getElementById('pushCampaignsBody')!.innerHTML =
        '<tr><td colspan="5" class="empty-state">Ошибка загрузки</td></tr>';
    }
  }

  function renderPushCampaigns(campaigns: adminApi.PushCampaign[]): void {
    const tbody = document.getElementById('pushCampaignsBody')!;
    if (campaigns.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Нет кампаний</td></tr>';
      return;
    }
    tbody.innerHTML = campaigns.map((c) => {
      const target = c.target === 'user' && c.target_user_id
        ? (clientNames[c.target_user_id] ?? `#${c.target_user_id}`)
        : 'Всем';
      return `
        <tr>
          <td>${escapeHtml(c.title)}</td>
          <td>${escapeHtml(target)}</td>
          <td>${formatDateTime(c.scheduled_at ?? undefined)}</td>
          <td>${formatDateTime(c.sent_at ?? undefined)}</td>
          <td>${c.sent_count}</td>
        </tr>
      `;
    }).join('');
  }

  sendPushNowBtn?.addEventListener('click', async () => {
    const title = (document.getElementById('pushTitle') as HTMLInputElement)?.value?.trim();
    const body = (document.getElementById('pushBody') as HTMLTextAreaElement)?.value?.trim();
    const target = pushTargetSel?.value as 'all' | 'user';
    const userId = pushUserIdSel?.value ? Number(pushUserIdSel.value) : undefined;
    if (!title || !body) {
      modal.alert('Заполните заголовок и текст', 'Ошибка');
      return;
    }
    if (target === 'user' && !userId) {
      modal.alert('Выберите пользователя', 'Ошибка');
      return;
    }
    try {
      const { sent } = await adminApi.adminPushSend({ title, body, target, user_id: userId });
      modal.alert(`Отправлено: ${sent} получателей`, 'Готово');
      (document.getElementById('pushTitle') as HTMLInputElement).value = '';
      (document.getElementById('pushBody') as HTMLTextAreaElement).value = '';
    } catch (err) {
      modal.alert((err as Error).message, 'Ошибка');
    }
  });

  schedulePushBtn?.addEventListener('click', async () => {
    const title = (document.getElementById('pushTitle') as HTMLInputElement)?.value?.trim();
    const body = (document.getElementById('pushBody') as HTMLTextAreaElement)?.value?.trim();
    const target = pushTargetSel?.value as 'all' | 'user';
    const userId = pushUserIdSel?.value ? Number(pushUserIdSel.value) : undefined;
    const scheduledAt = (document.getElementById('pushScheduledAt') as HTMLInputElement)?.value;
    if (!title || !body) {
      modal.alert('Заполните заголовок и текст', 'Ошибка');
      return;
    }
    if (target === 'user' && !userId) {
      modal.alert('Выберите пользователя', 'Ошибка');
      return;
    }
    if (!scheduledAt) {
      modal.alert('Укажите дату и время отправки', 'Ошибка');
      return;
    }
    try {
      await adminApi.adminPushCreateCampaign({ title, body, target, user_id: userId, scheduled_at: scheduledAt });
      modal.alert('Кампания запланирована', 'Готово');
      (document.getElementById('pushTitle') as HTMLInputElement).value = '';
      (document.getElementById('pushBody') as HTMLTextAreaElement).value = '';
      pushScheduleCb.checked = false;
      pushScheduleGroup.style.display = 'none';
      schedulePushBtn.style.display = 'none';
      sendPushNowBtn.style.display = 'inline-block';
      await loadPushCampaigns();
    } catch (err) {
      modal.alert((err as Error).message, 'Ошибка');
    }
  });

  document.getElementById('refreshPushCampaignsBtn')?.addEventListener('click', loadPushCampaigns);
  await loadPushCampaigns();

  // Categorization rules section
  const adminRulesBody = document.getElementById('adminRulesBody')!;
  const adminCandidatesBody = document.getElementById('adminCandidatesBody')!;
  const adminRuleModal = document.getElementById('adminRuleModal')!;
  const adminRuleForm = document.getElementById('adminRuleForm') as HTMLFormElement;
  const adminRuleIdInput = document.getElementById('adminRuleId') as HTMLInputElement;
  const adminRuleModalTitle = document.getElementById('adminRuleModalTitle')!;

  async function loadRules(): Promise<void> {
    try {
      const [rulesData, candidatesData] = await Promise.all([
        adminApi.adminCategorizationRules(),
        adminApi.adminCategorizationRuleCandidates(),
      ]);
      const rules = rulesData.rules;
      const candidates = candidatesData.candidates;

      if (rules.length === 0) {
        adminRulesBody.innerHTML = '<tr><td colspan="7" class="empty-state">Нет правил</td></tr>';
      } else {
        const statusLabels: Record<string, string> = {
          auto: '✅ Авто',
          suggestion: '⚠️ Предложение',
          review: '📋 На проверку',
          candidate: '⚡ Кандидат',
        };
        adminRulesBody.innerHTML = rules
          .map((r) => {
            const pattern = r.merchant_pattern || r.name || '—';
            const status = statusLabels[r.status] ?? r.status;
            return `
              <tr>
                <td>${escapeHtml(pattern)}</td>
                <td>${escapeHtml(r.category_name || '—')}</td>
                <td>${r.applied}</td>
                <td>${r.accepted}</td>
                <td>${r.accuracy_percent != null ? r.accuracy_percent + '%' : '—'}</td>
                <td>${status}</td>
                <td>
                  <button class="btn btn-sm btn-edit admin-rule-stats" data-id="${r.id}" title="Статистика">📊</button>
                  <button class="btn btn-sm btn-edit admin-rule-edit" data-id="${r.id}" title="Редактировать">✏️</button>
                  ${r.accuracy_percent != null && r.accuracy_percent < 60 && r.status !== 'suggestion' ? `<button class="btn btn-sm btn-warning admin-rule-downgrade" data-id="${r.id}" title="Точность ${r.accuracy_percent}% — понизить до предложения">⬇️</button>` : ''}
                  <button class="btn btn-sm admin-rule-delete" data-id="${r.id}" title="Удалить">🗑️</button>
                </td>
              </tr>
            `;
          })
          .join('');
      }

      if (candidates.length === 0) {
        adminCandidatesBody.innerHTML = '<tr><td colspan="5" class="empty-state">Нет кандидатов</td></tr>';
      } else {
        adminCandidatesBody.innerHTML = candidates
          .map((c) => `
            <tr>
              <td>${escapeHtml(c.merchant)}</td>
              <td>${escapeHtml(c.category_name)}</td>
              <td>${c.total_mappings} (${c.unique_clients} польз.)</td>
              <td>${c.consistency_percent}%</td>
              <td><button class="btn btn-sm btn-primary admin-candidate-create" data-merchant="${escapeHtml(c.merchant)}" data-category="${escapeHtml(c.category_name)}">+ Создать правило</button></td>
            </tr>
          `)
          .join('');
      }
    } catch (err) {
      console.error('[Admin] Rules load error:', err);
      adminRulesBody.innerHTML = '<tr><td colspan="7" class="empty-state">Ошибка загрузки</td></tr>';
      adminCandidatesBody.innerHTML = '<tr><td colspan="5" class="empty-state">Ошибка загрузки</td></tr>';
    }
  }

  function openRuleModal(editId?: number, preset?: { merchant: string; category: string }): void {
    adminRuleModal.classList.add('show');
    adminRuleIdInput.value = editId ? String(editId) : '';
    adminRuleModalTitle.textContent = editId ? 'Редактировать правило' : 'Новое правило';
    (document.getElementById('adminRuleName') as HTMLInputElement).value = preset?.merchant ?? '';
    (document.getElementById('adminRulePattern') as HTMLInputElement).value = preset?.merchant ?? '';
    (document.getElementById('adminRuleCategory') as HTMLInputElement).value = preset?.category ?? '';
    (document.getElementById('adminRuleIsAuto') as HTMLInputElement).checked = true;
    if (!editId && !preset) adminRuleForm.reset();
  }

  function closeRuleModal(): void {
    adminRuleModal.classList.remove('show');
  }

  adminRuleModal.querySelectorAll('.modal-close').forEach((btn) => {
    btn.addEventListener('click', closeRuleModal);
  });
  adminRuleModal.addEventListener('click', (e) => {
    if (e.target === adminRuleModal) closeRuleModal();
  });

  adminRuleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = adminRuleIdInput.value;
    const pattern = (document.getElementById('adminRulePattern') as HTMLInputElement).value.trim();
    const categoryName = (document.getElementById('adminRuleCategory') as HTMLInputElement).value.trim();
    const name = (document.getElementById('adminRuleName') as HTMLInputElement).value.trim();
    const isAuto = (document.getElementById('adminRuleIsAuto') as HTMLInputElement).checked;
    if (!pattern || !categoryName) {
      modal.alert('Заполните паттерн и категорию', 'Ошибка');
      return;
    }
    try {
      if (id) {
        await adminApi.adminCategorizationRuleUpdate(Number(id), {
          name: name || undefined,
          merchant_pattern: pattern,
          category_name: categoryName,
          is_auto: isAuto,
        });
      } else {
        await adminApi.adminCategorizationRuleCreate({
          name: name || undefined,
          merchant_pattern: pattern,
          category_name: categoryName,
          is_auto: isAuto,
        });
      }
      closeRuleModal();
      await loadRules();
    } catch (err) {
      modal.alert((err as Error).message, 'Ошибка');
    }
  });

  document.getElementById('adminRulesRefreshBtn')?.addEventListener('click', loadRules);
  document.getElementById('adminRulesAddBtn')?.addEventListener('click', () => openRuleModal());

  adminRulesBody.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const statsBtn = target.closest('.admin-rule-stats');
    const editBtn = target.closest('.admin-rule-edit');
    const deleteBtn = target.closest('.admin-rule-delete');
    const downgradeBtn = target.closest('.admin-rule-downgrade');
    if (statsBtn) {
      const id = Number(statsBtn.getAttribute('data-id'));
      try {
        const data = await adminApi.adminCategorizationRuleStats(id);
        const breakdown = data.rejected_breakdown
          .map((b) => `  ↳ ${b.category_name}: ${b.count}`)
          .join('\n');
        modal.alert(
          `Правило: ${(data.rule as { name?: string }).name || data.rule.merchant_pattern}\n` +
            `Применено: ${data.applied} (у ${data.unique_clients} пользователей)\n` +
            `Принято: ${data.accepted} (${data.accuracy_percent ?? 0}%)\n` +
            `Отклонено: ${data.rejected}\n` +
            (breakdown ? `Куда меняли:\n${breakdown}` : ''),
          'Статистика'
        );
      } catch (err) {
        modal.alert((err as Error).message, 'Ошибка');
      }
    } else if (editBtn) {
      const id = Number(editBtn.getAttribute('data-id'));
      const row = (await adminApi.adminCategorizationRules()).rules.find((r) => r.id === id);
      if (row) {
        (document.getElementById('adminRuleName') as HTMLInputElement).value = row.name ?? '';
        (document.getElementById('adminRulePattern') as HTMLInputElement).value = row.merchant_pattern ?? '';
        (document.getElementById('adminRuleCategory') as HTMLInputElement).value = row.category_name ?? '';
        (document.getElementById('adminRuleIsAuto') as HTMLInputElement).checked = row.is_auto;
        openRuleModal(id);
      }
    } else if (downgradeBtn) {
      const id = Number(downgradeBtn.getAttribute('data-id'));
      if (!confirm('Понизить точность правила до статуса «Предложение»?')) return;
      try {
        await adminApi.adminCategorizationRuleUpdate(id, { is_auto: false });
        await loadRules();
      } catch (err) {
        modal.alert((err as Error).message, 'Ошибка');
      }
    } else if (deleteBtn) {
      const id = Number(deleteBtn.getAttribute('data-id'));
      if (!confirm('Удалить правило?')) return;
      try {
        await adminApi.adminCategorizationRuleDelete(id);
        await loadRules();
      } catch (err) {
        modal.alert((err as Error).message, 'Ошибка');
      }
    }
  });

  adminCandidatesBody.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const createBtn = target.closest('.admin-candidate-create');
    if (createBtn) {
      const merchant = createBtn.getAttribute('data-merchant') ?? '';
      const category = createBtn.getAttribute('data-category') ?? '';
      openRuleModal(undefined, { merchant, category });
    }
  });

  // ── Receipts section ────────────────────────────────────────────────
  const receiptsSummary = document.getElementById('adminReceiptsSummary')!;
  const aiMetricsSummary = document.getElementById('adminAiMetricsSummary')!;
  const aiMetricsBody = document.getElementById('adminAiMetricsBody')!;
  const topMappingsBody = document.getElementById('adminTopMappingsBody')!;

  async function loadReceipts(): Promise<void> {
    try {
      const [stats, ai, mappings] = await Promise.all([
        adminApi.adminBankReceiptStats(),
        adminApi.adminAiMetrics(7),
        adminApi.adminTopMappings(20),
      ]);

      receiptsSummary.innerHTML = `
        <div class="admin-stat-card"><span class="admin-stat-value">${stats.imports_30d}</span><span class="admin-stat-label">Импортов за 30 д.</span></div>
        <div class="admin-stat-card"><span class="admin-stat-value">${stats.imports_90d}</span><span class="admin-stat-label">Импортов за 90 д.</span></div>
        <div class="admin-stat-card"><span class="admin-stat-value">${stats.tx_created_30d}</span><span class="admin-stat-label">Транзакций за 30 д.</span></div>
        <div class="admin-stat-card"><span class="admin-stat-value">${stats.active_users_30d}</span><span class="admin-stat-label">Активных польз. (30 д.)</span></div>
      `;

      const sr = ai.success_rate != null ? `${ai.success_rate}%` : '—';
      aiMetricsSummary.innerHTML = `
        <div class="admin-stat-card"><span class="admin-stat-value">${ai.total_requests}</span><span class="admin-stat-label">AI-запросов (7 д.)</span></div>
        <div class="admin-stat-card"><span class="admin-stat-value">${sr}</span><span class="admin-stat-label">Успешность</span></div>
        <div class="admin-stat-card"><span class="admin-stat-value">${ai.avg_duration_ms} мс</span><span class="admin-stat-label">Ср. время ответа</span></div>
        <div class="admin-stat-card"><span class="admin-stat-value">${ai.error_count}</span><span class="admin-stat-label">Ошибок</span></div>
      `;

      if (ai.by_service.length === 0) {
        aiMetricsBody.innerHTML = '<tr><td colspan="5" class="empty-state">Нет данных</td></tr>';
      } else {
        aiMetricsBody.innerHTML = ai.by_service
          .map((s) => `<tr><td>${escapeHtml(s.service)}</td><td>${s.total}</td><td>${s.success}</td><td>${s.errors}</td><td>${s.avg_ms}</td></tr>`)
          .join('');
      }

      if (mappings.length === 0) {
        topMappingsBody.innerHTML = '<tr><td colspan="4" class="empty-state">Нет данных</td></tr>';
      } else {
        topMappingsBody.innerHTML = mappings
          .map((m) => `<tr>
            <td>${escapeHtml(m.merchant)}</td>
            <td>${escapeHtml(m.category_name ?? '—')}</td>
            <td>${m.client_count}</td>
            <td>${m.category_variants > 1 ? `<span style="color:var(--warning)">${m.category_variants}</span>` : m.category_variants}</td>
          </tr>`)
          .join('');
      }
    } catch (err) {
      console.error('[Admin] Receipts load error:', err);
      receiptsSummary.innerHTML = '<span class="empty-state">Ошибка загрузки</span>';
    }
  }

  document.getElementById('adminReceiptsRefreshBtn')?.addEventListener('click', loadReceipts);

  await Promise.all([loadRules(), loadReceipts()]);
});

function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const csvContent = '\uFEFF' + [
    headers.join(';'),
    ...rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')),
  ].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportClientsCsv(): void {
  const toExport = filterClients(lastClients);
  if (toExport.length === 0) {
    modal.alert('Нет данных для экспорта', 'Экспорт');
    return;
  }
  const headers = ['Email', 'Имя', 'Регистрация', 'Последний вход', 'Транзакций', 'Баланс', 'Статус'];
  const rows = toExport.map((c) => {
    const u = c.user;
    return [
      u.email,
      u.name || '',
      formatDate(u.created_at),
      formatDate(u.last_login_at),
      String(c.transaction_count),
      String(c.balance ?? 0).replace('.', ','),
      u.is_active ? 'Активен' : 'Неактивен',
    ];
  });
  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clients_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
