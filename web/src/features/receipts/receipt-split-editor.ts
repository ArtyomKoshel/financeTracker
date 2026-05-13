import type { BankReceiptPreviewRow } from '@/api/experimental';

type FlatCategory = { id: number; name: string; icon?: string };
type Split = { category_id: number; amount: number; description?: string };

export function createSplitEditor(
  cardElement: HTMLElement,
  row: BankReceiptPreviewRow,
  categories: FlatCategory[],
  callbacks: {
    onSave: (splits: Split[]) => void;
    onCancel: () => void;
  }
): { destroy(): void } {
  const editor = document.createElement('div');
  editor.className = 'receipt-split-editor';

  const splits: Split[] = row.splits?.length
    ? row.splits.map(s => ({ category_id: s.category_id, amount: s.amount, description: s.description ?? '' }))
    : [
        { category_id: row.category_id ?? 0, amount: row.amount, description: '' },
        { category_id: 0, amount: 0, description: '' },
      ];

  render();
  cardElement.appendChild(editor);

  function render(): void {
    const linesHtml = splits.map((s, idx) => buildLine(s, idx)).join('');
    const total = splits.reduce((sum, s) => sum + (s.amount || 0), 0);
    const diff = Math.abs(row.amount - total);
    const isValid = diff < 0.01;

    editor.innerHTML = `
      <div class="split-editor__header">
        <span class="text-sm text-muted">Разделить ${formatAmount(row.amount)} по категориям</span>
      </div>
      <div class="split-editor__lines">${linesHtml}</div>
      <div class="split-editor__footer">
        <button type="button" class="btn btn-text btn-sm split-add-line-btn">+ Добавить</button>
        <div class="split-editor__total ${isValid ? '' : 'split-editor__total--invalid'}">
          Итого: ${formatAmount(total)} / ${formatAmount(row.amount)}
          ${isValid ? '' : `<span class="split-editor__warning">Разница: ${formatAmount(diff)}</span>`}
        </div>
      </div>
      <div class="split-editor__actions">
        <button type="button" class="btn btn-secondary btn-sm split-cancel-btn">Отмена</button>
        <button type="button" class="btn btn-primary btn-sm split-save-btn" ${isValid ? '' : 'disabled'}>Сохранить</button>
      </div>
    `;

    bindEvents();
  }

  function buildLine(s: Split, idx: number): string {
    const catOpts = categories.map(c => {
      const label = c.icon ? `${c.icon} ${escape(c.name)}` : escape(c.name);
      return `<option value="${c.id}" ${c.id === s.category_id ? 'selected' : ''}>${label}</option>`;
    }).join('');

    return `<div class="split-line" data-idx="${idx}">
      <select class="form-control split-line__category" data-idx="${idx}">
        <option value="0">— Категория —</option>
        ${catOpts}
      </select>
      <input type="number" class="form-control split-line__amount" data-idx="${idx}"
        value="${s.amount || ''}" step="0.01" min="0" placeholder="0.00">
      <input type="text" class="form-control split-line__desc" data-idx="${idx}"
        value="${escape(s.description || '')}" placeholder="Описание">
      <button type="button" class="btn btn-text btn-sm split-line__remove" data-idx="${idx}"
        ${splits.length <= 2 ? 'disabled' : ''}>✕</button>
    </div>`;
  }

  function bindEvents(): void {
    editor.querySelectorAll<HTMLSelectElement>('.split-line__category').forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = parseInt(sel.dataset.idx ?? '0');
        splits[idx].category_id = parseInt(sel.value) || 0;
      });
    });

    editor.querySelectorAll<HTMLInputElement>('.split-line__amount').forEach(input => {
      input.addEventListener('input', () => {
        const idx = parseInt(input.dataset.idx ?? '0');
        splits[idx].amount = parseFloat(input.value) || 0;
        updateAutoFill(idx);
        updateTotalDisplay();
      });
    });

    editor.querySelectorAll<HTMLInputElement>('.split-line__desc').forEach(input => {
      input.addEventListener('input', () => {
        const idx = parseInt(input.dataset.idx ?? '0');
        splits[idx].description = input.value;
      });
    });

    editor.querySelectorAll('.split-line__remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx ?? '0');
        if (splits.length > 2) {
          splits.splice(idx, 1);
          render();
        }
      });
    });

    editor.querySelector('.split-add-line-btn')?.addEventListener('click', () => {
      splits.push({ category_id: 0, amount: 0, description: '' });
      render();
      autoFillLast();
    });

    editor.querySelector('.split-cancel-btn')?.addEventListener('click', () => {
      destroy();
      callbacks.onCancel();
    });

    editor.querySelector('.split-save-btn')?.addEventListener('click', () => {
      const valid = splits.filter(s => s.category_id > 0 && s.amount > 0);
      if (valid.length < 2) {
        return;
      }
      const total = valid.reduce((sum, s) => sum + s.amount, 0);
      if (Math.abs(total - row.amount) >= 0.01) {
        return;
      }
      destroy();
      callbacks.onSave(valid);
    });
  }

  function updateAutoFill(changedIdx: number): void {
    const lastIdx = splits.length - 1;
    if (changedIdx === lastIdx) return;

    const otherSum = splits.reduce((sum, s, i) => i === lastIdx ? sum : sum + (s.amount || 0), 0);
    const remainder = Math.round((row.amount - otherSum) * 100) / 100;
    if (remainder >= 0) {
      splits[lastIdx].amount = remainder;
      const lastInput = editor.querySelector<HTMLInputElement>(`.split-line__amount[data-idx="${lastIdx}"]`);
      if (lastInput) lastInput.value = remainder > 0 ? remainder.toFixed(2) : '';
    }
  }

  function autoFillLast(): void {
    const lastIdx = splits.length - 1;
    const otherSum = splits.reduce((sum, s, i) => i === lastIdx ? sum : sum + (s.amount || 0), 0);
    const remainder = Math.round((row.amount - otherSum) * 100) / 100;
    if (remainder > 0) {
      splits[lastIdx].amount = remainder;
      const lastInput = editor.querySelector<HTMLInputElement>(`.split-line__amount[data-idx="${lastIdx}"]`);
      if (lastInput) lastInput.value = remainder.toFixed(2);
    }
  }

  function updateTotalDisplay(): void {
    const total = splits.reduce((sum, s) => sum + (s.amount || 0), 0);
    const diff = Math.abs(row.amount - total);
    const isValid = diff < 0.01;

    const totalEl = editor.querySelector('.split-editor__total');
    if (totalEl) {
      totalEl.className = `split-editor__total ${isValid ? '' : 'split-editor__total--invalid'}`;
      totalEl.innerHTML = `Итого: ${formatAmount(total)} / ${formatAmount(row.amount)}` +
        (isValid ? '' : `<span class="split-editor__warning">Разница: ${formatAmount(diff)}</span>`);
    }

    const saveBtn = editor.querySelector<HTMLButtonElement>('.split-save-btn');
    if (saveBtn) saveBtn.disabled = !isValid;
  }

  function formatAmount(n: number): string {
    return n.toFixed(2) + ' Br';
  }

  function escape(s: string): string {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function destroy(): void {
    editor.remove();
  }

  return { destroy };
}
