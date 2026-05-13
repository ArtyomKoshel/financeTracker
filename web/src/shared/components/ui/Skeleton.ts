/**
 * Skeleton UI component
 * Варианты: default, transaction
 */

export type SkeletonVariant = 'default' | 'transaction';

/**
 * Render skeleton loading placeholder HTML
 */
export function skeletonHtml(count: number, variant: SkeletonVariant = 'default'): string {
  const skeletons = variant === 'transaction'
    ? Array(count).fill(0).map(() => `
        <div class="skeleton-item skeleton-transaction">
          <div class="skeleton-line skeleton-icon"></div>
          <div class="skeleton-content">
            <div class="skeleton-line skeleton-title"></div>
            <div class="skeleton-line skeleton-text"></div>
          </div>
          <div class="skeleton-line skeleton-amount"></div>
        </div>
      `).join('')
    : Array(count).fill(0).map(() => `
        <div class="skeleton-item">
          <div class="skeleton-line skeleton-title"></div>
          <div class="skeleton-line skeleton-text"></div>
        </div>
      `).join('');
  return `<div class="skeleton-container">${skeletons}</div>`;
}

/**
 * Show skeleton in container
 */
export function showSkeleton(
  container: HTMLElement | null,
  count = 3,
  variant: SkeletonVariant = 'default'
): void {
  if (!container) return;
  container.setAttribute('aria-busy', 'true');
  container.innerHTML = skeletonHtml(count, variant);
}

/**
 * Clear skeleton and reset aria-busy
 */
export function clearSkeleton(container: HTMLElement | null): void {
  if (!container) return;
  container.removeAttribute('aria-busy');
}

/**
 * Show skeletons for multiple containers by ID
 */
export function showSkeletons(
  targets: Array<{ id: string; count?: number; variant?: SkeletonVariant }>
): void {
  targets.forEach(({ id, count = 3, variant = 'default' }) =>
    showSkeleton(document.getElementById(id), count, variant)
  );
}
