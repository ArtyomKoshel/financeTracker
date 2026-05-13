import { offlineService } from '@/shared/services/offline.service';
import { syncService } from '@/shared/services/sync.service';

class OfflineIndicator {
  private el: HTMLElement | null = null;
  private badgeEl: HTMLElement | null = null;
  private textEl: HTMLElement | null = null;
  private pendingCount = 0;

  init(): void {
    this.render();
    offlineService.onStatusChange((online) => this.onStatusChange(online));
    syncService.onStatusChange((syncing, pending) => this.onSyncChange(syncing, pending));

    if (!offlineService.isOnline) {
      void this.show(false);
    }

    void this.updateBadge();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'sync-complete') {
          void this.onSyncComplete();
        } else if (e.data?.type === 'get-storage') {
          const port = e.ports?.[0];
          if (port) {
            port.postMessage(localStorage.getItem(e.data.key));
          }
        }
      });
    }
  }

  private render(): void {
    const indicator = document.createElement('div');
    indicator.id = 'offlineIndicator';
    indicator.className = 'offline-indicator';
    indicator.innerHTML = `
      <span class="offline-indicator__icon">⚡</span>
      <span class="offline-indicator__text">Нет соединения</span>
      <span class="offline-indicator__badge" style="display:none"></span>
      <button class="offline-indicator__close" aria-label="Закрыть">&times;</button>
    `;
    document.body.appendChild(indicator);

    this.el = indicator;
    this.textEl = indicator.querySelector('.offline-indicator__text');
    this.badgeEl = indicator.querySelector('.offline-indicator__badge');

    indicator.querySelector('.offline-indicator__close')?.addEventListener('click', () => {
      this.hide();
    });
  }

  private async onStatusChange(online: boolean): Promise<void> {
    if (online) {
      this.setText('Соединение восстановлено');
      this.setIcon('✅');
      this.el?.classList.add('offline-indicator--online');
      this.el?.classList.remove('offline-indicator--syncing');

      const count = await syncService.getPendingCount();
      if (count > 0) {
        this.setText(`Синхронизация... (${count})`);
        this.setIcon('🔄');
        this.el?.classList.add('offline-indicator--syncing');
        void this.show(true);

        const result = await syncService.syncAll();
        if (result.success > 0) {
          this.setText(`Синхронизировано: ${result.success}`);
          this.setIcon('✅');
          window.dispatchEvent(new CustomEvent('offline-sync-complete'));
        }

        this.el?.classList.remove('offline-indicator--syncing');
      } else {
        void this.show(true);
      }

      setTimeout(() => this.hide(), 3000);
    } else {
      this.el?.classList.remove('offline-indicator--online');
      this.setIcon('⚡');
      this.setText('Нет соединения');
      void this.show(false);
      void this.updateBadge();
    }
  }

  private onSyncChange(syncing: boolean, pending: number): void {
    this.pendingCount = pending;
    if (syncing) {
      this.setText(`Синхронизация... (${pending})`);
      this.setIcon('🔄');
      this.el?.classList.add('offline-indicator--syncing');
    }
    this.updateBadgeUI();
  }

  private async onSyncComplete(): Promise<void> {
    const count = await syncService.getPendingCount();
    this.pendingCount = count;
    this.updateBadgeUI();

    if (count === 0) {
      this.setText('Всё синхронизировано');
      this.setIcon('✅');
      this.el?.classList.remove('offline-indicator--syncing');
      this.el?.classList.add('offline-indicator--online');
      void this.show(true);
      setTimeout(() => this.hide(), 3000);
      window.dispatchEvent(new CustomEvent('offline-sync-complete'));
    }
  }

  private async show(autoHide: boolean): Promise<void> {
    if (!this.el) return;
    this.el.classList.add('offline-indicator--visible');
    if (autoHide) {
      setTimeout(() => this.hide(), 4000);
    }
  }

  private hide(): void {
    if (!this.el) return;
    this.el.classList.remove('offline-indicator--visible');
  }

  private setText(text: string): void {
    if (this.textEl) this.textEl.textContent = text;
  }

  private setIcon(icon: string): void {
    const iconEl = this.el?.querySelector('.offline-indicator__icon');
    if (iconEl) iconEl.textContent = icon;
  }

  private async updateBadge(): Promise<void> {
    this.pendingCount = await syncService.getPendingCount();
    this.updateBadgeUI();
  }

  private updateBadgeUI(): void {
    if (!this.badgeEl) return;
    if (this.pendingCount > 0) {
      this.badgeEl.textContent = String(this.pendingCount);
      this.badgeEl.style.display = '';
    } else {
      this.badgeEl.style.display = 'none';
    }
  }
}

export const offlineIndicator = new OfflineIndicator();
