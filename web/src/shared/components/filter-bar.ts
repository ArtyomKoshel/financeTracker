/**
 * Filter Bar Component
 */
import { debounce } from '@/shared/utils/dom';

export interface FilterBarOptions {
  onChange: (filters: FilterValues) => void;
  showSearch?: boolean;
  showImportFilter?: boolean;
  typeOptions?: { value: string; label: string }[];
}

export interface FilterValues {
  year: string;
  month: string;
  type: string;
  search: string;
  source: string;
  tag: string;
}

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const DEFAULT_TYPE_OPTIONS = [
  { value: '', label: 'Все типы' },
  { value: 'income', label: 'Доходы' },
  { value: 'expense', label: 'Расходы' },
  { value: 'savings', label: 'Накопления' },
];

export function createFilterBar(
  container: HTMLElement,
  options: FilterBarOptions
): {
  getFilters: () => FilterValues;
  setTags: (tags: { id: number; name: string; color: string }[]) => void;
  destroy: () => void;
} {
  const { onChange, showSearch = true, showImportFilter = false, typeOptions = DEFAULT_TYPE_OPTIONS } = options;

  let activeSource = '';

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Create HTML
  const wrapper = document.createElement('div');
  wrapper.className = 'filters';
  wrapper.innerHTML = `
    <div class="filter-period">
      <select class="filter-year"></select>
      <select class="filter-month"></select>
    </div>
    <select class="filter-type">
      ${typeOptions.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
    </select>
    ${showSearch ? `
      <div class="filter-search-wrap">
        <input type="text" class="filter-search" placeholder="🔍 Поиск...">
      </div>
    ` : ''}
    <select class="filter-tag"><option value="">🏷 Все теги</option></select>
    ${showImportFilter ? `
      <div class="filter-pills">
        <button type="button" class="filter-pill" data-source="bank_receipt" title="Только из импорта чеков">🧾 Из импорта</button>
        <button type="button" class="filter-pill" data-source="email_parse" title="Только из email-парсинга">📧 Email</button>
      </div>
    ` : ''}
  `;

  container.appendChild(wrapper);

  // Get elements
  const yearSelect = wrapper.querySelector<HTMLSelectElement>('.filter-year')!;
  const monthSelect = wrapper.querySelector<HTMLSelectElement>('.filter-month')!;
  const typeSelect = wrapper.querySelector<HTMLSelectElement>('.filter-type')!;
  const searchInput = wrapper.querySelector<HTMLInputElement>('.filter-search');
  const tagSelect = wrapper.querySelector<HTMLSelectElement>('.filter-tag')!

  // Populate years
  yearSelect.innerHTML = '<option value="all">Все годы</option>';
  for (let y = currentYear; y >= currentYear - 4; y--) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = `${y} год`;
    if (y === currentYear) opt.selected = true;
    yearSelect.appendChild(opt);
  }

  // Populate months
  const populateMonths = () => {
    monthSelect.innerHTML = '';

    if (yearSelect.value === 'all') {
      const allOpt = document.createElement('option');
      allOpt.value = 'all';
      allOpt.textContent = 'Все месяцы';
      allOpt.selected = true;
      monthSelect.appendChild(allOpt);
      monthSelect.disabled = true;
      return;
    }

    monthSelect.disabled = false;

    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = 'Все месяцы';
    monthSelect.appendChild(allOpt);

    const year = parseInt(yearSelect.value);
    const maxMonth = (year === currentYear) ? currentMonth : 11;

    for (let m = maxMonth; m >= 0; m--) {
      const opt = document.createElement('option');
      opt.value = String(m);
      opt.textContent = MONTH_NAMES[m];
      monthSelect.appendChild(opt);
    }
    
    // По умолчанию "Все месяцы"
    allOpt.selected = true;
  };

  populateMonths();

  const getFilters = (): FilterValues => ({
    year: yearSelect.value,
    month: monthSelect.value,
    type: typeSelect.value,
    search: searchInput?.value.toLowerCase().trim() || '',
    source: activeSource,
    tag: tagSelect.value,
  });

  // Handle changes
  const handleChange = () => onChange(getFilters());
  const handleSearchChange = debounce(handleChange, 300);

  const handleYearChange = () => {
    populateMonths();
    handleChange();
  };

  yearSelect.addEventListener('change', handleYearChange);
  monthSelect.addEventListener('change', handleChange);
  typeSelect.addEventListener('change', handleChange);
  tagSelect.addEventListener('change', handleChange);
  searchInput?.addEventListener('input', handleSearchChange);

  if (showImportFilter) {
    wrapper.querySelectorAll<HTMLButtonElement>('.filter-pill[data-source]').forEach(pill => {
      pill.addEventListener('click', () => {
        const src = pill.dataset.source ?? '';
        activeSource = activeSource === src ? '' : src;
        wrapper.querySelectorAll('.filter-pill[data-source]').forEach(p => {
          p.classList.toggle('active', p === pill && activeSource === src);
        });
        handleChange();
      });
    });
  }

  const setTags = (tags: { id: number; name: string; color: string }[]) => {
    const current = tagSelect.value;
    tagSelect.innerHTML = '<option value="">🏷 Все теги</option>';
    tags.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = `🏷 ${t.name}`;
      if (t.name === current) opt.selected = true;
      tagSelect.appendChild(opt);
    });
    tagSelect.style.display = tags.length === 0 ? 'none' : '';
  };

  tagSelect.style.display = 'none';

  return {
    getFilters,
    setTags,
    destroy: () => {
      yearSelect.removeEventListener('change', handleYearChange);
      monthSelect.removeEventListener('change', handleChange);
      typeSelect.removeEventListener('change', handleChange);
      tagSelect.removeEventListener('change', handleChange);
      searchInput?.removeEventListener('input', handleSearchChange);
      wrapper.remove();
    },
  };
}
