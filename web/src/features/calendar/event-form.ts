import { getToday } from '@/shared/utils/format';
import type { CalendarEvent } from '@/types';

export interface EventFormData {
  title: string;
  description?: string;
  start_at: string;
  end_at?: string | null;
  is_all_day: boolean;
  color?: string | null;
  reminder_minutes?: number | null;
  recurrence_rule?: string | null;
}

export interface EventFormOptions {
  initialData?: Partial<CalendarEvent>;
  onSubmit: (data: EventFormData) => void;
  onCancel: () => void;
  onDelete?: (id: number) => void;
}

const EVENT_COLORS = [
  '#6C5CE7',
  '#00B894',
  '#00CEC9',
  '#0984E3',
  '#A29BFE',
  '#FD79A8',
  '#E17055',
  '#FDCB6E',
  '#2D3436',
];

const RECURRENCE_OPTIONS = [
  { value: '', label: 'Нет' },
  { value: 'FREQ=DAILY', label: 'Ежедневно' },
  { value: 'FREQ=WEEKLY', label: 'Еженедельно' },
  { value: 'FREQ=MONTHLY', label: 'Ежемесячно' },
  { value: 'FREQ=YEARLY', label: 'Ежегодно' },
];

const REMINDER_OPTIONS = [
  { value: '', label: 'Не напоминать' },
  { value: '0', label: 'В момент события' },
  { value: '15', label: 'За 15 мин' },
  { value: '30', label: 'За 30 мин' },
  { value: '60', label: 'За 1 час' },
  { value: '1440', label: 'За 1 день' },
];

function parseStartAt(startAt: string): { date: string; time: string } {
  const d = new Date(startAt);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { date, time };
}

function parseEndAt(endAt: string | null | undefined): { date: string; time: string } | null {
  if (!endAt) return null;
  const d = new Date(endAt);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { date, time };
}

export function createEventForm(container: HTMLElement, options: EventFormOptions): { destroy: () => void } {
  const initial = options.initialData;
  const initialExt = initial as Partial<CalendarEvent> & { reminder_minutes?: number };
  const startParsed = initial?.start_at ? parseStartAt(initial.start_at) : { date: getToday(), time: '09:00' };
  const endParsed = initial?.end_at ? parseEndAt(initial.end_at) : null;
  const defaultColor =
    initial?.color && EVENT_COLORS.includes(initial.color) ? initial.color : EVENT_COLORS[0];
  const reminderMinutes = initialExt?.reminder_minutes;

  const wrapper = document.createElement('div');
  wrapper.className = 'event-form-wrapper';
  wrapper.innerHTML = `
    <form class="form event-form">
      <div class="form-group">
        <label>Название</label>
        <input type="text" class="event-title" placeholder="Событие" required value="${(initial?.title ?? '').replace(/"/g, '&quot;')}">
      </div>
      <div class="form-group">
        <label>Описание</label>
        <textarea class="event-description" rows="2" placeholder="Описание (опционально)">${(initial?.description ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
      </div>
      <div class="form-group checkbox-group">
        <label class="checkbox-label">
          <input type="checkbox" class="event-all-day" ${initial?.is_all_day ? 'checked' : ''}>
          Весь день
        </label>
      </div>
      <div class="form-row event-datetime-row">
        <div class="form-group">
          <label>Начало</label>
          <input type="date" class="event-start-date" required value="${startParsed.date}">
        </div>
        <div class="form-group event-time-group">
          <label>Время</label>
          <input type="time" class="event-start-time" value="${startParsed.time}">
        </div>
      </div>
      <div class="form-row event-datetime-row event-end-row">
        <div class="form-group">
          <label>Конец</label>
          <input type="date" class="event-end-date" value="${endParsed?.date ?? startParsed.date}">
        </div>
        <div class="form-group event-time-group">
          <label>Время</label>
          <input type="time" class="event-end-time" value="${endParsed?.time ?? '18:00'}">
        </div>
      </div>
      <div class="form-group">
        <label>Цвет</label>
        <div class="event-color-picker">
          ${EVENT_COLORS.map(
            (c) =>
              `<button type="button" class="event-color-btn ${c === defaultColor ? 'active' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`
          ).join('')}
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Повторение</label>
          <select class="event-recurrence">
            ${RECURRENCE_OPTIONS.map(
              (o) =>
                `<option value="${o.value}" ${(initial?.recurrence_rule ?? '') === o.value ? 'selected' : ''}>${o.label}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Напоминание</label>
          <select class="event-reminder">
            ${REMINDER_OPTIONS.map(
              (o) =>
                `<option value="${o.value}" ${(String(reminderMinutes ?? '') === o.value || (reminderMinutes === undefined && o.value === '')) ? 'selected' : ''}>${o.label}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="form-actions">
        ${initial?.id ? '<button type="button" class="btn btn-text btn-danger event-delete">Удалить</button>' : ''}
        <button type="button" class="btn btn-text event-cancel">Отмена</button>
        <button type="submit" class="btn btn-primary">Сохранить</button>
      </div>
    </form>
  `;

  container.appendChild(wrapper);

  const form = wrapper.querySelector('form')!;
  const allDayCheck = wrapper.querySelector<HTMLInputElement>('.event-all-day')!;
  const startTimeGroup = wrapper.querySelector<HTMLElement>('.event-time-group')!;
  const endRow = wrapper.querySelector<HTMLElement>('.event-end-row')!;
  const colorBtns = wrapper.querySelectorAll<HTMLButtonElement>('.event-color-btn');
  const titleInput = wrapper.querySelector<HTMLInputElement>('.event-title')!;
  const descriptionInput = wrapper.querySelector<HTMLTextAreaElement>('.event-description')!;
  const startDateInput = wrapper.querySelector<HTMLInputElement>('.event-start-date')!;
  const startTimeInput = wrapper.querySelector<HTMLInputElement>('.event-start-time')!;
  const endDateInput = wrapper.querySelector<HTMLInputElement>('.event-end-date')!;
  const endTimeInput = wrapper.querySelector<HTMLInputElement>('.event-end-time')!;
  const recurrenceSelect = wrapper.querySelector<HTMLSelectElement>('.event-recurrence')!;
  const reminderSelect = wrapper.querySelector<HTMLSelectElement>('.event-reminder')!;

  let selectedColor = defaultColor;

  const toggleAllDay = () => {
    const isAllDay = allDayCheck.checked;
    startTimeGroup.style.display = isAllDay ? 'none' : 'block';
    endRow.style.display = isAllDay ? 'none' : 'flex';
    const timeGroups = wrapper.querySelectorAll('.event-time-group');
    timeGroups.forEach((g) => {
      (g as HTMLElement).style.display = isAllDay ? 'none' : 'block';
    });
  };

  toggleAllDay();

  allDayCheck.addEventListener('change', toggleAllDay);

  colorBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      colorBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedColor = btn.dataset.color ?? selectedColor;
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const isAllDay = allDayCheck.checked;
    const startDate = startDateInput.value;
    const startTime = startTimeInput.value;
    const endDate = endDateInput.value;
    const endTime = endTimeInput.value;

    const start_at = isAllDay ? `${startDate}T00:00:00` : `${startDate}T${startTime}:00`;
    const end_at =
      isAllDay && startDate === endDate ? null : isAllDay ? `${endDate}T23:59:59` : `${endDate}T${endTime}:00`;

    const reminderVal = reminderSelect.value;
    const reminder_minutes = reminderVal === '' ? null : parseInt(reminderVal, 10);

    const recurrenceVal = recurrenceSelect.value;
    const recurrence_rule = recurrenceVal === '' ? null : recurrenceVal;

    options.onSubmit({
      title: titleInput.value.trim(),
      description: descriptionInput.value.trim() || undefined,
      start_at,
      end_at,
      is_all_day: isAllDay,
      color: selectedColor || null,
      reminder_minutes,
      recurrence_rule,
    });
  });

  wrapper.querySelector('.event-cancel')?.addEventListener('click', () => options.onCancel());

  const deleteBtn = wrapper.querySelector('.event-delete');
  if (deleteBtn && initial?.id && options.onDelete) {
    deleteBtn.addEventListener('click', () => options.onDelete!(initial.id!));
  }

  return {
    destroy: () => {
      allDayCheck.removeEventListener('change', toggleAllDay);
      wrapper.remove();
    },
  };
}
