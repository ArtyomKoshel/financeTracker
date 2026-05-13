/**
 * Category Form Modal Component
 */
import { createPicker, EMOJI_SET, COLOR_SET } from '@/shared/components/picker';
import type { CategoryWithSubs } from '@/types';

export interface CategoryFormData {
  id?: number;
  name: string;
  icon: string;
  color: string;
  parent_id?: number;
}

export interface CategoryFormOptions {
  onSubmit: (data: CategoryFormData) => Promise<void>;
  onClose?: () => void;
}

export function createCategoryFormModal(options: CategoryFormOptions): {
  open: (categories: CategoryWithSubs[], editCategory?: CategoryWithSubs) => void;
  close: () => void;
  destroy: () => void;
} {
  let editId: number | undefined;
  let emojiPicker: ReturnType<typeof createPicker> | null = null;
  let colorPicker: ReturnType<typeof createPicker> | null = null;

  // Create modal HTML
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">Добавить категорию</h3>
        <button class="btn-close modal-close" aria-label="Закрыть">×</button>
      </div>
      <form class="category-form">
        <div class="form-group">
          <label>Название</label>
          <input type="text" class="cat-name" required>
        </div>
        <div class="form-group">
          <label>Родительская категория</label>
          <select class="cat-parent">
            <option value="">-- Корневая категория --</option>
          </select>
        </div>
        <div class="form-group">
          <label>Иконка</label>
          <div class="emoji-picker-container"></div>
        </div>
        <div class="form-group">
          <label>Цвет</label>
          <div class="color-picker-container"></div>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Сохранить</button>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  // Get elements
  const form = modal.querySelector<HTMLFormElement>('.category-form')!;
  const closeBtn = modal.querySelector<HTMLButtonElement>('.modal-close')!;
  const titleEl = modal.querySelector<HTMLElement>('.modal-title')!;
  const nameInput = modal.querySelector<HTMLInputElement>('.cat-name')!;
  const parentSelect = modal.querySelector<HTMLSelectElement>('.cat-parent')!;
  const emojiContainer = modal.querySelector<HTMLElement>('.emoji-picker-container')!;
  const colorContainer = modal.querySelector<HTMLElement>('.color-picker-container')!;

  // Initialize pickers
  emojiPicker = createPicker(emojiContainer, {
    items: EMOJI_SET,
    type: 'emoji',
    defaultValue: '📦',
    showSearch: true,
    showTabs: true,
  });

  colorPicker = createPicker(colorContainer, {
    items: COLOR_SET,
    type: 'color',
    defaultValue: '#6C5CE7',
  });

  // Populate parent categories
  const populateParents = (categories: CategoryWithSubs[]) => {
    parentSelect.innerHTML = '<option value="">-- Корневая категория --</option>';
    for (const cat of categories) {
      if (cat.is_active && cat.id !== editId) {
        const opt = document.createElement('option');
        opt.value = String(cat.id);
        opt.textContent = cat.icon ? `${cat.icon} ${cat.name}` : cat.name;
        parentSelect.appendChild(opt);
      }
    }
  };

  // Close modal
  const close = () => {
    modal.classList.remove('show');
    form.reset();
    editId = undefined;
    emojiPicker?.setValue('📦');
    colorPicker?.setValue('#6C5CE7');
    options.onClose?.();
  };

  // Open modal
  const open = (categories: CategoryWithSubs[], editCategory?: CategoryWithSubs) => {
    populateParents(categories);

    if (editCategory) {
      editId = editCategory.id;
      titleEl.textContent = 'Редактировать категорию';
      nameInput.value = editCategory.name;
      emojiPicker?.setValue(editCategory.icon || '📦');
      colorPicker?.setValue(editCategory.color || '#6C5CE7');
      // Hide parent select when editing
      (parentSelect.closest('.form-group') as HTMLElement).style.display = 'none';
    } else {
      editId = undefined;
      titleEl.textContent = 'Добавить категорию';
      (parentSelect.closest('.form-group') as HTMLElement).style.display = 'block';
    }

    modal.classList.add('show');
  };

  // Handle submit
  const onSubmit = async (e: Event) => {
    e.preventDefault();

    const data: CategoryFormData = {
      id: editId,
      name: nameInput.value,
      icon: emojiPicker?.getValue() || '📦',
      color: colorPicker?.getValue() || '#6C5CE7',
      parent_id: parentSelect.value ? parseInt(parentSelect.value) : undefined,
    };

    await options.onSubmit(data);
    close();
  };

  // Handle overlay click
  const onOverlayClick = (e: Event) => {
    if (e.target === modal) {
      close();
    }
  };

  // Event listeners
  form.addEventListener('submit', onSubmit);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', onOverlayClick);

  return {
    open,
    close,
    destroy: () => {
      form.removeEventListener('submit', onSubmit);
      closeBtn.removeEventListener('click', close);
      modal.removeEventListener('click', onOverlayClick);
      emojiPicker?.destroy();
      colorPicker?.destroy();
      modal.remove();
    },
  };
}
