import { globalSearch } from '@/shared/components/global-search';

interface ShortcutHandler {
  key: string;
  ctrl?: boolean;
  handler: () => void;
  description: string;
}

class ShortcutManager {
  private shortcuts: ShortcutHandler[] = [];
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.register({
      key: 'k',
      ctrl: true,
      description: 'Глобальный поиск',
      handler: () => globalSearch.toggle(),
    });

    this.register({
      key: 'n',
      ctrl: true,
      description: 'Новая транзакция',
      handler: () => {
        window.switchTab('operations');
      },
    });

    document.addEventListener('keydown', (e) => this.handleKeydown(e));
  }

  private register(shortcut: ShortcutHandler): void {
    this.shortcuts.push(shortcut);
  }

  private handleKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT'
      || target.tagName === 'TEXTAREA'
      || target.tagName === 'SELECT'
      || target.isContentEditable;

    const mod = e.metaKey || e.ctrlKey;

    for (const shortcut of this.shortcuts) {
      if (shortcut.ctrl && mod && e.key.toLowerCase() === shortcut.key) {
        e.preventDefault();
        shortcut.handler();
        return;
      }
    }

    if (e.key === 'Escape' && !isInput) {
      const activeModal = document.querySelector('.modal.show') as HTMLElement;
      if (activeModal) {
        window.closeModal(activeModal.id);
      }
    }
  }
}

export const shortcutManager = new ShortcutManager();
