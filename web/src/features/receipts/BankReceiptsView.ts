import { store } from '@/store';
import { $ } from '@/shared/utils/dom';
import type { BankReceiptPreviewRow, BankReceiptMatchStats } from '@/api/experimental';
import type { CategoryWithSubs } from '@/types';

type FlatCategory = { id: number; name: string; is_active?: boolean };

export interface RenderCardOptions {
  existsExpanded?: boolean;
}

export function escape(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export function formatDate(dateStr: string, timeStr?: string | null): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const datePart = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (timeStr) {
    const t = timeStr.replace(/^(\d{1,2}):(\d{2})(?::\d{2})?$/, '$1:$2');
    return `${datePart} ${t}`;
  }
  return datePart;
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const formatted = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return isToday ? `${formatted} — сегодня` : formatted;
}

export function getValidDate(dateStr?: string | null): string {
  if (!dateStr || typeof dateStr !== 'string') return todayISO();
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return todayISO();
  return d.toISOString().slice(0, 10);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDisplayName(row: BankReceiptPreviewRow): string {
  const raw = row.raw_description?.trim();
  const short = row.bank_merchant_name?.trim() || '';
  if (raw && raw.length > 15) {
    if (row.confidence === 'manual') return raw;
    if (row.confidence === 'mapped' && raw.length > short.length + 10) return raw;
    if (short.length < 10 && raw.length > short.length + 8) return raw;
  }
  return short || raw || '—';
}

export function getPropagationKey(row: BankReceiptPreviewRow): string {
  const raw = (row.raw_description ?? '').trim();
  const short = (row.bank_merchant_name ?? '').trim();
  const stripNoise = (s: string) =>
    s.replace(/^\d{8}\s*/, '')
     .replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*$/, '')
     .replace(/\s+\d{2}\.\d{2}\.\d{4}\s*$/, '')
     .replace(/\s+\d{4}-\d{2}-\d{2}\s*$/, '')
     .trim();
  const normalized = (s: string) => stripNoise(s).toLowerCase().replace(/\s+/g, ' ');
  if (raw.length > 20) return normalized(raw);
  return normalized(short || raw);
}

export function renderMatchStats(stats: BankReceiptMatchStats | null): void {
  const el = $('bankReceiptMatchStats');
  if (!el || !stats) {
    if (el) el.innerHTML = '';
    return;
  }
  const total = stats.exists + stats.batch_learned + stats.mapped + stats.similar + stats.ai_suggested + stats.manual + (stats.rule ?? 0);
  const auto = stats.batch_learned + stats.mapped + stats.similar + stats.ai_suggested + (stats.rule ?? 0);
  el.innerHTML = `Распознано: ${total} · Уже внесено: ${stats.exists} · Автокатегоризация: ${auto} · Требуют внимания: ${stats.manual}`;
}

export function renderExistsCard(row: BankReceiptPreviewRow): string {
  const isIncome = row.type === 'income';
  const amountClass = isIncome ? 'amount-income' : 'amount-expense';
  const amountStr = isIncome ? `+${row.amount.toFixed(2)}` : `−${row.amount.toFixed(2)}`;
  const displayName = getDisplayName(row);

  const matchedDesc = row.existing_transaction_description?.trim();
  const matchedType = row.existing_transaction_type;
  const typeLabel = matchedType ? store.getTypeLabel(matchedType) : (row.category_name || '—');
  const descShort = matchedDesc ? (matchedDesc.length > 50 ? matchedDesc.slice(0, 47) + '…' : matchedDesc) : '';
  const matchedInfo = descShort
    ? `Совпало с: ${escape(descShort)} (${escape(typeLabel)})`
    : `Совпадение по сумме и дате · ${escape(typeLabel)}`;

  return `
    <div class="receipt-card receipt-card--exists" data-id="${row.id}">
      <div class="receipt-card__main">
        <span class="receipt-card__name">${escape(displayName)}</span>
        <span class="receipt-card__amount ${amountClass}">${amountStr} Br</span>
      </div>
      <div class="receipt-card__meta">
        <span>${formatDate(row.date, row.time)}</span>
        <span>${row.category_name || typeLabel || '—'}</span>
      </div>
      <span class="badge badge-success">✓ Уже внесено</span>
      <span class="receipt-card__exists-hint" title="${escape(matchedInfo)}">${matchedInfo}</span>
    </div>`;
}

export function renderCreateCard(
  row: BankReceiptPreviewRow,
  flatCategories: FlatCategory[],
  selectedIds: Set<string>,
  _options?: RenderCardOptions,
): string {
  const isIncome = row.type === 'income';
  const amountClass = isIncome ? 'amount-income' : 'amount-expense';
  const typeLabel = isIncome ? 'Доход' : 'Расход';
  const displayName = getDisplayName(row);
  const checked = selectedIds.has(row.id) ? 'checked' : '';

  const fromMapping = !!(row as { from_mapping?: boolean }).from_mapping;
  const isSuggestion =
    !fromMapping &&
    (row.confidence === 'learned' || row.confidence === 'similar' || row.confidence === 'batch_learned' || row.confidence === 'mapped' || row.confidence === 'ai_suggested' || row.confidence === 'rule');
  const manualHint = fromMapping && (row.category_id || row.income_type) ? 'Ты уже добавлял такой платёж под этой категорией' : '';
  const hintBlock = manualHint ? `<span class="receipt-card__hint">${manualHint}</span>` : '';
  const isManualConfidence = row.confidence === 'manual';

  const ruleBadge = row.confidence === 'rule' && row.from_rule
    ? `<span class="receipt-card__rule-badge" title="Matched by rule: ${escape(String((row as any).rule_name ?? row.rule_id ?? ''))}">🔒</span>`
    : '';

  const validDate = getValidDate(row.date);
  const dateBlock = `
    <div class="receipt-card__date">
      <label class="receipt-card__label">Дата</label>
      <input type="date" class="receipt-date-input" data-row-id="${row.id}" value="${validDate}">
    </div>`;

  let recurringBanner = '';
  if (row.suggested_recurring_payment_id) {
    recurringBanner = `
      <div class="receipt-card__recurring-banner" data-row-id="${row.id}" data-payment-id="${row.suggested_recurring_payment_id}">
        ⚡ Похоже на платёж "${escape(row.suggested_recurring_payment_name ?? '')}" (${row.suggested_recurring_payment_amount?.toFixed(2)} Br, ${row.suggested_recurring_payment_day}-го числа)
        <button type="button" class="btn btn-text btn-sm receipt-link-recurring-btn" data-row-id="${row.id}" data-payment-id="${row.suggested_recurring_payment_id}">Связать</button>
        <button type="button" class="btn btn-text btn-sm receipt-unlink-recurring-btn" data-row-id="${row.id}">Создать отдельно</button>
      </div>`;
  }

  let categoryBlock: string;
  if (row.splits && row.splits.length > 0) {
    const cats = store.get('categories') as CategoryWithSubs[];
    const allCats = cats.flatMap((c) => c.subcategories?.length ? [c, ...c.subcategories] : [c]);
    const splitsHtml = row.splits.map((s) => {
      const cat = allCats.find((c) => c.id === s.category_id);
      const catName = cat?.name ?? `#${s.category_id}`;
      return `${escape(catName)} ${s.amount.toFixed(2)}`;
    }).join(', ');
    categoryBlock = `
      <div class="receipt-card__splits-summary">
        Разбито: ${splitsHtml}
        <button class="btn btn-text btn-sm receipt-edit-split-btn" data-row-id="${row.id}">Изменить</button>
      </div>`;
  } else if (isIncome) {
    categoryBlock = renderIncomeSelect(row, fromMapping, isSuggestion);
  } else {
    categoryBlock = renderExpenseSelect(row, flatCategories, fromMapping, isSuggestion, hintBlock);
    categoryBlock += `<button class="btn btn-text btn-sm receipt-split-btn" data-row-id="${row.id}">✂ Разбить</button>`;
  }

  const confidenceBadge = isManualConfidence
    ? '<span class="receipt-card__type" style="color:var(--warning)">⚠ Категория не определена</span>'
    : '';

  return `
    <div class="receipt-card receipt-card--create ${isManualConfidence ? 'receipt-card--needs-attention' : ''}" data-id="${row.id}" data-type="${row.type || 'expense'}">
      <div class="receipt-card__top">
        <label class="receipt-card__check">
          <input type="checkbox" ${checked} data-row-id="${row.id}">
          <span class="receipt-card__name">${escape(displayName)}</span>
          ${ruleBadge}
        </label>
        <input type="number" class="receipt-card__amount-input ${amountClass}" data-row-id="${row.id}" value="${row.amount.toFixed(2)}" step="0.01" min="0.01">
      </div>
      <div class="receipt-card__meta">
        <span>${formatDate(validDate, row.time)}</span>
        <span class="receipt-card__type">${typeLabel}</span>
        ${confidenceBadge}
      </div>
      ${recurringBanner}
      ${dateBlock}
      ${categoryBlock}
    </div>`;
}

export function renderDateGroupedRows(
  createRows: BankReceiptPreviewRow[],
  flatCategories: FlatCategory[],
  selectedIds: Set<string>,
  collapsedGroups: Set<string>,
  options?: RenderCardOptions,
): string {
  const dateGroups = new Map<string, BankReceiptPreviewRow[]>();
  createRows.forEach((r) => {
    const date = r.date || 'unknown';
    if (!dateGroups.has(date)) dateGroups.set(date, []);
    dateGroups.get(date)!.push(r);
  });

  const sortedDates = [...dateGroups.keys()].sort().reverse();
  let html = '';

  sortedDates.forEach((date) => {
    const rows = dateGroups.get(date)!;
    const collapsed = collapsedGroups.has(date);
    const expenses = rows.filter((r) => r.type !== 'income').reduce((s, r) => s + r.amount, 0);
    const incomes = rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const newCount = rows.length;
    const statsText = [
      `${newCount} ${newCount === 1 ? 'транзакция' : 'транзакций'}`,
      expenses > 0 ? `−${expenses.toFixed(2)}` : '',
      incomes > 0 ? `+${incomes.toFixed(2)}` : '',
    ].filter(Boolean).join(' · ');

    html += `<div class="receipt-date-group ${collapsed ? 'receipt-date-group--collapsed' : ''}" data-date="${date}">
      <div class="receipt-date-group__header" data-toggle-date="${date}">
        <span class="receipt-date-group__arrow">▼</span>
        <span class="receipt-date-group__date">${formatDateShort(date)}</span>
        <span class="receipt-date-group__stats">${statsText}</span>
      </div>
      <div class="receipt-date-group__items">`;

    rows.forEach((row) => {
      html += renderCreateCard(row, flatCategories, selectedIds, options);
    });

    html += '</div></div>';
  });

  return html;
}

export function renderMerchantGroupedRows(
  createRows: BankReceiptPreviewRow[],
  flatCategories: FlatCategory[],
  selectedIds: Set<string>,
  collapsedGroups: Set<string>,
  options?: RenderCardOptions,
): string {
  const merchantGroups = new Map<string, BankReceiptPreviewRow[]>();
  createRows.forEach((r) => {
    const key = getPropagationKey(r);
    if (!merchantGroups.has(key)) merchantGroups.set(key, []);
    merchantGroups.get(key)!.push(r);
  });

  const sortedKeys = [...merchantGroups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key]) => key);

  let html = '';

  sortedKeys.forEach((key) => {
    const rows = merchantGroups.get(key)!;
    const first = rows[0];
    const isMulti = rows.length > 1;
    const collapsed = collapsedGroups.has(key);
    const displayName = first.bank_merchant_name?.trim() || first.raw_description?.trim() || '—';
    const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
    const isIncome = first.type === 'income';
    const amountClass = isIncome ? 'amount-income' : 'amount-expense';
    const amountPrefix = isIncome ? '+' : '−';
    const allSelected = rows.every((r) => selectedIds.has(r.id));
    const someSelected = rows.some((r) => selectedIds.has(r.id));

    if (!isMulti) {
      html += renderCreateCard(first, flatCategories, selectedIds, options);
      return;
    }

    const groupId = `mg-${key.replace(/\W/g, '_').slice(0, 40)}`;

    html += `<div class="receipt-merchant-group ${collapsed ? 'receipt-merchant-group--collapsed' : ''}" data-merchant-key="${escape(key)}" id="${groupId}">
      <div class="receipt-merchant-group__header">
        <div class="receipt-merchant-group__top">
          <label class="receipt-merchant-group__check">
            <input type="checkbox" class="receipt-merchant-group__check-all" data-merchant-key="${escape(key)}" ${allSelected ? 'checked' : ''} ${!allSelected && someSelected ? 'data-indeterminate="1"' : ''}>
            <span class="receipt-merchant-group__name">${escape(displayName)}</span>
          </label>
          <span class="receipt-merchant-group__badge">${rows.length}</span>
          <span class="receipt-merchant-group__amount ${amountClass}">${amountPrefix}${totalAmount.toFixed(2)} Br</span>
        </div>
        <div class="receipt-merchant-group__category" data-merchant-key="${escape(key)}">
          ${isIncome
            ? renderMerchantGroupIncomeSelect(key, first, rows)
            : renderMerchantGroupCategorySelect(key, first, rows, flatCategories)
          }
        </div>
        <div class="receipt-merchant-group__details-toggle" data-toggle-merchant="${escape(key)}">
          <span class="receipt-merchant-group__arrow">▼</span>
          <span>${collapsed ? 'показать' : 'скрыть'} ${rows.length} транзакций</span>
        </div>
      </div>
      <div class="receipt-merchant-group__items">`;

    rows.forEach((row) => {
      html += renderMerchantSubRow(row, selectedIds);
    });

    html += '</div></div>';
  });

  return html;
}

export function renderMerchantGroupCategorySelect(
  groupKey: string,
  representative: BankReceiptPreviewRow,
  rows: BankReceiptPreviewRow[],
  flatCategories: FlatCategory[],
): string {
  const fromMapping = !!(representative as { from_mapping?: boolean }).from_mapping;
  const isSuggestion =
    !fromMapping &&
    (representative.confidence === 'learned' || representative.confidence === 'similar' ||
     representative.confidence === 'batch_learned' || representative.confidence === 'mapped' ||
     representative.confidence === 'ai_suggested' || representative.confidence === 'rule');
  const defaultCatId = (fromMapping || isSuggestion) && representative.category_id !== null
    ? Number(representative.category_id)
    : (flatCategories[0]?.id ?? 0);
  const hasMappingCat = defaultCatId && !flatCategories.some((c) => Number(c.id) === defaultCatId);
  const opts = hasMappingCat && representative.category_name
    ? [{ id: defaultCatId, name: representative.category_name }, ...flatCategories]
    : flatCategories;
  const optionsHtml = opts
    .map((c) => `<option value="${c.id}" ${Number(c.id) === defaultCatId ? 'selected' : ''}>${escape(c.name)}</option>`)
    .join('');
  const rowIds = rows.map((r) => r.id).join(',');
  return `
    <label class="receipt-card__label">Категория для всех</label>
    <select class="receipt-category-select receipt-merchant-group-select" data-merchant-key="${escape(groupKey)}" data-row-ids="${rowIds}">
      ${optionsHtml}
    </select>`;
}

export function renderMerchantGroupIncomeSelect(
  groupKey: string,
  representative: BankReceiptPreviewRow,
  rows: BankReceiptPreviewRow[],
): string {
  const incomeTypesList = (store.get('incomeTypes') || []) as Array<{ code: string; label: string; icon: string }>;
  const types = incomeTypesList.length > 0 ? incomeTypesList : [];
  const fromMapping = !!(representative as { from_mapping?: boolean }).from_mapping;
  const isSuggestion = !fromMapping &&
    (representative.confidence === 'learned' || representative.confidence === 'similar' ||
     representative.confidence === 'batch_learned' || representative.confidence === 'mapped' ||
     representative.confidence === 'rule');
  const defaultIncomeType = (fromMapping || isSuggestion) && representative.income_type
    ? String(representative.income_type).trim()
    : 'other';
  const hasOther = types.some((t) => t.code === 'other');
  const incomeOptions = types
    .map((t) => `<option value="${t.code}" ${t.code === defaultIncomeType ? 'selected' : ''}>${t.icon} ${escape(t.label)}</option>`)
    .join('') + (hasOther ? '' : `<option value="other" ${defaultIncomeType === 'other' ? 'selected' : ''}>📦 Другое</option>`);
  const rowIds = rows.map((r) => r.id).join(',');
  return `
    <label class="receipt-card__label">Тип дохода для всех</label>
    <select class="receipt-income-type-select receipt-merchant-group-select" data-merchant-key="${escape(groupKey)}" data-row-ids="${rowIds}">
      ${incomeOptions}
    </select>`;
}

export function renderMerchantSubRow(row: BankReceiptPreviewRow, selectedIds: Set<string>): string {
  const isIncome = row.type === 'income';
  const amountClass = isIncome ? 'amount-income' : 'amount-expense';
  const amountPrefix = isIncome ? '+' : '−';
  const checked = selectedIds.has(row.id) ? 'checked' : '';
  const validDate = getValidDate(row.date);
  return `
    <div class="receipt-merchant-subrow" data-id="${row.id}">
      <label class="receipt-merchant-subrow__check">
        <input type="checkbox" ${checked} data-row-id="${row.id}">
      </label>
      <input type="date" class="receipt-date-input receipt-merchant-subrow__date" data-row-id="${row.id}" value="${validDate}">
      <input type="number" class="receipt-card__amount-input receipt-merchant-subrow__amount ${amountClass}" data-row-id="${row.id}" value="${row.amount.toFixed(2)}" step="0.01" min="0.01">
      <span class="receipt-merchant-subrow__amount-label">${amountPrefix}${row.amount.toFixed(2)} Br</span>
    </div>`;
}

export function renderIncomeSelect(row: BankReceiptPreviewRow, fromMapping: boolean, isSuggestion: boolean): string {
  const incomeTypesList = (store.get('incomeTypes') || []) as Array<{ code: string; label: string; icon: string }>;
  const hasOther = incomeTypesList.some((t) => t.code === 'other');
  const types = incomeTypesList.length > 0 ? incomeTypesList : [];
  const defaultIncomeType = (fromMapping || isSuggestion) && row.income_type
    ? String(row.income_type).trim()
    : 'other';
  const hasDefaultInTypes = types.some((t) => String(t.code) === defaultIncomeType);
  const typesWithDefault =
    defaultIncomeType && !hasDefaultInTypes && defaultIncomeType !== 'other'
      ? (() => {
          const full = store.getTypeLabel(defaultIncomeType);
          const icon = full.match(/^(\S+)/)?.[1] ?? '📦';
          const label = full.replace(/^\S+\s*/, '').trim() || defaultIncomeType;
          return [{ code: defaultIncomeType, label, icon }, ...types];
        })()
      : types;
  const incomeOptions =
    typesWithDefault
      .map((t) => `<option value="${t.code}" ${String(t.code) === defaultIncomeType ? 'selected' : ''}>${t.icon} ${escape(t.label)}</option>`)
      .join('') + (hasOther || typesWithDefault.some((t) => t.code === 'other') ? '' : `<option value="other" ${defaultIncomeType === 'other' ? 'selected' : ''}>📦 Другое</option>`);
  const suggestionBlock =
    isSuggestion && row.income_type && String(row.income_type).trim() !== defaultIncomeType
      ? `<div class="receipt-card__suggestion">Предложение: <button type="button" class="receipt-suggestion-btn" data-row-id="${row.id}" data-type="income" data-value="${escape(row.income_type)}">${escape(store.getTypeLabel(row.income_type))}</button></div>`
      : '';
  return `
    <div class="receipt-card__category">
      <label class="receipt-card__label">Тип дохода</label>
      <select class="receipt-income-type-select" data-row-id="${row.id}">
        ${incomeOptions}
      </select>
      ${suggestionBlock}
    </div>`;
}

export function renderExpenseSelect(
  row: BankReceiptPreviewRow,
  flatCategories: FlatCategory[],
  fromMapping: boolean,
  isSuggestion: boolean,
  hintBlock: string,
): string {
  const isManual = fromMapping;
  const defaultCatId = isManual && row.category_id !== null && row.category_id !== undefined ? Number(row.category_id) : (
    isSuggestion && row.category_id ? Number(row.category_id) : (flatCategories[0]?.id ?? 0)
  );
  const hasMappingCat = defaultCatId && !flatCategories.some((c) => Number(c.id) === defaultCatId);
  const opts = hasMappingCat && row.category_name
    ? [{ id: defaultCatId, name: row.category_name }, ...flatCategories]
    : flatCategories;
  const optionsHtml = opts
    .map((c) => `<option value="${c.id}" ${Number(c.id) === defaultCatId ? 'selected' : ''}>${escape(c.name)}</option>`)
    .join('');
  const suggestionBlock =
    isSuggestion && row.category_id && row.category_name
      ? `<div class="receipt-card__suggestion">Предложение: <button type="button" class="receipt-suggestion-btn" data-row-id="${row.id}" data-type="expense" data-value="${row.category_id}">${escape(row.category_name)}</button></div>`
      : '';
  return `
    <div class="receipt-card__category">
      <label class="receipt-card__label">Категория</label>
      <select class="receipt-category-select" data-row-id="${row.id}">
        ${optionsHtml}
      </select>
      ${hintBlock}
      ${suggestionBlock}
    </div>`;
}

export function updateSummary(previewRows: BankReceiptPreviewRow[], selectedIds: Set<string>): void {
  const summaryEl = $('bankReceiptSummary');
  if (summaryEl) {
    const selected = previewRows.filter((r) => r.action === 'create' && selectedIds.has(r.id));
    const totalExpense = selected.filter((r) => r.type !== 'income').reduce((s, r) => s + r.amount, 0);
    const totalIncome = selected.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const parts = [`Выбрано: ${selected.length}`];
    if (totalExpense > 0) parts.push(`расходы: −${totalExpense.toFixed(2)}`);
    if (totalIncome > 0) parts.push(`доходы: +${totalIncome.toFixed(2)}`);
    summaryEl.textContent = parts.join(' · ');
  }

  const btn = $('bankReceiptApplyBtn');
  if (btn) {
    (btn as HTMLButtonElement).disabled = selectedIds.size === 0;
  }
}

export function updateCategoryProgress(
  previewRows: BankReceiptPreviewRow[],
  selectedIds: Set<string>,
  userChangedIds: Set<string>,
): void {
  const el = $('bankReceiptCategoryProgress');
  const btn = $('bankReceiptNextUncategorizedBtn');
  if (!el) return;

  const createRows = previewRows.filter((r) => r.action === 'create' && selectedIds.has(r.id));
  const manualCount = createRows.filter((r) => r.confidence === 'manual' && !userChangedIds.has(r.id)).length;

  if (manualCount > 0) {
    el.textContent = `⚠ Нужно проверить: ${manualCount} из ${createRows.length}`;
    if (btn) btn.style.display = '';
  } else {
    el.textContent = '';
    if (btn) btn.style.display = 'none';
  }
}
