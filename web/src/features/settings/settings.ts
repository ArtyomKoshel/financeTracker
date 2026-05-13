/**
 * Settings page module
 */
import { BasePage } from '@/pages/base';
import { toast } from '@/shared/components/toast';
import { modal } from '@/shared/components/modal';
import { createCategoryFormModal } from '@/shared/components/category-form';
import { $, setHTML, setText } from '@/shared/utils/dom';
import { store, type IncomeTypeItem } from '@/store';
import { subscribeToPush, unsubscribePush, isPushSupported, getNotificationPermission } from '@/shared/services/push.service';
import type { CategoryWithSubs, AccountItem, AiUsage } from '@/types';
import { settingsService } from '@/features/settings/settings.service';
import categoryService from '@/shared/services/category.service';

export class SettingsPage extends BasePage {
  private categories: CategoryWithSubs[] = [];
  private categoryModal: ReturnType<typeof createCategoryFormModal> | null = null;
  private incomeTypes: IncomeTypeItem[] = [];
  private accounts: AccountItem[] = [];

  constructor() {
    super('settings');
  }

  init(): void {
    super.init();
    this.setupForms();
    this.initCategoryModal();
  }

  private setupForms(): void {
    // Settings form
    const settingsForm = $<HTMLFormElement>('settingsForm');
    settingsForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveSettings();
    });

    // Update rates button
    const updateRatesBtn = $('updateRatesBtn');
    updateRatesBtn?.addEventListener('click', () => this.updateRates());

    // Toggle inactive categories
    const showInactiveCheckbox = $<HTMLInputElement>('showInactiveCategories');
    showInactiveCheckbox?.addEventListener('change', () => this.loadCategories());

    // Category search
    const categorySearch = $<HTMLInputElement>('categorySearch');
    categorySearch?.addEventListener('input', () => this.renderCategories());

    // Income types
    $('openIncomeTypeModalBtn')?.addEventListener('click', () => this.openIncomeTypeModal());

    // Accounts
    $('openAddAccountModalBtn')?.addEventListener('click', () => this.openAddAccountModal());

    // AI usage
    $('refreshAiUsageBtn')?.addEventListener('click', () => this.refreshAiUsage());

    // Telegram
    $('generateTelegramCodeBtn')?.addEventListener('click', () => this.generateTelegramCode());
    $('unlinkTelegramBtn')?.addEventListener('click', () => this.unlinkTelegram());

    // Push notifications
    $('enablePushBtn')?.addEventListener('click', () => this.enablePush());
    $('disablePushBtn')?.addEventListener('click', () => this.disablePush());
    $('savePushPrefsBtn')?.addEventListener('click', () => this.savePushPreferences());
    $('testLocalNotificationBtn')?.addEventListener('click', () => this.testLocalNotification());
    $<HTMLInputElement>('pushUpcoming')?.addEventListener('change', () => this.togglePushDaysVisibility());
    this.setupDemoToastButtons();
    this.setupTaxHelper();
  }

  private initCategoryModal(): void {
    this.categoryModal = createCategoryFormModal({
      onSubmit: async (data) => {
        try {
          if (data.id) {
            await categoryService.update({
              id: data.id,
              name: data.name,
              icon: data.icon,
              color: data.color,
            });
            toast.success('Категория обновлена');
          } else {
            await categoryService.create({
              name: data.name,
              icon: data.icon,
              color: data.color,
              parentId: data.parent_id,
            });
            toast.success('Категория создана');
          }
          await this.loadCategories();
        } catch (e) {
          toast.error('Ошибка при сохранении категории');
        }
      },
    });
  }

  async load(): Promise<void> {
    const { applyDesktopLayout } = await import('@/features/settings/SettingsView');
    applyDesktopLayout();
    
    await Promise.all([
      this.loadSettings(),
      this.loadAccounts(),
      this.loadCategories(),
      this.loadIncomeTypes(),
    ]);
    this.loadAiUsage();
    this.updateTelegramStatus();
    this.updatePushStatus();
    this.updateDemoToastVisibility();
  }

  private updateDemoToastVisibility(): void {
    const card = $('demoToastCard');
    if (!card) return;
    const me = store.get('me');
    const isDemo = me?.email === 'demo@local';
    card.style.display = isDemo ? '' : 'none';
  }

  private setupDemoToastButtons(): void {
    const container = $('demoToastCard');
    if (!container) return;
    const demos: Record<string, { msg: string; type: 'success' | 'error' | 'warning' | 'info' }> = {
      overdue: { msg: '⚠️ Интернет: 29.99 Br — просрочено', type: 'error' },
      upcoming: { msg: '📅 Аренда: 50 Br — завтра', type: 'info' },
      operation: { msg: 'Операция добавлена', type: 'success' },
      paid: { msg: 'Платёж оплачен', type: 'success' },
      limit: { msg: '🍕 Питание: лимит превышен на 20 Br', type: 'warning' },
      sync: { msg: 'Баланс скорректирован. Разница: 15.50 Br', type: 'info' },
    };
    container.querySelectorAll('[data-toast]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = (btn as HTMLElement).dataset.toast;
        const d = key ? demos[key] : null;
        if (d) toast[d.type](d.msg);
      });
    });
  }

  private async loadSettings(): Promise<void> {
    try {
      const settings = await settingsService.getSettings();
      store.set('settings', settings);

      // Push preferences
      const prefs = {
        push_overdue: settings.push_overdue !== '0',
        push_upcoming: settings.push_upcoming !== '0',
        push_upcoming_days: parseInt(String(settings.push_upcoming_days || '1'), 10),
      };
      this.applyPushPreferences(prefs);

      // Populate form fields
      this.setInputValue('grossSalary', String(settings.salary_config?.gross_salary || 0));
      this.setInputValue('expectedAdvance', String(settings.salary_config?.expected_advance || 0));
      this.setInputValue('advanceDay', settings.advance_day || '30');
      this.setInputValue('salaryDay', settings.salary_day || '15');
      this.setInputValue('savingsPercent', settings.savings_percent || '20');
      this.setInputValue('minLivingBudget', settings.min_living_budget || '1500');
      this.setInputValue('autoSavingsPercent', settings.auto_savings_percent || '');
      this.setInputValue('autoSavingsGoalId', settings.auto_savings_goal_id || '');

      // Update currency rates display
      setText($('rateRUB'), settings.rub_rate || '0.034');
      setText($('rateEUR'), settings.eur_rate || '3.55');
      setText($('rateUSD'), settings.usd_rate || '3.25');
      setText($('ratesUpdated'), settings.rates_updated || 'Не обновлялось');

      // Update store rates
      store.set('currencyRates', {
        BYN: 1,
        RUB: parseFloat(settings.rub_rate) || 0.034,
        EUR: parseFloat(settings.eur_rate) || 3.55,
        USD: parseFloat(settings.usd_rate) || 3.25,
      });
    } catch (e) {
      console.error('Settings error:', e);
      toast.error('Ошибка загрузки настроек');
    }
  }

  private setInputValue(id: string, value: string | number): void {
    const input = $<HTMLInputElement>(id);
    if (input) input.value = String(value);
  }

  private async loadAiUsage(): Promise<void> {
    const card = $('aiUsageCard');
    const content = $('aiUsageContent');
    if (!card || !content) return;
    try {
      const usage = await settingsService.getAiUsage();
      card.style.display = '';
      this.renderAiUsage(content, usage);
    } catch {
      card.style.display = 'none';
    }
  }

  private async refreshAiUsage(): Promise<void> {
    const content = $('aiUsageContent');
    if (!content) return;
    content.innerHTML = '<p class="empty-state">Обновление...</p>';
    try {
      const usage = await settingsService.refreshAiUsage();
      this.renderAiUsage(content, usage);
      toast.success('Лимиты обновлены');
    } catch {
      content.innerHTML = '<p class="empty-state text-danger">Ошибка загрузки</p>';
      toast.error('Не удалось обновить лимиты');
    }
  }

  private renderAiUsage(container: HTMLElement, u: AiUsage): void {
    const fmt = (n: number) => n.toLocaleString('ru-RU');
    const providerLabel = u.provider === 'groq' ? 'Groq' : u.provider === 'anthropic' ? 'Anthropic' : u.provider;
    let html = `<p class="ai-usage-provider"><strong>Провайдер:</strong> ${providerLabel}</p>`;
    if (u.updated_at) {
      const d = new Date(u.updated_at);
      const timeStr = `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
      html += `<p class="text-muted"><small>Обновлено: ${timeStr}</small></p>`;
    }
    if (u.limit_requests !== null && u.remaining_requests !== null) {
      html += `<p><strong>Запросов в день:</strong> ${fmt(u.remaining_requests)} из ${fmt(u.limit_requests)}</p>`;
      if (u.reset_requests) html += `<p class="text-muted"><small>Сброс через: ${u.reset_requests}</small></p>`;
    }
    if (u.limit_tokens !== null && u.remaining_tokens !== null) {
      html += `<p><strong>Токенов в минуту:</strong> ${fmt(u.remaining_tokens)} из ${fmt(u.limit_tokens)}</p>`;
      if (u.reset_tokens) html += `<p class="text-muted"><small>Сброс через: ${u.reset_tokens}</small></p>`;
    }
    if (u.provider === 'anthropic' || (u.limit_requests === null && u.limit_tokens === null)) {
      html += '<p class="text-muted"><small>Лимиты доступны только для Groq</small></p>';
    }
    html += '<p class="text-muted"><small>Данные обновляются при каждом AI-запросе (анализ заметок и т.д.). Кнопка «Обновить» отправляет один запрос к Groq и расходует ~5 токенов.</small></p>';
    container.innerHTML = html;
  }

  private setupTaxHelper(): void {
    const calcBtn = $('calcTaxBtn');
    if (!calcBtn) return;
    const now = new Date();
    const yStart = `${now.getFullYear()}-01`;
    const yCur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    this.setInputValue('taxDateFrom', yStart);
    this.setInputValue('taxDateTo', yCur);
    calcBtn.addEventListener('click', () => this.calcTax());
  }

  private async calcTax(): Promise<void> {
    const from = ($<HTMLInputElement>('taxDateFrom'))?.value;
    const to   = ($<HTMLInputElement>('taxDateTo'))?.value;
    if (!from || !to) { toast.error('Укажите период'); return; }
    try {
      const data = await settingsService.getTaxSummary(from, to);
      const fmt = (n: number) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' BYN';
      const el = (id: string) => document.getElementById(id);
      const result = el('taxResult');
      if (result) result.style.display = '';
      const inc = el('taxTotalIncome'); if (inc) inc.textContent = fmt(data.total_income);
      const usn = el('taxUsn');         if (usn) usn.textContent = fmt(data.tax_usn);
      const se  = el('taxSelfEmployed'); if (se) se.textContent = fmt(data.tax_self_employed);
      const tbl = el('taxByMonthTable');
      if (tbl && data.by_month.length > 0) {
        tbl.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:0.9em"><thead><tr>' +
          '<th style="text-align:left;padding:4px 8px;border-bottom:1px solid var(--border-color)">Месяц</th>' +
          '<th style="text-align:right;padding:4px 8px;border-bottom:1px solid var(--border-color)">Доход</th>' +
          '<th style="text-align:right;padding:4px 8px;border-bottom:1px solid var(--border-color)">УСН 6%</th>' +
          '<th style="text-align:right;padding:4px 8px;border-bottom:1px solid var(--border-color)">4%</th>' +
          '</tr></thead><tbody>' +
          data.by_month.map(r =>
            `<tr><td style="padding:3px 8px">${r.month}</td>` +
            `<td style="text-align:right;padding:3px 8px">${fmt(r.income)}</td>` +
            `<td style="text-align:right;padding:3px 8px;color:var(--danger-color)">${fmt(r.income * 0.06)}</td>` +
            `<td style="text-align:right;padding:3px 8px;color:var(--danger-color)">${fmt(r.income * 0.04)}</td></tr>`
          ).join('') +
          '</tbody></table>';
      } else if (tbl) { tbl.innerHTML = ''; }
    } catch { toast.error('Ошибка расчёта налога'); }
  }

  private async saveSettings(): Promise<void> {
    const settings: Record<string, string> = {
      gross_salary: ($<HTMLInputElement>('grossSalary'))?.value || '0',
      expected_advance: ($<HTMLInputElement>('expectedAdvance'))?.value || '0',
      advance_day: ($<HTMLInputElement>('advanceDay'))?.value || '30',
      salary_day: ($<HTMLInputElement>('salaryDay'))?.value || '15',
      savings_percent: ($<HTMLInputElement>('savingsPercent'))?.value || '20',
      min_living_budget: ($<HTMLInputElement>('minLivingBudget'))?.value || '1500',
      auto_savings_percent: ($<HTMLInputElement>('autoSavingsPercent'))?.value || '',
      auto_savings_goal_id: ($<HTMLInputElement>('autoSavingsGoalId'))?.value || '',
    };

    try {
      await settingsService.updateSettings(settings);
      toast.success('Настройки сохранены');
      await this.loadSettings();
    } catch (e) {
      toast.error('Ошибка сохранения настроек');
    }
  }

  private async updateRates(): Promise<void> {
    try {
      await settingsService.updateRates();
      toast.success('Курсы обновлены');
      await this.loadSettings();
    } catch (e) {
      toast.error('Ошибка обновления курсов');
    }
  }

  private async loadAccounts(): Promise<void> {
    try {
      const res = await settingsService.getAccounts();
      this.accounts = res.accounts ?? [];
      this.renderAccounts();
    } catch (e) {
      console.error('Accounts error:', e);
      setHTML($('accountsList')!, '<p class="empty-state">Ошибка загрузки</p>');
    }
  }

  private renderAccounts(): void {
    const container = $('accountsList');
    if (!container) return;

    if (!this.accounts.length) {
      setHTML(container, '<p class="empty-state">Нет счетов. Добавьте первый.</p>');
      return;
    }

    const html = this.accounts.map(a => `
      <div class="category-item" data-id="${a.id}">
        <div class="category-main">
          <span class="category-icon">💳</span>
          <span class="category-name">${a.name}</span>
          <span class="category-amount">${a.balance.toFixed(2)} Br</span>
        </div>
        <div class="category-actions">
          <button class="btn-icon" data-edit-account="${a.id}" title="Редактировать">✏️</button>
          ${this.accounts.length > 1 ? `<button class="btn-icon btn-danger" data-delete-account="${a.id}" title="Удалить">🗑️</button>` : ''}
        </div>
      </div>
    `).join('');

    setHTML(container, html);
    this.attachAccountHandlers(container);
  }

  private attachAccountHandlers(container: HTMLElement): void {
    container.querySelectorAll('[data-edit-account]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt((e.currentTarget as HTMLElement).dataset.editAccount!);
        const acc = this.accounts.find(a => a.id === id);
        if (acc) this.openEditAccountModal(acc);
      });
    });
    container.querySelectorAll('[data-delete-account]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = parseInt((e.currentTarget as HTMLElement).dataset.deleteAccount!);
        await this.deleteAccount(id);
      });
    });
  }

  private openAddAccountModal(): void {
    const name = prompt('Название счёта', 'Новая карта');
    if (!name?.trim()) return;
    settingsService.createAccount({ name: name.trim() }).then(() => {
      toast.success('Счёт добавлен');
      this.loadAccounts();
    }).catch(() => toast.error('Ошибка'));
  }

  private openEditAccountModal(acc: AccountItem): void {
    const name = prompt('Название счёта', acc.name);
    if (!name?.trim() || name === acc.name) return;
    settingsService.updateAccount({ id: acc.id, name: name.trim() }).then(() => {
      toast.success('Счёт обновлён');
      this.loadAccounts();
    }).catch(() => toast.error('Ошибка'));
  }

  private async deleteAccount(id: number): Promise<void> {
    if (!(await modal.confirm('Удалить счёт? Нельзя удалить единственный счёт или счёт с операциями.', 'Удалить счёт'))) return;
    try {
      await settingsService.deleteAccount(id);
      toast.success('Счёт удалён');
      this.loadAccounts();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  private async loadCategories(): Promise<void> {
    const showInactive = ($<HTMLInputElement>('showInactiveCategories'))?.checked || false;

    try {
      this.categories = await categoryService.getAll(showInactive);
      this.renderCategories();
    } catch (e) {
      console.error('Categories error:', e);
    }
  }

  private renderCategories(): void {
    const container = $('categoriesList');
    if (!container) return;

    const search = ($<HTMLInputElement>('categorySearch'))?.value?.trim().toLowerCase() || '';

    const filtered = this.categories
      .map(cat => {
        const nameMatch = !search || cat.name.toLowerCase().includes(search);
        const subs = cat.subcategories?.filter(s => !search || s.name.toLowerCase().includes(search)) ?? [];
        if (nameMatch) return { ...cat, subcategories: subs.length ? subs : cat.subcategories };
        if (subs.length) return { ...cat, subcategories: subs };
        return null;
      })
      .filter((c): c is CategoryWithSubs => c !== null);

    if (!filtered.length) {
      setHTML(container, '<p class="empty-state">Ничего не найдено</p>');
      return;
    }

    const html = filtered.map(cat => `
      <div class="category-item ${!cat.is_active ? 'inactive' : ''}" data-id="${cat.id}">
        <div class="category-main">
          <span class="category-icon" style="background-color: ${cat.color || '#6C5CE7'}">${cat.icon || '📦'}</span>
          <span class="category-name">${cat.name}</span>
          ${!cat.is_active ? '<span class="badge-deleted">удалена</span>' : ''}
        </div>
        <div class="category-actions">
          <button class="btn-icon" data-edit-cat="${cat.id}" title="Редактировать">✏️</button>
          ${cat.is_active 
            ? `<button class="btn-icon btn-danger" data-delete-cat="${cat.id}" title="Удалить">🗑️</button>`
            : `<button class="btn-icon btn-success" data-restore-cat="${cat.id}" title="Восстановить">♻️</button>`
          }
        </div>
        ${cat.subcategories && cat.subcategories.length > 0 ? `
          <div class="subcategories">
            ${cat.subcategories.map(sub => `
              <div class="category-item subcategory ${!sub.is_active ? 'inactive' : ''}">
                <div class="category-main">
                  <span class="category-icon small">${sub.icon || '📁'}</span>
                  <span class="category-name">${sub.name}</span>
                  ${!sub.is_active ? '<span class="badge-deleted">удалена</span>' : ''}
                </div>
                <div class="category-actions">
                  <button class="btn-icon" data-edit-cat="${sub.id}" title="Редактировать">✏️</button>
                  ${sub.is_active 
                    ? `<button class="btn-icon btn-danger" data-delete-cat="${sub.id}" title="Удалить">🗑️</button>`
                    : `<button class="btn-icon btn-success" data-restore-cat="${sub.id}" title="Восстановить">♻️</button>`
                  }
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `).join('');

    setHTML(container, html);
    this.attachCategoryHandlers(container);
  }

  private attachCategoryHandlers(container: HTMLElement): void {
    container.querySelectorAll('[data-edit-cat]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt((e.currentTarget as HTMLElement).dataset.editCat!);
        const cat = this.findCategory(id);
        if (cat) {
          this.categoryModal?.open(this.categories, cat);
        }
      });
    });

    container.querySelectorAll('[data-delete-cat]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = parseInt((e.currentTarget as HTMLElement).dataset.deleteCat!);
        await this.deleteCategory(id);
      });
    });

    container.querySelectorAll('[data-restore-cat]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = parseInt((e.currentTarget as HTMLElement).dataset.restoreCat!);
        await this.restoreCategory(id);
      });
    });
  }

  private findCategory(id: number): CategoryWithSubs | null {
    for (const cat of this.categories) {
      if (cat.id === id) return cat;
      if (cat.subcategories) {
        const sub = cat.subcategories.find(s => s.id === id);
        if (sub) return sub as unknown as CategoryWithSubs;
      }
    }
    return null;
  }

  private async deleteCategory(id: number): Promise<void> {
    if (!(await modal.confirm('Удалить категорию? Она будет скрыта, но транзакции сохранятся.', 'Удалить категорию'))) return;

    try {
      await categoryService.delete(id);
      toast.success('Категория удалена');
      await this.loadCategories();
    } catch (e) {
      toast.error('Ошибка при удалении');
    }
  }

  private async restoreCategory(id: number): Promise<void> {
    try {
      await categoryService.restore(id);
      toast.success('Категория восстановлена');
      await this.loadCategories();
    } catch (e) {
      toast.error('Ошибка при восстановлении');
    }
  }

  openCategoryModal(): void {
    this.categoryModal?.open(this.categories);
  }

  private async loadIncomeTypes(): Promise<void> {
    try {
      this.incomeTypes = await settingsService.getIncomeTypes();
      store.set('incomeTypes', this.incomeTypes);
      this.renderIncomeTypes();
    } catch (e) {
      console.error('Income types error:', e);
      setHTML($('incomeTypesList')!, '<p class="empty-state">Ошибка загрузки</p>');
    }
  }

  private renderIncomeTypes(): void {
    const container = $('incomeTypesList');
    if (!container) return;

    if (!this.incomeTypes.length) {
      setHTML(container, '<p class="empty-state">Нет типов. Добавьте первый.</p>');
      return;
    }

    const html = this.incomeTypes.map(t => `
      <div class="category-item" data-id="${t.id}">
        <div class="category-main">
          <span class="category-icon">${t.icon}</span>
          <span class="category-name">${t.label}</span>
          <code class="type-code">${t.code}</code>
        </div>
        <div class="category-actions">
          <button class="btn-icon" data-edit-type="${t.id}" title="Редактировать">✏️</button>
          <button class="btn-icon btn-danger" data-delete-type="${t.id}" title="Удалить">🗑️</button>
        </div>
      </div>
    `).join('');

    setHTML(container, html);
    this.attachIncomeTypeHandlers(container);
  }

  private attachIncomeTypeHandlers(container: HTMLElement): void {
    container.querySelectorAll('[data-edit-type]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt((e.currentTarget as HTMLElement).dataset.editType!);
        const t = this.incomeTypes.find(x => x.id === id);
        if (t) this.openIncomeTypeModal(t);
      });
    });

    container.querySelectorAll('[data-delete-type]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = parseInt((e.currentTarget as HTMLElement).dataset.deleteType!);
        await this.deleteIncomeType(id);
      });
    });
  }

  private openIncomeTypeModal(edit?: IncomeTypeItem): void {
    const existing = $('incomeTypeModal');
    existing?.remove();

    const modal = document.createElement('div');
    modal.id = 'incomeTypeModal';
    modal.className = 'modal show';
    modal.innerHTML = `
      <div class="modal-content modal-small">
        <div class="modal-header">
          <h3>${edit ? 'Редактировать тип' : 'Добавить тип дохода'}</h3>
          <button class="btn-close modal-close" aria-label="Закрыть">×</button>
        </div>
        <form id="incomeTypeForm">
          <input type="hidden" id="incomeTypeId" value="${edit?.id ?? ''}">
          <div class="form-group">
            <label>Код (латиница, underscore)</label>
            <input type="text" id="incomeTypeCode" placeholder="my_income" value="${edit?.code ?? ''}" ${edit ? 'readonly' : ''}>
            <small class="hint">Уникальный идентификатор, например: bonus, vacation</small>
          </div>
          <div class="form-group">
            <label>Название</label>
            <input type="text" id="incomeTypeLabel" placeholder="Премия" value="${edit?.label ?? ''}" required>
          </div>
          <div class="form-group">
            <label>Иконка (emoji)</label>
            <input type="text" id="incomeTypeIcon" placeholder="🎁" value="${edit?.icon ?? '📦'}" maxlength="4">
          </div>
          <button type="submit" class="btn btn-primary btn-block">Сохранить</button>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('.modal-close')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    modal.querySelector('form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = ($<HTMLInputElement>('incomeTypeId'))?.value;
      const code = ($<HTMLInputElement>('incomeTypeCode'))?.value?.trim().toLowerCase().replace(/\s+/g, '_') || '';
      const label = ($<HTMLInputElement>('incomeTypeLabel'))?.value?.trim() || '';
      const icon = ($<HTMLInputElement>('incomeTypeIcon'))?.value?.trim() || '📦';

      if (!code || !label) {
        toast.error('Заполните код и название');
        return;
      }

      try {
        if (id) {
          await settingsService.updateIncomeType({ id: parseInt(id), label, icon });
          toast.success('Тип обновлён');
        } else {
          await settingsService.createIncomeType({ code, label, icon });
          toast.success('Тип добавлен');
        }
        close();
        await this.loadIncomeTypes();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  }

  private applyPushPreferences(prefs: { push_overdue?: boolean; push_upcoming?: boolean; push_upcoming_days?: number }): void {
    const overdue = $<HTMLInputElement>('pushOverdue');
    const upcoming = $<HTMLInputElement>('pushUpcoming');
    const days = $<HTMLSelectElement>('pushUpcomingDays');
    if (overdue) overdue.checked = prefs.push_overdue !== false;
    if (upcoming) upcoming.checked = prefs.push_upcoming !== false;
    if (days) days.value = String(prefs.push_upcoming_days ?? 1);
    this.togglePushDaysVisibility();
  }

  private togglePushDaysVisibility(): void {
    const upcoming = $<HTMLInputElement>('pushUpcoming');
    const daysGroup = $('pushDaysGroup');
    if (daysGroup) daysGroup.style.display = upcoming?.checked ? '' : 'none';
  }

  private async savePushPreferences(): Promise<void> {
    const overdue = $<HTMLInputElement>('pushOverdue');
    const upcoming = $<HTMLInputElement>('pushUpcoming');
    const days = $<HTMLSelectElement>('pushUpcomingDays');
    if (!overdue || !upcoming || !days) return;
    try {
      await settingsService.updateSettings({
        push_overdue: overdue.checked ? '1' : '0',
        push_upcoming: upcoming.checked ? '1' : '0',
        push_upcoming_days: days.value,
      });
      toast.success('Настройки уведомлений сохранены');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  private setPushBadge(klass: string, text: string): void {
    const badge = $('pushStatusBadge');
    if (badge) {
      badge.className = 'push-status-badge ' + klass;
      badge.textContent = text;
    }
  }

  private async updatePushStatus(): Promise<void> {
    const statusEl = $('pushStatusText');
    const enableBtn = $('enablePushBtn');
    const disableBtn = $('disablePushBtn');
    const prefsEl = $('pushPreferences');
    if (!statusEl || !enableBtn || !disableBtn) return;

    if (!isPushSupported()) {
      setText(statusEl, 'Браузер не поддерживает push-уведомления');
      this.setPushBadge('error', 'Не поддерживается');
      enableBtn.style.display = 'none';
      disableBtn.style.display = 'none';
      prefsEl && (prefsEl.style.display = 'none');
      return;
    }

    const perm = getNotificationPermission();
    if (perm === 'denied') {
      setText(statusEl, 'Уведомления заблокированы в браузере');
      this.setPushBadge('error', 'Заблокировано');
      enableBtn.style.display = 'none';
      disableBtn.style.display = 'none';
      prefsEl && (prefsEl.style.display = 'none');
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        setText(statusEl, 'Получаете напоминания о платежах');
        this.setPushBadge('active', 'Включено');
        enableBtn.style.display = 'none';
        disableBtn.style.display = '';
        if (prefsEl) prefsEl.style.display = '';
        const hintEl1 = $('pushHint');
        if (hintEl1) hintEl1.style.display = '';
        const testBtn1 = $('testLocalNotificationBtn');
        if (testBtn1) testBtn1.style.display = '';
      } else {
        const vapidRes = await settingsService.getVapidPublic().catch(() => null);
        if (vapidRes?.publicKey) {
          setText(statusEl, 'Включите, чтобы получать напоминания о платежах');
          this.setPushBadge('inactive', 'Выключено');
          enableBtn.style.display = '';
          disableBtn.style.display = 'none';
          if (prefsEl) prefsEl.style.display = 'none';
          const hintEl2 = $('pushHint');
          if (hintEl2) hintEl2.style.display = 'none';
          const testBtn2 = $('testLocalNotificationBtn');
          if (testBtn2) testBtn2.style.display = 'none';
        } else {
          setText(statusEl, 'Push не настроен на сервере');
          this.setPushBadge('error', 'Не настроен');
          enableBtn.style.display = 'none';
          disableBtn.style.display = 'none';
          if (prefsEl) prefsEl.style.display = 'none';
          const hintEl3 = $('pushHint');
          if (hintEl3) hintEl3.style.display = 'none';
          const testBtn3 = $('testLocalNotificationBtn');
          if (testBtn3) testBtn3.style.display = 'none';
        }
      }
    } catch {
      setText(statusEl, 'Ошибка проверки подписки');
      this.setPushBadge('error', 'Ошибка');
      enableBtn.style.display = 'none';
      disableBtn.style.display = 'none';
      if (prefsEl) prefsEl.style.display = 'none';
      const hintEl4 = $('pushHint');
      if (hintEl4) hintEl4.style.display = 'none';
      const testBtn4 = $('testLocalNotificationBtn');
      if (testBtn4) testBtn4.style.display = 'none';
    }
  }

  private async enablePush(): Promise<void> {
    try {
      const { publicKey: vapid } = await settingsService.getVapidPublic();
      if (!vapid) {
        toast.error('Push не настроен на сервере');
        return;
      }
      const ok = await subscribeToPush(vapid);
      if (ok) {
        toast.success('Уведомления включены');
      } else {
        toast.error('Не удалось включить уведомления');
      }
      this.updatePushStatus();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  private testLocalNotification(): void {
    if (!('Notification' in window)) {
      toast.error('Браузер не поддерживает уведомления');
      return;
    }
    if (Notification.permission !== 'granted') {
      toast.error('Сначала включите уведомления');
      return;
    }
    new Notification('Finance Tracker', {
      body: 'Проверка: если вы видите это — уведомления работают.',
      tag: 'test',
    });
    toast.success('Проверьте системную область уведомлений');
  }

  private async disablePush(): Promise<void> {
    try {
      await unsubscribePush();
      toast.success('Уведомления отключены');
      this.updatePushStatus();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  private async deleteIncomeType(id: number): Promise<void> {
    if (!(await modal.confirm('Удалить этот тип? Это возможно только если нет транзакций с ним.', 'Удалить тип дохода'))) return;

    try {
      await settingsService.deleteIncomeType(id);
      toast.success('Тип удалён');
      await this.loadIncomeTypes();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  private updateTelegramStatus(): void {
    const card = $('telegramCard');
    if (!card) return;

    const linked = store.get('telegramLinked') === true;

    const linkedEl = $('telegramLinked');
    const notLinkedEl = $('telegramNotLinked');
    const badge = $('telegramStatusBadge');

    if (linkedEl) linkedEl.style.display = linked ? '' : 'none';
    if (notLinkedEl) notLinkedEl.style.display = linked ? 'none' : '';
    if (badge) {
      badge.className = 'push-status-badge ' + (linked ? 'active' : 'inactive');
      badge.textContent = linked ? 'Привязан' : 'Не привязан';
    }
  }

  private async generateTelegramCode(): Promise<void> {
    const btn = $<HTMLButtonElement>('generateTelegramCodeBtn');
    if (btn) btn.disabled = true;

    try {
      const res = await settingsService.generateTelegramCode();

      if (res.already_linked) {
        toast.info('Telegram уже привязан');
        this.updateTelegramStatus();
        return;
      }

      const codeBlock = $('telegramCodeBlock');
      const codeEl = $('telegramCode');
      const ttlEl = $('telegramCodeTtl');

      if (codeBlock && codeEl && res.code) {
        codeBlock.style.display = '';
        setText(codeEl, res.code);
        if (ttlEl) setText(ttlEl, `Действует ${Math.floor((res.ttl ?? 300) / 60)} мин`);
      }
    } catch (e) {
      toast.error('Ошибка генерации кода');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  private async unlinkTelegram(): Promise<void> {
    if (!(await modal.confirm('Отвязать Telegram? Бот перестанет принимать транзакции.', 'Отвязать Telegram'))) return;

    try {
      await settingsService.unlinkTelegram();
      toast.success('Telegram отвязан');

      store.set('telegramLinked', false);
      this.updateTelegramStatus();
    } catch (e) {
      toast.error('Ошибка при отвязке');
    }
  }

  destroy(): void {
    this.categoryModal?.destroy();
    super.destroy();
  }
}

export const settingsPage = new SettingsPage();
