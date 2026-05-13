import { $, setHTML } from '@/shared/utils/dom';
import { showSkeletons, emptyStateHtml } from '@/shared/components/ui';
import { parseMarkdown, highlightText } from '@/shared/utils/markdown';
import { DEFAULT_LABEL_COLOR, LABEL_COLORS, randomLabelColor } from '@/shared/utils/label-colors';
import type { Note, NoteFolder, NoteLabel, NoteSuggestion } from '@/types';

export interface NotesViewCallbacks {
  onSelect: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onAnalyze: (id: number) => void;
  onPin: (id: number) => void;
  onCopy: (id: number) => void;
  onReorder: (orderedIds: number[]) => void;
  onFolderSelect: (folderId: number | null) => void;
  onLabelSelect: (labelId: number | null) => void;
  onSearch: (query: string) => void;
  onAdd: () => void;
}

export class NotesView {
  private notes: Note[] = [];
  private folders: NoteFolder[] = [];
  private selectedId: number | null = null;
  private searchQuery = '';

  callbacks: NotesViewCallbacks = {
    onSelect: () => {},
    onEdit: () => {},
    onDelete: () => {},
    onAnalyze: () => {},
    onPin: () => {},
    onCopy: () => {},
    onReorder: () => {},
    onFolderSelect: () => {},
    onLabelSelect: () => {},
    onSearch: () => {},
    onAdd: () => {},
  };

  showSkeletons(): void {
    showSkeletons([
      { id: 'notesListContainer', count: 4 },
    ]);
    setHTML($('notesDetailContainer'), '');
  }

  renderFolders(folders: NoteFolder[], activeFolderId: number | null): void {
    this.folders = folders;
    const container = $('notesFoldersList');
    if (!container) return;

    const allActive = activeFolderId === null;

    let html = `<button type="button" class="notes-folder-item ${allActive ? 'active' : ''}" data-folder-id="all">📁 Все</button>`;
    for (const f of folders) {
      const isActive = activeFolderId === f.id;
      const depth = this.getFolderDepth(folders, f);
      const styleParts: string[] = [];
      if (f.color) styleParts.push(`--folder-color:${f.color}`);
      if (depth > 0) {
        styleParts.push(`padding-left:${12 + depth * 20}px`);
      }
      const styleAttr = styleParts.length > 0 ? ` style="${styleParts.join('; ')}"` : '';
      const nestIcon = depth > 0 ? '<span class="notes-folder-nest-icon" aria-hidden="true">▸</span>' : '';
      html += `<button type="button" class="notes-folder-item notes-folder-item-colored ${isActive ? 'active' : ''}" data-folder-id="${f.id}"${styleAttr}>${nestIcon}<span class="notes-folder-circle"></span>📁 ${this.escapeHtml(f.name)}</button>`;
    }
    container.innerHTML = html;
  }

  private getFolderDepth(folders: NoteFolder[], folder: NoteFolder): number {
    const pid = folder.parent_id;
    if (pid === null || pid === undefined) return 0;
    const parentId = pid;
    if (isNaN(parentId)) return 0;
    const parent = folders.find(f => Number(f.id) === parentId);
    return parent ? 1 + this.getFolderDepth(folders, parent) : 0;
  }

  private getFolderPath(folderId: number, folders: NoteFolder[]): NoteFolder[] {
    const fid = typeof folderId === 'number' ? folderId : parseInt(String(folderId), 10);
    const folder = folders.find(f => Number(f.id) === fid);
    if (!folder) return [];
    const parentPath = folder.parent_id ? this.getFolderPath(folder.parent_id, folders) : [];
    return [...parentPath, folder];
  }

  renderLabelsFilter(labels: NoteLabel[], activeLabelId: number | null): void {
    const container = $('notesLabelsFilter');
    if (!container) return;

    let html = `<button type="button" class="notes-label-filter ${activeLabelId === null ? 'active' : ''}" data-label-id="all">Все</button>`;
    for (const l of labels) {
      const isActive = activeLabelId === l.id;
      html += `<button type="button" class="notes-label-filter ${isActive ? 'active' : ''}" data-label-id="${l.id}" style="--label-color:${l.color ?? DEFAULT_LABEL_COLOR}">${this.escapeHtml(l.name)}</button>`;
    }
    container.innerHTML = html;
  }

  renderFolderOptions(folders: NoteFolder[], selectedFolderId?: number | null): void {
    const select = $<HTMLSelectElement>('noteModalFolder');
    if (!select) return;
    select.innerHTML = '<option value="">Без папки</option>';
    for (const f of folders) {
      const opt = document.createElement('option');
      opt.value = String(f.id);
      const depth = this.getFolderDepth(folders, f);
      opt.textContent = (depth > 0 ? '　'.repeat(depth) : '') + f.name;
      if (f.id === selectedFolderId) opt.selected = true;
      select.appendChild(opt);
    }
  }

  renderLabelCheckboxes(labels: NoteLabel[], selectedIds: number[]): void {
    const container = $('noteModalLabels');
    if (!container) return;
    container.innerHTML = labels.map(l => {
      const isSelected = selectedIds.includes(l.id);
      return `<label class="note-modal-label-chip" style="--chip-color:${l.color ?? DEFAULT_LABEL_COLOR}">
        <input type="checkbox" value="${l.id}" ${isSelected ? 'checked' : ''} class="sr-only">
        <span class="note-modal-label-chip-text">${this.escapeHtml(l.name)}</span>
      </label>`;
    }).join('');
  }

  renderColorPicker(selectedColor?: string | null): void {
    const container = $('noteModalColorPicker');
    if (!container) return;
    const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16'];
    container.innerHTML = colors.map(c => `
      <button type="button" class="note-color-swatch ${c === selectedColor ? 'active' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>
    `).join('');
  }

  setSearchQuery(query: string): void {
    this.searchQuery = query;
  }

  render(notes: Note[], folders?: NoteFolder[]): void {
    this.notes = notes;
    if (folders) this.folders = folders;
    const container = $('notesListContainer');
    if (!container) return;

    if (notes.length === 0) {
      container.innerHTML = emptyStateHtml('Нет заметок. Создайте первую!', {
        icon: '📝',
        cta: 'Добавить заметку',
        ctaTrigger: 'notesAddBtn',
      });
      return;
    }

    container.innerHTML = notes.map(note => this.renderNoteCard(note, this.folders)).join('');
  }

  renderDetail(note: Note): void {
    this.selectedId = note.id;
    const container = $('notesDetailContainer');
    if (!container) return;

    const labelsHtml = note.labels.length > 0
      ? `<div class="note-labels">${note.labels.map(l => `<span class="note-label" style="background:${l.color ?? DEFAULT_LABEL_COLOR}">${l.name}</span>`).join('')}</div>`
      : '';

    const titleHtml = this.searchQuery
      ? highlightText(this.escapeHtml(note.title), this.searchQuery)
      : this.escapeHtml(note.title);

    const hasAnalysis = (note.action_items?.length ?? 0) > 0 || (note.suggested_labels?.length ?? 0) > 0 || !!note.analyzed_at;
    const analysisHtml = hasAnalysis && (note.action_items?.length ?? 0) > 0
      ? this.renderSavedAnalysis(note.action_items ?? [], note.summary ?? '')
      : '';
    const summaryHtml = note.summary && !analysisHtml
      ? `<div class="note-summary"><strong>Резюме:</strong> ${this.searchQuery ? highlightText(this.escapeHtml(note.summary), this.searchQuery) : this.escapeHtml(note.summary)}</div>`
      : '';

    const updatedStr = note.updated_at
      ? `<span class="note-date">Изменено: ${this.formatDate(note.updated_at)}</span>`
      : '';

    container.innerHTML = `
      <div class="note-detail">
        <div class="note-detail-header">
          <h2 class="note-detail-title">${titleHtml}</h2>
          <div class="note-detail-actions">
            <button type="button" class="btn btn-sm btn-outline" data-note-pin="${note.id}" title="${note.is_pinned ? 'Открепить' : 'Закрепить'}">${note.is_pinned ? '📌' : '📍'}</button>
            <button type="button" class="btn btn-sm btn-outline" data-note-copy="${note.id}" title="Копировать">📋</button>
            <button type="button" class="btn btn-sm btn-outline" data-note-analyze="${note.id}" title="${hasAnalysis ? 'Перегенерировать анализ' : 'AI-анализ'}">${hasAnalysis ? '🔄 Перегенерировать' : '✨ Анализ'}</button>
            <button type="button" class="btn btn-sm btn-outline" data-note-edit="${note.id}" title="Редактировать">✏️</button>
            <button type="button" class="btn btn-sm btn-danger-outline" data-note-delete="${note.id}" title="Удалить">🗑️</button>
          </div>
        </div>
        ${summaryHtml}
        ${analysisHtml}
        <div id="noteSearchNav" class="note-search-nav" style="display:none">
          <span class="note-search-nav-counter"></span>
          <button type="button" class="btn btn-sm btn-outline" id="noteSearchPrev" title="Предыдущее (Shift+Enter)">◀</button>
          <button type="button" class="btn btn-sm btn-outline" id="noteSearchNext" title="Следующее (Enter)">▶</button>
        </div>
        <div class="note-detail-content">${this.formatContent(note.content)}</div>
        <div class="note-detail-footer">
          <div class="note-detail-meta">
            <span class="note-date">${this.formatDate(note.created_at)}</span>
            ${updatedStr}
          </div>
          ${labelsHtml}
        </div>
      </div>
    `;

    this.setupSearchNav(container);
    this.highlightSelected(note.id);
  }

  private setupSearchNav(container: HTMLElement): void {
    const marks = container.querySelectorAll('.search-highlight');
    const nav = container.querySelector('#noteSearchNav');
    const counter = container.querySelector('.note-search-nav-counter');
    const prevBtn = container.querySelector('#noteSearchPrev');
    const nextBtn = container.querySelector('#noteSearchNext');

    if (!nav || marks.length === 0) return;

    (nav as HTMLElement).style.display = 'flex';
    let currentIdx = 0;

    const updateCounter = (): void => {
      if (counter) counter.textContent = `${currentIdx + 1} из ${marks.length}`;
      marks.forEach((m, i) => m.classList.toggle('search-highlight-current', i === currentIdx));
      marks[currentIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    prevBtn?.addEventListener('click', () => {
      currentIdx = (currentIdx - 1 + marks.length) % marks.length;
      updateCounter();
    });
    nextBtn?.addEventListener('click', () => {
      currentIdx = (currentIdx + 1) % marks.length;
      updateCounter();
    });

    const keyHandler = (e: Event): void => {
      const ke = e as KeyboardEvent;
      if (ke.key !== 'Enter' || ke.ctrlKey || ke.metaKey) return;
      const target = ke.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable]')) return;
      if (!nav || (nav as HTMLElement).style.display === 'none') return;
      e.preventDefault();
      currentIdx = ke.shiftKey ? (currentIdx - 1 + marks.length) % marks.length : (currentIdx + 1) % marks.length;
      updateCounter();
    };
    const parent = container.closest('#tab-notes');
    const prevCleanup = (container as HTMLElement & { _searchNavKeyCleanup?: () => void })._searchNavKeyCleanup;
    prevCleanup?.();
    (container as HTMLElement & { _searchNavKeyCleanup?: () => void })._searchNavKeyCleanup = () => {
      parent?.removeEventListener('keydown', keyHandler);
    };
    parent?.addEventListener('keydown', keyHandler);

    updateCounter();
  }

  showDetailSkeleton(): void {
    const container = $('notesDetailContainer');
    if (!container) return;
    container.innerHTML = `
      <div class="skeleton-block" style="height:32px;width:60%;margin-bottom:12px"></div>
      <div class="skeleton-block" style="height:16px;width:100%;margin-bottom:8px"></div>
      <div class="skeleton-block" style="height:16px;width:90%;margin-bottom:8px"></div>
      <div class="skeleton-block" style="height:16px;width:80%"></div>
    `;
  }

  private renderSavedAnalysis(actionItems: string[], summary: string): string {
    const itemsHtml = actionItems.length > 0
      ? `<ul class="note-action-items">${actionItems.map(item => `<li>${this.escapeHtml(item)}</li>`).join('')}</ul>`
      : '';
    const summaryPart = summary ? `<div class="note-analysis-summary">${this.escapeHtml(summary)}</div>` : '';
    return `<div class="note-analysis"><div class="note-analysis-header">✨ AI-анализ</div>${summaryPart}${itemsHtml}</div>`;
  }

  showAnalysisResult(summary: string, actionItems: string[]): void {
    const container = $('notesDetailContainer');
    if (!container) return;

    const existing = container.querySelector('.note-analysis');
    if (existing) existing.remove();

    const analysisEl = document.createElement('div');
    analysisEl.className = 'note-analysis';

    const itemsHtml = actionItems.length > 0
      ? `<ul class="note-action-items">${actionItems.map(item => `<li>${this.escapeHtml(item)}</li>`).join('')}</ul>`
      : '';

    analysisEl.innerHTML = `
      <div class="note-analysis-header">✨ AI-анализ</div>
      <div class="note-analysis-summary">${this.escapeHtml(summary)}</div>
      ${itemsHtml}
    `;

    const detailContent = container.querySelector('.note-detail-content');
    if (detailContent) {
      detailContent.insertAdjacentElement('beforebegin', analysisEl);
    } else {
      container.appendChild(analysisEl);
    }
  }

  showAnalyzing(noteId: number): void {
    const btn = document.querySelector<HTMLButtonElement>(`[data-note-analyze="${noteId}"]`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Анализирую...';
    }
  }

  hideAnalyzing(noteId: number): void {
    const btn = document.querySelector<HTMLButtonElement>(`[data-note-analyze="${noteId}"]`);
    if (btn) {
      btn.disabled = false;
      btn.textContent = '✨ Анализ';
    }
  }

  optimisticAdd(note: Note): void {
    this.notes = [note, ...this.notes];
    this.render(this.notes);
    this.renderDetail(note);
  }

  optimisticUpdate(note: Note): void {
    this.notes = this.notes.map(n => n.id === note.id ? note : n);
    this.render(this.notes);
    if (this.selectedId === note.id) {
      this.renderDetail(note);
    }
  }

  optimisticRemove(id: number): void {
    this.notes = this.notes.filter(n => n.id !== id);
    this.render(this.notes);
    if (this.selectedId === id) {
      setHTML($('notesDetailContainer'), '');
      this.selectedId = null;
    }
  }

  rollback(notes: Note[]): void {
    this.notes = notes;
    this.render(notes);
  }

  openNoteModal(note?: Note, folders: NoteFolder[] = [], labels: NoteLabel[] = []): void {
    const modal = $('noteModal');
    if (!modal) return;

    const titleInput = $<HTMLInputElement>('noteModalTitle');
    const contentInput = $<HTMLTextAreaElement>('noteModalContent');
    const idInput = $<HTMLInputElement>('noteModalId');
    const heading = $('noteModalHeading');

    if (note) {
      if (titleInput) titleInput.value = note.title;
      if (contentInput) contentInput.value = note.content;
      if (idInput) idInput.value = String(note.id);
      if (heading) heading.textContent = 'Редактировать заметку';
      this.renderFolderOptions(folders, note.folder_id ?? null);
      this.renderLabelCheckboxes(labels, note.labels.map(l => l.id));
      this.renderColorPicker(note.color ?? null);
    } else {
      if (titleInput) titleInput.value = '';
      if (contentInput) contentInput.value = '';
      if (idInput) idInput.value = '';
      if (heading) heading.textContent = 'Новая заметка';
      this.renderFolderOptions(folders, null);
      this.renderLabelCheckboxes(labels, []);
      this.renderColorPicker(null);
    }

    modal.classList.add('show');
    titleInput?.focus();
  }

  closeNoteModal(): void {
    $('noteModal')?.classList.remove('show');
  }

  openFolderModal(folders: NoteFolder[]): void {
    const modal = $('folderModal');
    const nameInput = $<HTMLInputElement>('folderModalName');
    const parentSelect = $<HTMLSelectElement>('folderModalParent');
    if (!modal || !parentSelect) return;

    parentSelect.innerHTML = '<option value="">Корневая</option>';
    for (const f of folders) {
      const opt = document.createElement('option');
      opt.value = String(f.id);
      const depth = this.getFolderDepth(folders, f);
      opt.textContent = (depth > 0 ? '　'.repeat(depth) : '') + f.name;
      parentSelect.appendChild(opt);
    }

    if (nameInput) nameInput.value = '';
    this.renderFolderColorPicker('folderModalColorPicker', randomLabelColor());
    modal.classList.add('show');
    nameInput?.focus();
  }

  closeFolderModal(): void {
    $('folderModal')?.classList.remove('show');
  }

  renderFolderColorPicker(containerId: string, selectedColor: string): void {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = LABEL_COLORS.map(
      (c) => `<button type="button" class="notes-label-swatch ${c === selectedColor ? 'active' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`
    ).join('');
    container.onclick = (e) => {
      const swatch = (e.target as HTMLElement).closest('.notes-label-swatch');
      if (swatch) {
        container.querySelectorAll('.notes-label-swatch').forEach((s) => s.classList.remove('active'));
        swatch.classList.add('active');
      }
    };
  }

  getNoteFormData(): { title: string; content: string; folder_id?: number; is_pinned?: boolean; color?: string; label_ids?: number[] } | null {
    const title = $<HTMLInputElement>('noteModalTitle')?.value.trim();
    const content = $<HTMLTextAreaElement>('noteModalContent')?.value.trim();
    if (!title || !content) return null;

    const folderVal = $<HTMLSelectElement>('noteModalFolder')?.value;
    const folder_id = folderVal ? parseInt(folderVal) : undefined;

    const labelIds: number[] = [];
    $('noteModalLabels')?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked').forEach(cb => {
      const v = parseInt(cb.value);
      if (!isNaN(v)) labelIds.push(v);
    });

    const colorEl = $('noteModalColorPicker')?.querySelector('.note-color-swatch.active');
    const color = colorEl?.getAttribute('data-color') ?? undefined;

    return { title, content, folder_id, label_ids: labelIds.length > 0 ? labelIds : undefined, color };
  }

  getSelectedNoteId(): number | null {
    return this.selectedId;
  }

  getEditingNoteId(): number | null {
    const val = $<HTMLInputElement>('noteModalId')?.value;
    return val ? parseInt(val) : null;
  }

  showSuggestion(suggestions: NoteSuggestion[], suggestedLabel?: string): void {
    const container = $('noteSuggestion');
    if (!container) return;

    if (suggestions.length === 0 && !suggestedLabel) {
      this.hideSuggestion();
      return;
    }

    let html = '';

    if (suggestions.length > 0) {
      const s = suggestions[0];
      html += `
        <div class="note-suggestion-match">
          <div class="note-suggestion-icon">✨</div>
          <div class="note-suggestion-body">
            <div class="note-suggestion-text">Похоже на заметку <strong>${this.escapeHtml(s.note_title)}</strong></div>
            <div class="note-suggestion-preview">${this.escapeHtml(s.preview)}</div>
            <div class="note-suggestion-actions">
              <button type="button" class="btn btn-sm btn-primary" data-suggest-append="${s.note_id}">Добавить туда</button>
              <button type="button" class="btn btn-sm btn-outline" data-suggest-dismiss>Создать новую</button>
            </div>
          </div>
        </div>
      `;
    }

    if (suggestedLabel) {
      html += `
        <div class="note-suggestion-label">
          <span class="note-suggestion-icon">🏷️</span>
          <span>Предлагаю метку: <strong>${this.escapeHtml(suggestedLabel)}</strong></span>
        </div>
      `;
    }

    container.innerHTML = html;
    container.style.display = 'block';
  }

  hideSuggestion(): void {
    const container = $('noteSuggestion');
    if (container) {
      container.innerHTML = '';
      container.style.display = 'none';
    }
  }

  showSuggestionLoading(): void {
    const container = $('noteSuggestion');
    if (!container) return;
    container.innerHTML = '<div class="note-suggestion-loading"><span class="note-suggestion-icon">⏳</span> Ищу похожие заметки...</div>';
    container.style.display = 'block';
  }

  private getNoteAccentColor(note: Note): string | undefined {
    if (note.folder?.color) return note.folder.color;
    if (note.labels[0]) return note.labels[0].color ?? DEFAULT_LABEL_COLOR;
    return note.color;
  }

  private renderNoteCard(note: Note, folders: NoteFolder[]): string {
    const isSelected = note.id === this.selectedId;
    const pinnedClass = note.is_pinned ? ' note-card--pinned' : '';
    const accentColor = this.getNoteAccentColor(note);
    const colorStyle = accentColor ? ` style="--note-accent:${this.escapeHtml(accentColor)}"` : '';
    const labelsHtml = note.labels.length > 0
      ? `<div class="note-card-labels">${note.labels.map(l => `<span class="note-label-badge" style="--label-color:${l.color ?? DEFAULT_LABEL_COLOR}">${this.escapeHtml(l.name)}</span>`).join('')}</div>`
      : '';
    const pinIcon = note.is_pinned ? '<span class="note-card-pin">📌</span>' : '';
    const preview = note.content.length > 80 ? note.content.slice(0, 80) + '…' : note.content;
    const titleHtml = this.searchQuery
      ? highlightText(this.escapeHtml(note.title), this.searchQuery)
      : this.escapeHtml(note.title);
    const previewHtml = this.searchQuery
      ? highlightText(this.escapeHtml(preview), this.searchQuery)
      : this.escapeHtml(preview);

    const folderPath = note.folder_id ? this.getFolderPath(note.folder_id, folders) : [];
    const spineHtml = folderPath.length > 0
      ? `<div class="note-card-spine" style="${accentColor ? `--note-accent:${accentColor}` : ''}">${folderPath.map((f, i) => {
          const bg = f.color ?? accentColor ?? '#6366f1';
          return `<span class="note-card-spine-item" style="background:${bg};color:#fff">${this.escapeHtml(f.name)}</span>${i < folderPath.length - 1 ? '<span class="note-card-spine-sep">›</span>' : ''}`;
        }).join('')}</div>`
      : '';

    const accentClass = accentColor ? ' note-card--accent' : '';
    return `
      <div class="note-card-wrapper" data-note-id="${note.id}" role="button" tabindex="0" draggable="true">
        ${spineHtml}
        <div class="note-card ${isSelected ? 'active' : ''}${pinnedClass}${accentClass}"${colorStyle}>
          <div class="note-card-header">
            <span class="note-card-title">${pinIcon}${titleHtml}</span>
          </div>
          <div class="note-card-preview">${previewHtml}</div>
          <div class="note-card-footer">
            <div class="note-card-date">${this.formatDate(note.created_at)}</div>
            ${labelsHtml}
          </div>
        </div>
      </div>
    `;
  }

  private highlightSelected(id: number): void {
    document.querySelectorAll('.note-card-wrapper').forEach(wrapper => {
      const isActive = wrapper.getAttribute('data-note-id') === String(id);
      wrapper.querySelector('.note-card')?.classList.toggle('active', isActive);
    });
  }

  private formatContent(text: string): string {
    return parseMarkdown(text, this.searchQuery);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
