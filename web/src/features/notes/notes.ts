import { BasePage } from '@/pages/base';
import { notesService } from '@/features/notes/notes.service';
import { NotesView } from '@/features/notes/NotesView';
import { toast } from '@/shared/components/toast';
import { isEnabled } from '@/shared/utils/features';
import { debounce } from '@/shared/utils/dom';
import { insertAtCursor } from '@/shared/utils/textarea-format';
import type { InsertAction } from '@/shared/utils/textarea-format';
import { LABEL_COLORS, randomLabelColor } from '@/shared/utils/label-colors';
import type { Note, NoteFolder, NoteLabel } from '@/types';

const FORMAT_ACTIONS: Record<string, InsertAction> = {
  code: { type: 'block', template: '```\nкод\n```' },
  'inline-code': { type: 'wrap', before: '`', after: '`', placeholder: 'код' },
  h1: { type: 'line', prefix: '# ' },
  h2: { type: 'line', prefix: '## ' },
  h3: { type: 'line', prefix: '### ' },
  bold: { type: 'wrap', before: '**', after: '**', placeholder: 'текст' },
  italic: { type: 'wrap', before: '*', after: '*', placeholder: 'текст' },
  list: { type: 'line', prefix: '- ' },
  link: { type: 'wrap', before: '[', after: '](url)', placeholder: 'текст' },
};

export class NotesPage extends BasePage {
  private view = new NotesView();
  private notes: Note[] = [];
  private folders: NoteFolder[] = [];
  private labels: NoteLabel[] = [];
  private searchQuery = '';
  private activeFolderId: number | null = null;
  private activeLabelId: number | null = null;
  private suggestAbort: AbortController | null = null;

  constructor() {
    super('notes');
  }

  init(): void {
    super.init();

    if (!isEnabled('notes')) return;

    this.setupSearch();
    this.setupAddButton();
    this.setupNoteModal();
    this.setupModalLabelCreate();
    this.setupListDelegation();
    this.setupDragAndDrop();
    this.setupFoldersCreate();
    this.setupLabelsCreate();
    this.setupSuggestionDelegation();
    this.setupFoldersAndLabelsDelegation();
  }

  async load(): Promise<void> {
    if (!isEnabled('notes')) {
      this.renderDisabled();
      return;
    }

    this.view.showSkeletons();

    try {
      const [notesRes, foldersRes, labelsRes] = await Promise.all([
        notesService.getAll({
          query: this.searchQuery || undefined,
          folder_id: this.activeFolderId ?? undefined,
          label_id: this.activeLabelId ?? undefined,
        }),
        notesService.getFolders(),
        notesService.getLabels(),
      ]);

      this.notes = notesRes;
      this.folders = foldersRes;
      this.labels = labelsRes;

      this.view.renderFolders(this.folders, this.activeFolderId);
      this.view.renderLabelsFilter(this.labels, this.activeLabelId);
      this.view.setSearchQuery(this.searchQuery);
      this.view.render(this.notes, this.folders);

      if (this.notes.length > 0) {
        this.view.renderDetail(this.notes[0]);
      }
    } catch (e) {
      toast.error('Не удалось загрузить заметки');
    }
  }

  private renderDisabled(): void {
    const container = document.getElementById('tab-notes');
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">🔒</span>
          <span>Модуль заметок недоступен</span>
        </div>
      `;
    }
  }

  private setupSearch(): void {
    const input = document.getElementById('notesSearch') as HTMLInputElement | null;
    if (!input) return;

    const handleSearch = debounce((...args: unknown[]) => {
      this.searchQuery = (args[0] as InputEvent & { target: HTMLInputElement }).target.value;
      void this.load();
    }, 400);

    input.addEventListener('input', handleSearch as EventListener);
  }

  private setupAddButton(): void {
    document.getElementById('notesAddBtn')?.addEventListener('click', () => {
      this.view.openNoteModal(undefined, this.folders, this.labels);
    });
  }

  private setupFoldersCreate(): void {
    const addBtn = document.getElementById('notesAddFolderBtn');
    const modal = document.getElementById('folderModal');
    const form = document.getElementById('folderModalForm') as HTMLFormElement | null;
    const closeBtn = document.getElementById('folderModalClose');
    const backdrop = modal?.querySelector('[data-dismiss="folderModal"]');

    addBtn?.addEventListener('click', () => {
      this.view.openFolderModal(this.folders);
    });

    const close = (): void => {
      this.view.closeFolderModal();
    };

    closeBtn?.addEventListener('click', close);
    backdrop?.addEventListener('click', close);

    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('folderModalName') as HTMLInputElement | null;
      const parentSelect = document.getElementById('folderModalParent') as HTMLSelectElement | null;
      const name = nameInput?.value.trim();
      if (!name) return;
      const color = this.getLabelColorFromPicker('folderModalColorPicker') ?? randomLabelColor();
      const parentId = parentSelect?.value ? parseInt(parentSelect.value) : undefined;
      void this.handleCreateFolder({ name, color, parent_id: parentId });
      close();
    });
  }

  private async handleCreateFolder(data: { name: string; color?: string; parent_id?: number }): Promise<void> {
    try {
      await notesService.createFolder(data);
      this.folders = await notesService.getFolders();
      this.view.renderFolders(this.folders, this.activeFolderId);
      this.view.renderFolderOptions(this.folders);
      toast.success('Папка создана');
    } catch {
      toast.error('Не удалось создать папку');
    }
  }

  private setupLabelsCreate(): void {
    const addBtn = document.getElementById('notesAddLabelBtn');
    const form = document.getElementById('notesLabelCreateForm');
    const input = document.getElementById('notesLabelNameInput') as HTMLInputElement | null;
    const createBtn = document.getElementById('notesLabelCreateBtn');
    const cancelBtn = document.getElementById('notesLabelCancelBtn');

    addBtn?.addEventListener('click', () => {
      this.renderLabelColorPicker('notesLabelColorPicker', randomLabelColor());
      form?.style.setProperty('display', 'flex');
      input?.focus();
      input?.select();
    });

    cancelBtn?.addEventListener('click', () => {
      form?.style.setProperty('display', 'none');
      if (input) input.value = '';
    });

    const submit = (): void => {
      const name = input?.value.trim();
      if (!name) return;
      const color = this.getLabelColorFromPicker('notesLabelColorPicker') ?? randomLabelColor();
      void this.handleCreateLabel(name, color);
      form?.style.setProperty('display', 'none');
      if (input) input.value = '';
    };

    createBtn?.addEventListener('click', submit);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
      if (e.key === 'Escape') {
        cancelBtn?.click();
      }
    });
  }

  private renderLabelColorPicker(containerId: string, selectedColor: string): void {
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

  private getLabelColorFromPicker(containerId: string): string | null {
    const active = document.querySelector(`#${containerId} .notes-label-swatch.active`);
    return active?.getAttribute('data-color') ?? null;
  }

  private async handleCreateLabel(name: string, color?: string): Promise<void> {
    try {
      const label = await notesService.createLabel({ name, color: color ?? randomLabelColor() });
      this.labels = [...this.labels, label];
      this.view.renderLabelsFilter(this.labels, this.activeLabelId);
      toast.success('Метка создана');
    } catch {
      toast.error('Не удалось создать метку');
    }
  }

  private setupNoteModal(): void {
    const form = document.getElementById('noteModalForm') as HTMLFormElement | null;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleNoteSubmit();
    });

    document.getElementById('noteModalClose')?.addEventListener('click', () => {
      this.view.closeNoteModal();
      this.view.hideSuggestion();
    });

    document.getElementById('noteModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.view.closeNoteModal();
        this.view.hideSuggestion();
      }
    });

    const contentArea = document.getElementById('noteModalContent') as HTMLTextAreaElement | null;
    if (contentArea) {
      const handleContentChange = debounce((...args: unknown[]) => {
        const value = (args[0] as InputEvent & { target: HTMLTextAreaElement }).target.value.trim();
        void this.handleContentSuggest(value);
      }, 800);
      contentArea.addEventListener('input', handleContentChange as EventListener);
    }
  }

  private setupModalLabelCreate(): void {
    const addBtn = document.getElementById('noteModalAddLabelBtn');
    const form = document.getElementById('noteModalLabelCreateForm');
    const input = document.getElementById('noteModalLabelNameInput') as HTMLInputElement | null;
    const createBtn = document.getElementById('noteModalLabelCreateBtn');
    const cancelBtn = document.getElementById('noteModalLabelCancelBtn');

    addBtn?.addEventListener('click', () => {
      this.renderLabelColorPicker('noteModalLabelColorPicker', randomLabelColor());
      form?.style.setProperty('display', 'flex');
      input?.focus();
      input?.select();
    });

    cancelBtn?.addEventListener('click', () => {
      form?.style.setProperty('display', 'none');
      if (input) input.value = '';
    });

    const submit = async (): Promise<void> => {
      const name = input?.value.trim();
      if (!name) return;
      const color = this.getLabelColorFromPicker('noteModalLabelColorPicker') ?? randomLabelColor();
      try {
        const label = await notesService.createLabel({ name, color });
        this.labels = [...this.labels, label];
        this.view.renderLabelsFilter(this.labels, this.activeLabelId);
        const selectedIds: number[] = [];
        document.querySelectorAll('#noteModalLabels input[type="checkbox"]:checked').forEach((cb) => {
          const v = parseInt((cb as HTMLInputElement).value);
          if (!isNaN(v)) selectedIds.push(v);
        });
        this.view.renderLabelCheckboxes(this.labels, [...selectedIds, label.id]);
        form?.style.setProperty('display', 'none');
        if (input) input.value = '';
        toast.success('Метка создана');
      } catch {
        toast.error('Не удалось создать метку');
      }
    };

    createBtn?.addEventListener('click', () => void submit());
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void submit();
      }
      if (e.key === 'Escape') {
        cancelBtn?.click();
      }
    });
  }

  private setupSuggestionDelegation(): void {
    const modal = document.getElementById('noteModal');
    if (!modal) return;

    modal.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      const aiFormatBtn = target.closest<HTMLButtonElement>('#noteModalAiFormatBtn');
      if (aiFormatBtn) {
        e.preventDefault();
        void this.handleAiFormat();
        return;
      }

      const formatBtn = target.closest<HTMLButtonElement>('.note-format-btn');
      if (formatBtn) {
        e.preventDefault();
        const format = formatBtn.getAttribute('data-format');
        const contentArea = document.getElementById('noteModalContent') as HTMLTextAreaElement | null;
        const action = format ? FORMAT_ACTIONS[format] : null;
        if (contentArea && action) {
          insertAtCursor(contentArea, action);
        }
        return;
      }

      const appendBtn = target.closest<HTMLElement>('[data-suggest-append]');
      if (appendBtn) {
        const noteId = parseInt(appendBtn.getAttribute('data-suggest-append') ?? '0');
        if (noteId) void this.handleAppendToNote(noteId);
        return;
      }

      if (target.closest('[data-suggest-dismiss]')) {
        this.view.hideSuggestion();
      }

      const colorSwatch = target.closest<HTMLElement>('.note-color-swatch');
      if (colorSwatch) {
        colorSwatch.parentElement?.querySelectorAll('.note-color-swatch').forEach(s => s.classList.remove('active'));
        colorSwatch.classList.add('active');
      }
    });
  }

  private setupFoldersAndLabelsDelegation(): void {
    const container = document.getElementById('tab-notes');
    if (!container) return;

    container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      const folderBtn = target.closest<HTMLElement>('.notes-folder-item');
      if (folderBtn) {
        const val = folderBtn.getAttribute('data-folder-id');
        if (val === 'all') this.activeFolderId = null;
        else this.activeFolderId = parseInt(val ?? '0') || null;
        void this.load();
        return;
      }

      const labelBtn = target.closest<HTMLElement>('.notes-label-filter');
      if (labelBtn) {
        const val = labelBtn.getAttribute('data-label-id');
        if (val === 'all') this.activeLabelId = null;
        else this.activeLabelId = parseInt(val ?? '0') || null;
        void this.load();
        return;
      }
    });
  }

  private async handleContentSuggest(content: string): Promise<void> {
    if (this.suggestAbort) {
      this.suggestAbort.abort();
      this.suggestAbort = null;
    }

    if (content.length < 5) {
      this.view.hideSuggestion();
      return;
    }

    const editingId = this.view.getEditingNoteId();
    if (editingId) return;

    this.view.showSuggestionLoading();
    this.suggestAbort = new AbortController();

    try {
      const result = await notesService.suggest(content);
      this.view.showSuggestion(result.suggestions, result.suggested_label);
    } catch {
      this.view.hideSuggestion();
    } finally {
      this.suggestAbort = null;
    }
  }

  private async handleAiFormat(): Promise<void> {
    const contentArea = document.getElementById('noteModalContent') as HTMLTextAreaElement | null;
    const content = contentArea?.value.trim();
    if (!content) {
      toast.error('Введите текст для форматирования');
      return;
    }

    const btn = document.getElementById('noteModalAiFormatBtn') as HTMLButtonElement | null;
    const originalText = btn?.textContent ?? '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '…';
    }

    try {
      const formatted = await notesService.formatContent(content);
      if (contentArea) contentArea.value = formatted;
      toast.success('Контент отформатирован');
    } catch {
      toast.error('Не удалось отформатировать');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  }

  private async handleAppendToNote(noteId: number): Promise<void> {
    const contentArea = document.getElementById('noteModalContent') as HTMLTextAreaElement | null;
    const content = contentArea?.value.trim();
    if (!content) return;

    this.view.closeNoteModal();
    this.view.hideSuggestion();

    try {
      const updated = await notesService.append(noteId, content);
      this.notes = this.notes.map(n => n.id === noteId ? updated : n);
      this.view.render(this.notes);
      this.view.renderDetail(updated);
      toast.success('Добавлено в существующую заметку');
    } catch {
      toast.error('Не удалось добавить к заметке');
    }
  }

  private setupListDelegation(): void {
    const container = document.getElementById('tab-notes');
    if (!container) return;

    container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      const noteCard = target.closest<HTMLElement>('[data-note-id]');
      if (noteCard && !target.closest('[data-note-edit]') && !target.closest('[data-note-delete]') && !target.closest('[data-note-analyze]') && !target.closest('[data-note-pin]') && !target.closest('[data-note-copy]')) {
        const id = parseInt(noteCard.getAttribute('data-note-id') ?? '0');
        if (id) this.handleSelectNote(id);
        return;
      }

      const pinBtn = target.closest<HTMLElement>('[data-note-pin]');
      if (pinBtn) {
        const id = parseInt(pinBtn.getAttribute('data-note-pin') ?? '0');
        if (id) void this.handlePinNote(id);
        return;
      }

      const copyBtn = target.closest<HTMLElement>('[data-note-copy]');
      if (copyBtn) {
        const id = parseInt(copyBtn.getAttribute('data-note-copy') ?? '0');
        if (id) this.handleCopyNote(id);
        return;
      }

      const editBtn = target.closest<HTMLElement>('[data-note-edit]');
      if (editBtn) {
        const id = parseInt(editBtn.getAttribute('data-note-edit') ?? '0');
        if (id) this.handleEditNote(id);
        return;
      }

      const deleteBtn = target.closest<HTMLElement>('[data-note-delete]');
      if (deleteBtn) {
        const id = parseInt(deleteBtn.getAttribute('data-note-delete') ?? '0');
        if (id) void this.handleDeleteNote(id);
        return;
      }

      const analyzeBtn = target.closest<HTMLElement>('[data-note-analyze]');
      if (analyzeBtn) {
        const id = parseInt(analyzeBtn.getAttribute('data-note-analyze') ?? '0');
        if (id) void this.handleAnalyzeNote(id);
        return;
      }
    });

    container.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const noteCard = (e.target as HTMLElement).closest<HTMLElement>('[data-note-id]');
        if (noteCard) {
          const id = parseInt(noteCard.getAttribute('data-note-id') ?? '0');
          if (id) this.handleSelectNote(id);
        }
      }
    });
  }

  private setupDragAndDrop(): void {
    const container = document.getElementById('notesListContainer');
    if (!container) return;

    let dropIndicator: HTMLElement | null = null;
    let draggedId: number | null = null;

    const getOrderedIds = (): number[] => {
      return Array.from(container.querySelectorAll('.note-card-wrapper[data-note-id]'))
        .map(el => parseInt(el.getAttribute('data-note-id') ?? '0'))
        .filter(id => id > 0);
    };

    const showDropIndicator = (beforeEl: Element | null): void => {
      removeDropIndicator();
      dropIndicator = document.createElement('div');
      dropIndicator.className = 'note-drop-indicator';
      if (beforeEl) {
        container.insertBefore(dropIndicator, beforeEl);
      } else {
        container.appendChild(dropIndicator);
      }
    };

    const removeDropIndicator = (): void => {
      dropIndicator?.remove();
      dropIndicator = null;
    };

    container.addEventListener('dragstart', (e) => {
      const wrapper = (e.target as HTMLElement).closest('.note-card-wrapper');
      if (!wrapper) return;
      const id = parseInt(wrapper.getAttribute('data-note-id') ?? '0');
      if (!id) return;
      draggedId = id;
      wrapper.classList.add('dragging');
      e.dataTransfer?.setData('text/plain', String(id));
      e.dataTransfer!.effectAllowed = 'move';
    });

    container.addEventListener('dragover', (e) => {
      if (draggedId === null) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      const wrapper = (e.target as HTMLElement).closest('.note-card-wrapper');
      if (!wrapper || wrapper.classList.contains('dragging')) {
        removeDropIndicator();
        return;
      }
      const rect = wrapper.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const insertBefore = e.clientY < midY;
      showDropIndicator(insertBefore ? wrapper : wrapper.nextElementSibling);
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      const wrapper = (e.target as HTMLElement).closest('.note-card-wrapper');
      const rect = wrapper?.getBoundingClientRect();
      const insertBefore = rect ? e.clientY < rect.top + rect.height / 2 : true;
      removeDropIndicator();
      if (!wrapper || !draggedId) return;
      let ids = getOrderedIds();
      const fromIdx = ids.indexOf(draggedId);
      if (fromIdx < 0) return;
      ids = ids.filter(id => id !== draggedId);
      const targetId = parseInt(wrapper.getAttribute('data-note-id') ?? '0');
      const toIdx = ids.indexOf(targetId);
      const insertIdx = insertBefore ? toIdx : toIdx + 1;
      ids.splice(insertIdx, 0, draggedId);
      void this.handleReorderNotes(ids);
    });

    container.addEventListener('dragend', (e) => {
      (e.target as HTMLElement).closest('.note-card-wrapper')?.classList.remove('dragging');
      draggedId = null;
      removeDropIndicator();
    });

    container.addEventListener('dragleave', (e) => {
      if (!container.contains(e.relatedTarget as Node)) removeDropIndicator();
    });
  }

  private async handleReorderNotes(orderedIds: number[]): Promise<void> {
    const snapshot = [...this.notes];
    const reordered = orderedIds
      .map(id => this.notes.find(n => n.id === id))
      .filter((n): n is Note => n !== null && n !== undefined);
    if (reordered.length !== this.notes.length) return;
    this.notes = reordered;
    this.view.render(this.notes);
    try {
      await notesService.reorder(orderedIds);
      toast.success('Порядок изменён');
    } catch {
      this.notes = snapshot;
      this.view.render(this.notes);
      toast.error('Не удалось изменить порядок');
    }
  }

  private handleSelectNote(id: number): void {
    const note = this.notes.find(n => n.id === id);
    if (note) this.view.renderDetail(note);
  }

  private handleEditNote(id: number): void {
    const note = this.notes.find(n => n.id === id);
    if (note) this.view.openNoteModal(note, this.folders, this.labels);
  }

  private async handlePinNote(id: number): Promise<void> {
    try {
      const updated = await notesService.togglePin(id);
      this.notes = this.notes.map(n => n.id === id ? updated : n);
      this.view.render(this.notes);
      if (this.view.getSelectedNoteId() === id) this.view.renderDetail(updated);
      toast.success(updated.is_pinned ? 'Заметка закреплена' : 'Заметка откреплена');
    } catch {
      toast.error('Не удалось изменить');
    }
  }

  private handleCopyNote(id: number): void {
    const note = this.notes.find(n => n.id === id);
    if (!note) return;
    navigator.clipboard.writeText(note.content).then(() => {
      toast.success('Скопировано');
    }).catch(() => {
      toast.error('Не удалось скопировать');
    });
  }

  private async handleDeleteNote(id: number): Promise<void> {
    const snapshot = [...this.notes];
    this.view.optimisticRemove(id);

    try {
      await notesService.delete(id);
      this.notes = this.notes.filter(n => n.id !== id);
      toast.success('Заметка удалена');
    } catch (e) {
      if ((e as Error & { offlineQueued?: boolean }).offlineQueued) {
        toast.success('Удаление в очереди');
        return;
      }
      this.view.rollback(snapshot);
      this.notes = snapshot;
      toast.error('Не удалось удалить заметку');
    }
  }

  private async handleAnalyzeNote(id: number): Promise<void> {
    this.view.showAnalyzing(id);
    try {
      const result = await notesService.analyze(id);
      this.notes = this.notes.map(n => n.id === id ? result.note : n);
      this.view.renderDetail(result.note);
    } catch {
      toast.error('Не удалось выполнить анализ');
    } finally {
      this.view.hideAnalyzing(id);
    }
  }

  private async handleNoteSubmit(): Promise<void> {
    const data = this.view.getNoteFormData();
    if (!data) {
      toast.error('Заполните заголовок и содержимое');
      return;
    }

    const editingId = this.view.getEditingNoteId();

    if (editingId) {
      await this.handleUpdateNote(editingId, data);
    } else {
      await this.handleCreateNote(data);
    }
  }

  private async handleCreateNote(data: { title: string; content: string; folder_id?: number; is_pinned?: boolean; color?: string; label_ids?: number[] }): Promise<void> {
    const tempNote: Note = {
      id: -Date.now(),
      title: data.title,
      content: data.content,
      labels: [],
      created_at: new Date().toISOString(),
    };

    this.view.closeNoteModal();
    this.view.optimisticAdd(tempNote);
    const snapshot = this.notes.filter(n => n.id !== tempNote.id);

    try {
      const created = await notesService.create(data);
      this.notes = [created, ...snapshot];
      this.view.render(this.notes);
      this.view.renderDetail(created);
      toast.success('Заметка создана');
    } catch (e) {
      if ((e as Error & { offlineQueued?: boolean }).offlineQueued) {
        toast.success('Заметка сохранена офлайн');
        return;
      }
      this.view.rollback(snapshot);
      this.notes = snapshot;
      toast.error('Не удалось создать заметку');
    }
  }

  private async handleUpdateNote(id: number, data: { title: string; content: string; folder_id?: number; is_pinned?: boolean; color?: string; label_ids?: number[] }): Promise<void> {
    const original = this.notes.find(n => n.id === id);
    if (!original) return;

    const optimistic: Note = { ...original, ...data };
    this.view.closeNoteModal();
    this.view.optimisticUpdate(optimistic);

    try {
      const updated = await notesService.update(id, data);
      this.notes = this.notes.map(n => n.id === id ? updated : n);
      this.view.optimisticUpdate(updated);
      toast.success('Заметка обновлена');
    } catch (e) {
      if ((e as Error & { offlineQueued?: boolean }).offlineQueued) {
        toast.success('Обновление сохранено офлайн');
        return;
      }
      this.view.optimisticUpdate(original);
      this.notes = this.notes.map(n => n.id === id ? original : n);
      toast.error('Не удалось обновить заметку');
    }
  }
}

export const notesPage = new NotesPage();
