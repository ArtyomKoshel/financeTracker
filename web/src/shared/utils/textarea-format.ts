export type InsertAction =
  | { type: 'wrap'; before: string; after: string; placeholder?: string }
  | { type: 'line'; prefix: string; suffix?: string }
  | { type: 'block'; template: string };

export function insertAtCursor(
  textarea: HTMLTextAreaElement,
  action: InsertAction
): void {
  const { value, selectionStart, selectionEnd } = textarea;
  const selected = value.slice(selectionStart, selectionEnd);

  let newValue: string;
  let newCursor: number;

  switch (action.type) {
    case 'wrap': {
      const placeholder = action.placeholder ?? 'текст';
      const text = selected || placeholder;
      newValue =
        value.slice(0, selectionStart) +
        action.before +
        text +
        action.after +
        value.slice(selectionEnd);
      newCursor =
        selectionStart +
        action.before.length +
        (selected ? selected.length : placeholder.length);
      break;
    }
    case 'line': {
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const lineEnd = value.indexOf('\n', selectionEnd);
      const lineEndPos = lineEnd === -1 ? value.length : lineEnd;
      const line = value.slice(lineStart, lineEndPos);
      const suffix = action.suffix ?? '';
      newValue =
        value.slice(0, lineStart) +
        action.prefix +
        line +
        suffix +
        value.slice(lineEndPos);
      newCursor = lineStart + action.prefix.length + line.length + suffix.length;
      break;
    }
    case 'block': {
      const insertPos = selectionStart;
      const template = action.template;
      newValue =
        value.slice(0, insertPos) + template + value.slice(selectionEnd);
      const cursorOffset = template.includes('\n')
        ? template.indexOf('\n') + 1
        : template.length;
      newCursor = insertPos + cursorOffset;
      break;
    }
    default:
      return;
  }

  textarea.value = newValue;
  textarea.setSelectionRange(newCursor, newCursor);
  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}
