/**
 * Transaction List Component with Pagination
 */
import { getCurrentMonth } from '@/shared/utils/format';
import { emptyStateHtml, skeletonHtml } from '@/shared/components/ui';
import { modal } from '@/shared/components/modal';
import { transactionListHtml } from '@/templates';
import type { Transaction } from '@/types';

const PAGE_SIZE = 10;

export interface PaginationMeta {
  total: number;
  page: number;
  per_page: number;
  last_page: number;
}

export interface TransactionListOptions {
  onDelete?: (id: number) => Promise<void>;
  onSelect?: (transaction: Transaction) => void;
  onPageChange?: (page: number) => void;
  showCount?: boolean;
  emptyText?: string;
  pageSize?: number;
}

export function createTransactionList(
  container: HTMLElement,
  options: TransactionListOptions = {}
): {
  setTransactions: (transactions: Transaction[]) => void;
  setPagedData: (transactions: Transaction[], meta: PaginationMeta) => void;
  setLoading: (loading: boolean) => void;
  prependTransaction: (t: Transaction) => void;
  removeTransaction: (id: number) => void;
  getTransactions: () => Transaction[];
  destroy: () => void;
} {
  const { 
    onDelete,
    onSelect,
    onPageChange,
    showCount = true, 
    emptyText = 'Нет операций',
    pageSize = PAGE_SIZE,
  } = options;

  let allTransactions: Transaction[] = [];
  let currentPage = 1;
  let serverMeta: PaginationMeta | null = null;

  // Create wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'transaction-list-wrapper';
  wrapper.innerHTML = `
    ${showCount ? '<div class="transactions-header"><span class="transactions-count"></span></div>' : ''}
    <div class="transactions-list"></div>
    <div class="pagination"></div>
  `;

  container.appendChild(wrapper);

  const countEl = wrapper.querySelector<HTMLElement>('.transactions-count');
  const listEl = wrapper.querySelector<HTMLElement>('.transactions-list')!;
  const paginationEl = wrapper.querySelector<HTMLElement>('.pagination')!;

  const isServerPaged = () => serverMeta !== null;

  const getTotalPages = () =>
    serverMeta ? serverMeta.last_page : Math.ceil(allTransactions.length / pageSize);

  const getPageTransactions = () => {
    if (serverMeta) return allTransactions;
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return allTransactions.slice(start, end);
  };

  // Render pagination
  const renderPagination = () => {
    const totalPages = getTotalPages();
    
    if (totalPages <= 1) {
      paginationEl.innerHTML = '';
      return;
    }

    let html = '<div class="pagination-controls">';
    
    // Previous button
    html += `<button class="pagination-btn" data-page="prev" ${currentPage === 1 ? 'disabled' : ''}>←</button>`;
    
    // Page numbers
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const endPage = Math.min(totalPages, startPage + maxVisible - 1);
    
    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }
    
    if (startPage > 1) {
      html += `<button class="pagination-btn" data-page="1">1</button>`;
      if (startPage > 2) html += '<span class="pagination-dots">...</span>';
    }
    
    for (let p = startPage; p <= endPage; p++) {
      html += `<button class="pagination-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
    }
    
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += '<span class="pagination-dots">...</span>';
      html += `<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`;
    }
    
    // Next button
    html += `<button class="pagination-btn" data-page="next" ${currentPage === totalPages ? 'disabled' : ''}>→</button>`;
    
    html += '</div>';
    html += `<div class="pagination-info">Стр. ${currentPage} из ${totalPages}</div>`;
    
    paginationEl.innerHTML = html;
    
    paginationEl.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const page = (e.currentTarget as HTMLElement).dataset.page!;
        let newPage: number;
        if (page === 'prev') {
          newPage = Math.max(1, currentPage - 1);
        } else if (page === 'next') {
          newPage = Math.min(getTotalPages(), currentPage + 1);
        } else {
          newPage = parseInt(page);
        }
        currentPage = newPage;
        if (isServerPaged() && onPageChange) {
          onPageChange(newPage);
        } else {
          renderList();
          renderPagination();
        }
      });
    });
  };

  // Render list
  const renderList = () => {
    const transactions = getPageTransactions();
    const currentMonth = getCurrentMonth();

    if (!transactions.length) {
      listEl.innerHTML = emptyStateHtml(emptyText, { icon: '💳' });
      return;
    }

    listEl.innerHTML = transactionListHtml(transactions, {
      showDelete: !!onDelete,
      currentMonth,
    });

    // Attach click handlers for selection
    if (onSelect) {
      listEl.querySelectorAll('.transaction-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('[data-delete]')) return;
          const id = parseInt((item as HTMLElement).dataset.id || '0');
          const transaction = transactions.find(t => t.id === id);
          if (transaction) {
            listEl.querySelectorAll('.transaction-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            onSelect(transaction);
          }
        });
      });
    }

    // Attach delete handlers
    if (onDelete) {
      listEl.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = parseInt((e.currentTarget as HTMLElement).dataset.delete!);
          if (await modal.confirm('Удалить эту операцию? Баланс будет скорректирован.', 'Удалить операцию')) {
            await onDelete(id);
          }
        });
      });
    }
  };

  const render = (transactions: Transaction[]) => {
    serverMeta = null;
    allTransactions = transactions;
    currentPage = 1;
    
    if (countEl) {
      countEl.textContent = `${transactions.length} записей`;
    }

    if (!transactions.length) {
      listEl.innerHTML = emptyStateHtml(emptyText, { icon: '💳' });
      paginationEl.innerHTML = '';
      return;
    }

    renderList();
    renderPagination();
  };

  const renderPaged = (transactions: Transaction[], meta: PaginationMeta) => {
    serverMeta = meta;
    allTransactions = transactions;
    currentPage = meta.page;

    if (countEl) {
      countEl.textContent = `${meta.total} записей`;
    }

    if (!transactions.length) {
      listEl.innerHTML = emptyStateHtml(emptyText, { icon: '💳' });
      paginationEl.innerHTML = '';
      return;
    }

    renderList();
    renderPagination();
  };

  return {
    setTransactions: render,
    setPagedData: renderPaged,
    prependTransaction: (t: Transaction) => {
      allTransactions = [t, ...allTransactions];
      if (countEl) countEl.textContent = `${allTransactions.length} записей`;
      renderList();
      renderPagination();
    },
    removeTransaction: (id: number) => {
      allTransactions = allTransactions.filter(x => x.id !== id);
      if (countEl) countEl.textContent = `${allTransactions.length} записей`;
      renderList();
      renderPagination();
    },
    getTransactions: () => [...allTransactions],
    setLoading: (loading: boolean) => {
      if (loading) {
        listEl.innerHTML = skeletonHtml(5, 'transaction');
        paginationEl.innerHTML = '';
        if (countEl) countEl.textContent = '...';
      }
    },
    destroy: () => {
      wrapper.remove();
    },
  };
}
