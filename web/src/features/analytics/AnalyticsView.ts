/**
 * Analytics View — слой представления
 * Рендер в DOM, создание Chart.js (возвращает инстансы для cleanup)
 * Desktop: full-width charts, side-by-side tables
 */
import { $, setHTML, setText } from '@/shared/utils/dom';
import { formatMoney, formatMonth, formatMonthShort } from '@/shared/utils/format';
import type { ExpenseByCategory, MonthSummary, YearlyAnalytics, MonthComparison, CategoryTrend, ForecastMonth, ForecastScenarios } from '@/types';
import type { ForecastItem, Recommendation } from '@/features/analytics/analytics.service';

declare const Chart: any;

function getMonthName(monthStr: string): string {
  const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const [, month] = monthStr.split('-');
  return months[parseInt(month) - 1];
}

export interface AnalyticsViewCallbacks {
  onCategoryClick: (categoryId: number) => void;
}

export function renderForecast(container: HTMLElement | null, forecast: ForecastItem[] | null): void {
  if (!container) return;
  if (!forecast?.length) {
    setHTML(container, '<p class="empty-state">Добавьте доходы и расходы для прогноза</p>');
    return;
  }
  const html = forecast.map(f => {
    const balanceClass = f.balance_end >= 0 ? 'positive' : 'negative';
    const out = f.expenses || f.planned_payments || 0;
    const detail = f.income > 0 || out > 0
      ? `+${formatMoney(f.income || 0)} −${formatMoney(out)}`
      : '';
    return `
      <div class="forecast-row">
        <div class="forecast-month-block">
          <span class="forecast-month">${getMonthName(f.month)}</span>
          ${detail ? `<span class="forecast-detail">${detail}</span>` : ''}
        </div>
        <span class="forecast-balance ${balanceClass}">${formatMoney(f.balance_end)}</span>
      </div>
    `;
  }).join('');
  setHTML(container, html);
}

export function renderForecastScenarios(container: HTMLElement | null, scenarios: ForecastScenarios | null): void {
  if (!container) return;
  if (!scenarios?.base?.length) {
    setHTML(container, '<p class="empty-state">Добавьте доходы и расходы для прогноза</p>');
    return;
  }

  const renderRow = (label: string, items: ForecastMonth[], cls: string) => {
    return `
      <div class="forecast-scenario ${cls}">
        <h4 class="scenario-label">${label}</h4>
        ${items.map(f => {
          const balanceClass = f.balance_end >= 0 ? 'positive' : 'negative';
          return `
            <div class="forecast-row">
              <span class="forecast-month">${getMonthName(f.month)}</span>
              <span class="forecast-balance ${balanceClass}">${formatMoney(f.balance_end)}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  };

  const html = `
    <div class="forecast-scenarios-grid">
      ${renderRow('📉 Худший', scenarios.worst, 'scenario-worst')}
      ${renderRow('📊 Базовый', scenarios.base, 'scenario-base')}
      ${renderRow('📈 Лучший', scenarios.best, 'scenario-best')}
    </div>
  `;
  setHTML(container, html);
}

export function renderForecastError(container: HTMLElement | null): void {
  if (!container) return;
  setHTML(container, '<p class="empty-state error">Не удалось загрузить прогноз. Проверьте подключение.</p>');
}

export function renderRecommendations(container: HTMLElement | null, recs: Recommendation[] | null): void {
  if (!container) return;
  if (!recs?.length) {
    setHTML(container, '<p class="empty-state success">Всё в порядке, рекомендаций нет</p>');
    return;
  }
  const html = recs.map(r => `
    <div class="ai-rec-item">
      <p class="ai-rec-message">${r.message}</p>
      <p class="ai-rec-suggestion">${r.suggestion}</p>
    </div>
  `).join('');
  setHTML(container, html);
}

export function renderRecommendationsError(container: HTMLElement | null): void {
  if (!container) return;
  setHTML(container, '<p class="empty-state error">Не удалось загрузить рекомендации. Проверьте подключение.</p>');
}

export function renderComparison(container: HTMLElement | null, data: MonthComparison): void {
  if (!container) return;

  const incomeDiffClass = data.income_diff >= 0 ? 'positive' : 'negative';
  const expensesDiffClass = data.expenses_diff <= 0 ? 'positive' : 'negative';

  let html = `
    <div class="comparison-summary">
      <div class="comparison-row">
        <span>Доходы:</span>
        <span class="${incomeDiffClass}">${data.income_diff >= 0 ? '+' : ''}${formatMoney(data.income_diff)}</span>
      </div>
      <div class="comparison-row">
        <span>Расходы:</span>
        <span class="${expensesDiffClass}">${data.expenses_diff >= 0 ? '+' : ''}${formatMoney(data.expenses_diff)}</span>
      </div>
    </div>
  `;

  if (data.categories && data.categories.length > 0) {
    const plannedCategories = data.categories.filter(c => c.is_planned);
    const otherCategories = data.categories.filter(c => !c.is_planned);

    const sumMonth1 = (cats: typeof data.categories) => cats.reduce((sum, c) => sum + (c.month1_amount || 0), 0);
    const sumMonth2 = (cats: typeof data.categories) => cats.reduce((sum, c) => sum + (c.month2_amount || 0), 0);

    const renderCategoryTable = (categories: typeof data.categories, title: string) => {
      if (categories.length === 0) return '';

      const month1Total = sumMonth1(categories);
      const month2Total = sumMonth2(categories);
      const diffTotal = month2Total - month1Total;
      const diffClass = diffTotal > 0 ? 'negative' : diffTotal < 0 ? 'positive' : '';

      let tableHtml = `
        <div class="comparison-categories">
          <h4>${title}</h4>
          <table class="comparison-table">
            <thead>
              <tr>
                <th>Категория</th>
                <th>${formatMonthShort(data.month1)}</th>
                <th>${formatMonthShort(data.month2)}</th>
                <th>Разница</th>
              </tr>
            </thead>
            <tbody>
      `;

      for (const cat of categories) {
        const catDiffClass = cat.difference > 0 ? 'negative' : cat.difference < 0 ? 'positive' : '';
        const percentStr = cat.percent_change !== 0 ?
          ` (${cat.percent_change > 0 ? '+' : ''}${cat.percent_change.toFixed(0)}%)` : '';

        tableHtml += `
          <tr>
            <td class="cat-cell">
              <span class="cat-icon">${cat.category_icon}</span>
              <span>${cat.category_name}</span>
            </td>
            <td>${formatMoney(cat.month1_amount)}</td>
            <td>${formatMoney(cat.month2_amount)}</td>
            <td class="${catDiffClass}">
              ${cat.difference >= 0 ? '+' : ''}${formatMoney(cat.difference)}${percentStr}
            </td>
          </tr>
        `;
      }

      tableHtml += `
            <tr class="totals-row">
              <td><strong>Итого</strong></td>
              <td><strong>${formatMoney(month1Total)}</strong></td>
              <td><strong>${formatMoney(month2Total)}</strong></td>
              <td class="${diffClass}"><strong>${diffTotal >= 0 ? '+' : ''}${formatMoney(diffTotal)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
      `;
      return tableHtml;
    };

    html += renderCategoryTable(plannedCategories, '📅 Плановые платежи');
    html += renderCategoryTable(otherCategories, '🛒 Прочие расходы');
  }

  setHTML(container, html);
}

export function renderSummary(monthLabel: string, totalIncome: number, totalExpenses: number): void {
  setText($('analyticsMonth'), monthLabel);
  setText($('analyticsIncome'), formatMoney(totalIncome));
  setText($('analyticsExpenses'), formatMoney(totalExpenses));
  setText($('analyticsBalance'), formatMoney(totalIncome - totalExpenses));
}

export function renderCategoryChart(
  ctx: HTMLCanvasElement | null,
  legend: HTMLElement | null,
  categories: ExpenseByCategory[],
  callbacks: AnalyticsViewCallbacks
): any {
  if (!ctx || !legend) return null;

  if (!categories || categories.length === 0) {
    ctx.style.display = 'none';
    setHTML(legend, '<p class="empty-state">Нет данных о расходах</p>');
    return null;
  }

  ctx.style.display = 'block';

  const chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categories.map(c => c.category_name),
      datasets: [{
        data: categories.map(c => c.amount),
        backgroundColor: categories.map(c => c.color),
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context: any) => {
              const label = context.label || '';
              const value = formatMoney(context.raw);
              return `${label}: ${value}`;
            },
          },
        },
      },
      cutout: '60%',
    },
  });

  const legendHtml = categories.map(c => `
    <div class="legend-item clickable" data-category-id="${c.category_id}" title="Нажмите для просмотра тренда">
      <span class="legend-color" style="background: ${c.color}"></span>
      <span class="legend-name">${c.icon} ${c.category_name}</span>
      <span class="legend-value">${formatMoney(c.amount)} (${c.percent.toFixed(1)}%)</span>
      <span class="legend-trend-icon">📈</span>
    </div>
  `).join('');

  setHTML(legend, legendHtml);

  legend.querySelectorAll('[data-category-id]').forEach(item => {
    item.addEventListener('click', () => {
      const categoryId = parseInt((item as HTMLElement).dataset.categoryId!);
      if (categoryId > 0) callbacks.onCategoryClick(categoryId);
    });
  });

  return chart;
}

export function renderTrendChart(ctx: HTMLCanvasElement | null, trend: MonthSummary[]): any {
  if (!ctx) return null;

  if (!trend || trend.length === 0) {
    ctx.style.display = 'none';
    return null;
  }

  ctx.style.display = 'block';

  const labels = trend.map(t => formatMonthShort(t.month).split(' ')[0]).reverse();
  const income = trend.map(t => t.total_income).reverse();
  const expenses = trend.map(t => t.expenses).reverse();

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Доходы', data: income, backgroundColor: '#4CAF50' },
        { label: 'Расходы', data: expenses, backgroundColor: '#F44336' },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (context: any) => {
              const label = context.dataset.label || '';
              const value = formatMoney(context.raw);
              return `${label}: ${value}`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value: number) => formatMoney(value),
          },
        },
      },
    },
  });
}

export function renderYearlyTrendChart(ctx: HTMLCanvasElement | null, data: YearlyAnalytics): any {
  if (!ctx) return null;

  if (!data.monthly_data || data.monthly_data.length === 0) {
    ctx.style.display = 'none';
    return null;
  }

  ctx.style.display = 'block';

  const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  const labels = data.monthly_data.map(m => {
    const monthIndex = parseInt(m.month.split('-')[1]) - 1;
    return monthNames[monthIndex];
  });
  const income = data.monthly_data.map(m => m.total_income);
  const expenses = data.monthly_data.map(m => m.expenses);

  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Доходы', data: income, backgroundColor: '#4CAF50' },
        { label: 'Расходы', data: expenses, backgroundColor: '#F44336' },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (context: any) => {
              const label = context.dataset.label || '';
              const value = formatMoney(context.raw);
              return `${label}: ${value}`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value: number) => formatMoney(value),
          },
        },
      },
    },
  });

  const legend = $('categoryLegend');
  if (legend) {
    legend.querySelector('.yearly-summary')?.remove();
    const summaryHtml = `
      <div class="yearly-summary">
        <div class="summary-row">
          <span>Среднемесячный доход:</span>
          <strong class="positive">${formatMoney(data.avg_monthly_income)}</strong>
        </div>
        <div class="summary-row">
          <span>Среднемесячные расходы:</span>
          <strong class="negative">${formatMoney(data.avg_monthly_expenses)}</strong>
        </div>
      </div>
    `;
    legend.insertAdjacentHTML('beforeend', summaryHtml);
  }

  return chart;
}

export function renderTrendModal(trend: CategoryTrend): { modal: HTMLElement; chart: any } | null {
  $('categoryTrendModal')?.remove();

  const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

  const modalHtml = `
    <div id="categoryTrendModal" class="modal show">
      <div class="modal-content modal-large">
        <div class="modal-header">
          <h3>${trend.category_icon} ${trend.category_name} — тренд</h3>
          <button class="btn-close modal-close" aria-label="Закрыть">×</button>
        </div>
        <div class="trend-stats">
          <div class="trend-stat">
            <span class="stat-label">Средний расход</span>
            <span class="stat-value">${formatMoney(trend.average)}</span>
          </div>
          <div class="trend-stat">
            <span class="stat-label">Минимум</span>
            <span class="stat-value positive">${formatMoney(trend.min)}</span>
          </div>
          <div class="trend-stat">
            <span class="stat-label">Максимум</span>
            <span class="stat-value negative">${formatMoney(trend.max)}</span>
          </div>
        </div>
        <div class="trend-chart-container">
          <canvas id="categoryTrendChart"></canvas>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  const modal = $('categoryTrendModal');
  if (!modal) return null;

  let trendChart: any = null;
  const chartCtx = $<HTMLCanvasElement>('categoryTrendChart');
  if (chartCtx && trend.monthly_data.length > 0) {
    const labels = trend.monthly_data.map(m => {
      const monthIndex = parseInt(m.month.split('-')[1]) - 1;
      return monthNames[monthIndex];
    });
    const data = trend.monthly_data.map(m => m.amount);

    trendChart = new Chart(chartCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: trend.category_name,
          data,
          borderColor: '#6C5CE7',
          backgroundColor: 'rgba(108, 92, 231, 0.1)',
          fill: true,
          tension: 0.4,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context: any) => formatMoney(context.raw),
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value: number) => formatMoney(value),
            },
          },
        },
      },
    });
  }

  return { modal, chart: trendChart };
}

export function applyDesktopLayout(): void {
  const wrapper = $('analytics-cards-wrapper');
  if (!wrapper) return;

  if (window.innerWidth >= 768) {
    wrapper.classList.add('analytics-desktop');
  } else {
    wrapper.classList.remove('analytics-desktop');
  }
}

export { formatMonth };
