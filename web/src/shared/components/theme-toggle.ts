interface ThemeToggleOptions {
  className?: string;
  showLabel?: boolean;
}

function getCurrentTheme(): string {
  return document.body.getAttribute('data-theme') || 'dark';
}

export class ThemeToggle {
  private btn: HTMLButtonElement;
  private showLabel: boolean;
  onToggle?: (theme: string) => void;

  constructor(options: ThemeToggleOptions = {}) {
    this.showLabel = options.showLabel ?? false;
    this.btn = document.createElement('button');
    this.btn.type = 'button';
    this.btn.className = options.className || 'btn btn-icon';
    this.render();

    this.btn.addEventListener('click', () => {
      const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
      this.onToggle?.(next);
    });
  }

  get element(): HTMLButtonElement {
    return this.btn;
  }

  update(): void {
    this.render();
  }

  private render(): void {
    const isDark = getCurrentTheme() === 'dark';
    const icon = isDark ? '☀️' : '🌙';
    this.btn.title = isDark ? 'Светлая тема' : 'Тёмная тема';

    if (this.showLabel) {
      const label = isDark ? 'Светлая тема' : 'Тёмная тема';
      this.btn.innerHTML = `<span>${icon}</span><span>${label}</span>`;
    } else {
      this.btn.textContent = icon;
    }
  }
}
