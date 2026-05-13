import { $, setHTML } from '@/shared/utils/dom';
import { showSkeletons } from '@/shared/components/ui';
import { formatDate, formatDateTime, formatMoney } from '@/shared/utils/format';
import { renderCalendarGrid } from '@/features/calendar/calendar-grid';
import type { CalendarItem } from '@/types';

export interface CalendarViewCallbacks {
  onSelectDay?: (date: string) => void;
  onSelectEvent?: (item: CalendarItem) => void;
  onAddClick?: () => void;
}

export class CalendarView {
  onSelectDay?: (date: string) => void;
  onSelectEvent?: (item: CalendarItem) => void;
  onAddClick?: () => void;

  private selectedDate: string | null = null;

  constructor(callbacks?: CalendarViewCallbacks) {
    this.onSelectDay = callbacks?.onSelectDay;
    this.onSelectEvent = callbacks?.onSelectEvent;
    this.onAddClick = callbacks?.onAddClick;
  }

  render(items: CalendarItem[], currentMonth: { year: number; month: number }): void {
    const gridContainer = $('calendarGridContainer');
    const dayEventsContainer = $('calendarDayEvents');

    if (!gridContainer) return;

    renderCalendarGrid(gridContainer, {
      year: currentMonth.year,
      month: currentMonth.month,
      items,
      selectedDate: this.selectedDate ?? undefined,
      onDaySelect: (date) => {
        this.selectedDate = date;
        this.onSelectDay?.(date);
        this.renderDayEvents(date, items.filter((i) => i.start_at.startsWith(date)));
        this.rerenderGrid(items, currentMonth);
      },
    });

    if (this.selectedDate) {
      const dayItems = items.filter((i) => i.start_at.startsWith(this.selectedDate!));
      this.renderDayEvents(this.selectedDate, dayItems);
    } else if (dayEventsContainer) {
      setHTML(
        dayEventsContainer,
        `<div class="calendar-empty-state">
          <span class="calendar-empty-state-icon">📅</span>
          <p class="calendar-empty-state-text">Выберите день в календаре</p>
        </div>`
      );
      this.renderDescriptionsStrip($('calendarDescriptionsStrip'), []);
    }
  }

  private rerenderGrid(items: CalendarItem[], currentMonth: { year: number; month: number }): void {
    const gridContainer = $('calendarGridContainer');
    if (!gridContainer) return;

    renderCalendarGrid(gridContainer, {
      year: currentMonth.year,
      month: currentMonth.month,
      items,
      selectedDate: this.selectedDate ?? undefined,
      onDaySelect: (date) => {
        this.selectedDate = date;
        this.onSelectDay?.(date);
        this.renderDayEvents(date, items.filter((i) => i.start_at.startsWith(date)));
        this.rerenderGrid(items, currentMonth);
      },
    });
  }

  renderDayEvents(day: string, items: CalendarItem[]): void {
    const container = $('calendarDayEvents');
    const stripContainer = $('calendarDescriptionsStrip');
    if (!container) return;

    this.renderDescriptionsStrip(stripContainer, items);

    if (items.length === 0) {
      setHTML(
        container,
        `<div class="calendar-day-events-header">
          <span class="calendar-day-events-date">${formatDate(day)}</span>
          <button type="button" class="btn btn-primary btn-sm" data-add-event>+ Добавить</button>
        </div>
        <div class="calendar-empty-state">
          <span class="calendar-empty-state-icon">✨</span>
          <p class="calendar-empty-state-text">Нет событий на этот день</p>
          <button type="button" class="btn btn-text btn-sm" data-add-event>Добавить событие</button>
        </div>`
      );
    } else {
      const itemsHtml = items
        .map((item) => {
          if (item.kind === 'payment') {
            const amountStr = item.is_variable ? `~${formatMoney(item.amount, item.currency)}` : formatMoney(item.amount, item.currency);
            const paidClass = item.is_paid ? ' is-paid' : '';
            return `
          <div class="calendar-event-item calendar-event-item--payment${paidClass}" data-item-id="${item.id}" data-item-kind="payment" role="presentation">
            <span class="calendar-event-icon calendar-event-icon--payment">💰</span>
            <div class="calendar-event-content">
              <span class="calendar-event-title">${item.title}</span>
              <span class="calendar-event-meta">${amountStr}${item.is_paid ? ' · Оплачено' : ''}</span>
            </div>
          </div>
        `;
          }
          const color = item.color ?? 'var(--primary)';
          return `
          <div class="calendar-event-item" data-item-id="${item.id}" data-item-kind="event" role="button" tabindex="0" style="--event-color: ${color}">
            <span class="calendar-event-dot" style="background: ${color}"></span>
            <div class="calendar-event-content">
              <span class="calendar-event-title">${item.title}</span>
              <span class="calendar-event-time">${item.is_all_day ? 'Весь день' : formatDateTime(item.start_at, item.start_at)}</span>
            </div>
          </div>
        `;
        })
        .join('');

      setHTML(
        container,
        `<div class="calendar-day-events-header">
          <span class="calendar-day-events-date">${formatDate(day)}</span>
          <button type="button" class="btn btn-text btn-sm" data-add-event>+ Добавить</button>
        </div>
        <div class="calendar-day-events-list">${itemsHtml}</div>`
      );
    }

    container.querySelectorAll('[data-add-event]').forEach((btn) => {
      btn.addEventListener('click', () => this.onAddClick?.());
    });

    container.querySelectorAll('[data-item-kind="event"]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.itemId;
        const item = items.find((i) => i.kind === 'event' && String(i.id) === id);
        if (item) this.onSelectEvent?.(item);
      });
      el.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          e.preventDefault();
          const id = (el as HTMLElement).dataset.itemId;
          const item = items.find((i) => i.kind === 'event' && String(i.id) === id);
          if (item) this.onSelectEvent?.(item);
        }
      });
    });
  }

  private renderDescriptionsStrip(container: HTMLElement | null, items: CalendarItem[]): void {
    if (!container) return;

    const chips: { title: string; desc: string; fullTitle: string }[] = [];
    for (const item of items) {
      if (item.kind === 'event') {
        const desc = (item.description ?? '').trim();
        if (desc) chips.push({ title: item.title, desc, fullTitle: `${item.title}: ${desc}` });
      } else {
        const amountStr = item.is_variable ? `~${formatMoney(item.amount, item.currency)}` : formatMoney(item.amount, item.currency);
        chips.push({ title: item.title, desc: amountStr, fullTitle: `${item.title}: ${amountStr}` });
      }
    }

    if (chips.length === 0) {
      container.classList.remove('calendar-descriptions-strip--visible');
      setHTML(container, '');
      return;
    }

    const maxLen = 50;
    const truncate = (s: string) => (s.length > maxLen ? s.slice(0, maxLen) + '…' : s);

    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const chipsHtml = chips
      .map(({ title, desc, fullTitle }) => {
        const shortDesc = truncate(desc);
        return `<span class="calendar-desc-chip" title="${esc(fullTitle)}">${esc(title)} — ${esc(shortDesc)}</span>`;
      })
      .join('');

    container.classList.add('calendar-descriptions-strip--visible');
    setHTML(container, chipsHtml);
  }

  showSkeletons(): void {
    showSkeletons([
      { id: 'calendarGridContainer', count: 4 },
      { id: 'calendarDayEvents', count: 2 },
    ]);
  }

  setSelectedDate(date: string | null): void {
    this.selectedDate = date;
  }
}

export function applyDesktopLayout(): void {
  const tab = $('tab-calendar');
  if (!tab) return;

  if (window.innerWidth >= 768) {
    tab.classList.add('calendar-desktop');
  } else {
    tab.classList.remove('calendar-desktop');
  }
}
