import { toast } from '@/shared/components/toast';
import { getBankReceiptImports, deleteBankReceiptImport, type BankReceiptImport } from '@/api/experimental';

export function createImportHistory(container: HTMLElement): {
  load(): Promise<void>;
  destroy(): void;
} {
  let imports: BankReceiptImport[] = [];

  async function load(): Promise<void> {
    try {
      imports = await getBankReceiptImports();
      render();
    } catch {
      container.innerHTML = '<p class="empty-state">Ошибка загрузки истории</p>';
    }
  }

  function render(): void {
    if (imports.length === 0) {
      container.innerHTML = '<p class="empty-state">Нет импортов</p>';
      return;
    }

    const rows = imports.map(i => {
      const date = i.created_at
        ? new Date(i.created_at).toLocaleDateString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })
        : '—';
      const fname = i.filename || 'Без имени';
      const truncated = fname.length > 30 ? fname.slice(0, 27) + '…' : fname;

      return `<tr>
        <td>${date}</td>
        <td title="${escape(fname)}">${escape(truncated)}</td>
        <td>${i.pages_count}</td>
        <td>${i.rows_found}</td>
        <td>${i.rows_created}</td>
        <td>${i.rows_skipped}</td>
        <td><button class="btn btn-text btn-sm receipt-import-delete-btn" data-import-id="${i.id}" title="Удалить импорт и все транзакции">🗑</button></td>
      </tr>`;
    }).join('');

    container.innerHTML = `<table class="receipt-imports-table">
      <thead><tr><th>Дата</th><th>Файл</th><th>Стр.</th><th>Найд.</th><th>Созд.</th><th>Проп.</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

    container.querySelectorAll('.receipt-import-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => handleDelete(btn as HTMLElement));
    });
  }

  async function handleDelete(btn: HTMLElement): Promise<void> {
    const id = parseInt(btn.dataset.importId ?? '0');
    if (!id) return;

    const imp = imports.find(i => i.id === id);
    const label = imp?.filename ? ` "${imp.filename}"` : '';
    const count = imp?.rows_created ?? 0;

    if (!confirm(`Удалить импорт${label} и все ${count} созданных транзакций?`)) return;

    try {
      const result = await deleteBankReceiptImport(id);
      toast.success(`Удалено ${result.deleted} транзакций`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка удаления');
    }
  }

  function escape(s: string): string {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  return {
    load,
    destroy: () => { container.innerHTML = ''; },
  };
}
