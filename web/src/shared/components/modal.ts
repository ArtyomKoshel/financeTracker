interface ModalOptions {
  title?: string;
  content: string | HTMLElement;
  closable?: boolean;
  onClose?: () => void;
}

/**
 * Modal dialog component
 */
class ModalManager {
  private activeModals: HTMLElement[] = [];

  /**
   * Show modal dialog
   */
  show(options: ModalOptions): HTMLElement {
    const { title, content, closable = true, onClose } = options;

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      animation: fadeIn 0.2s ease;
    `;

    // Modal container
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = `
      background: var(--card-bg, white);
      border-radius: 12px;
      max-width: 500px;
      width: 90%;
      max-height: 90vh;
      overflow: auto;
      animation: scaleIn 0.2s ease;
    `;

    // Header
    if (title || closable) {
      const header = document.createElement('div');
      header.className = 'modal-header';
      header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-color, #eee);
      `;

      if (title) {
        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        titleEl.style.margin = '0';
        header.appendChild(titleEl);
      }

      if (closable) {
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.className = 'modal-close';
        closeBtn.style.cssText = `
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          line-height: 1;
          color: var(--text-secondary, #666);
        `;
        closeBtn.onclick = () => this.close(overlay, onClose);
        header.appendChild(closeBtn);
      }

      modal.appendChild(header);
    }

    // Body
    const body = document.createElement('div');
    body.className = 'modal-body';
    body.style.padding = '20px';

    if (typeof content === 'string') {
      body.innerHTML = content;
    } else {
      body.appendChild(content);
    }

    modal.appendChild(body);
    overlay.appendChild(modal);

    // Close on overlay click
    if (closable) {
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          this.close(overlay, onClose);
        }
      };

      // Close on Escape key
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          this.close(overlay, onClose);
          document.removeEventListener('keydown', handleEscape);
        }
      };
      document.addEventListener('keydown', handleEscape);
    }

    document.body.appendChild(overlay);
    this.activeModals.push(overlay);

    return overlay;
  }

  /**
   * Close modal
   */
  close(modal: HTMLElement, onClose?: () => void): void {
    modal.style.animation = 'fadeOut 0.2s ease';
    const inner = modal.querySelector('.modal') as HTMLElement;
    if (inner) {
      inner.style.animation = 'scaleOut 0.2s ease';
    }

    setTimeout(() => {
      modal.remove();
      const index = this.activeModals.indexOf(modal);
      if (index > -1) {
        this.activeModals.splice(index, 1);
      }
      onClose?.();
    }, 200);
  }

  /**
   * Close all modals
   */
  closeAll(): void {
    for (const modal of [...this.activeModals]) {
      this.close(modal);
    }
  }

  /**
   * Confirm dialog — использует HTML-модал confirmModal (как goalModal, syncModal)
   */
  confirm(message: string, title = 'Подтверждение'): Promise<boolean> {
    const openConfirm = (window as unknown as { openConfirmModal?: (m: string, t?: string) => Promise<boolean> }).openConfirmModal;
    if (openConfirm) {
      return openConfirm(message, title);
    }
    // Fallback: динамический попап (если app ещё не инициализирован)
    return this.confirmFallback(message, title);
  }

  private confirmFallback(message: string, title = 'Подтверждение'): Promise<boolean> {
    return new Promise((resolve) => {
      const content = document.createElement('div');
      content.innerHTML = `
        <p style="margin: 0 0 20px 0;">${message}</p>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button type="button" class="btn btn-secondary" data-action="cancel">Отмена</button>
          <button type="button" class="btn btn-primary" data-action="confirm">Подтвердить</button>
        </div>
      `;

      const modal = this.show({
        title,
        content,
        closable: true,
        onClose: () => resolve(false),
      });

      content.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
        this.close(modal);
        resolve(false);
      });

      content.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
        this.close(modal);
        resolve(true);
      });
    });
  }

  /**
   * Prompt dialog — single input, returns value or null
   */
  prompt(options: {
    label: string;
    defaultValue?: string;
    type?: 'text' | 'number';
    placeholder?: string;
    min?: number;
    max?: number;
    step?: string;
  }, title = 'Ввод'): Promise<string | null> {
    return new Promise((resolve) => {
      const { label, defaultValue = '', type = 'text', placeholder = '', min, max, step } = options;
      const inputAttrs = [
        `type="${type}"`,
        `value="${defaultValue.replace(/"/g, '&quot;')}"`,
        placeholder ? `placeholder="${placeholder.replace(/"/g, '&quot;')}"` : '',
        type === 'number' ? 'step="0.01"' : '',
        min !== undefined ? `min="${min}"` : '',
        max !== undefined ? `max="${max}"` : '',
        step ? `step="${step}"` : '',
      ].filter(Boolean).join(' ');

      const content = document.createElement('div');
      content.innerHTML = `
        <form class="modal-prompt-form" data-action="form">
          <div class="form-group">
            <label>${label}</label>
            <input ${inputAttrs} required autofocus>
          </div>
          <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;">
            <button type="button" class="btn btn-secondary" data-action="cancel">Отмена</button>
            <button type="submit" class="btn btn-primary" data-action="submit">OK</button>
          </div>
        </form>
      `;

      const overlay = this.show({
        title,
        content,
        closable: true,
        onClose: () => resolve(null),
      });

      const input = content.querySelector<HTMLInputElement>('input');
      const form = content.querySelector('form');

      content.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
        this.close(overlay);
        resolve(null);
      });

      form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const value = input?.value?.trim();
        this.close(overlay);
        resolve(value || null);
      });

      setTimeout(() => input?.focus(), 50);
    });
  }

  /**
   * Alert dialog
   */
  alert(message: string, title = 'Уведомление'): Promise<void> {
    return new Promise((resolve) => {
      const content = document.createElement('div');
      content.innerHTML = `
        <p style="margin: 0 0 20px 0;">${message}</p>
        <div style="display: flex; justify-content: flex-end;">
          <button class="btn btn-primary" data-action="ok">OK</button>
        </div>
      `;

      const modal = this.show({
        title,
        content,
        closable: true,
        onClose: () => resolve(),
      });

      content.querySelector('[data-action="ok"]')?.addEventListener('click', () => {
        this.close(modal);
        resolve();
      });
    });
  }
}

// Add animations
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  @keyframes scaleIn {
    from { transform: scale(0.9); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  @keyframes scaleOut {
    from { transform: scale(1); opacity: 1; }
    to { transform: scale(0.9); opacity: 0; }
  }
`;
document.head.appendChild(style);

// Export singleton instance
export const modal = new ModalManager();

export default modal;
