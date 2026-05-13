import { BasePage } from '@/pages/base';
import { calendarService } from '@/features/calendar/calendar.service';
import { CalendarView } from '@/features/calendar/CalendarView';
import { createEventForm } from '@/features/calendar/event-form';
import { createCalendarParser } from '@/features/calendar/calendar-parser';
import { formatMonthShort } from '@/shared/utils/format';
import { toast } from '@/shared/components/toast';
import { isEnabled } from '@/shared/utils/features';
import { $ } from '@/shared/utils/dom';
import type { CalendarEventItem, CalendarItem, ParsedCalendarEvent } from '@/types';

export class CalendarPage extends BasePage {
  private view = new CalendarView();
  private items: CalendarItem[] = [];
  private selectedDate: string | null = null;
  private currentMonth = { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
  private eventFormDestroy: (() => void) | null = null;
  private parserInstance: { renderParsedPreview: (events: ParsedCalendarEvent[]) => void; destroy: () => void } | null = null;

  constructor() {
    super('calendar');
  }

  init(): void {
    super.init();

    if (!isEnabled('calendar')) {
      this.renderDisabled();
      return;
    }

    this.view.onSelectDay = (date) => {
      this.selectedDate = date;
      const dayItems = this.items.filter((i) => i.start_at.startsWith(date));
      this.view.renderDayEvents(date, dayItems);
    };

    this.view.onSelectEvent = (item) => {
      if (item.kind === 'event') this.openEventForm(item);
    };
    this.view.onAddClick = () => this.openEventForm();

    this.setupAddButton();
    this.setupParserButton();
    this.setupEventModal();
    this.setupMonthNav();
  }

  async load(): Promise<void> {
    if (!isEnabled('calendar')) {
      this.renderDisabled();
      return;
    }

    this.view.showSkeletons();

    const from = `${this.currentMonth.year}-${String(this.currentMonth.month).padStart(2, '0')}-01`;
    const lastDay = new Date(this.currentMonth.year, this.currentMonth.month, 0).getDate();
    const to = `${this.currentMonth.year}-${String(this.currentMonth.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    try {
      this.items = await calendarService.getCalendarItems(from, to);
      this.view.render(this.items, { year: this.currentMonth.year, month: this.currentMonth.month });
      this.updateMonthTitle();
      if (this.selectedDate) {
        const dayItems = this.items.filter((i) => i.start_at.startsWith(this.selectedDate!));
        this.view.renderDayEvents(this.selectedDate, dayItems);
      }
    } catch (e) {
      toast.error('Не удалось загрузить события');
    }
  }

  private renderDisabled(): void {
    const container = document.getElementById('tab-calendar');
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">🔒</span>
          <span>Модуль недоступен</span>
        </div>
      `;
    }
  }

  private updateMonthTitle(): void {
    const el = $('calendarMonthTitle');
    if (el) {
      el.textContent = formatMonthShort(
        `${this.currentMonth.year}-${String(this.currentMonth.month).padStart(2, '0')}`
      );
    }
  }

  private setupAddButton(): void {
    $('calendarAddEventBtn')?.addEventListener('click', () => {
      this.openEventForm();
    });
  }

  private setupParserButton(): void {
    const btn = $('calendarParserBtn');
    const panel = $('calendarParserPanel');
    const container = $('calendarParserContainer');

    if (!btn || !panel || !container) return;

    btn.addEventListener('click', () => {
      const isHidden = panel.style.display === 'none';
      panel.style.display = isHidden ? 'block' : 'none';
      if (isHidden && !this.parserInstance) {
        this.parserInstance = createCalendarParser(container, {
          onParse: (text) => this.handleParse(text),
          onApplySelected: (events) => this.handleApplyParsed(events),
        });
      }
    });
  }

  private setupEventModal(): void {
    const modal = $('calendarEventModal');
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) this.closeEventModal();
    });
  }

  private openEventForm(event?: CalendarEventItem | null): void {
    const container = $('calendarEventFormContainer');
    if (!container) return;

    this.eventFormDestroy?.();

    const defaultDate = this.selectedDate ?? new Date().toISOString().slice(0, 10);
    const initialData = event
      ? { ...event }
      : { start_at: `${defaultDate}T09:00:00`, is_all_day: false };

    const { destroy } = createEventForm(container, {
      initialData,
      onSubmit: (data) => this.handleEventSubmit(data, event?.id),
      onCancel: () => this.closeEventModal(),
      onDelete: event ? (id) => { this.closeEventModal(); void this.handleDeleteEvent(id); } : undefined,
    });
    this.eventFormDestroy = destroy;

    window.openModal('calendarEventModal');
  }

  private closeEventModal(): void {
    this.eventFormDestroy?.();
    this.eventFormDestroy = null;
    window.closeModal('calendarEventModal');
  }

  private async handleEventSubmit(
    data: {
      title: string;
      description?: string;
      start_at: string;
      end_at?: string | null;
      is_all_day: boolean;
      color?: string | null;
      recurrence_rule?: string | null;
    },
    editingId?: number
  ): Promise<void> {
    if (editingId) {
      await this.handleUpdateEvent(editingId, data);
    } else {
      await this.handleCreateEvent(data);
    }
  }

  private async handleCreateEvent(data: {
    title: string;
    description?: string;
    start_at: string;
    end_at?: string | null;
    is_all_day: boolean;
    color?: string | null;
    recurrence_rule?: string | null;
  }): Promise<void> {
    const tempId = -Date.now();
    const tempEvent: CalendarEventItem = {
      kind: 'event',
      id: tempId,
      title: data.title,
      description: data.description ?? null,
      start_at: data.start_at,
      end_at: data.end_at ?? null,
      is_all_day: data.is_all_day,
      color: data.color ?? null,
      recurrence_rule: data.recurrence_rule ?? null,
      source: undefined,
    };

    this.closeEventModal();
    this.items = [...this.items, tempEvent];
    this.view.render(this.items, this.currentMonth);
    if (this.selectedDate && tempEvent.start_at.startsWith(this.selectedDate)) {
      const dayItems = this.items.filter((i) => i.start_at.startsWith(this.selectedDate!));
      this.view.renderDayEvents(this.selectedDate!, dayItems);
    }
    const snapshot = this.items.filter((i) => !(i.kind === 'event' && i.id === tempId));

    try {
      const created = await calendarService.create({
        title: data.title,
        description: data.description,
        start_at: data.start_at,
        end_at: data.end_at ?? undefined,
        is_all_day: data.is_all_day,
        color: data.color ?? undefined,
        recurrence_rule: data.recurrence_rule ?? undefined,
      });
      const createdItem: CalendarEventItem = {
        kind: 'event',
        id: created.id,
        title: created.title,
        description: created.description ?? null,
        start_at: created.start_at,
        end_at: created.end_at ?? null,
        is_all_day: created.is_all_day,
        color: created.color ?? null,
        recurrence_rule: created.recurrence_rule ?? null,
        source: created.source,
      };
      this.items = [createdItem, ...snapshot];
      this.view.render(this.items, this.currentMonth);
      if (this.selectedDate && created.start_at.startsWith(this.selectedDate)) {
        const dayItems = this.items.filter((i) => i.start_at.startsWith(this.selectedDate!));
        this.view.renderDayEvents(this.selectedDate!, dayItems);
      }
      toast.success('Событие создано');
    } catch (e) {
      if ((e as Error & { offlineQueued?: boolean }).offlineQueued) {
        toast.success('Событие сохранено офлайн');
        return;
      }
      this.items = snapshot;
      this.view.render(this.items, this.currentMonth);
      if (this.selectedDate) {
        const dayItems = this.items.filter((i) => i.start_at.startsWith(this.selectedDate!));
        this.view.renderDayEvents(this.selectedDate!, dayItems);
      }
      toast.error('Не удалось создать событие');
    }
  }

  private async handleUpdateEvent(
    id: number,
    data: {
      title: string;
      description?: string;
      start_at: string;
      end_at?: string | null;
      is_all_day: boolean;
      color?: string | null;
      recurrence_rule?: string | null;
    }
  ): Promise<void> {
    const original = this.items.find((i) => i.kind === 'event' && i.id === id) as
      | CalendarEventItem
      | undefined;
    if (!original) return;

    const optimistic: CalendarEventItem = { ...original, ...data };
    this.closeEventModal();
    this.items = this.items.map((i) =>
      i.kind === 'event' && i.id === id ? optimistic : i
    );
    this.view.render(this.items, this.currentMonth);
    if (this.selectedDate) {
      const dayItems = this.items.filter((i) => i.start_at.startsWith(this.selectedDate!));
      this.view.renderDayEvents(this.selectedDate!, dayItems);
    }

    try {
      const updated = await calendarService.update(id, {
        title: data.title,
        description: data.description,
        start_at: data.start_at,
        end_at: data.end_at ?? undefined,
        is_all_day: data.is_all_day,
        color: data.color ?? undefined,
        recurrence_rule: data.recurrence_rule ?? undefined,
      });
      const updatedItem: CalendarEventItem = {
        kind: 'event',
        id: updated.id,
        title: updated.title,
        description: updated.description ?? null,
        start_at: updated.start_at,
        end_at: updated.end_at ?? null,
        is_all_day: updated.is_all_day,
        color: updated.color ?? null,
        recurrence_rule: updated.recurrence_rule ?? null,
        source: updated.source,
      };
      this.items = this.items.map((i) =>
        i.kind === 'event' && i.id === id ? updatedItem : i
      );
      this.view.render(this.items, this.currentMonth);
      if (this.selectedDate) {
        const dayItems = this.items.filter((i) => i.start_at.startsWith(this.selectedDate!));
        this.view.renderDayEvents(this.selectedDate!, dayItems);
      }
      toast.success('Событие обновлено');
    } catch (e) {
      if ((e as Error & { offlineQueued?: boolean }).offlineQueued) {
        toast.success('Обновление сохранено офлайн');
        return;
      }
      this.items = this.items.map((i) =>
        i.kind === 'event' && i.id === id ? original : i
      );
      this.view.render(this.items, this.currentMonth);
      if (this.selectedDate) {
        const dayItems = this.items.filter((i) => i.start_at.startsWith(this.selectedDate!));
        this.view.renderDayEvents(this.selectedDate!, dayItems);
      }
      toast.error('Не удалось обновить событие');
    }
  }

  private async handleDeleteEvent(id: number): Promise<void> {
    const original = this.items.find((i) => i.kind === 'event' && i.id === id);
    if (!original) return;

    const snapshot = [...this.items];
    this.items = this.items.filter((i) => !(i.kind === 'event' && i.id === id));
    this.view.render(this.items, this.currentMonth);
    if (this.selectedDate) {
      const dayItems = this.items.filter((i) => i.start_at.startsWith(this.selectedDate!));
      this.view.renderDayEvents(this.selectedDate!, dayItems);
    }

    try {
      await calendarService.delete(id);
      toast.success('Событие удалено');
    } catch (e) {
      if ((e as Error & { offlineQueued?: boolean }).offlineQueued) {
        toast.success('Удаление в очереди');
        return;
      }
      this.items = snapshot;
      this.view.render(this.items, this.currentMonth);
      if (this.selectedDate) {
        const dayItems = this.items.filter((i) => i.start_at.startsWith(this.selectedDate!));
        this.view.renderDayEvents(this.selectedDate!, dayItems);
      }
      toast.error('Не удалось удалить событие');
    }
  }

  private async handleParse(text: string): Promise<void> {
    try {
      const parsed = await calendarService.parse(text);
      this.parserInstance?.renderParsedPreview(parsed);
    } catch (e) {
      toast.error('Не удалось распознать текст');
    }
  }

  private async handleApplyParsed(events: ParsedCalendarEvent[]): Promise<void> {
    for (const e of events) {
      try {
        const created = await calendarService.create({
          title: e.title,
          start_at: e.start_at,
          end_at: e.end_at ?? undefined,
          is_all_day: e.is_all_day,
          source: 'ai_parsed',
        });
        const item: CalendarEventItem = {
          kind: 'event',
          id: created.id,
          title: created.title,
          description: created.description ?? null,
          start_at: created.start_at,
          end_at: created.end_at ?? null,
          is_all_day: created.is_all_day,
          color: created.color ?? null,
          recurrence_rule: created.recurrence_rule ?? null,
          source: created.source,
        };
        this.items = [item, ...this.items];
      } catch (err) {
        toast.error(`Не удалось создать: ${e.title}`);
      }
    }
    this.view.render(this.items, this.currentMonth);
    if (this.selectedDate) {
      const dayItems = this.items.filter((i) => i.start_at.startsWith(this.selectedDate!));
      this.view.renderDayEvents(this.selectedDate!, dayItems);
    }
    this.parserInstance?.renderParsedPreview([]);
    toast.success(`Создано событий: ${events.length}`);
  }

  private setupMonthNav(): void {
    $('calendarPrevMonth')?.addEventListener('click', () => {
      if (this.currentMonth.month === 1) {
        this.currentMonth.year -= 1;
        this.currentMonth.month = 12;
      } else {
        this.currentMonth.month -= 1;
      }
      void this.load();
    });
    $('calendarNextMonth')?.addEventListener('click', () => {
      if (this.currentMonth.month === 12) {
        this.currentMonth.year += 1;
        this.currentMonth.month = 1;
      } else {
        this.currentMonth.month += 1;
      }
      void this.load();
    });
    $('calendarTodayBtn')?.addEventListener('click', () => {
      const now = new Date();
      this.currentMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
      this.selectedDate = now.toISOString().slice(0, 10);
      this.view.setSelectedDate(this.selectedDate);
      void this.load();
    });
  }
}

export const calendarPage = new CalendarPage();
