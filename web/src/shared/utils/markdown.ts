function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightText(text: string, query: string): string {
  if (!query || !query.trim()) return text;
  const escaped = escapeRegExp(query.trim());
  const re = new RegExp(`(${escaped})`, 'gi');
  return text.replace(re, '<mark class="search-highlight">$1</mark>');
}

const HL_START = '\u200B\u200C';
const HL_END = '\u200D\u200B';

export function parseMarkdown(text: string, highlightQuery?: string): string {
  let out = text;
  if (highlightQuery?.trim()) {
    const escaped = escapeRegExp(highlightQuery.trim());
    const re = new RegExp(`(${escaped})`, 'gi');
    out = out.replace(re, `${HL_START}$1${HL_END}`);
  }
  const placeholders: string[] = ['<hr class="note-divider">'];
  const ph = (i: number) => `\u200B__MD${i}__\u200B`;
  out = out.replace(/\n---\n/g, ph(0));
  out = out.replace(/```[\s\S]*?```/g, (match) => {
    const code = match.slice(3, -3).trim();
    const idx = placeholders.length;
    placeholders.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
    return ph(idx);
  });

  out = escapeHtml(out);

  out = out.replace(/\u200B__MD(\d+)__\u200B/g, (_, i) => placeholders[Number(i)] ?? '');

  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  out = out.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  out = out.replace(/^# (.+)$/gm, '<h3>$1</h3>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/_([^_]+)_/g, '<em>$1</em>');

  const lines = out.split('\n');
  const result: string[] = [];
  let listTag = '';
  let listItems: string[] = [];

  const flushList = (): void => {
    if (listItems.length > 0) {
      result.push(`<${listTag}>${listItems.join('')}</${listTag}>`);
      listItems = [];
    }
    listTag = '';
  };

  for (const line of lines) {
    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    const olMatch = line.match(/^\d+\.\s+(.+)$/);

    if (ulMatch) {
      if (listTag !== 'ul') {
        flushList();
        listTag = 'ul';
      }
      listItems.push(`<li>${ulMatch[1]}</li>`);
    } else if (olMatch) {
      if (listTag !== 'ol') {
        flushList();
        listTag = 'ol';
      }
      listItems.push(`<li>${olMatch[1]}</li>`);
    } else {
      flushList();
      if (line.trim() === '') {
        result.push('<br>');
      } else {
        result.push(line);
      }
    }
  }
  flushList();

  let html = result.join('\n').replace(/\n/g, '<br>');
  if (highlightQuery?.trim()) {
    const hlRe = new RegExp(`${escapeRegExp(HL_START)}([\\s\\S]*?)${escapeRegExp(HL_END)}`, 'g');
    html = html.replace(hlRe, '<mark class="search-highlight">$1</mark>');
  }
  return html;
}
