const DEBUG = () => typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_BANK_RECEIPTS') === '1';
if (typeof window !== 'undefined') {
  (window as any).debugBankReceipts = (on?: boolean) => {
    if (on === true) localStorage.setItem('DEBUG_BANK_RECEIPTS', '1');
    else if (on === false) localStorage.removeItem('DEBUG_BANK_RECEIPTS');
    console.log('[BankReceipts] DEBUG=', DEBUG());
  };
}

import { BasePage } from '@/pages/base';
import { store } from '@/store';
import { toast } from '@/shared/components/toast';
import {
  bankReceiptPreview,
  bankReceiptPreviewCsv,
  bankReceiptApply,
  type BankReceiptPreviewRow,
  type BankReceiptApplyRow,
  type BankReceiptMatchStats,
  type BankReceiptPreviewResponse,
} from '@/api/experimental';
import api from '@/api/client';
import categoryService from '@/shared/services/category.service';
import { $ } from '@/shared/utils/dom';
import { pdfToBase64Images } from '@/shared/utils/pdf-to-images';
import type { CategoryWithSubs } from '@/types';

import * as View from '@/features/receipts/BankReceiptsView';
import { createImportHistory } from '@/features/receipts/receipt-import-history';
import { createSplitEditor } from '@/features/receipts/receipt-split-editor';
import { showSummaryModal } from '@/features/receipts/receipt-summary-modal';
import { createReconciliation } from '@/features/receipts/receipt-reconciliation';
import { createKeyboardHandler } from '@/features/receipts/receipt-keyboard';

declare const TomSelect: any;

type PageImage = { base64: string; mime: string };
type FilterMode = 'all' | 'new' | 'exists' | 'expense' | 'income' | 'no-category';
type GroupMode = 'date' | 'merchant';

const SESSION_KEY = 'bank_receipt_preview_state';

export class ExperimentalBankReceiptsPage extends BasePage {
  private previewRows: BankReceiptPreviewRow[] = [];
  private selectedRows = new Set<string>();
  private pages: PageImage[] | null = null;
  private selectedPagesIndexes = new Set<number>();
  private tomSelectInstances = new Map<string, any>();
  private propagateToastPending = { count: 0, timeout: null as ReturnType<typeof setTimeout> | null };
  private lastPropagateValue = new Map<string, string>();
  private userChangedRows = new Set<string>();
  private activeFilters = new Set<FilterMode>(['all']);
  private collapsedDateGroups = new Set<string>();
  private collapsedMerchantGroups = new Set<string>();
  private existsExpanded = false;
  private matchStats: BankReceiptMatchStats | null = null;
  private groupMode: GroupMode = 'date';
  private fileHash: string | undefined;
  private filename: string | undefined;

  private importHistory: ReturnType<typeof createImportHistory> | null = null;
  private reconciliation: ReturnType<typeof createReconciliation> | null = null;
  private keyboard: ReturnType<typeof createKeyboardHandler> | null = null;
  private activeSplitEditor: { destroy(): void } | null = null;

  constructor() {
    super('bank-receipts');
  }

  init(): void {
    super.init();
    this.setupUpload();
    this.setupButtons();
    this.setupFilters();
    this.setupGroupToggle();
    this.populateAccountSelect();
    this.setupCollapsibleSections();
    this.initComponents();
    this.setupEmailParse();
  }

  private initComponents(): void {
    const historyEl = $('bankReceiptImportsList');
    if (historyEl) this.importHistory = createImportHistory(historyEl);

    const reconEl = $('bankReceiptReconciliation');
    if (reconEl) this.reconciliation = createReconciliation(reconEl);

    this.keyboard = createKeyboardHandler({
      getVisibleCreateRows: () => this.getFilteredRows().filter(r => r.action === 'create'),
      getSelectedIds: () => this.selectedRows,
      getQuickCategories: () => this.getQuickCategories(),
      callbacks: {
        onToggle: (id) => this.toggleRow(id),
        onSetCategory: (id, catId) => this.setCategoryForRow(id, catId),
        onNextUncategorized: () => this.scrollToNextUncategorized(),
        onApply: () => this.confirmAndApply(),
        onEscape: () => {
          if (this.activeSplitEditor) {
            this.activeSplitEditor.destroy();
            this.activeSplitEditor = null;
            return true;
          }
          return false;
        },
      },
    });
  }

  private setupCollapsibleSections(): void {
    document.querySelectorAll<HTMLElement>('.receipt-section-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const targetId = toggle.dataset.target;
        if (!targetId) return;
        const body = document.getElementById(targetId);
        if (!body) return;
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : '';
        const arrow = toggle.querySelector('.receipt-section-arrow');
        if (arrow) arrow.textContent = isOpen ? '▸' : '▾';
      });
    });
  }

  protected onActivate(): void {
    if (this.previewRows.length > 0) this.keyboard?.activate();
  }

  protected onDeactivate(): void {
    this.saveStateToSession();
    this.keyboard?.deactivate();
    this.activeSplitEditor?.destroy();
    this.activeSplitEditor = null;
  }

  // ── Upload & pages ──

  private populateAccountSelect(): void {
    const sel = $<HTMLSelectElement>('bankReceiptAccountSelect');
    if (!sel) return;
    const balanceData = store.get('balance') as { accounts?: Array<{ id: number; name: string; balance: number }> } | null;
    const accounts = balanceData?.accounts ?? [];
    if (accounts.length === 0) { sel.innerHTML = '<option value="">Основной</option>'; return; }
    sel.innerHTML = accounts.map(a => `<option value="${a.id}">${View.escape(a.name)} (${a.balance.toFixed(2)} Br)</option>`).join('');
  }

  private setupUpload(): void {
    const dropZone = $('bankReceiptDropZone');
    const fileInput = $<HTMLInputElement>('bankReceiptFileInput');
    if (!dropZone || !fileInput) return;

    const MAX_FILE_BYTES = 10 * 1024 * 1024;
    const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

    const handleFiles = async (files: FileList | File[]) => {
      const arr = Array.from(files ?? []);
      if (arr.length === 0) return;
      const xlsxFiles = arr.filter(f => /\.(xlsx|xls)$/i.test(f.name));
      if (xlsxFiles.length > 0) {
        const file = xlsxFiles[0];
        if (file.size > MAX_FILE_BYTES) {
          toast.error(`Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ). Максимум — 10 МБ.`);
          return;
        }
        const XLSX = (window as any).XLSX;
        if (!XLSX) { toast.error('Библиотека XLSX ещё не загружена. Подождите секунду и попробуйте снова.'); return; }
        try {
          this.showProgress(true);
          this.updateProgress(10, 'Конвертация XLSX → CSV...');
          const ab = await file.arrayBuffer();
          const wb = XLSX.read(ab, { type: 'array' });
          const sheetName = wb.SheetNames[0];
          const csv: string = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
          this.updateProgress(40, 'Парсинг CSV...');
          const result = await bankReceiptPreviewCsv(csv, file.name.replace(/\.xlsx?$/i, '.csv'));
          this.showProgress(false);
          this.applyPreviewResult(result, file.name);
        } catch (e) { this.showProgress(false); toast.error(e instanceof Error ? e.message : 'Ошибка конвертации XLSX'); }
        return;
      }
      const csvFiles = arr.filter(f => f.name.toLowerCase().endsWith('.csv') || f.type === 'text/csv');
      if (csvFiles.length > 0) {
        const file = csvFiles[0];
        if (file.size > MAX_FILE_BYTES) {
          toast.error(`Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ). Максимум — 10 МБ.`);
          return;
        }
        try {
          this.showProgress(true);
          this.updateProgress(10, 'Парсинг CSV...');
          const text = await file.text();
          const result = await bankReceiptPreviewCsv(text, file.name);
          this.showProgress(false);
          this.applyPreviewResult(result, file.name);
        } catch (e) { this.showProgress(false); toast.error(e instanceof Error ? e.message : 'Ошибка парсинга CSV'); }
        return;
      }
      const valid = arr.filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');
      const oversized = valid.filter(f => f.size > MAX_FILE_BYTES);
      if (oversized.length > 0) {
        toast.error(`Файл(ы) слишком большие: ${oversized.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} МБ)`).join(', ')}. Максимум — 10 МБ на файл.`);
        return;
      }
      const totalSize = valid.reduce((s, f) => s + f.size, 0);
      if (totalSize > MAX_TOTAL_BYTES) {
        toast.error(`Суммарный размер файлов (${(totalSize / 1024 / 1024).toFixed(1)} МБ) превышает лимит 50 МБ.`);
        return;
      }
      if (valid.length < arr.length) toast.error('Поддерживаются изображения (JPEG, PNG, WebP), PDF и CSV');
      if (valid.length === 0) return;
      const allPages: PageImage[] = [];
      try {
        this.showProgress(true);
        for (let i = 0; i < valid.length; i++) {
          const file = valid[i];
          this.updateProgress(Math.round(((i + 0.5) / valid.length) * 100), `Обработка: ${file.name}`);
          const isPdf = file.type === 'application/pdf';
          if (isPdf) {
            const pages = await pdfToBase64Images(file, () => {});
            allPages.push(...pages);
          } else {
            const b64 = await new Promise<string>((res, rej) => {
              const r = new FileReader();
              r.onload = () => { const s = (r.result as string)?.split(',')[1]; res(s ?? ''); };
              r.onerror = rej;
              r.readAsDataURL(file);
            });
            if (b64) allPages.push({ base64: b64, mime: file.type || 'image/jpeg' });
          }
        }
        this.showProgress(false);
        if (allPages.length === 0) { toast.error('Не удалось загрузить файлы'); return; }
        this.pages = allPages;
        this.selectedPagesIndexes = new Set(allPages.map((_, i) => i));
        this.filename = valid.length === 1 ? valid[0].name : `${valid.length} файлов`;
        this.renderPageSelection();
        toast.success(`Загружено ${allPages.length} ${allPages.length === 1 ? 'страница' : allPages.length < 5 ? 'страницы' : 'страниц'} из ${valid.length} ${valid.length === 1 ? 'файла' : 'файлов'}`);
      } catch (e) { this.showProgress(false); toast.error(e instanceof Error ? e.message : 'Ошибка загрузки'); }
    };

    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); const files = e.dataTransfer?.files; if (files?.length) handleFiles(files); });
    fileInput.addEventListener('change', () => { const files = fileInput.files; if (files?.length) handleFiles(files); });
  }

  private setupEmailParse(): void {
    const btn = $('emailParseBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const textarea = $<HTMLTextAreaElement>('emailParseText');
      const statusEl = $('emailParseStatus');
      const resultEl = $('emailParseResult');
      const text = textarea?.value?.trim() ?? '';
      if (!text) { toast.error('Вставьте текст письма'); return; }
      if (statusEl) statusEl.textContent = 'Анализирую...';
      btn.setAttribute('disabled', '');
      try {
        const res = await api.parseEmailText(text);
        if (resultEl) { resultEl.style.display = ''; }
        if (res.count === 0) {
          if (statusEl) statusEl.textContent = 'Транзакции не найдены';
          if (resultEl) resultEl.innerHTML = '<p class="empty-state">AI не нашёл транзакций в тексте. Попробуйте другой текст.</p>';
        } else {
          if (statusEl) statusEl.textContent = `Найдено: ${res.count}`;
          if (resultEl) {
            resultEl.innerHTML = '';
            res.transactions.forEach((t, idx) => {
              const row = document.createElement('div');
              row.style.cssText = 'display:flex;align-items:center;gap:0.5rem;padding:6px 0;border-bottom:1px solid var(--border-color)';
              const color = t.type === 'income' ? 'var(--success-color)' : 'var(--danger-color)';
              const icon  = t.type === 'income' ? '📈' : '📉';
              row.innerHTML =
                `<span style="min-width:90px;font-size:0.85em;color:var(--text-muted)">${t.date}</span>` +
                `<span style="flex:1;font-size:0.9em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${View.escape(t.description)}">${View.escape(t.description) || '—'}</span>` +
                `<span style="font-weight:600;color:${color};white-space:nowrap">${icon} ${t.amount.toFixed(2)} ${t.currency}</span>` +
                `<button type="button" class="btn btn-sm btn-primary ep-create-btn" data-idx="${idx}" style="white-space:nowrap">+ Создать</button>`;
              resultEl.appendChild(row);

              row.querySelector('.ep-create-btn')!.addEventListener('click', async (e) => {
                const createBtn = e.currentTarget as HTMLButtonElement;
                createBtn.disabled = true;
                createBtn.textContent = '...';
                try {
                  await api.createTransaction({
                    type: t.type === 'income' ? 'other' : 'expense',
                    amount: t.amount,
                    currency: t.currency,
                    date: t.date,
                    month: t.date.slice(0, 7),
                    description: t.description,
                    source: 'email_parse',
                  });
                  createBtn.textContent = '✓';
                  createBtn.classList.replace('btn-primary', 'btn-outline');
                  toast.success('Транзакция создана');
                } catch {
                  createBtn.disabled = false;
                  createBtn.textContent = '+ Создать';
                  toast.error('Ошибка создания транзакции');
                }
              });
            });
          }
        }
      } catch (e) {
        if (statusEl) statusEl.textContent = '';
        toast.error(e instanceof Error ? e.message : 'Ошибка AI-парсинга');
      } finally {
        btn.removeAttribute('disabled');
      }
    });
  }

  private setupButtons(): void {
    $('bankReceiptAnalyzeBtn')?.addEventListener('click', () => this.analyze());
    $('bankReceiptApplyBtn')?.addEventListener('click', () => this.confirmAndApply());
    $('bankReceiptSelectAllBtn')?.addEventListener('click', () => this.selectAll());
    $('bankReceiptDeselectAllBtn')?.addEventListener('click', () => this.deselectAll());
    $('bankReceiptNextUncategorizedBtn')?.addEventListener('click', () => this.scrollToNextUncategorized());
  }

  private setupFilters(): void {
    const container = $('bankReceiptFilters');
    if (!container) return;
    container.addEventListener('click', e => {
      const pill = (e.target as HTMLElement).closest('.receipt-filter-pill') as HTMLElement;
      if (!pill) return;
      const filter = pill.dataset.filter as FilterMode;
      if (!filter) return;
      if (filter === 'all') { this.activeFilters.clear(); this.activeFilters.add('all'); }
      else {
        this.activeFilters.delete('all');
        if (this.activeFilters.has(filter)) this.activeFilters.delete(filter);
        else {
          if (filter === 'new' || filter === 'exists') { this.activeFilters.delete('new'); this.activeFilters.delete('exists'); }
          if (filter === 'expense' || filter === 'income') { this.activeFilters.delete('expense'); this.activeFilters.delete('income'); }
          this.activeFilters.add(filter);
        }
        if (this.activeFilters.size === 0) this.activeFilters.add('all');
      }
      container.querySelectorAll('.receipt-filter-pill').forEach(p =>
        (p as HTMLElement).classList.toggle('active', this.activeFilters.has(p.getAttribute('data-filter') as FilterMode)));
      this.renderPreviewTable();
    });
  }

  private setupGroupToggle(): void {
    const btn = $('bankReceiptGroupToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      this.groupMode = this.groupMode === 'date' ? 'merchant' : 'date';
      const icon = btn.querySelector('.receipt-group-toggle__icon');
      const label = btn.querySelector('.receipt-group-toggle__label');
      if (icon) { icon.setAttribute('data-mode', this.groupMode); icon.innerHTML = this.groupMode === 'date' ? '&#128197;' : '&#127970;'; }
      if (label) label.textContent = this.groupMode === 'date' ? 'По дате' : 'По получателю';
      btn.classList.toggle('active', this.groupMode === 'merchant');
      if (this.previewRows.length > 0) this.renderPreviewTable();
    });
  }

  private renderPageSelection(): void {
    const preview = $('bankReceiptImagePreview');
    if (!preview || !this.pages) return;
    if (this.pages.length === 1) {
      preview.innerHTML = `<img src="data:image/png;base64,${this.pages[0].base64}" alt="Превью" style="max-width:100%;max-height:200px;border-radius:8px"><p class="text-muted" style="margin-top:8px;font-size:12px">1 страница</p>`;
      return;
    }
    const pagesHtml = this.pages.map((p, i) =>
      `<label class="receipt-page-thumb ${this.selectedPagesIndexes.has(i) ? 'receipt-page-thumb--selected' : ''}" data-page-idx="${i}"><input type="checkbox" ${this.selectedPagesIndexes.has(i) ? 'checked' : ''} data-page-idx="${i}"><img src="data:image/png;base64,${p.base64}" alt="Стр. ${i + 1}"><span class="receipt-page-num">${i + 1}</span></label>`
    ).join('');
    preview.innerHTML = `<div class="receipt-pages-header"><span class="text-muted">Выберите страницы:</span><div class="receipt-pages-actions"><button type="button" class="btn btn-text btn-sm" id="bankReceiptSelectAllPagesBtn">Все</button><button type="button" class="btn btn-text btn-sm" id="bankReceiptDeselectAllPagesBtn">Ни одной</button></div></div><div class="receipt-pages-grid">${pagesHtml}</div><p class="text-muted" style="margin-top:8px;font-size:12px">Выбрано: ${this.selectedPagesIndexes.size} из ${this.pages.length}</p>`;
    preview.querySelectorAll('.receipt-page-thumb input').forEach(cb => cb.addEventListener('change', e => {
      const idx = parseInt((e.target as HTMLInputElement).dataset.pageIdx ?? '-1', 10);
      if (idx < 0) return;
      if ((e.target as HTMLInputElement).checked) this.selectedPagesIndexes.add(idx); else this.selectedPagesIndexes.delete(idx);
      (e.target as HTMLElement).closest('.receipt-page-thumb')?.classList.toggle('receipt-page-thumb--selected', this.selectedPagesIndexes.has(idx));
      const c = preview.querySelector('.text-muted:last-of-type');
      if (c) c.textContent = `Выбрано: ${this.selectedPagesIndexes.size} из ${this.pages!.length}`;
    }));
    $('bankReceiptSelectAllPagesBtn')?.addEventListener('click', () => { this.pages?.forEach((_, i) => this.selectedPagesIndexes.add(i)); this.renderPageSelection(); });
    $('bankReceiptDeselectAllPagesBtn')?.addEventListener('click', () => { this.selectedPagesIndexes.clear(); this.renderPageSelection(); });
  }

  private showProgress(show: boolean): void { const el = document.getElementById('bankReceiptProgress'); if (el) el.style.display = show ? 'flex' : 'none'; }
  private updateProgress(pct: number, text: string): void {
    const fill = document.getElementById('bankReceiptProgressFill');
    const t = document.getElementById('bankReceiptProgressText');
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    if (t) t.textContent = text;
  }

  // ── Data flow ──

  async load(): Promise<void> {
    if (this.restoreStateFromSession()) {
      this.populateAccountSelect();
      await this.importHistory?.load();
      return;
    }
    const container = $('bankReceiptPreviewTable');
    if (container) container.innerHTML = '<p class="empty-state">Загрузите фото или PDF документ и нажмите «Анализировать»</p>';
    this.previewRows = [];
    this.selectedRows.clear();
    this.pages = null;
    this.selectedPagesIndexes.clear();
    this.userChangedRows.clear();
    this.existsExpanded = false;
    this.matchStats = null;
    this.collapsedMerchantGroups.clear();
    this.populateAccountSelect();
    this.reconciliation?.hide();
    this.keyboard?.deactivate();
    const dupEl = $('bankReceiptDuplicateWarning');
    if (dupEl) dupEl.style.display = 'none';
    await this.importHistory?.load();
  }

  private saveStateToSession(): void {
    if (this.previewRows.length === 0) {
      try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
      return;
    }
    try {
      const state = {
        previewRows: this.previewRows,
        selectedRows: Array.from(this.selectedRows),
        userChangedRows: Array.from(this.userChangedRows),
        activeFilters: Array.from(this.activeFilters),
        collapsedDateGroups: Array.from(this.collapsedDateGroups),
        collapsedMerchantGroups: Array.from(this.collapsedMerchantGroups),
        existsExpanded: this.existsExpanded,
        matchStats: this.matchStats,
        groupMode: this.groupMode,
        fileHash: this.fileHash,
        filename: this.filename,
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
    } catch (e) {
      if (DEBUG()) console.warn('[BankReceipts] saveState failed:', e);
    }
  }

  private restoreStateFromSession(): boolean {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      const state = JSON.parse(raw) as {
        previewRows: BankReceiptPreviewRow[];
        selectedRows: string[];
        userChangedRows: string[];
        activeFilters: FilterMode[];
        collapsedDateGroups: string[];
        collapsedMerchantGroups: string[];
        existsExpanded: boolean;
        matchStats: BankReceiptMatchStats | null;
        groupMode: GroupMode;
        fileHash?: string;
        filename?: string;
      };
      if (!state.previewRows?.length) return false;
      this.previewRows = state.previewRows;
      this.selectedRows = new Set(state.selectedRows ?? []);
      this.userChangedRows = new Set(state.userChangedRows ?? []);
      this.activeFilters = new Set((state.activeFilters ?? ['all']) as FilterMode[]);
      this.collapsedDateGroups = new Set(state.collapsedDateGroups ?? []);
      this.collapsedMerchantGroups = new Set(state.collapsedMerchantGroups ?? []);
      this.existsExpanded = state.existsExpanded ?? false;
      this.matchStats = state.matchStats ?? null;
      this.groupMode = state.groupMode ?? 'date';
      this.fileHash = state.fileHash;
      this.filename = state.filename;
      this.pages = null;
      this.selectedPagesIndexes.clear();
      const previewContainer = document.getElementById('bankReceiptPreviewContainer');
      if (previewContainer) previewContainer.style.display = '';
      View.renderMatchStats(this.matchStats);
      this.renderPreviewTable();
      this.reconciliation?.show();
      this.updateReconciliation();
      this.keyboard?.activate();
      const legendEl = $('bankReceiptQuickCategories');
      if (legendEl) { legendEl.style.display = ''; this.keyboard?.renderLegend(legendEl); }
      const dupEl = $('bankReceiptDuplicateWarning');
      if (dupEl) dupEl.style.display = 'none';
      return true;
    } catch (e) {
      if (DEBUG()) console.warn('[BankReceipts] restoreState failed:', e);
      return false;
    }
  }

  private applyPreviewResult(result: BankReceiptPreviewResponse, filename?: string): void {
    this.fileHash = result.file_hash;
    this.filename = filename ?? this.filename;
    this.matchStats = result.match_stats ?? null;
    const dupEl = $('bankReceiptDuplicateWarning');
    if (result.warning) {
      if (dupEl) { dupEl.textContent = result.warning; dupEl.style.display = ''; }
      toast.error(result.warning);
    } else if (dupEl) dupEl.style.display = 'none';
    const allRows = result.rows.map((r, i) => ({ ...r, id: `r-${i}` }));
    this.previewRows = allRows.filter(r => r.action !== 'skip');
    this.selectedRows = new Set(this.previewRows.filter(r => r.action === 'create').map(r => r.id));
    this.userChangedRows.clear();
    this.existsExpanded = false;
    this.collapsedDateGroups.clear();
    const previewContainer = document.getElementById('bankReceiptPreviewContainer');
    if (previewContainer) previewContainer.style.display = this.previewRows.length ? '' : 'none';
    View.renderMatchStats(this.matchStats);
    this.renderPreviewTable();
    this.reconciliation?.show();
    this.updateReconciliation();
    this.keyboard?.activate();
    const legendEl = $('bankReceiptQuickCategories');
    if (legendEl) { legendEl.style.display = ''; this.keyboard?.renderLegend(legendEl); }
  }

  private async analyze(): Promise<void> {
    if (!this.pages || this.pages.length === 0) { toast.error('Сначала загрузите фото или PDF документ'); return; }
    const selected = [...this.pages.entries()].filter(([i]) => this.selectedPagesIndexes.has(i));
    if (selected.length === 0) { toast.error('Выберите хотя бы одну страницу'); return; }
    try {
      this.showProgress(true);
      this.updateProgress(10, 'Анализ документа...');
      const result = await bankReceiptPreview(selected.map(([, p]) => p), 'image/jpeg', this.filename);
      this.updateProgress(100, 'Готово');
      this.showProgress(false);
      this.applyPreviewResult(result, this.filename);
    } catch (e) { this.showProgress(false); toast.error(e instanceof Error ? e.message : 'Ошибка анализа'); }
  }

  // ── Rendering (delegates to View) ──

  private getFlatCategories() {
    const categories = store.get('categories') as CategoryWithSubs[];
    return categories.flatMap(c => c.subcategories?.length ? [c, ...c.subcategories] : [c]).filter(c => c.is_active !== false);
  }

  private isRowVisible(row: BankReceiptPreviewRow): boolean {
    if (this.activeFilters.has('all')) return true;
    if (this.activeFilters.has('new') && row.action !== 'create') return false;
    if (this.activeFilters.has('exists') && row.action !== 'exists') return false;
    if (this.activeFilters.has('expense') && row.type !== 'expense') return false;
    if (this.activeFilters.has('income') && row.type !== 'income') return false;
    if (this.activeFilters.has('no-category') && (row.action === 'exists' || row.confidence !== 'manual')) return false;
    return true;
  }

  private getFilteredRows(): BankReceiptPreviewRow[] {
    return this.previewRows.filter(r => this.isRowVisible(r));
  }

  private renderPreviewTable(): void {
    const container = $('bankReceiptPreviewTable');
    if (!container) return;
    this.tomSelectInstances.forEach(ts => ts?.destroy());
    this.tomSelectInstances.clear();
    this.lastPropagateValue.clear();

    const flatCats = this.getFlatCategories();
    const visible = this.getFilteredRows();
    const existsRows = visible.filter(r => r.action === 'exists');
    const createRows = visible.filter(r => r.action === 'create');
    let html = '';

    if (existsRows.length > 0 && !this.activeFilters.has('new')) {
      html += `<div class="receipt-exists-collapsed" id="bankReceiptExistsToggle"><span class="receipt-exists-collapsed__icon">✓</span><span class="receipt-exists-collapsed__text">Уже внесено: ${existsRows.length}</span><span class="receipt-exists-collapsed__toggle">${this.existsExpanded ? 'скрыть' : 'показать'}</span></div>`;
      html += `<div class="receipt-exists-expanded ${this.existsExpanded ? 'visible' : ''}" id="bankReceiptExistsItems">`;
      existsRows.forEach(r => { html += View.renderExistsCard(r); });
      html += '</div>';
    }

    html += this.groupMode === 'merchant'
      ? View.renderMerchantGroupedRows(createRows, flatCats, this.selectedRows, this.collapsedMerchantGroups)
      : View.renderDateGroupedRows(createRows, flatCats, this.selectedRows, this.collapsedDateGroups);

    if (!html) html = '<p class="empty-state">Нет данных по выбранному фильтру</p>';
    container.innerHTML = `<div class="receipt-cards">${html}</div>`;
    this.bindCardEvents(container);
    View.updateSummary(this.previewRows, this.selectedRows);
    View.updateCategoryProgress(this.previewRows, this.selectedRows, this.userChangedRows);
    this.updateReconciliation();
  }

  // ── Card events ──

  private bindCardEvents(container: HTMLElement): void {
    container.querySelector('#bankReceiptExistsToggle')?.addEventListener('click', () => {
      this.existsExpanded = !this.existsExpanded;
      container.querySelector('#bankReceiptExistsItems')?.classList.toggle('visible', this.existsExpanded);
      const t = container.querySelector('.receipt-exists-collapsed__toggle');
      if (t) t.textContent = this.existsExpanded ? 'скрыть' : 'показать';
    });

    container.querySelectorAll('[data-toggle-date]').forEach(h => h.addEventListener('click', () => {
      const date = (h as HTMLElement).dataset.toggleDate!;
      const g = h.closest('.receipt-date-group');
      if (this.collapsedDateGroups.has(date)) { this.collapsedDateGroups.delete(date); g?.classList.remove('receipt-date-group--collapsed'); }
      else { this.collapsedDateGroups.add(date); g?.classList.add('receipt-date-group--collapsed'); }
    }));

    container.querySelectorAll('[data-toggle-merchant]').forEach(t => t.addEventListener('click', () => {
      const key = (t as HTMLElement).dataset.toggleMerchant!;
      const g = t.closest('.receipt-merchant-group');
      const collapsed = this.collapsedMerchantGroups.has(key);
      if (collapsed) this.collapsedMerchantGroups.delete(key); else this.collapsedMerchantGroups.add(key);
      g?.classList.toggle('receipt-merchant-group--collapsed', !collapsed);
      const label = t.querySelector('span:last-child');
      if (label) label.textContent = `${!collapsed ? 'показать' : 'скрыть'} ${g?.querySelectorAll('.receipt-merchant-subrow').length ?? 0} транзакций`;
    }));

    this.initTomSelects(container);
    this.bindIncomeSelects(container);
    this.bindCheckboxes(container);
    this.bindAmountInputs(container);
    this.bindSuggestionButtons(container);
    this.bindMerchantGroupSelects(container);
    this.bindSplitButtons(container);
    this.bindRecurringButtons(container);
  }

  private initTomSelects(container: HTMLElement): void {
    container.querySelectorAll<HTMLSelectElement>('.receipt-category-select:not(.receipt-merchant-group-select)').forEach(sel => {
      const rowId = sel.dataset.rowId;
      if (!rowId || typeof TomSelect === 'undefined') return;
      const ts = new TomSelect(sel, {
        create: async (input: string, cb: (opt: { value: string; text: string } | null) => void) => {
          const name = input.trim();
          if (!name) { cb(null); return; }
          try { const cat = await categoryService.create({ name }); cb({ value: String(cat.id), text: cat.name }); store.set('categories', await categoryService.getAll()); }
          catch { toast.error('Ошибка создания категории'); cb(null); }
        },
        sortField: { field: 'text', direction: 'asc' },
        placeholder: 'Поиск или добавление категории...',
      });
      this.tomSelectInstances.set(rowId, ts);
      const row = this.previewRows.find(r => r.id === rowId);
      const fm = row && (row as any).from_mapping && row.category_id !== null;
      const sg = row && !fm && row.category_id && ['similar', 'mapped', 'batch_learned', 'ai_suggested', 'rule'].includes(row.confidence ?? '');
      if (fm || sg) ts.setValue(String(row!.category_id));
      this.lastPropagateValue.set(rowId, String(ts.getValue?.() ?? sel.value ?? ''));
      ts.on('change', (val: string) => {
        const v = String(val ?? '').trim();
        if (!v) return;
        this.userChangedRows.add(rowId);
        const old = this.lastPropagateValue.get(rowId);
        this.lastPropagateValue.set(rowId, v);
        this.propagateToSameMerchant(rowId, 'expense', v, old);
        View.updateCategoryProgress(this.previewRows, this.selectedRows, this.userChangedRows);
      });
    });
  }

  private bindIncomeSelects(container: HTMLElement): void {
    container.querySelectorAll<HTMLSelectElement>('.receipt-income-type-select:not(.receipt-merchant-group-select)').forEach(sel => {
      const rowId = sel.dataset.rowId;
      if (!rowId) return;
      const row = this.previewRows.find(r => r.id === rowId);
      const fm = row && (row as any).from_mapping;
      const sg = row && !fm && ['learned', 'similar', 'batch_learned', 'mapped', 'rule'].includes(row.confidence ?? '');
      const wanted = (fm || sg) && row?.income_type ? String(row.income_type).trim() : null;
      if (wanted && Array.from(sel.options).some(o => o.value === wanted)) sel.value = wanted;
      this.lastPropagateValue.set(rowId, sel.value || 'other');
      sel.addEventListener('change', () => {
        this.userChangedRows.add(rowId);
        const nv = sel.value || 'other';
        const old = this.lastPropagateValue.get(rowId);
        this.lastPropagateValue.set(rowId, nv);
        this.propagateToSameMerchant(rowId, 'income', nv, old);
      });
    });
  }

  private bindCheckboxes(container: HTMLElement): void {
    container.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-row-id]').forEach(cb => cb.addEventListener('change', () => {
      const id = cb.dataset.rowId;
      if (!id) return;
      if (cb.checked) this.selectedRows.add(id); else this.selectedRows.delete(id);
      View.updateSummary(this.previewRows, this.selectedRows);
      this.updateReconciliation();
    }));
    container.querySelectorAll<HTMLInputElement>('.receipt-merchant-group__check-all').forEach(cb => {
      if (cb.dataset.indeterminate === '1') cb.indeterminate = true;
      cb.addEventListener('change', () => {
        const group = cb.closest('.receipt-merchant-group');
        group?.querySelectorAll<HTMLInputElement>('.receipt-merchant-subrow input[type="checkbox"][data-row-id]').forEach(rcb => {
          const id = rcb.dataset.rowId;
          if (id) { rcb.checked = cb.checked; if (cb.checked) this.selectedRows.add(id); else this.selectedRows.delete(id); }
        });
        cb.indeterminate = false;
        View.updateSummary(this.previewRows, this.selectedRows);
        this.updateReconciliation();
      });
    });
    container.querySelectorAll<HTMLInputElement>('.receipt-merchant-subrow input[type="checkbox"][data-row-id]').forEach(cb => cb.addEventListener('change', () => {
      const group = (cb as HTMLElement).closest('.receipt-merchant-group');
      const groupCb = group?.querySelector<HTMLInputElement>('.receipt-merchant-group__check-all');
      if (!groupCb || !group) return;
      const all = group.querySelectorAll<HTMLInputElement>('.receipt-merchant-subrow input[type="checkbox"][data-row-id]');
      const checked = Array.from(all).filter(s => s.checked).length;
      groupCb.checked = checked === all.length;
      groupCb.indeterminate = checked > 0 && checked < all.length;
    }));
  }

  private bindAmountInputs(container: HTMLElement): void {
    container.querySelectorAll<HTMLInputElement>('.receipt-card__amount-input').forEach(input => input.addEventListener('change', () => {
      const row = input.dataset.rowId ? this.previewRows.find(r => r.id === input.dataset.rowId) : null;
      if (row) { const v = parseFloat(input.value); if (!isNaN(v) && v > 0) { row.amount = v; View.updateSummary(this.previewRows, this.selectedRows); this.updateReconciliation(); } }
    }));
  }

  private bindSuggestionButtons(container: HTMLElement): void {
    container.addEventListener('click', e => {
      const btn = (e.target as HTMLElement).closest('.receipt-suggestion-btn');
      if (!btn || !(btn instanceof HTMLElement)) return;
      const { rowId, type, value } = btn.dataset;
      if (!rowId || !type || !value) return;
      this.userChangedRows.add(rowId);
      if (type === 'expense') { const ts = this.tomSelectInstances.get(rowId); if (ts) { ts.setValue(value); this.lastPropagateValue.set(rowId, value); } }
      else { const sel = container.querySelector<HTMLSelectElement>(`.receipt-income-type-select[data-row-id="${rowId}"]`); if (sel) { sel.value = value; this.lastPropagateValue.set(rowId, value); sel.dispatchEvent(new Event('change', { bubbles: true })); } }
      btn.remove();
      View.updateCategoryProgress(this.previewRows, this.selectedRows, this.userChangedRows);
    });
  }

  private bindMerchantGroupSelects(container: HTMLElement): void {
    container.querySelectorAll<HTMLSelectElement>('.receipt-merchant-group-select.receipt-category-select').forEach(sel => {
      const merchantKey = sel.dataset.merchantKey;
      const rowIdsStr = sel.dataset.rowIds;
      if (!merchantKey || !rowIdsStr) return;
      const rowIds = rowIdsStr.split(',');
      const groupTsKey = `group:${merchantKey}`;
      if (typeof TomSelect !== 'undefined') {
        const ts = new TomSelect(sel, {
          create: async (input: string, cb: (opt: { value: string; text: string } | null) => void) => {
            const name = input.trim();
            if (!name) { cb(null); return; }
            try { const cat = await categoryService.create({ name }); cb({ value: String(cat.id), text: cat.name }); store.set('categories', await categoryService.getAll()); }
            catch { toast.error('Ошибка создания категории'); cb(null); }
          },
          sortField: { field: 'text', direction: 'asc' },
          placeholder: 'Категория для группы...',
        });
        this.tomSelectInstances.set(groupTsKey, ts);
        const first = this.previewRows.find(r => rowIds.includes(r.id));
        const fm = first && (first as any).from_mapping && first.category_id !== null;
        const sg = first && !fm && first.category_id && ['similar', 'mapped', 'batch_learned', 'ai_suggested', 'rule'].includes(first.confidence ?? '');
        if (fm || sg) ts.setValue(String(first!.category_id));
        ts.on('change', () => { rowIds.forEach(id => this.userChangedRows.add(id)); View.updateCategoryProgress(this.previewRows, this.selectedRows, this.userChangedRows); });
      }
    });
    container.querySelectorAll<HTMLSelectElement>('.receipt-merchant-group-select.receipt-income-type-select').forEach(sel => {
      const rowIds = sel.dataset.rowIds?.split(',') ?? [];
      sel.addEventListener('change', () => rowIds.forEach(id => this.userChangedRows.add(id)));
    });
  }

  private bindSplitButtons(container: HTMLElement): void {
    container.addEventListener('click', e => {
      const splitBtn = (e.target as HTMLElement).closest('.receipt-split-btn, .receipt-edit-split-btn');
      if (!splitBtn || !(splitBtn instanceof HTMLElement)) return;
      const rowId = splitBtn.dataset.rowId;
      if (!rowId) return;
      const row = this.previewRows.find(r => r.id === rowId);
      const card = container.querySelector<HTMLElement>(`.receipt-card[data-id="${rowId}"]`);
      if (!row || !card) return;
      this.activeSplitEditor?.destroy();
      this.activeSplitEditor = createSplitEditor(card, row, this.getFlatCategories(), {
        onSave: (splits) => { row.splits = splits; this.activeSplitEditor = null; this.renderPreviewTable(); },
        onCancel: () => { this.activeSplitEditor = null; },
      });
    });
  }

  private bindRecurringButtons(container: HTMLElement): void {
    container.addEventListener('click', e => {
      const linkBtn = (e.target as HTMLElement).closest('.receipt-link-recurring-btn');
      if (linkBtn instanceof HTMLElement) {
        const rowId = linkBtn.dataset.rowId;
        const paymentId = parseInt(linkBtn.dataset.paymentId ?? '0');
        const row = rowId ? this.previewRows.find(r => r.id === rowId) : null;
        if (row && paymentId) {
          (row as any).recurring_payment_id = paymentId;
          const banner = linkBtn.closest('.receipt-card__recurring-banner');
          if (banner) banner.innerHTML = `<span style="color:var(--success)">✓ Связано с платежом</span>`;
        }
        return;
      }
      const unlinkBtn = (e.target as HTMLElement).closest('.receipt-unlink-recurring-btn');
      if (unlinkBtn instanceof HTMLElement) {
        const rowId = unlinkBtn.dataset.rowId;
        const row = rowId ? this.previewRows.find(r => r.id === rowId) : null;
        if (row) {
          delete (row as any).recurring_payment_id;
          const banner = unlinkBtn.closest('.receipt-card__recurring-banner');
          if (banner) (banner as HTMLElement).style.display = 'none';
        }
      }
    });
  }

  // ── Selection helpers ──

  private selectAll(): void { this.getFilteredRows().filter(r => r.action === 'create').forEach(r => this.selectedRows.add(r.id)); this.syncCheckboxes(); View.updateSummary(this.previewRows, this.selectedRows); this.updateReconciliation(); }
  private deselectAll(): void { this.selectedRows.clear(); this.syncCheckboxes(); View.updateSummary(this.previewRows, this.selectedRows); this.updateReconciliation(); }
  private syncCheckboxes(): void { $('bankReceiptPreviewTable')?.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-row-id]').forEach(cb => { if (cb.dataset.rowId) cb.checked = this.selectedRows.has(cb.dataset.rowId); }); }

  private toggleRow(id: string): void {
    if (this.selectedRows.has(id)) this.selectedRows.delete(id); else this.selectedRows.add(id);
    this.syncCheckboxes();
    View.updateSummary(this.previewRows, this.selectedRows);
    this.updateReconciliation();
  }

  private setCategoryForRow(rowId: string, catId: number): void {
    const ts = this.tomSelectInstances.get(rowId);
    if (ts) { ts.setValue(String(catId)); this.userChangedRows.add(rowId); this.lastPropagateValue.set(rowId, String(catId)); }
    View.updateCategoryProgress(this.previewRows, this.selectedRows, this.userChangedRows);
  }

  private scrollToNextUncategorized(): void {
    const container = $('bankReceiptPreviewTable');
    if (!container) return;
    const cards = container.querySelectorAll('.receipt-card--needs-attention');
    for (const card of cards) {
      if (card.getBoundingClientRect().top > 100) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); (card as HTMLElement).style.outline = '2px solid var(--warning)'; setTimeout(() => { (card as HTMLElement).style.outline = ''; }, 2000); return; }
    }
    if (cards.length > 0) cards[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  private getQuickCategories(): Array<{ id: number; name: string; icon: string }> {
    const counts = new Map<number, number>();
    this.previewRows.forEach(r => { if (r.action === 'create' && r.category_id && r.type !== 'income') counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1); });
    const allCats = this.getFlatCategories();
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9).map(([id]) => {
      const c = allCats.find(cat => cat.id === id);
      return { id, name: c?.name ?? `#${id}`, icon: c?.icon ?? '📦' };
    });
  }

  private updateReconciliation(): void {
    if (!this.reconciliation || this.previewRows.length === 0) return;
    this.reconciliation.update({
      allRows: this.previewRows.filter(r => r.action === 'create'),
      selectedRows: this.previewRows.filter(r => r.action === 'create' && this.selectedRows.has(r.id)),
    });
  }

  // ── Propagation ──

  private propagateToSameMerchant(changedRowId: string, type: 'expense' | 'income', newVal: string, oldVal?: string): void {
    const changed = this.previewRows.find(r => r.id === changedRowId);
    if (!changed || changed.action !== 'create') return;
    const merchant = (changed.bank_merchant_name ?? '').trim();
    if (!merchant || merchant.toLowerCase().includes('erip')) return;
    const targetKey = View.getPropagationKey(changed);
    const same = this.previewRows.filter(r => r.id !== changedRowId && r.action === 'create' && r.type === type && View.getPropagationKey(r) === targetKey);
    let updated = 0;
    same.forEach(r => {
      if (type === 'expense') {
        const ts = this.tomSelectInstances.get(r.id);
        const cur = ts ? String(ts.getValue?.() ?? '') : '';
        if (ts && (oldVal === '' || cur === (oldVal ?? '')) && cur !== newVal) { ts.setValue(newVal); this.lastPropagateValue.set(r.id, newVal); this.userChangedRows.add(r.id); updated++; }
      } else {
        const sel = document.querySelector<HTMLSelectElement>(`.receipt-income-type-select[data-row-id="${r.id}"]`);
        const cur = sel?.value ?? '';
        if (sel && (oldVal === '' || cur === (oldVal ?? '')) && cur !== newVal) { sel.value = newVal; this.lastPropagateValue.set(r.id, newVal); this.userChangedRows.add(r.id); updated++; }
      }
    });
    if (updated > 0) {
      this.propagateToastPending.count += updated;
      if (this.propagateToastPending.timeout) clearTimeout(this.propagateToastPending.timeout);
      this.propagateToastPending.timeout = setTimeout(() => {
        const n = this.propagateToastPending.count; this.propagateToastPending.count = 0; this.propagateToastPending.timeout = null;
        toast.success(`Применено к ${n} ${n === 1 ? 'строке' : 'строкам'} с тем же получателем`);
      }, 400);
    }
  }

  // ── Apply ──

  private confirmAndApply(): void {
    const selected = this.previewRows.filter(r => r.action === 'create' && this.selectedRows.has(r.id));
    if (selected.length === 0) { toast.error('Выберите транзакции'); return; }
    const accountSel = $<HTMLSelectElement>('bankReceiptAccountSelect');
    const accountName = accountSel?.selectedOptions[0]?.textContent ?? 'дефолтный';

    const rows = selected.map(r => {
      const isIncome = r.type === 'income';
      let categoryId: number | null = null;
      let incomeType = 'other';
      if (this.groupMode === 'merchant') {
        const gv = this.getMerchantGroupValue(r);
        categoryId = gv.categoryId;
        incomeType = gv.incomeType;
      }
      if (!isIncome && !categoryId) { const ts = this.tomSelectInstances.get(r.id); categoryId = ts ? (parseInt(String(ts.getValue?.() ?? ''), 10) || null) : r.category_id; }
      if (isIncome && incomeType === 'other') { const sel = document.querySelector<HTMLSelectElement>(`.receipt-income-type-select[data-row-id="${r.id}"]`); if (sel) incomeType = sel.value || 'other'; }
      return { amount: r.amount, date: View.getValidDate(r.date), type: (r.type || 'expense') as 'expense' | 'income', category_id: isIncome ? null : categoryId, splits: r.splits };
    });

    showSummaryModal({
      rows,
      accountName,
      totalCount: selected.length,
      onConfirm: () => this.apply(),
      onCancel: () => {},
    });
  }

  private getMerchantGroupValue(row: BankReceiptPreviewRow): { categoryId: number | null; incomeType: string } {
    const key = View.getPropagationKey(row);
    if (row.type === 'income') {
      const sel = document.querySelector<HTMLSelectElement>(`.receipt-merchant-group-select.receipt-income-type-select[data-merchant-key="${CSS.escape(key)}"]`);
      return { categoryId: null, incomeType: sel?.value || 'other' };
    }
    const ts = this.tomSelectInstances.get(`group:${key}`);
    if (ts) return { categoryId: parseInt(String(ts.getValue?.() ?? ''), 10) || null, incomeType: 'other' };
    return { categoryId: null, incomeType: 'other' };
  }

  private async apply(): Promise<void> {
    const rows: BankReceiptApplyRow[] = [];
    this.previewRows.forEach(row => {
      if (row.action !== 'create' || !this.selectedRows.has(row.id)) return;
      const isIncome = row.type === 'income';
      let categoryId: number | null = null;
      let incomeType = 'other';

      if (this.groupMode === 'merchant') {
        const gv = this.getMerchantGroupValue(row);
        categoryId = gv.categoryId; incomeType = gv.incomeType;
        if (!isIncome && !categoryId) { const ts = this.tomSelectInstances.get(row.id); categoryId = ts ? (parseInt(String(ts.getValue?.() ?? ''), 10) || null) : row.category_id; }
        if (isIncome && incomeType === 'other') { const sel = document.querySelector<HTMLSelectElement>(`.receipt-income-type-select[data-row-id="${row.id}"]`); if (sel) incomeType = sel.value || 'other'; }
      } else {
        if (isIncome) { const sel = document.querySelector<HTMLSelectElement>(`.receipt-income-type-select[data-row-id="${row.id}"]`); incomeType = sel?.value || 'other'; }
        else { const ts = this.tomSelectInstances.get(row.id); categoryId = ts ? (parseInt(String(ts.getValue?.() ?? ''), 10) || null) : row.category_id; }
      }
      if (!isIncome && !categoryId) return;
      const dateInput = document.querySelector<HTMLInputElement>(`.receipt-date-input[data-row-id="${row.id}"]`);
      const date = dateInput?.value && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.value) ? dateInput.value : View.getValidDate(row.date);
      const amountInput = document.querySelector<HTMLInputElement>(`.receipt-card__amount-input[data-row-id="${row.id}"]`);
      const amount = amountInput ? (parseFloat(amountInput.value) || row.amount) : row.amount;
      const bankMerchant = (row.bank_merchant_name?.trim() || row.raw_description?.trim() || 'Неизвестно').slice(0, 255);

      const fromRule = row.confidence === 'rule' && (row as BankReceiptPreviewRow).rule_id;
      rows.push({
        id: row.id, amount, date, type: row.type || 'expense', category_id: categoryId,
        income_type: isIncome ? incomeType : undefined,
        bank_merchant_name: bankMerchant, raw_description: row.raw_description ?? undefined,
        selected: true, action: 'create', user_confirmed: this.userChangedRows.has(row.id),
        recurring_payment_id: (row as any).recurring_payment_id ?? undefined,
        splits: row.splits,
        currency: (row as { currency?: string }).currency ?? 'BYN',
        ...(fromRule && {
          rule_id: (row as BankReceiptPreviewRow).rule_id,
          suggested_category_id: (row as BankReceiptPreviewRow).category_id ?? undefined,
          suggested_income_type: isIncome ? ((row as BankReceiptPreviewRow).income_type ?? undefined) : undefined,
        }),
      });
    });

    if (rows.length === 0) { toast.error('Нечего применять'); return; }
    const btn = $('bankReceiptApplyBtn') as HTMLButtonElement;
    if (btn) { btn.disabled = true; btn.textContent = 'Подождите...'; }
    const accountId = $<HTMLSelectElement>('bankReceiptAccountSelect')?.value ? parseInt($<HTMLSelectElement>('bankReceiptAccountSelect')!.value, 10) : undefined;

    try {
      const result = await bankReceiptApply(rows, accountId, {
        filename: this.filename, file_hash: this.fileHash, pages_count: this.pages?.length,
      });
      toast.success(`Создано ${result.created} транзакций${result.import_id ? ` (импорт #${result.import_id})` : ''}`);
      this.pages = null; this.previewRows = []; this.selectedRows.clear(); this.userChangedRows.clear();
      try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
      await this.load();
      if (window.app?.switchTab) window.app.switchTab('operations');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка применения');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Применить'; }
    }
  }

  destroy(): void {
    this.keyboard?.destroy();
    this.importHistory?.destroy();
    this.reconciliation?.destroy();
    this.activeSplitEditor?.destroy();
    this.tomSelectInstances.forEach(ts => ts?.destroy());
    this.tomSelectInstances.clear();
  }
}

export const experimentalBankReceiptsPage = new ExperimentalBankReceiptsPage();
