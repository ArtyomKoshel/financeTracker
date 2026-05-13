/**
 * Searchable Select Component (Select2-like)
 */

export interface SelectOption {
  value: string;
  label: string;
  icon?: string;
}

export interface SearchableSelectOptions {
  placeholder?: string;
  emptyText?: string;
  onChange?: (value: string) => void;
}

export function createSearchableSelect(
  container: HTMLElement,
  options: SearchableSelectOptions = {}
): {
  setOptions: (items: SelectOption[]) => void;
  getValue: () => string;
  setValue: (value: string) => void;
  destroy: () => void;
} {
  const { placeholder = 'Выберите...', emptyText = 'Ничего не найдено', onChange } = options;

  let allOptions: SelectOption[] = [];
  let selectedValue = '';
  let isOpen = false;

  // Create wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'ss-wrapper';
  wrapper.innerHTML = `
    <div class="ss-control">
      <span class="ss-value">${placeholder}</span>
      <span class="ss-arrow">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M2 4 L6 8 L10 4" stroke="currentColor" stroke-width="2" fill="none"/>
        </svg>
      </span>
    </div>
    <div class="ss-menu">
      <div class="ss-search-wrap">
        <input type="text" class="ss-search" placeholder="Поиск..." autocomplete="off">
      </div>
      <div class="ss-list"></div>
    </div>
  `;

  container.appendChild(wrapper);

  const control = wrapper.querySelector<HTMLElement>('.ss-control')!;
  const valueEl = wrapper.querySelector<HTMLElement>('.ss-value')!;
  const menu = wrapper.querySelector<HTMLElement>('.ss-menu')!;
  const searchInput = wrapper.querySelector<HTMLInputElement>('.ss-search')!;
  const list = wrapper.querySelector<HTMLElement>('.ss-list')!;

  // Update display
  const updateDisplay = () => {
    const option = allOptions.find(o => o.value === selectedValue);
    if (option && option.value) {
      valueEl.innerHTML = option.icon 
        ? `<span class="ss-icon">${option.icon}</span>${option.label}`
        : option.label;
      valueEl.classList.remove('ss-placeholder');
    } else {
      valueEl.textContent = placeholder;
      valueEl.classList.add('ss-placeholder');
    }
  };

  // Render list
  const renderList = (filter = '') => {
    const filterLower = filter.toLowerCase();
    const filtered = filter
      ? allOptions.filter(o => o.value && o.label.toLowerCase().includes(filterLower))
      : allOptions.filter(o => o.value); // exclude empty placeholder

    if (!filtered.length) {
      list.innerHTML = `<div class="ss-no-results">${emptyText}</div>`;
      return;
    }

    list.innerHTML = filtered.map(o => `
      <div class="ss-item ${o.value === selectedValue ? 'ss-selected' : ''}" data-value="${o.value}">
        ${o.icon ? `<span class="ss-icon">${o.icon}</span>` : ''}
        <span class="ss-label">${o.label}</span>
      </div>
    `).join('');
  };

  // Open menu
  const openMenu = () => {
    if (isOpen) return;
    isOpen = true;
    wrapper.classList.add('ss-open');
    searchInput.value = '';
    renderList();
    // Delay focus to prevent immediate close
    setTimeout(() => searchInput.focus(), 10);
  };

  // Close menu
  const closeMenu = () => {
    if (!isOpen) return;
    isOpen = false;
    wrapper.classList.remove('ss-open');
  };

  // Select value
  const select = (value: string) => {
    selectedValue = value;
    updateDisplay();
    closeMenu();
    onChange?.(value);
  };

  // Handle control click
  control.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  // Handle list click (event delegation)
  list.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest('.ss-item') as HTMLElement;
    if (item) {
      e.stopPropagation();
      select(item.dataset.value || '');
    }
  });

  // Handle search
  searchInput.addEventListener('input', () => {
    renderList(searchInput.value);
  });

  // Handle keyboard
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenu();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const firstItem = list.querySelector('.ss-item') as HTMLElement;
      if (firstItem) {
        select(firstItem.dataset.value || '');
      }
    }
  });

  // Close on outside click
  const handleOutsideClick = (e: MouseEvent) => {
    if (!wrapper.contains(e.target as Node)) {
      closeMenu();
    }
  };
  document.addEventListener('click', handleOutsideClick);

  // Prevent menu clicks from closing
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  return {
    setOptions: (items: SelectOption[]) => {
      allOptions = items;
      renderList();
      // Keep current selection if still valid
      if (selectedValue && !items.find(o => o.value === selectedValue)) {
        selectedValue = '';
      }
      updateDisplay();
    },
    getValue: () => selectedValue,
    setValue: (value: string) => {
      selectedValue = value;
      updateDisplay();
    },
    destroy: () => {
      document.removeEventListener('click', handleOutsideClick);
      wrapper.remove();
    },
  };
}
