import { bankReceiptPreviewSummary } from '@/api/experimental';
import { store } from '@/store';
import type { CategoryWithSubs } from '@/types';

declare const Chart: any;

interface SummaryRow {
  amount: number;
  date: string;
  type: 'expense' | 'income';
  category_id: number | null;
  splits?: Array<{ category_id: number; amount: number }>;
}

interface CategoryBreakdown {
  id: number;
  name: string;
  icon: string;
  color: string;
  amount: number;
  percent: number;
}

interface SummaryData {
  expenses_total: number;
  income_total: number;
  net: number;
  categories: CategoryBreakdown[];
  budget_warnings: Array<{ category_icon: string; message: string; percent: number }>;
  uncategorized_count: number;
}

function findCategory(id: number): CategoryWithSubs | undefined {
  const cats = store.get('categories') ?? [];
  for (const c of cats) {
    if (c.id === id) return c;
    const sub = c.subcategories?.find(s => s.id === id);
    if (sub) return { ...sub, subcategories: [] } as CategoryWithSubs;
  }
  return undefined;
}

function computeLocally(rows: SummaryRow[]): SummaryData {
  let expenses_total = 0;
  let income_total = 0;
  const catMap = new Map<number, number>();
  let uncategorized_count = 0;

  for (const r of rows) {
    if (r.type === 'income') {
      income_total += r.amount;
      continue;
    }

    expenses_total += r.amount;

    if (r.splits?.length) {
      for (const s of r.splits) {
        catMap.set(s.category_id, (catMap.get(s.category_id) ?? 0) + s.amount);
      }
    } else if (r.category_id) {
      catMap.set(r.category_id, (catMap.get(r.category_id) ?? 0) + r.amount);
    } else {
      uncategorized_count++;
    }
  }

  const categories: CategoryBreakdown[] = [];
  for (const [id, amount] of catMap) {
    const cat = findCategory(id);
    categories.push({
      id,
      name: cat?.name ?? `Категория #${id}`,
      icon: cat?.icon ?? '📦',
      color: cat?.color ?? '#999',
      amount,
      percent: expenses_total > 0 ? Math.round((amount / expenses_total) * 100) : 0,
    });
  }

  categories.sort((a, b) => b.amount - a.amount);

  return {
    expenses_total,
    income_total,
    net: income_total - expenses_total,
    categories,
    budget_warnings: [],
    uncategorized_count,
  };
}

function fmt(n: number): string {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function showSummaryModal(params: {
  rows: SummaryRow[];
  accountName: string;
  totalCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}): void {
  let chartInstance: any = null;

  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;animation:fadeIn .2s ease';

  const content = document.createElement('div');
  content.className = 'receipt-summary-modal';
  content.style.cssText = 'background:var(--card-bg,#fff);border-radius:12px;max-width:560px;width:92%;max-height:88vh;overflow:auto;animation:scaleIn .2s ease;padding:24px';
  overlay.appendChild(content);

  content.innerHTML = '<div class="loading-indicator"><div class="loading-spinner"></div><span class="loading-text">Подготовка итогов…</span></div>';

  function close(): void {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    overlay.style.animation = 'fadeOut .2s ease';
    content.style.animation = 'scaleOut .2s ease';
    setTimeout(() => overlay.remove(), 200);
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
      params.onCancel();
    }
  });

  document.body.appendChild(overlay);

  async function load(): Promise<void> {
    let data: SummaryData;

    try {
      data = await bankReceiptPreviewSummary(params.rows);
    } catch {
      data = computeLocally(params.rows);
    }

    const catCount = data.categories.length;
    const netSign = data.net >= 0 ? '+' : '';

    let html = `<h3 style="margin:0 0 12px">📊 Итоги импорта</h3>`;
    html += `<p style="margin:0 0 16px;color:var(--text-secondary)">`;
    html += `Расходы: <b>${fmt(data.expenses_total)} Br</b> по ${catCount} категориям`;
    html += ` · Доходы: <b>${fmt(data.income_total)} Br</b>`;
    html += ` · Итог: <b>${netSign}${fmt(data.net)} Br</b>`;
    html += `</p>`;

    if (data.categories.length > 0 && typeof Chart !== 'undefined') {
      html += `<div style="display:flex;justify-content:center;margin-bottom:16px"><canvas id="summaryDoughnut" width="200" height="200"></canvas></div>`;
    }

    if (data.categories.length > 0) {
      html += `<div class="receipt-summary-categories" style="margin-bottom:16px">`;
      for (const c of data.categories) {
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">`;
        html += `<span>${c.icon} ${esc(c.name)}</span>`;
        html += `<span style="white-space:nowrap"><b>${fmt(c.amount)} Br</b> <span style="color:var(--text-secondary)">(${c.percent}%)</span></span>`;
        html += `</div>`;
      }
      html += `</div>`;
    }

    if (data.budget_warnings?.length) {
      html += `<div class="receipt-summary-warnings" style="margin-bottom:16px">`;
      for (const w of data.budget_warnings) {
        const color = w.percent >= 100 ? 'var(--danger,#e74c3c)' : 'var(--warning,#f39c12)';
        const bg = w.percent >= 100 ? 'rgba(231,76,60,.1)' : 'rgba(243,156,18,.1)';
        html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;background:${bg};border-left:3px solid ${color};margin-bottom:6px">`;
        html += `<span>${w.category_icon}</span>`;
        html += `<span style="color:${color}">${esc(w.message)}</span>`;
        html += `</div>`;
      }
      html += `</div>`;
    }

    if (data.uncategorized_count > 0) {
      html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;background:rgba(243,156,18,.1);border-left:3px solid var(--warning,#f39c12);margin-bottom:16px">`;
      html += `<span>⚠️</span>`;
      html += `<span>${data.uncategorized_count} транзакций без категории (нужна проверка)</span>`;
      html += `</div>`;
    }

    html += `<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">`;
    html += `<button type="button" class="btn btn-text" data-action="cancel">Отмена</button>`;
    html += `<button type="button" class="btn btn-primary" data-action="confirm">Применить ${params.totalCount} транзакций</button>`;
    html += `</div>`;

    content.innerHTML = html;

    content.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
      close();
      params.onCancel();
    });
    content.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
      close();
      params.onConfirm();
    });

    const canvas = content.querySelector<HTMLCanvasElement>('#summaryDoughnut');
    if (canvas && typeof Chart !== 'undefined' && data.categories.length > 0) {
      chartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: data.categories.map(c => c.name),
          datasets: [{
            data: data.categories.map(c => c.amount),
            backgroundColor: data.categories.map(c => c.color),
            borderWidth: 1,
            borderColor: 'var(--card-bg, #fff)',
          }],
        },
        options: {
          responsive: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx: any) => {
                  const cat = data.categories[ctx.dataIndex];
                  return `${cat.name}: ${fmt(cat.amount)} Br (${cat.percent}%)`;
                },
              },
            },
          },
          cutout: '55%',
        },
      });
    }
  }

  load();
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
