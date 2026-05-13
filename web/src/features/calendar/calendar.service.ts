import api from '@/api/client';
import type {
  CalendarEvent,
  CalendarItem,
  CalendarPaymentItem,
  ParsedCalendarEvent,
} from '@/types';

class CalendarService {
  async getEvents(from: string, to: string): Promise<CalendarEvent[]> {
    return api.getCalendarEvents(from, to);
  }

  async getCalendarItems(from: string, to: string): Promise<CalendarItem[]> {
    const [events, payments] = await Promise.all([
      api.getCalendarEvents(from, to),
      api.getPaymentCalendarByRange(from, to),
    ]);
    const eventItems: CalendarItem[] = events.map((e) => ({
      kind: 'event',
      id: e.id,
      title: e.title,
      description: e.description ?? null,
      start_at: e.start_at,
      end_at: e.end_at ?? null,
      is_all_day: e.is_all_day,
      color: e.color ?? null,
      recurrence_rule: e.recurrence_rule ?? null,
      source: e.source,
    }));
    const paymentItems: CalendarPaymentItem[] = [];
    for (const [dateStr, dayItems] of Object.entries(payments)) {
      for (const { payment, is_paid } of dayItems) {
        paymentItems.push({
          kind: 'payment',
          id: `payment-${payment.id}-${dateStr}`,
          title: payment.name,
          start_at: `${dateStr}T00:00:00`,
          amount: payment.amount,
          currency: payment.currency ?? 'BYN',
          is_paid,
          is_variable: payment.is_variable ?? false,
          payment_id: payment.id,
        });
      }
    }
    return [...eventItems, ...paymentItems];
  }

  async create(data: {
    title: string;
    description?: string;
    start_at: string;
    end_at?: string;
    is_all_day?: boolean;
    color?: string;
    recurrence_rule?: string;
    source?: 'manual' | 'ai_parsed';
  }): Promise<CalendarEvent> {
    return api.createCalendarEvent(data);
  }

  async update(
    id: number,
    data: {
      title?: string;
      description?: string;
      start_at?: string;
      end_at?: string;
      is_all_day?: boolean;
      color?: string;
      recurrence_rule?: string;
    }
  ): Promise<CalendarEvent> {
    return api.updateCalendarEvent(id, data);
  }

  async delete(id: number): Promise<void> {
    await api.deleteCalendarEvent(id);
  }

  async parse(text: string): Promise<ParsedCalendarEvent[]> {
    return api.parseCalendarText(text);
  }
}

export const calendarService = new CalendarService();
