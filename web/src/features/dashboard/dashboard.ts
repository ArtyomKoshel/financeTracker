/**
 * Dashboard Page — оркестрация
 * Связывает Service (данные) и View (отображение)
 */
import { BasePage } from '@/pages/base';
import { operationsPage } from '@/features/transactions/operations';
import { toast } from '@/shared/components/toast';
import { modal } from '@/shared/components/modal';
import { getToday } from '@/shared/utils/format';
import { dashboardService } from '@/features/dashboard/dashboard.service';
import * as DashboardView from '@/features/dashboard/DashboardView';
import type { DashboardViewCallbacks } from '@/features/dashboard/DashboardView';
import { shouldShowOnboarding, createOnboardingWizard } from '@/shared/components/onboarding-wizard';

export class DashboardPage extends BasePage {
  constructor() {
    super('dashboard');
  }

  async load(): Promise<void> {
    DashboardView.showDashboardSkeletons();
    DashboardView.applyDesktopLayout();

    const callbacks: DashboardViewCallbacks = {
      onPaymentPaid: (id, amount, isVariable, name) => this.markPaymentPaid(id, amount, isVariable, name),
      onAddQuickSavings: async (amount) => this.addQuickSavings(amount),
      onWithdrawClick: async (maxAmount) => {
        window.switchTab('operations');
        operationsPage.setTypeAmountAndFocus('savings_withdrawal', maxAmount);
      },
    };

    try {
      const cachedBalance = dashboardService.getCachedBalance();
      const cachedReminders = dashboardService.getCachedReminders();
      if (cachedBalance) DashboardView.renderBalance(cachedBalance);
      if (cachedReminders) DashboardView.renderPayments(cachedReminders, callbacks);

      const data = await dashboardService.getDashboard();
      DashboardView.renderMonthSummary(data);
      // Load month-over-month comparison async (non-blocking)
      this.loadMonthComparison(data).catch(() => {});

      this.loadRecommendations(callbacks).catch(() => {});
      this.loadHealthScore(callbacks).catch(() => {});

      if (!cachedBalance) {
        const account = await dashboardService.getBalance();
        DashboardView.renderBalance(account);
        dashboardService.setCachedBalance(account);

        if (shouldShowOnboarding(data.recent_transactions.length, account.total_balance)) {
          createOnboardingWizard(() => void this.load());
        }
      }
      if (!cachedReminders) {
        const reminders = await dashboardService.getPaymentReminders();
        DashboardView.renderPayments(reminders, callbacks);
        dashboardService.setCachedReminders(reminders);
      }
    } catch (e) {
      console.error('Dashboard load error:', e);
      toast.error('Ошибка загрузки дашборда');
    }
  }

  private async loadMonthComparison(data: import('@/types').DashboardData): Promise<void> {
    const now = new Date();
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const currentMonth = fmt(now);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = fmt(prevDate);

    const comparison = await dashboardService.compareMonths(prevMonth, currentMonth);
    const calcPct = (curr: number, diff: number): number => {
      const prevVal = curr - diff;
      if (prevVal === 0) return 0;
      return Math.round((diff / Math.abs(prevVal)) * 100);
    };

    const income_pct = calcPct(data.current_month.total_income, comparison.income_diff);
    const expenses_pct = calcPct(data.current_month.expenses, comparison.expenses_diff);
    const savings_pct = calcPct(data.current_month.total_saved, comparison.expenses_diff - comparison.income_diff);

    DashboardView.renderMonthSummary(Object.assign({}, data, {
      comparison: { income_pct, expenses_pct, savings_pct },
    }));
  }

  private async loadHealthScore(callbacks: Pick<DashboardViewCallbacks, 'onWithdrawClick'>): Promise<void> {
    try {
      const health = await dashboardService.getFinancialHealth();
      DashboardView.renderHealthScore(health, callbacks);
    } catch {
      // Silently fail
    }
  }

  private async markPaymentPaid(
    paymentId: number,
    amount: number,
    isVariable: boolean,
    paymentName: string
  ): Promise<void> {
    let finalAmount = amount;
    if (isVariable) {
      const input = await modal.prompt(
        { label: 'Фактическая сумма платежа', type: 'number', defaultValue: amount.toFixed(2) },
        'Оплата платежа'
      );
      if (input === null) return;
      finalAmount = parseFloat(input);
      if (isNaN(finalAmount) || finalAmount <= 0) {
        toast.error('Некорректная сумма');
        return;
      }
    }

    try {
      const result = await dashboardService.createTransaction({
        date: getToday(),
        amount: finalAmount,
        currency: 'BYN',
        type: 'expense',
        recurring_payment_id: paymentId,
        description: paymentName,
      });
      toast.success('Платёж оплачен');
      if (result.budget_warning) {
        const w = result.budget_warning;
        (w.percent >= 100 ? toast.error : toast.warning)(`${w.category_icon} ${w.message}`);
      }
      await this.load();
    } catch {
      toast.error('Ошибка при оплате');
    }
  }

  private async loadRecommendations(callbacks: Pick<DashboardViewCallbacks, 'onAddQuickSavings'>): Promise<void> {
    try {
      const rec = await dashboardService.getCashflowRecommendation();
      DashboardView.renderRecommendations(rec, callbacks);
    } catch {
      DashboardView.renderRecommendationsError();
    }
  }

  private addQuickSavings(amount: number): void {
    window.switchTab('operations');
    operationsPage.setTypeAmountAndFocus('savings', amount);
  }

}

export const dashboardPage = new DashboardPage();
