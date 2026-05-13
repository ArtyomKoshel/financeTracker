/**
 * Analytics Page — оркестрация
 * Связывает Service (данные) и View (отображение)
 */
import { BasePage } from '@/pages/base';
import { analyticsService } from '@/features/analytics/analytics.service';
import { dashboardService } from '@/features/dashboard/dashboard.service';
import { toast } from '@/shared/components/toast';
import { formatMoney, formatMonth, getCurrentMonth, getToday } from '@/shared/utils/format';
import { $ } from '@/shared/utils/dom';
import { isEnabled } from '@/shared/utils/features';
import * as AnalyticsView from '@/features/analytics/AnalyticsView';
import * as DashboardView from '@/features/dashboard/DashboardView';

type ViewMode = 'month' | 'year';

declare const Chart: any;

export class AnalyticsPage extends BasePage {
  private currentMonth: string = getCurrentMonth();
  private currentYear: number = new Date().getFullYear();
  private viewMode: ViewMode = 'month';
  private categoryChart: any = null;
  private trendChart: any = null;
  private trendModalChart: any = null;
  private netWorthChart: any = null;

  constructor() {
    super('analytics');
  }

  init(): void {
    super.init();
    this.setupNavigation();
    this.setupViewModeToggle();
    this.setupComparison();
    this.setupRefreshButtons();
    this.setupForecastScenarios();
    this.setupPdfReport();
  }

  private setupPdfReport(): void {
    const header = document.querySelector<HTMLElement>('.analytics-header');
    if (!header || document.getElementById('pdfReportBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'pdfReportBtn';
    btn.className = 'btn btn-secondary btn-sm';
    btn.textContent = '🖨 PDF';
    btn.title = 'Открыть отчёт для печати / сохранения в PDF';
    btn.addEventListener('click', () => this.openPdfReport());
    header.appendChild(btn);
  }

  private async openPdfReport(): Promise<void> {
    try {
      const month = this.viewMode === 'month' ? this.currentMonth : `${this.currentYear}-01`;
      const html = await analyticsService.getMonthlyReportHtml(month);
      const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (win) {
        win.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
      }
    } catch {
      toast.error('Ошибка формирования отчёта');
    }
  }

  private setupRefreshButtons(): void {
    $('refreshForecastBtn')?.addEventListener('click', () => this.loadForecast().catch(() => toast.error('Ошибка загрузки прогноза')));
    $('refreshAIRecommendationsBtn')?.addEventListener('click', () => this.loadAIRecommendations().catch(() => toast.error('Ошибка загрузки рекомендаций')));
  }

  private setupNavigation(): void {
    const prevBtn = $('analyticsPrevMonth');
    const nextBtn = $('analyticsNextMonth');

    prevBtn?.addEventListener('click', () => this.changePeriod(-1));
    nextBtn?.addEventListener('click', () => this.changePeriod(1));
  }

  private setupViewModeToggle(): void {
    const header = document.querySelector('.analytics-header');
    if (header && !$('analyticsViewToggle')) {
      const toggleHtml = `
        <div id="analyticsViewToggle" class="view-mode-toggle">
          <button class="view-btn active" data-mode="month">Месяц</button>
          <button class="view-btn" data-mode="year">Год</button>
        </div>
      `;
      header.insertAdjacentHTML('afterend', toggleHtml);

      const toggle = $('analyticsViewToggle');
      toggle?.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.dataset.mode) {
          this.setViewMode(target.dataset.mode as ViewMode);
        }
      });
    }
  }

  private setViewMode(mode: ViewMode): void {
    this.viewMode = mode;

    const toggle = $('analyticsViewToggle');
    toggle?.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.mode === mode);
    });

    this.load();
  }

  private setupComparison(): void {
    const select1 = $<HTMLSelectElement>('compareMonth1');
    const select2 = $<HTMLSelectElement>('compareMonth2');

    select1?.addEventListener('change', () => this.compareMonths());
    select2?.addEventListener('change', () => this.compareMonths());

    const compareBtn = $('compareMonthsBtn');
    compareBtn?.addEventListener('click', () => this.compareMonths());
  }

  private initComparison(): void {
    const select1 = $<HTMLSelectElement>('compareMonth1');
    const select2 = $<HTMLSelectElement>('compareMonth2');

    if (!select1 || !select2) return;

    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    const months: string[] = [];
    for (let i = -1; i <= 11; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const optionsHtml = months.map(m =>
      `<option value="${m}">${AnalyticsView.formatMonth(m)}</option>`
    ).join('');

    select1.innerHTML = optionsHtml;
    select2.innerHTML = optionsHtml;

    select1.value = prevMonthStr;
    select2.value = currentMonthStr;

    this.compareMonths();
  }

  private async compareMonths(): Promise<void> {
    const month1 = ($<HTMLSelectElement>('compareMonth1'))?.value;
    const month2 = ($<HTMLSelectElement>('compareMonth2'))?.value;

    if (!month1 || !month2) {
      toast.warning('Выберите оба месяца');
      return;
    }

    if (month1 === month2) {
      toast.warning('Выберите разные месяцы');
      return;
    }

    try {
      const comparison = await analyticsService.compareMonths(month1, month2);
      AnalyticsView.renderComparison($('comparisonResults'), comparison);
    } catch (e) {
      toast.error('Ошибка сравнения');
    }
  }

  private changePeriod(delta: number): void {
    if (this.viewMode === 'month') {
      const d = new Date(this.currentMonth + '-01');
      d.setMonth(d.getMonth() + delta);
      this.currentMonth = d.toISOString().slice(0, 7);
    } else {
      this.currentYear += delta;
    }
    this.load();
  }

  async load(): Promise<void> {
    AnalyticsView.applyDesktopLayout();
    
    const advanced = isEnabled('advanced_analytics');

    this.loadHealthScore().catch(() => {});
    if (advanced) {
      this.loadForecast().catch(() => {});
      this.loadAIRecommendations().catch(() => {});
      this.loadVelocity().catch(() => {});
      this.loadTopGrowth().catch(() => {});
    }
    this.loadNetWorth().catch(() => {});

    try {
      if (this.viewMode === 'month') {
        await this.loadMonthlyAnalytics();
      } else {
        await this.loadYearlyAnalytics();
      }
      this.initComparison();
    } catch (e) {
      console.error('Analytics error:', e);
      toast.error('Ошибка загрузки аналитики');
    }
  }

  private async loadForecast(): Promise<void> {
    const container = $('forecastContent');
    const showScenarios = ($<HTMLInputElement>('forecastScenariosCheckbox'))?.checked || false;

    try {
      if (showScenarios) {
        const scenarios = await analyticsService.getForecastScenarios();
        AnalyticsView.renderForecastScenarios(container, scenarios);
      } else {
        const forecast = await analyticsService.getForecast(3);
        AnalyticsView.renderForecast(container, forecast);
      }
    } catch (e) {
      console.error('Forecast load error:', e);
      AnalyticsView.renderForecastError(container);
    }
  }

  private async loadAIRecommendations(): Promise<void> {
    const container = $('aiRecommendationsContent');
    try {
      const recs = await analyticsService.getRecommendations();
      AnalyticsView.renderRecommendations(container, recs);
    } catch (e) {
      console.error('Recommendations load error:', e);
      AnalyticsView.renderRecommendationsError(container);
    }
  }

  private async loadHealthScore(): Promise<void> {
    try {
      const health = await dashboardService.getFinancialHealth();
      DashboardView.renderHealthScore(health, {
        onWithdrawClick: (maxAmount) => this.openWithdrawModal(maxAmount),
      });
    } catch (e) {
      console.error('Health score load error:', e);
    }
  }

  private openWithdrawModal(maxAmount: number): void {
    const existingModal = $('withdrawSavingsModal');
    existingModal?.remove();

    const modalHtml = `
      <div id="withdrawSavingsModal" class="modal show">
        <div class="modal-content modal-small">
          <div class="modal-header">
            <h3>💸 Снять с копилки</h3>
            <button class="btn-close modal-close" aria-label="Закрыть">×</button>
          </div>
          <form id="withdrawSavingsForm">
            <div class="form-group">
              <label>Сумма (макс. ${formatMoney(maxAmount)})</label>
              <input type="number" id="withdrawAmountInput" step="0.01" min="0" max="${maxAmount}" placeholder="0" required autofocus>
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-secondary modal-cancel">Отмена</button>
              <button type="submit" class="btn btn-primary">Снять</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = $('withdrawSavingsModal');
    const form = $<HTMLFormElement>('withdrawSavingsForm');
    const input = $<HTMLInputElement>('withdrawAmountInput');

    const closeModal = () => modal?.remove();

    modal?.querySelector('.modal-close')?.addEventListener('click', closeModal);
    modal?.querySelector('.modal-cancel')?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onEscape); }
    };
    document.addEventListener('keydown', onEscape);

    setTimeout(() => input?.focus(), 100);

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat((input?.value || '0').replace(',', '.'));
      if (isNaN(amount) || amount <= 0) {
        toast.error('Введите корректную сумму');
        return;
      }
      if (amount > maxAmount) {
        toast.error(`Нельзя снять больше ${formatMoney(maxAmount)}`);
        return;
      }
      closeModal();
      await this.withdrawFromSavings(amount);
    });
  }

  private async withdrawFromSavings(amount: number): Promise<void> {
    try {
      await analyticsService.createTransaction({
        date: getToday(),
        amount,
        currency: 'BYN',
        type: 'savings_withdrawal',
        description: 'Снято с копилки',
      });
      toast.success('Средства сняты с копилки');
      await this.loadHealthScore();
    } catch {
      toast.error('Ошибка при снятии');
    }
  }

  private async loadMonthlyAnalytics(): Promise<void> {
    const data = await analyticsService.getAnalytics(this.currentMonth);

    AnalyticsView.renderSummary(
      formatMonth(this.currentMonth),
      data.total_income,
      data.total_expenses
    );

    if (this.categoryChart) {
      this.categoryChart.destroy();
      this.categoryChart = null;
    }
    if (this.trendChart) {
      this.trendChart.destroy();
      this.trendChart = null;
    }

    this.categoryChart = AnalyticsView.renderCategoryChart(
      $<HTMLCanvasElement>('categoryChart'),
      $('categoryLegend'),
      data.by_category,
      { onCategoryClick: (id) => this.showCategoryTrend(id) }
    );
    this.trendChart = AnalyticsView.renderTrendChart($<HTMLCanvasElement>('trendChart'), data.monthly_trend);
  }

  private async loadYearlyAnalytics(): Promise<void> {
    const data = await analyticsService.getYearlyAnalytics(this.currentYear);

    AnalyticsView.renderSummary(
      String(this.currentYear),
      data.total_income,
      data.total_expenses
    );

    if (this.categoryChart) {
      this.categoryChart.destroy();
      this.categoryChart = null;
    }
    if (this.trendChart) {
      this.trendChart.destroy();
      this.trendChart = null;
    }

    this.categoryChart = AnalyticsView.renderCategoryChart(
      $<HTMLCanvasElement>('categoryChart'),
      $('categoryLegend'),
      data.by_category,
      { onCategoryClick: (id) => this.showCategoryTrend(id) }
    );
    this.trendChart = AnalyticsView.renderYearlyTrendChart($<HTMLCanvasElement>('trendChart'), data);
  }

  private async showCategoryTrend(categoryId: number): Promise<void> {
    try {
      const trend = await analyticsService.getCategoryTrend(categoryId, 6);
      const result = AnalyticsView.renderTrendModal(trend);
      if (!result) return;

      this.trendModalChart = result.chart;

      const closeModal = () => {
        if (this.trendModalChart) {
          this.trendModalChart.destroy();
          this.trendModalChart = null;
        }
        result.modal.remove();
      };

      result.modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
      result.modal.addEventListener('click', (e) => {
        if (e.target === result.modal) closeModal();
      });
    } catch (e) {
      toast.error('Ошибка загрузки тренда');
    }
  }

  // --- Forecast Scenarios Toggle ---
  private setupForecastScenarios(): void {
    const checkbox = $<HTMLInputElement>('forecastScenariosCheckbox');
    checkbox?.addEventListener('change', () => {
      this.loadForecast().catch(() => toast.error('Ошибка загрузки прогноза'));
    });
  }

  // --- Spending Velocity ---
  private async loadVelocity(): Promise<void> {
    const container = $('velocityContent');
    if (!container) return;
    try {
      const data = await analyticsService.getSpendingVelocity();
      if (!data) {
        container.innerHTML = '<p class="empty-state">Нет данных</p>';
        return;
      }
      const daily = data.daily_average_7d || 0;
      const projected = data.projected_monthly || 0;
      const budget = data.budget_daily_rate || 0;
      const overBudget = daily > budget && budget > 0;

      container.innerHTML = `
        <div class="velocity-grid">
          <div class="velocity-stat">
            <span class="velocity-label">Средние траты за день (7 дней)</span>
            <span class="velocity-value ${overBudget ? 'negative' : ''}">${formatMoney(daily)}</span>
          </div>
          <div class="velocity-stat">
            <span class="velocity-label">Прогноз на месяц</span>
            <span class="velocity-value">${formatMoney(projected)}</span>
          </div>
          <div class="velocity-stat">
            <span class="velocity-label">Дневной бюджет</span>
            <span class="velocity-value positive">${formatMoney(budget)}</span>
          </div>
          ${overBudget ? '<div class="velocity-warning">⚠️ Вы тратите больше дневного бюджета!</div>' : '<div class="velocity-ok">✅ Темп трат в норме</div>'}
        </div>
      `;
    } catch {
      container.innerHTML = '<p class="empty-state error">Не удалось загрузить</p>';
    }
  }

  // --- Top Growing Categories ---
  private async loadTopGrowth(): Promise<void> {
    const container = $('topGrowthContent');
    if (!container) return;
    try {
      const data = await analyticsService.getTopGrowthCategories(5);
      if (!data?.length) {
        container.innerHTML = '<p class="empty-state">Нет данных для сравнения</p>';
        return;
      }

      container.innerHTML = `
        <div class="growth-list">
          ${data.map(c => {
            const pctStr = c.percent_change >= 0 ? `+${c.percent_change.toFixed(0)}%` : `${c.percent_change.toFixed(0)}%`;
            const isGrowth = c.difference > 0;
            return `
              <div class="growth-item">
                <span class="growth-name">${c.category_name}</span>
                <span class="growth-amounts">${formatMoney(c.previous)} → ${formatMoney(c.current)}</span>
                <span class="growth-badge ${isGrowth ? 'negative' : 'positive'}">${pctStr}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } catch {
      container.innerHTML = '<p class="empty-state error">Не удалось загрузить</p>';
    }
  }

  // --- Net Worth Chart ---
  private async loadNetWorth(): Promise<void> {
    const card = $('netWorthCard');
    try {
      const data = await analyticsService.getNetWorthHistory();
      if (!data?.length) {
        if (card) card.style.display = 'none';
        return;
      }
      if (card) card.style.display = '';

      if (this.netWorthChart) {
        this.netWorthChart.destroy();
        this.netWorthChart = null;
      }

      const ctx = $<HTMLCanvasElement>('netWorthChart');
      if (!ctx) return;

      const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
      const labels = data.map((d: { month: string }) => {
        const idx = parseInt(d.month.split('-')[1]) - 1;
        return monthNames[idx];
      });

      this.netWorthChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Чистая стоимость',
              data: data.map((d: { net_worth: number }) => d.net_worth),
              borderColor: '#6C5CE7',
              backgroundColor: 'rgba(108,92,231,0.1)',
              fill: true,
              tension: 0.4,
            },
            {
              label: 'Баланс',
              data: data.map((d: { total_balance: number }) => d.total_balance),
              borderColor: '#4CAF50',
              borderDash: [5, 5],
              fill: false,
              tension: 0.4,
            },
            {
              label: 'Накопления',
              data: data.map((d: { total_savings: number }) => d.total_savings),
              borderColor: '#2196F3',
              borderDash: [3, 3],
              fill: false,
              tension: 0.4,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              callbacks: {
                label: (context: any) => `${context.dataset.label}: ${formatMoney(context.raw)}`,
              },
            },
          },
          scales: {
            y: {
              ticks: { callback: (v: number) => formatMoney(v) },
            },
          },
        },
      });
    } catch {
      if (card) card.style.display = 'none';
    }
  }

  protected onDeactivate(): void {
    if (this.categoryChart) {
      this.categoryChart.destroy();
      this.categoryChart = null;
    }
    if (this.trendChart) {
      this.trendChart.destroy();
      this.trendChart = null;
    }
    if (this.trendModalChart) {
      this.trendModalChart.destroy();
      this.trendModalChart = null;
    }
    if (this.netWorthChart) {
      this.netWorthChart.destroy();
      this.netWorthChart = null;
    }
  }
}

export const analyticsPage = new AnalyticsPage();
