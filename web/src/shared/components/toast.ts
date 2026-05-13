type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
  duration?: number;
  closable?: boolean;
}

/**
 * Toast notification component
 */
class ToastManager {
  private container: HTMLElement | null = null;

  /**
   * Initialize toast container
   */
  private ensureContainer(): HTMLElement {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      this.container.setAttribute('role', 'status');
      this.container.setAttribute('aria-live', 'polite');
      this.container.setAttribute('aria-atomic', 'false');
      this.container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 10px;
      `;
      document.body.appendChild(this.container);
    }
    return this.container;
  }

  /**
   * Show toast notification
   */
  show(message: string, type: ToastType = 'info', options: ToastOptions = {}): void {
    const { duration = 3000, closable = true } = options;
    const container = this.ensureContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
      padding: 12px 20px;
      border-radius: 8px;
      color: white;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      animation: slideIn 0.3s ease;
      max-width: 350px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    `;

    // Set background color based on type
    const colors: Record<ToastType, string> = {
      success: '#10B981',
      error: '#EF4444',
      warning: '#F59E0B',
      info: '#3B82F6',
    };
    toast.style.backgroundColor = colors[type];

    // Icon
    const icons: Record<ToastType, string> = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ',
    };

    const icon = document.createElement('span');
    icon.textContent = icons[type];
    icon.style.fontWeight = 'bold';
    toast.appendChild(icon);

    // Message
    const text = document.createElement('span');
    text.textContent = message;
    text.style.flex = '1';
    toast.appendChild(text);

    // Close button
    if (closable) {
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      closeBtn.style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        line-height: 1;
        opacity: 0.7;
      `;
      closeBtn.onclick = () => this.dismiss(toast);
      toast.appendChild(closeBtn);
    }

    container.appendChild(toast);

    // Auto dismiss
    if (duration > 0) {
      setTimeout(() => this.dismiss(toast), duration);
    }
  }

  /**
   * Dismiss toast with animation
   */
  private dismiss(toast: HTMLElement): void {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }

  /**
   * Shorthand methods
   */
  success(message: string, options?: ToastOptions): void {
    this.show(message, 'success', options);
  }

  error(message: string, options?: ToastOptions): void {
    this.show(message, 'error', options);
  }

  warning(message: string, options?: ToastOptions): void {
    this.show(message, 'warning', options);
  }

  info(message: string, options?: ToastOptions): void {
    this.show(message, 'info', options);
  }
}

// Add keyframe animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Export singleton instance
export const toast = new ToastManager();

export default toast;
