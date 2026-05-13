/**
 * Main Application Controller
 * 
 * Manages tab navigation, WebSocket updates, and global actions.
 */
import { wsService } from '@/shared/services/websocket.service';
import { initTabSync, broadcastUpdate } from '@/shared/services/tab-sync.service';
import { toast } from '@/shared/components/toast';
import api from '@/api/client';
import { initHints } from '@/shared/components/hint';
import { store } from '@/store';
import { $, qsa } from '@/shared/utils/dom';
import { shortcutManager } from '@/shared/utils/shortcuts';
import type { BasePage } from '@/pages/base';
import { sidebar } from '@/shared/components/sidebar';
import { ThemeToggle } from '@/shared/components/theme-toggle';
import { offlineIndicator } from '@/shared/components/offline-indicator';
import { syncService } from '@/shared/services/sync.service';
import { isOfflineQueued } from '@/shared/services/offline.service';

type TabId = 'dashboard' | 'operations' | 'analytics' | 'plans' | 'budget' | 'settings' | 'bank-receipts' | 'notes' | 'calendar';

type PageWithTypeAndFocus = BasePage & { setTypeAndFocus(type: string): void };
type PageWithPaymentModal = BasePage & { openAddPaymentModal(): void };
type PageWithCategoryModal = BasePage & { openCategoryModal(): void };

type ViewModuleWithDesktopLayout = { applyDesktopLayout: () => void };

const TAB_DESKTOP_LAYOUT_MODULES: Partial<Record<TabId, () => Promise<ViewModuleWithDesktopLayout>>> = {
  dashboard: () => import('@/features/dashboard/DashboardView'),
  operations: () => import('@/features/transactions/OperationsView'),
  analytics: () => import('@/features/analytics/AnalyticsView'),
  plans: () => import('@/features/plans/PlansView'),
  budget: () => import('@/features/budget/BudgetView'),
  settings: () => import('@/features/settings/SettingsView'),
  calendar: () => import('@/features/calendar/CalendarView'),
};

class App {
  private pages: Partial<Record<TabId, BasePage>> = {};

  private pageLoaders: Record<TabId, () => Promise<BasePage>> = {
    dashboard: () => import('@/features/dashboard/dashboard').then(m => m.dashboardPage),
    operations: () => import('@/features/transactions/operations').then(m => m.operationsPage),
    analytics: () => import('@/features/analytics/analytics').then(m => m.analyticsPage),
    plans: () => import('@/features/plans/plans').then(m => m.plansPage),
    budget: () => import('@/features/budget/budget').then(m => m.budgetPage),
    settings: () => import('@/features/settings/settings').then(m => m.settingsPage),
    'bank-receipts': () => import('@/features/receipts/experimental-bank-receipts').then(m => m.experimentalBankReceiptsPage),
    notes: () => import('@/features/notes/notes').then(m => m.notesPage),
    calendar: () => import('@/features/calendar/calendar').then(m => m.calendarPage),
  };

  private currentTab: TabId = 'dashboard';
  private hasActivatedTab = false;
  private activeModalId: string | null = null;
  private themeToggles: ThemeToggle[] = [];

  private async getPage(tabId: TabId): Promise<BasePage> {
    if (!this.pages[tabId]) {
      const page = await this.pageLoaders[tabId]();
      page.init();
      this.pages[tabId] = page;
    }
    return this.pages[tabId]!;
  }

  /**
   * Initialize the application
   */
  async init(): Promise<void> {
    console.log('Finance Tracker initializing...');

    this.setupTheme();

    api.setErrorHandler((err, status) => {
      if (status === 429) toast.error(err.message);
      else if (status && status >= 500) toast.error('Ошибка сервера. Попробуйте позже.');
    });

    window.addEventListener('unhandledrejection', (e) => {
      if (isOfflineQueued(e.reason)) {
        e.preventDefault();
        toast.success('Сохранено офлайн. Синхронизируется при подключении.');
      }
    });

    // Setup tab navigation first — must work immediately, before API loads
    this.setupTabNavigation();

    // Show correct tab UI instantly from hash (before any API calls)
    const initialTab = this.getTabFromHash() ?? 'dashboard';
    this.applyTabUI(initialTab);

    // Setup sidebar (desktop navigation)
    this.setupSidebar();

    // Load initial data (categories, income types) — pages need it
    await this.loadInitialData();

    // Setup global event handlers
    this.setupGlobalHandlers();

    // Setup modals
    this.setupModals();

    // Initialize hint tooltips
    initHints();

    // Initialize keyboard shortcuts (Ctrl+K search, Ctrl+N new transaction)
    shortcutManager.init();

    // Register PWA service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // Setup offline indicator
    this.setupOfflineIndicator();

    // Connect WebSocket
    this.setupWebSocket();

    // Setup responsive layout handler
    this.setupResponsiveLayout();

    // Activate initial tab — lazy-loads the page module on demand
    await this.switchTab(initialTab);

    console.log('Finance Tracker initialized');
  }

  private setupResponsiveLayout(): void {
    const applyLayouts = async () => {
      const loaders = Object.values(TAB_DESKTOP_LAYOUT_MODULES);
      const modules = await Promise.all(loaders.map((loader) => loader()));
      modules.forEach((m) => m.applyDesktopLayout());
    };

    window.addEventListener('resize', () => {
      void applyLayouts();
    });

    void applyLayouts();
  }

  private async applyDesktopLayoutForTab(tabId: TabId): Promise<void> {
    const loader = TAB_DESKTOP_LAYOUT_MODULES[tabId];
    if (!loader) return;
    const module = await loader();
    module.applyDesktopLayout();
  }

  /**
   * Setup sidebar (desktop navigation)
   */
  private setupSidebar(): void {
    const me = store.get('me');
    const isAdmin = localStorage.getItem('user_is_admin') === '1';

    if (me) {
      sidebar.setUserInfo(me.name, isAdmin);
    }

    sidebar.refreshNav();

    sidebar.setLogoutHandler(() => {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_is_admin');
      localStorage.removeItem('auth_token_admin');
      window.location.href = '/login.html';
    });

    sidebar.setTabSwitchHandler((tabId) => this.switchTab(tabId as TabId));

    if (isAdmin) {
      sidebar.setAdminHandler(() => {
        window.location.href = '/admin.html';
      });
    }
  }

  private setupTheme(): void {
    const theme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', theme);

    const headerActions = document.querySelector('.header > div');
    if (headerActions) {
      const toggle = new ThemeToggle();
      toggle.onToggle = (t) => this.setTheme(t);
      const firstBtn = headerActions.querySelector('.btn-icon');
      headerActions.insertBefore(toggle.element, firstBtn);
      this.themeToggles.push(toggle);
    }

    const sidebarFooter = document.querySelector('.sidebar-footer');
    if (sidebarFooter) {
      const toggle = new ThemeToggle({ className: 'sidebar-footer-btn', showLabel: true });
      toggle.onToggle = (t) => this.setTheme(t);
      sidebarFooter.insertBefore(toggle.element, sidebarFooter.firstChild);
      this.themeToggles.push(toggle);
    }
  }

  private setTheme(theme: string, persist = true): void {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    this.themeToggles.forEach(t => t.update());
    if (persist) {
      api.updateSettings({ theme }).catch(() => {});
    }
  }

  /**
   * Setup tab navigation
   */
  private setupTabNavigation(): void {
    const handleTabClick = (e: Event): void => {
      const target = (e.target as HTMLElement).closest('[data-tab]');
      if (!target || (target as HTMLElement).hasAttribute('disabled')) return;
      const tabId = target.getAttribute('data-tab') as TabId;
      if (tabId && (tabId in this.pageLoaders)) {
        e.preventDefault();
        void this.switchTab(tabId).catch(err => console.error('Tab switch error:', err));
      }
    };
    document.addEventListener('click', handleTabClick, true);

    window.addEventListener('hashchange', () => {
      const tabId = this.getTabFromHash();
      if (tabId && tabId !== this.currentTab) {
        this.switchTab(tabId);
      }
    });
  }

  private getTabFromHash(): TabId | null {
    const hash = window.location.hash.replace('#', '') as TabId;
    return hash && (hash in this.pageLoaders) ? hash : null;
  }

  private applyTabUI(tabId: TabId): void {
    const contentEl = document.querySelector('.content');
    qsa('.tab').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    (contentEl ? contentEl.querySelectorAll('.tab-content') : []).forEach((c) => {
      c.classList.remove('active');
      c.setAttribute('aria-hidden', 'true');
    });

    document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
    document.querySelector(`[data-tab="${tabId}"]`)?.setAttribute('aria-selected', 'true');
    const tabContent = document.getElementById(`tab-${tabId}`);
    if (tabContent) {
      tabContent.classList.add('active');
      tabContent.setAttribute('aria-hidden', 'false');
    }

    this.currentTab = tabId;
    history.replaceState(null, '', `#${tabId}`);
  }

  /**
   * Switch to a tab — instant UI switch, content loads progressively
   */
  async switchTab(tabId: TabId): Promise<void> {
    if (!(tabId in this.pageLoaders) || (tabId === this.currentTab && this.hasActivatedTab)) return;

    this.pages[this.currentTab]?.deactivate();

    const contentEl = document.querySelector('.content');
    qsa('.tab').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    (contentEl ? contentEl.querySelectorAll('.tab-content') : []).forEach((c) => {
      c.classList.remove('active');
      c.setAttribute('aria-hidden', 'true');
    });

    const tabBtn = document.querySelector(`.tabs [data-tab="${tabId}"], .sidebar-item[data-tab="${tabId}"]`);
    const tabContent = document.getElementById(`tab-${tabId}`);

    tabBtn?.classList.add('active');
    tabBtn?.setAttribute('aria-selected', 'true');
    if (tabContent) {
      tabContent.classList.add('active');
      tabContent.setAttribute('aria-hidden', 'false');
    }

    if (contentEl) {
      contentEl.scrollTop = 0;
    }

    this.currentTab = tabId;
    this.hasActivatedTab = true;
    store.set('currentTab', tabId);

    const hashTab = window.location.hash.replace('#', '');
    if (hashTab !== tabId) {
      history.replaceState(null, '', `#${tabId}`);
    }

    const page = await this.getPage(tabId);
    requestAnimationFrame(() => {
      page.activate();
      void this.applyDesktopLayoutForTab(tabId);
    });
  }

  /**
   * Setup global event handlers
   */
  private setupGlobalHandlers(): void {
    // Delegate: [data-trigger] clicks the element with that id (e.g. empty-state CTA)
    document.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('[data-trigger]');
      if (target) {
        const id = target.getAttribute('data-trigger');
        if (id) document.getElementById(id)?.click();
      }
    });
    // Replace onclick handlers with proper event listeners
    document.querySelectorAll('.quick-btn.income').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.quickAddIncome();
      });
    });

    document.querySelectorAll('.quick-btn.expense').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.quickAddExpense();
      });
    });

    document.querySelectorAll('.quick-btn.savings').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.quickAddSavings();
      });
    });

    document.querySelectorAll('.quick-btn.transfer').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.quickAddTransfer();
      });
    });

    document.querySelectorAll('.quick-btn.savings-withdraw').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.quickAddSavingsWithdraw();
      });
    });

    document.querySelectorAll('.quick-btn.sync').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.prepareSyncModal();
        this.openModal('syncModal');
      });
    });

    document.querySelectorAll('.quick-btn.plans').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchTab('plans');
      });
    });

    document.querySelectorAll('.quick-btn.budget').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchTab('budget');
      });
    });

    // Sync form
    const syncForm = $<HTMLFormElement>('syncForm');
    syncForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSyncBalance();
    });

    // Add payment button
    $('openAddPaymentModalBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      void this.getPage('plans').then(p => (p as PageWithPaymentModal).openAddPaymentModal());
    });

    // Add category button
    $('openCategoryModalBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      void this.getPage('settings').then(p => (p as PageWithCategoryModal).openCategoryModal());
    });
    
    // Goal modal button — handled by budget page
    
    // Refresh recommendations button (reloads dashboard including forecast, cashflow, AI)
    $('refreshRecommendationsBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.pages['dashboard']?.load();
    });
  }

  /**
   * Setup offline/online indicator banner
   */
  private setupOfflineIndicator(): void {
    offlineIndicator.init();

    window.addEventListener('offline-sync-complete', () => {
      this.pages[this.currentTab]?.load();
    });

    void syncService.getPendingCount().then(count => {
      if (count > 0 && navigator.onLine) {
        void syncService.syncAll();
      }
    });
  }

  /**
   * Setup WebSocket и синхронизация между вкладками
   */
  private setupWebSocket(): void {
    const me = store.get('me') as { id: number } | null;
    wsService.connect(me?.id);

    const handleUpdateFromAnySource = (target: string) => {
      console.log('Data update:', target);
      void this.handleUpdate(target);
    };

    wsService.onUpdate((target) => {
      handleUpdateFromAnySource(target);
      broadcastUpdate(target);
    });

    initTabSync(handleUpdateFromAnySource);
  }

  /**
   * Handle WebSocket updates
   */
  private async handleUpdate(target: string): Promise<void> {
    switch (target) {
      case 'transactions':
        if (this.currentTab === 'operations') {
          this.pages['operations']?.load();
        } else if (this.currentTab === 'dashboard') {
          this.pages['dashboard']?.load();
        }
        break;
      case 'balance':
      case 'dashboard':
        await this.loadInitialData();
        if (this.currentTab === 'dashboard') {
          this.pages['dashboard']?.load();
        }
        break;
      case 'categories':
        if (this.currentTab === 'settings') {
          this.pages['settings']?.load();
        }
        break;
      case 'payments':
        if (this.currentTab === 'plans') {
          this.pages['plans']?.load();
        } else if (this.currentTab === 'dashboard') {
          this.pages['dashboard']?.load();
        }
        break;
      case 'goals':
        if (this.currentTab === 'budget') {
          this.pages['budget']?.load();
        } else if (this.currentTab === 'dashboard') {
          this.pages['dashboard']?.load();
        }
        break;
      case 'settings':
        if (this.currentTab === 'settings') {
          this.pages['settings']?.load();
        }
        await this.loadInitialData();
        break;
      case 'budgets':
        if (this.currentTab === 'budget') {
          this.pages['budget']?.load();
        }
        break;
      case 'notes':
        if (this.currentTab === 'notes') {
          this.pages['notes']?.load();
        }
        break;
      case 'calendar':
        if (this.currentTab === 'calendar') {
          this.pages['calendar']?.load();
        }
        break;
      default:
        this.pages[this.currentTab]?.refresh(target);
    }
  }

  /**
   * Load initial data — один запрос /api/bootstrap вместо 5–7
   */
  private async loadInitialData(): Promise<void> {
    try {
      const data = await api.getBootstrap();

      store.set('currencyRates', {
        BYN: 1,
        RUB: parseFloat(data.rates.RUB) || 0.034,
        EUR: parseFloat(data.rates.EUR) || 3.55,
        USD: parseFloat(data.rates.USD) || 3.25,
      });
      store.set('categories', data.categories);
      store.set('incomeTypes', data.income_types);
      store.set('experimentalFeatures', data.me.experimental_features || []);
      store.set('me', data.me);
      const balanceData = data.accounts && data.total_balance !== undefined
        ? { accounts: data.accounts, total_balance: data.total_balance }
        : {
            accounts: data.balance ? [{ id: data.balance.id, name: data.balance.name, balance: data.balance.balance }] : [],
            total_balance: data.balance?.balance ?? 0,
          };
      store.set('balance', balanceData);
      store.set('reminders', data.reminders);

      store.set('telegramLinked', data.telegram_linked === true);

      if (data.theme && (data.theme === 'dark' || data.theme === 'light')) {
        this.setTheme(data.theme, false);
      }

      if ((data.me.experimental_features || []).includes('bank_receipt_import')) {
        const tab = document.getElementById('bankReceiptsTab');
        if (tab) tab.style.display = '';
      }

      if ((data.me.experimental_features || []).includes('notes')) {
        const tab = document.getElementById('notesTab');
        if (tab) tab.style.display = '';
      }

      if ((data.me.experimental_features || []).includes('calendar')) {
        const tab = document.getElementById('calendarTab');
        if (tab) tab.style.display = '';
      }
    } catch (e) {
      console.error('Initial data load error:', e);
    }
  }

  /**
   * Setup modals (delegated for dynamic modals)
   */
  private setupModals(): void {
    // Close modal on Escape, focus trap on Tab (any .modal.show)
    document.addEventListener('keydown', (e) => {
      const activeModal = document.querySelector('.modal.show') as HTMLElement;
      if (e.key === 'Escape' && activeModal) {
        this.closeModal(activeModal.id);
        return;
      }
      if (e.key === 'Tab' && activeModal) {
        const focusable = activeModal.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first && last) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last && first) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    // Delegated: backdrop click, close buttons (works for dynamic modals)
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.modal-close') || target.closest('[onclick^="closeModal"]')) {
        e.preventDefault();
        const modal = target.closest('.modal');
        if (modal) this.closeModal(modal.id);
        return;
      }
      if (target.classList.contains('modal')) {
        if (e.target === target) this.closeModal(target.id);
      }
    });
  }

  /**
   * Open modal
   */
  openModal(id: string): void {
    const modal = $(id);
    if (modal) {
      modal.classList.add('show');
      this.activeModalId = id;

      // Focus first input
      const firstInput = modal.querySelector('input, select, textarea') as HTMLElement;
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
      }
    }
  }

  /**
   * Close modal
   */
  closeModal(id: string): void {
    const modal = $(id);
    if (modal) {
      modal.classList.remove('show');
      if (this.activeModalId === id) {
        this.activeModalId = null;
      }
    }
  }

  /**
   * Confirm dialog — использует тот же HTML-модал что goalModal, syncModal
   */
  openConfirmModal(message: string, title = 'Подтверждение'): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = $('confirmModal');
      const titleEl = $('confirmModalTitle');
      const messageEl = $('confirmModalMessage');
      const okBtn = $('confirmModalOk');
      const cancelBtn = $('confirmModalCancel');

      if (!modal || !titleEl || !messageEl || !okBtn || !cancelBtn) {
        resolve(false);
        return;
      }

      const cleanup = (result: boolean) => {
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
        modal.querySelectorAll('.modal-close').forEach(btn => btn.removeEventListener('click', onClose));
        this.closeModal('confirmModal');
        resolve(result);
      };

      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onClose = () => cleanup(false);
      const onBackdrop = (e: Event) => {
        if (e.target === modal) cleanup(false);
      };

      titleEl.textContent = title;
      messageEl.textContent = message;

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
      modal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', onClose));

      this.openModal('confirmModal');
    });
  }

  /**
   * Quick add income
   */
  private async quickAddIncome(): Promise<void> {
    await this.switchTab('operations');
    (this.pages['operations'] as PageWithTypeAndFocus | undefined)?.setTypeAndFocus('salary');
  }

  private async quickAddExpense(): Promise<void> {
    await this.switchTab('operations');
    (this.pages['operations'] as PageWithTypeAndFocus | undefined)?.setTypeAndFocus('expense');
  }

  private async quickAddSavings(): Promise<void> {
    await this.switchTab('operations');
    (this.pages['operations'] as PageWithTypeAndFocus | undefined)?.setTypeAndFocus('savings');
  }

  private async quickAddTransfer(): Promise<void> {
    await this.switchTab('operations');
    (this.pages['operations'] as PageWithTypeAndFocus | undefined)?.setTypeAndFocus('transfer');
  }

  private async quickAddSavingsWithdraw(): Promise<void> {
    await this.switchTab('operations');
    (this.pages['operations'] as PageWithTypeAndFocus | undefined)?.setTypeAndFocus('savings_withdrawal');
  }

  /**
   * Prepare sync modal — populate account selector if multiple accounts
   */
  private prepareSyncModal(): void {
    const balanceData = store.get('balance');
    const group = $('syncAccountGroup');
    const select = $<HTMLSelectElement>('syncAccountSelect');
    if (!group || !select) return;

    const accounts = balanceData?.accounts ?? [];
    if (accounts.length > 1) {
      group.style.display = 'block';
      select.innerHTML = accounts.map(a => `<option value="${a.id}">${a.name} (${a.balance.toFixed(2)} Br)</option>`).join('');
    } else {
      group.style.display = 'none';
    }
  }

  /**
   * Handle sync balance form
   */
  private async handleSyncBalance(): Promise<void> {
    const balanceInput = $<HTMLInputElement>('syncBalance');
    if (!balanceInput) return;

    const balance = parseFloat(balanceInput.value);
    const accountSelect = $<HTMLSelectElement>('syncAccountSelect');
    const accountId = accountSelect?.value ? parseInt(accountSelect.value) : undefined;

    try {
      const result = await api.syncBalance(balance, accountId);
      this.closeModal('syncModal');

      if (result.difference !== 0) {
        toast.info(`Баланс скорректирован. Разница: ${result.difference.toFixed(2)} Br`);
      } else {
        toast.success('Баланс актуален');
      }

      this.pages['dashboard']?.load();
    } catch (e) {
      toast.error('Ошибка синхронизации баланса');
    }
  }
}

// Create and export app instance
export const app = new App();

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

// Export for global access (during migration)
declare global {
  interface Window {
    app: App;
    switchTab: (tabId: string) => void;
    openModal: (id: string) => void;
    closeModal: (id: string) => void;
    openConfirmModal: (message: string, title?: string) => Promise<boolean>;
  }
}

window.app = app;
window.switchTab = (tabId: string) => app.switchTab(tabId as TabId);
window.openModal = (id: string) => app.openModal(id);
window.closeModal = (id: string) => app.closeModal(id);
window.openConfirmModal = (message: string, title?: string) => app.openConfirmModal(message, title);

export default app;
