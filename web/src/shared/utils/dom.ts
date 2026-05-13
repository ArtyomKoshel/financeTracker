/**
 * DOM utility functions
 */

/**
 * Get element by ID with type safety
 */
export function $<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/**
 * Get element by ID or throw
 */
export function $$<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`Element not found: ${id}`);
  return el;
}

/**
 * Query selector with type safety
 */
export function qs<T extends HTMLElement = HTMLElement>(selector: string, parent: Element | Document = document): T | null {
  return parent.querySelector(selector) as T | null;
}

/**
 * Query selector all with type safety
 */
export function qsa<T extends HTMLElement = HTMLElement>(selector: string, parent: Element | Document = document): T[] {
  return Array.from(parent.querySelectorAll(selector)) as T[];
}

/**
 * Create element with attributes and children
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number | boolean | undefined>,
  children?: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined) continue;
      if (key === 'className') {
        el.className = String(value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else {
        el.setAttribute(key, String(value));
      }
    }
  }
  
  if (children) {
    for (const child of children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else {
        el.appendChild(child);
      }
    }
  }
  
  return el;
}

/**
 * Set inner HTML safely
 */
export function setHTML(element: HTMLElement | null, html: string): void {
  if (element) {
    element.innerHTML = html;
  }
}

/**
 * Set text content
 */
export function setText(element: HTMLElement | null, text: string): void {
  if (element) {
    element.textContent = text;
  }
}

/**
 * Show element
 */
export function show(element: HTMLElement | null, display = 'block'): void {
  if (element) {
    element.style.display = display;
  }
}

/**
 * Hide element
 */
export function hide(element: HTMLElement | null): void {
  if (element) {
    element.style.display = 'none';
  }
}

/**
 * Toggle element visibility
 */
export function toggle(element: HTMLElement | null, visible?: boolean): void {
  if (!element) return;
  if (visible === undefined) {
    element.style.display = element.style.display === 'none' ? '' : 'none';
  } else {
    element.style.display = visible ? '' : 'none';
  }
}

/**
 * Add event listener with automatic cleanup
 */
export function on<K extends keyof HTMLElementEventMap>(
  element: HTMLElement | null,
  event: K,
  handler: (e: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions
): () => void {
  if (!element) return () => {};
  element.addEventListener(event, handler as EventListener, options);
  return () => element.removeEventListener(event, handler as EventListener, options);
}

/**
 * Delegate event listener
 */
export function delegate<K extends keyof HTMLElementEventMap>(
  parent: HTMLElement,
  selector: string,
  event: K,
  handler: (e: HTMLElementEventMap[K], target: HTMLElement) => void
): () => void {
  const listener = (e: Event) => {
    const target = (e.target as HTMLElement).closest(selector);
    if (target && parent.contains(target)) {
      handler(e as HTMLElementEventMap[K], target as HTMLElement);
    }
  };
  parent.addEventListener(event, listener);
  return () => parent.removeEventListener(event, listener);
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timeout: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  }) as T;
}

/**
 * Scroll element into view smoothly
 */
export function scrollTo(element: HTMLElement | null): void {
  element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Show loading indicator in container
 */
export function showLoading(container: HTMLElement | null, text = 'Загрузка...'): void {
  if (!container) return;
  container.innerHTML = `
    <div class="loading-indicator">
      <div class="loading-spinner"></div>
      <span class="loading-text">${text}</span>
    </div>
  `;
}

/**
 * Re-export from UI components (backward compatibility)
 * @deprecated Import from '@/shared/components/ui' instead
 */
export { showSkeleton, showSkeletons } from '@/shared/components/ui/Skeleton';
export { emptyStateHtml } from '@/shared/components/ui/EmptyState';
