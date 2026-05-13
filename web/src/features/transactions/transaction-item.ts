/**
 * Transaction item template
 */
import { formatMoney, formatDateTime } from '@/shared/utils/format';
import { store } from '@/store';
import type { Transaction } from '@/types';

export interface TransactionItemOptions {
  showDelete?: boolean;
  currentMonth?: string;
}

/**
 * Render single transaction item HTML
 */
export function transactionItemHtml(
  t: Transaction,
  options: TransactionItemOptions = {}
): string {
  const { showDelete = false } = options;
  const isTransfer = t.type === 'transfer';
  const isExpense = t.type === 'expense' || t.type === 'savings';
  const sign = isTransfer ? '' : (isExpense ? '-' : '+');
  const amountClass = isTransfer ? '' : (isExpense ? 'negative' : 'positive');
  const absAmount = Math.abs(t.amount);
  const categoryText = (t.type === 'expense' && t.category_name) ? ` • ${t.category_name}` : '';
  const transferText = isTransfer && (t.account_name || t.transfer_to_account_name)
    ? ` • ${t.account_name || '?'} → ${t.transfer_to_account_name || '?'}` : '';
  const typeLabel = store.getTypeLabel(t.type);
  const icon = t.category_icon || typeLabel.split(' ')[0] || '💳';

  const canDelete = showDelete;
  const deleteBtn = canDelete
    ? `<button class="btn-delete-tx" data-delete="${t.id}" title="Удалить">🗑️</button>`
    : '';

  const splitsHtml = t.splits?.length ? `
    <div class="tx-splits">
      ${t.splits.map(s => `<span class="tx-split-badge">${s.category_name || ''} ${formatMoney(s.amount)}</span>`).join('')}
    </div>` : '';

  const tagsHtml = t.tags?.length ? `
    <div class="tx-tags">
      ${t.tags.map(tag => `<span class="tx-tag-badge" style="background:${tag.color}22;color:${tag.color};border-color:${tag.color}44">${tag.name}</span>`).join('')}
    </div>` : '';

  const sourceTag = t.source === 'telegram'
    ? ' <span class="tx-source-badge" title="Добавлено через Telegram">🤖</span>'
    : t.source === 'bank_receipt'
      ? ' <span class="tx-source-badge tx-import-badge" title="Из импорта чека">🧾</span>'
      : t.source === 'email_parse'
        ? ' <span class="tx-source-badge" title="Из email-парсинга">📧</span>'
        : '';

  return `
    <div class="transaction-item" data-id="${t.id}">
      <div class="tx-icon">${icon}</div>
      <div class="tx-info">
        <span class="tx-type">${typeLabel}${categoryText}${transferText}${t.splits?.length ? ' • 📊 Разделён' : ''}${sourceTag}</span>
        <span class="tx-date">${formatDateTime(t.date, t.created_at)}${t.description && t.description.toLowerCase() !== (t.category_name || '').toLowerCase() ? ' • ' + t.description : ''}</span>
        ${splitsHtml}
        ${tagsHtml}
      </div>
      <span class="tx-amount ${amountClass}">${sign}${formatMoney(absAmount)}</span>
      ${deleteBtn}
    </div>
  `;
}

/**
 * Render list of transaction items
 */
export function transactionListHtml(
  transactions: Transaction[],
  options: TransactionItemOptions = {}
): string {
  return transactions.map(t => transactionItemHtml(t, options)).join('');
}
