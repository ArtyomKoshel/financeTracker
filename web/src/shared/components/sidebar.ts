/**
 * Sidebar Component (Desktop Navigation)
 * 
 * Renders sidebar navigation for desktop layout (min-width: 768px).
 * - Hidden on mobile (bottom tabs used instead)
 * - Uses Store to determine active tab and sync with app state
 * - Automatically updates when experimental features are enabled
 * - Integrates with app.ts for logout and admin navigation
 * 
 * Architecture:
 * - Component: sidebar.ts (this file) - only renders, no API calls
 * - Store: currentTab, experimentalFeatures, me - reactive state
 * - CSS: style.css @media (min-width: 768px) - responsive layout
 */
import { store } from '@/store';

type TabId = 'dashboard' | 'operations' | 'analytics' | 'plans' | 'budget' | 'settings' | 'bank-receipts' | 'notes' | 'calendar';

interface SidebarItem {
  id: TabId;
  icon: string;
  label: string;
  experimental?: boolean;
}

const EXPERIMENTAL_FEATURE_MAP: Record<string, string> = {
  'bank-receipts': 'bank_receipt_import',
  'notes': 'notes',
  'calendar': 'calendar',
};

const navItems: SidebarItem[] = [
  { id: 'dashboard', icon: '🏠', label: 'Главная' },
  { id: 'operations', icon: '💳', label: 'Операции' },
  { id: 'analytics', icon: '📊', label: 'Аналитика' },
  { id: 'plans', icon: '📋', label: 'Планы' },
  { id: 'budget', icon: '💰', label: 'Бюджет' },
  { id: 'notes', icon: '📝', label: 'Заметки', experimental: true },
  { id: 'calendar', icon: '📆', label: 'Календарь', experimental: true },
  { id: 'settings', icon: '⚙️', label: 'Настройки' },
  { id: 'bank-receipts', icon: '🧾', label: 'Чеки', experimental: true },
];

export class Sidebar {
  private container: HTMLElement | null = null;
  private userName: string = '';
  private isAdmin: boolean = false;
  private onLogout?: () => void;
  private onAdminClick?: () => void;
  private onTabSwitch?: (tabId: string) => void;

  constructor() {
    this.render();
    this.setupListeners();
  }

  setUserInfo(name: string, isAdmin: boolean): void {
    this.userName = name;
    this.isAdmin = isAdmin;
    this.updateUserInfo();
  }

  setLogoutHandler(handler: () => void): void {
    this.onLogout = handler;
  }

  setAdminHandler(handler: () => void): void {
    this.onAdminClick = handler;
  }

  setTabSwitchHandler(handler: (tabId: string) => void): void {
    this.onTabSwitch = handler;
  }

  refreshNav(): void {
    this.updateNavItems();
  }

  private render(): void {
    const existing = document.getElementById('appSidebar');
    if (existing) {
      this.container = existing;
      return;
    }

    const sidebar = document.createElement('aside');
    sidebar.id = 'appSidebar';
    sidebar.className = 'sidebar';
    sidebar.setAttribute('role', 'navigation');
    sidebar.setAttribute('aria-label', 'Основная навигация');

    sidebar.innerHTML = `
      <div class="sidebar-header">
        <div class="sidebar-logo">Finance Tracker</div>
        <div class="sidebar-user" id="sidebarUser">Загрузка...</div>
      </div>
      
      <nav class="sidebar-nav" id="sidebarNav">
        ${this.renderNavItems()}
      </nav>
      
      <div class="sidebar-footer">
        ${this.isAdmin ? '<button class="sidebar-footer-btn" id="sidebarAdminBtn"><span>👥</span><span>Админ</span></button>' : ''}
        <button class="sidebar-footer-btn" id="sidebarLogoutBtn">
          <span>🚪</span>
          <span>Выход</span>
        </button>
      </div>
    `;

    document.body.insertBefore(sidebar, document.body.firstChild);
    this.container = sidebar;
  }

  private renderNavItems(): string {
    const experimentalFeatures = store.get('experimentalFeatures') || [];

    return navItems
      .filter(item => {
        if (item.experimental) {
          const featureCode = EXPERIMENTAL_FEATURE_MAP[item.id] ?? item.id.replace(/-/g, '_');
          return experimentalFeatures.includes(featureCode);
        }
        return true;
      })
      .map(item => {
        const activeTab = store.get('currentTab');
        const isActive = activeTab === item.id;
        const badge = item.experimental ? '<span class="sidebar-item-badge" title="Экспериментальная функция">🧪</span>' : '';
        
        return `
          <button 
            type="button" 
            class="sidebar-item ${isActive ? 'active' : ''}" 
            data-tab="${item.id}"
            aria-current="${isActive ? 'page' : 'false'}"
          >
            <span class="sidebar-item-icon">${item.icon}</span>
            <span class="sidebar-item-label">${item.label}</span>
            ${badge}
          </button>
        `;
      })
      .join('');
  }

  private setupListeners(): void {
    store.subscribe('currentTab', () => {
      this.updateActiveItem();
    });

    store.subscribe('experimentalFeatures', () => {
      this.updateNavItems();
    });

    store.subscribe('me', () => {
      const me = store.get('me');
      if (me) {
        this.setUserInfo(me.name, false);
      }
    });

    document.addEventListener('click', (e) => {
      const logoutBtn = (e.target as HTMLElement).closest('#sidebarLogoutBtn');
      if (logoutBtn && this.onLogout) {
        this.onLogout();
      }

      const adminBtn = (e.target as HTMLElement).closest('#sidebarAdminBtn');
      if (adminBtn && this.onAdminClick) {
        this.onAdminClick();
      }
    });

    const nav = document.getElementById('sidebarNav');
    nav?.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.sidebar-item[data-tab]');
      if (item) {
        const tabId = item.getAttribute('data-tab');
        if (tabId && this.onTabSwitch) {
          e.preventDefault();
          this.onTabSwitch(tabId);
        }
      }
    });
  }

  private updateActiveItem(): void {
    if (!this.container) return;

    const activeTab = store.get('currentTab');
    const items = this.container.querySelectorAll('.sidebar-item');
    
    items.forEach(item => {
      const tabId = item.getAttribute('data-tab');
      const isActive = tabId === activeTab;
      
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
  }

  private updateNavItems(): void {
    const navContainer = document.getElementById('sidebarNav');
    if (navContainer) {
      navContainer.innerHTML = this.renderNavItems();
    }
  }

  private updateUserInfo(): void {
    const userEl = document.getElementById('sidebarUser');
    if (userEl) {
      userEl.textContent = this.userName || 'Пользователь';
    }

    const footer = this.container?.querySelector('.sidebar-footer');
    if (footer && this.isAdmin) {
      const existingAdminBtn = footer.querySelector('#sidebarAdminBtn');
      if (!existingAdminBtn) {
        const adminBtn = document.createElement('button');
        adminBtn.id = 'sidebarAdminBtn';
        adminBtn.className = 'sidebar-footer-btn';
        adminBtn.innerHTML = '<span>👥</span><span>Админ</span>';
        footer.insertBefore(adminBtn, footer.firstChild);
      }
    }
  }
}

export const sidebar = new Sidebar();
