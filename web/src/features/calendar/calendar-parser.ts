import { formatDateTime } from '@/shared/utils/format';
import type { ParsedCalendarEvent } from '@/types';

export interface CalendarParserOptions {
  onParse: (text: string) => void;
  onApplySelected: (events: ParsedCalendarEvent[]) => void;
}

export function createCalendarParser(
  container: HTMLElement,
  options: CalendarParserOptions
): {
  renderParsedPreview: (events: ParsedCalendarEvent[]) => void;
  setLoading: (loading: boolean) => void;
  destroy: () => void;
} {
  const wrapper = document.createElement('div');
  wrapper.className = 'calendar-parser';
  wrapper.innerHTML = `
    <div class="calendar-parser-input">
      <textarea class="calendar-parser-textarea" rows="4" placeholder="Введите текст: «завтра встреча в 14:00», «15 марта конференция в 09:00»..."></textarea>
      <button type="button" class="btn btn-primary calendar-parser-parse-btn">Распознать</button>
    </div>
    <div class="calendar-parser-preview" style="display: none;">
      <div class="calendar-parser-preview-header">Распознанные события</div>
      <ul class="calendar-parser-preview-list"></ul>
      <button type="button" class="btn btn-primary calendar-parser-apply-btn">Создать выбранные</button>
    </div>
  `;

  container.appendChild(wrapper);

  const textarea = wrapper.querySelector<HTMLTextAreaElement>('.calendar-parser-textarea')!;
  const parseBtn = wrapper.querySelector<HTMLButtonElement>('.calendar-parser-parse-btn')!;
  const previewSection = wrapper.querySelector<HTMLElement>('.calendar-parser-preview')!;
  const previewList = wrapper.querySelector<HTMLUListElement>('.calendar-parser-preview-list')!;
  const applyBtn = wrapper.querySelector<HTMLButtonElement>('.calendar-parser-apply-btn')!;

  let parsedEvents: ParsedCalendarEvent[] = [];

  parseBtn.addEventListener('click', () => {
    const text = textarea.value.trim();
    if (text) {
      options.onParse(text);
    }
  });

  function renderParsedPreview(events: ParsedCalendarEvent[]): void {
    parsedEvents = events;
    if (events.length === 0) {
      previewSection.style.display = 'none';
      return;
    }

    previewSection.style.display = 'block';
    previewList.innerHTML = events
      .map(
        (e, i) => `
      <li class="calendar-parser-preview-item">
        <label class="calendar-parser-checkbox-label">
          <input type="checkbox" class="calendar-parser-checkbox" data-index="${i}" checked>
          <span class="calendar-parser-event-title">${escapeHtml(e.title)}</span>
          <span class="calendar-parser-event-meta">${e.is_all_day ? 'Весь день' : formatDateTime(e.start_at, e.start_at)}</span>
        </label>
      </li>
    `
      )
      .join('');

    previewList.querySelectorAll('.calendar-parser-checkbox').forEach((cb) => {
      cb.addEventListener('change', updateApplyBtnState);
    });
    updateApplyBtnState();
  }

  function updateApplyBtnState(): void {
    const checked = previewList.querySelectorAll('.calendar-parser-checkbox:checked').length;
    applyBtn.disabled = checked === 0;
    applyBtn.textContent = checked > 0 ? `Создать выбранные (${checked})` : 'Создать выбранные';
  }

  applyBtn.addEventListener('click', () => {
    const checkboxes = previewList.querySelectorAll<HTMLInputElement>('.calendar-parser-checkbox:checked');
    const selected = Array.from(checkboxes)
      .map((cb) => parsedEvents[parseInt(cb.dataset.index ?? '-1', 10)])
      .filter((e): e is ParsedCalendarEvent => e !== undefined && e !== null);
    if (selected.length > 0) {
      options.onApplySelected(selected);
    }
  });

  function escapeHtml(s: string): string {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  return {
    renderParsedPreview,
    setLoading: (loading: boolean) => {
      parseBtn.disabled = loading;
      parseBtn.textContent = loading ? 'Распознаю...' : 'Распознать';
    },
    destroy: () => wrapper.remove(),
  };
}
