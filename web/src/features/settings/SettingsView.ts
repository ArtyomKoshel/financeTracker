/**
 * Settings View — слой представления
 * Только рендер в DOM, без API-вызовов
 * Desktop: sidebar navigation по секциям настроек
 */
import { $ } from '@/shared/utils/dom';

export function applyDesktopLayout(): void {
  const settingsTab = $('tab-settings');
  if (!settingsTab) return;

  if (window.innerWidth >= 768) {
    settingsTab.classList.add('settings-desktop');
  } else {
    settingsTab.classList.remove('settings-desktop');
  }
}
