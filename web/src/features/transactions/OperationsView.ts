import { $, setHTML } from '@/shared/utils/dom';
import { formatMoney, formatDate } from '@/shared/utils/format';
import type { Transaction } from '@/types';

export function applyDesktopLayout(): void {
  const operationsTab = document.getElementById('tab-operations');
  if (!operationsTab) return;

  if (window.innerWidth >= 768) {
    operationsTab.classList.add('operations-desktop');
  } else {
    operationsTab.classList.remove('operations-desktop');
  }
}

export function renderTransactionDetails(
  transaction: Transaction,
  onEdit: (id: number) => void,
  onDelete: (id: number) => void
): void {
  const panel = $('operationsDetailsPanel');
  if (!panel) return;

  panel.classList.remove('empty');

  const typeLabels: Record<string, string> = {
    income: 'Доход',
    expense: 'Расход',
    savings: 'Копилка',
    savings_withdrawal: 'Снятие с копилки',
    transfer: 'Перевод',
    sync: 'Сверка',
  };

  const typeLabel = typeLabels[transaction.type] || transaction.type;
  const amountClass = transaction.amount >= 0 ? 'positive' : 'negative';

  const html = `
    <div class="operations-details-header">
      <h3 class="operations-details-title">Детали операции</h3>
      <button class="operations-details-close" id="closeDetailsBtn">×</button>
    </div>
    <div class="operations-details-content">
      <div class="detail-row">
        <span class="detail-label">Сумма</span>
        <span class="detail-value amount ${amountClass}">${formatMoney(Math.abs(transaction.amount))}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Тип</span>
        <span class="detail-value">${typeLabel}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Дата</span>
        <span class="detail-value">${formatDate(transaction.date)}</span>
      </div>
      ${transaction.category_name ? `
        <div class="detail-row">
          <span class="detail-label">Категория</span>
          <span class="detail-value">${transaction.category_icon || ''} ${transaction.category_name}</span>
        </div>
      ` : ''}
      ${transaction.description ? `
        <div class="detail-row">
          <span class="detail-label">Описание</span>
          <span class="detail-value">${transaction.description}</span>
        </div>
      ` : ''}
      ${transaction.currency !== 'BYN' ? `
        <div class="detail-row">
          <span class="detail-label">Валюта</span>
          <span class="detail-value">${transaction.currency} (${formatMoney(transaction.original_amount || transaction.amount)})</span>
        </div>
      ` : ''}
      ${(transaction as { goal_name?: string }).goal_name ? `
        <div class="detail-row">
          <span class="detail-label">Цель</span>
          <span class="detail-value">🎯 ${(transaction as { goal_name?: string }).goal_name}</span>
        </div>
      ` : ''}
      ${transaction.recurring_payment_id ? `
        <div class="detail-row">
          <span class="detail-label">Платёж</span>
          <span class="detail-value">📋 Плановый платёж #${transaction.recurring_payment_id}</span>
        </div>
      ` : ''}
      <div class="detail-row">
        <span class="detail-label">Создано</span>
        <span class="detail-value">${formatDate(transaction.created_at || transaction.date)}</span>
      </div>
      ${transaction.tags?.length ? `
        <div class="detail-row">
          <span class="detail-label">Теги</span>
          <div class="detail-value tx-tags">
            ${transaction.tags.map(tag => `<span class="tx-tag-badge" style="background:${tag.color}22;color:${tag.color};border-color:${tag.color}44">${tag.name}</span>`).join('')}
          </div>
        </div>
      ` : ''}
      <div class="detail-actions">
        <button class="btn btn-primary btn-sm btn-block" id="editTransactionBtn">✏️ Редактировать</button>
        <button class="btn btn-outline btn-sm btn-block" id="editTransactionTagsBtn">🏷 Теги</button>
        <button class="btn btn-danger btn-sm btn-block" id="deleteTransactionBtn">🗑 Удалить</button>
      </div>
    </div>
  `;

  setHTML(panel, html);

  const closeBtn = panel.querySelector('#closeDetailsBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => clearTransactionDetails());
  }

  const editBtn = panel.querySelector('#editTransactionBtn');
  if (editBtn) {
    editBtn.addEventListener('click', () => onEdit(transaction.id));
  }

  const deleteBtn = panel.querySelector('#deleteTransactionBtn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => onDelete(transaction.id));
  }
}

export function clearTransactionDetails(): void {
  const panel = $('operationsDetailsPanel');
  if (!panel) return;

  panel.classList.add('empty');
  setHTML(panel, `
    <div class="empty-icon">💳</div>
    <p>Выберите операцию для просмотра деталей</p>
  `);
}
