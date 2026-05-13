/**
 * Plans service — API-обёртка для плановых платежей, календаря, подписок
 */
import api from '@/api/client';
import type { PaymentReminder, RecurringPayment, PaymentCalendar, DetectedSubscription, CategoryWithSubs } from '@/types';

export interface SubscriptionReminder {
  payment: RecurringPayment;
  cancel_by_date: string;
  days_until: number;
}

class PlansService {
  async getPaymentReminders(): Promise<PaymentReminder[]> {
    return api.getPaymentReminders();
  }

  async getPaymentCalendar(days = 60): Promise<PaymentCalendar> {
    return api.getPaymentCalendar(days);
  }

  async getSubscriptionReminders(): Promise<SubscriptionReminder[]> {
    return api.getSubscriptionReminders();
  }

  async getPayments(): Promise<RecurringPayment[]> {
    return api.getPayments();
  }

  async createPayment(data: Parameters<typeof api.createPayment>[0]): Promise<unknown> {
    return api.createPayment(data);
  }

  async updatePayment(data: Parameters<typeof api.updatePayment>[0]): Promise<unknown> {
    return api.updatePayment(data);
  }

  async deletePayment(id: number): Promise<{ deleted: boolean }> {
    return api.deletePayment(id);
  }

  async createTransaction(data: Parameters<typeof api.createTransaction>[0]) {
    return api.createTransaction(data);
  }

  async detectSubscriptions(): Promise<DetectedSubscription[]> {
    return api.detectSubscriptions();
  }

  async getCategories(): Promise<CategoryWithSubs[]> {
    return api.getCategories();
  }
}

export const plansService = new PlansService();
