export const DEFAULT_LABEL_COLOR = '#6366f1';

export const LABEL_COLORS = [
  '#6366f1',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
  '#e17055',
  '#a29bfe',
];

export function randomLabelColor(): string {
  return LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)]!;
}
