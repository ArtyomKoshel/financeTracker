import { setHTML } from '@/shared/utils/dom';
import type { CalendarItem } from '@/types';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function getItemsByDate(items: CalendarItem[]): Record<string, CalendarItem[]> {
  const map: Record<string, CalendarItem[]> = {};
  for (const i of items) {
    const date = i.start_at.slice(0, 10);
    if (!map[date]) map[date] = [];
    map[date].push(i);
  }
  return map;
}

function getMonthGrid(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const startOffset = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const daysInMonth = last.getDate();

  const grid: (number | null)[][] = [];
  let week: (number | null)[] = [];

  for (let i = 0; i < startOffset; i++) {
    week.push(null);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) {
      grid.push(week);
      week = [];
    }
  }

  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    grid.push(week);
  }

  return grid;
}

export interface CalendarGridOptions {
  year: number;
  month: number;
  items: CalendarItem[];
  selectedDate?: string;
  onDaySelect?: (date: string) => void;
}

export function renderCalendarGrid(
  container: HTMLElement | null,
  options: CalendarGridOptions
): void {
  if (!container) return;

  const { year, month, items, selectedDate, onDaySelect } = options;
  const itemsByDate = getItemsByDate(items);
  const grid = getMonthGrid(year, month);
  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayDay = isCurrentMonth ? today.getDate() : 0;

  const headerRow = WEEKDAYS.map((wd, idx) => {
    const isWeekend = idx >= 5;
    return `<th class="calendar-grid-th${isWeekend ? ' calendar-grid-th--weekend' : ''}">${wd}</th>`;
  }).join('');

  const bodyRows = grid
    .map(
      (week) =>
        `<tr class="calendar-grid-row">${week
          .map((day, colIdx) => {
            if (day === null) {
              return '<td class="calendar-grid-cell calendar-grid-cell-empty"></td>';
            }
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayItems = itemsByDate[dateStr] ?? [];
            const isSelected = selectedDate === dateStr;
            const isToday = day === todayDay;
            const isWeekend = colIdx >= 5;
            const classes = [
              'calendar-grid-cell',
              isSelected ? 'calendar-grid-cell-selected' : '',
              isToday ? 'calendar-grid-cell-today' : '',
              isWeekend ? 'calendar-grid-cell--weekend' : '',
            ]
              .filter(Boolean)
              .join(' ');

            const dotsHtml =
              dayItems.length > 0
                ? `<span class="calendar-grid-dots" title="${dayItems.map((i) => i.title).join(', ')}">${dayItems
                    .slice(0, 4)
                    .map((i) => {
                      const color =
                        i.kind === 'payment'
                          ? i.is_paid
                            ? 'var(--success)'
                            : 'var(--warning)'
                          : (i as { color?: string | null }).color ?? 'var(--primary)';
                      return `<span class="calendar-grid-dot" style="background:${color}"></span>`;
                    })
                    .join('')}</span>`
                : '';

            return `<td class="${classes}" data-date="${dateStr}" data-day="${day}" role="button" tabindex="0"><span class="calendar-grid-day-num">${day}</span><span class="calendar-grid-cell-content">${dotsHtml}</span></td>`;
          })
          .join('')}</tr>`
    )
    .join('');

  const html = `
    <table class="calendar-grid" role="grid">
      <thead><tr>${headerRow}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;

  setHTML(container, html);

  if (onDaySelect) {
    container.querySelectorAll('[data-date]').forEach((cell) => {
      cell.addEventListener('click', () => {
        const date = (cell as HTMLElement).dataset.date;
        if (date) onDaySelect(date);
      });
      cell.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          e.preventDefault();
          const date = (cell as HTMLElement).dataset.date;
          if (date) onDaySelect(date);
        }
      });
    });
  }
}
