/**
 * Base page class
 */
export abstract class BasePage {
  protected container: HTMLElement | null = null;
  protected isActive = false;

  constructor(protected readonly tabId: string) {}

  /**
   * Initialize the page
   */
  init(): void {
    this.container = document.getElementById(`tab-${this.tabId}`);
  }

  /**
   * Activate the page
   */
  activate(): void {
    this.isActive = true;
    this.onActivate();
    this.load();
  }

  /**
   * Deactivate the page
   */
  deactivate(): void {
    this.isActive = false;
    this.onDeactivate();
  }

  /**
   * Load page data
   */
  abstract load(): Promise<void>;

  /**
   * Refresh specific data
   */
  async refresh(_target?: string): Promise<void> {
    if (this.isActive) {
      await this.load();
    }
  }

  /**
   * Called when page becomes active
   */
  protected onActivate(): void {}

  /**
   * Called when page becomes inactive
   */
  protected onDeactivate(): void {}

  /**
   * Destroy the page and cleanup
   */
  destroy(): void {}
}
