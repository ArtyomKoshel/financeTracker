/**
 * Reusable Picker component for emojis, colors, etc.
 */

interface PickerItem {
  value: string;
  label?: string;
  category?: string;
}

interface PickerOptions {
  items: PickerItem[];
  type: 'emoji' | 'color';
  defaultValue?: string;
  onChange?: (value: string) => void;
  showSearch?: boolean;
  showTabs?: boolean;
}

/**
 * Create a picker element
 */
export function createPicker(container: HTMLElement, options: PickerOptions): {
  getValue: () => string;
  setValue: (value: string) => void;
  destroy: () => void;
} {
  const { items, type, defaultValue, onChange, showSearch = false, showTabs = false } = options;
  
  let currentValue = defaultValue || items[0]?.value || '';
  
  // Create wrapper
  const wrapper = document.createElement('div');
  wrapper.className = `picker-wrapper picker-wrapper-${type}`;
  
  // Search input (for emoji)
  let searchInput: HTMLInputElement | null = null;
  if (type === 'emoji' && showSearch) {
    searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'picker-search';
    searchInput.placeholder = 'Поиск...';
    wrapper.appendChild(searchInput);
  }
  
  // Tabs (for emoji categories)
  let tabsContainer: HTMLDivElement | null = null;
  let activeTab = 'all';
  if (type === 'emoji' && showTabs) {
    tabsContainer = document.createElement('div');
    tabsContainer.className = 'picker-tabs';
    
    const tabs = [
      { id: 'all', icon: '🔍', name: 'Все' },
      { id: 'food', icon: '🍔', name: 'Еда' },
      { id: 'shopping', icon: '🛒', name: 'Покупки' },
      { id: 'home', icon: '🏠', name: 'Дом' },
      { id: 'transport', icon: '🚗', name: 'Транспорт' },
      { id: 'health', icon: '💊', name: 'Здоровье' },
      { id: 'entertainment', icon: '🎬', name: 'Развлечения' },
      { id: 'tech', icon: '📱', name: 'Техника' },
      { id: 'finance', icon: '💰', name: 'Финансы' },
      { id: 'other', icon: '📦', name: 'Другое' },
    ];
    
    tabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.className = `picker-tab${tab.id === activeTab ? ' active' : ''}`;
      btn.dataset.tab = tab.id;
      btn.title = tab.name;
      btn.textContent = tab.icon;
      tabsContainer!.appendChild(btn);
    });
    
    wrapper.appendChild(tabsContainer);
  }
  
  // Create picker container
  const picker = document.createElement('div');
  picker.className = `picker picker-${type}`;
  
  // Render items function
  const renderItems = (filter?: string, category?: string) => {
    picker.innerHTML = '';
    
    let filteredItems = items;
    
    // Filter by search
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      filteredItems = filteredItems.filter(item => 
        item.value.includes(lowerFilter) || 
        item.label?.toLowerCase().includes(lowerFilter) ||
        item.category?.toLowerCase().includes(lowerFilter)
      );
    }
    
    // Filter by category
    if (category && category !== 'all') {
      filteredItems = filteredItems.filter(item => item.category === category);
    }
    
    filteredItems.forEach(item => {
      const el = document.createElement('span');
      el.className = 'picker-item';
      el.dataset.value = item.value;
      
      if (type === 'emoji') {
        el.textContent = item.value;
        if (item.label) el.title = item.label;
      } else if (type === 'color') {
        el.style.backgroundColor = item.value;
      }
      
      if (item.value === currentValue) {
        el.classList.add('selected');
      }
      
      picker.appendChild(el);
    });
  };
  
  renderItems();
  wrapper.appendChild(picker);
  
  // Handle search
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderItems(searchInput!.value, activeTab);
    });
  }
  
  // Handle tabs
  if (tabsContainer) {
    tabsContainer.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('picker-tab')) {
        activeTab = target.dataset.tab || 'all';
        tabsContainer!.querySelectorAll('.picker-tab').forEach(t => t.classList.remove('active'));
        target.classList.add('active');
        renderItems(searchInput?.value, activeTab);
      }
    });
  }
  
  // Handle click
  const handleClick = (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('picker-item')) {
      const value = target.dataset.value;
      if (value) {
        currentValue = value;
        picker.querySelectorAll('.picker-item').forEach(el => el.classList.remove('selected'));
        target.classList.add('selected');
        onChange?.(value);
      }
    }
  };
  
  picker.addEventListener('click', handleClick);
  container.appendChild(wrapper);
  
  return {
    getValue: () => currentValue,
    setValue: (value: string) => {
      currentValue = value;
      picker.querySelectorAll('.picker-item').forEach(el => {
        el.classList.toggle('selected', (el as HTMLElement).dataset.value === value);
      });
    },
    destroy: () => {
      picker.removeEventListener('click', handleClick);
      wrapper.remove();
    },
  };
}

// Predefined sets with categories
export const EMOJI_SET: PickerItem[] = [
  // Food & Drinks
  { value: '🍔', label: 'Бургер', category: 'food' },
  { value: '🍕', label: 'Пицца', category: 'food' },
  { value: '🍜', label: 'Лапша', category: 'food' },
  { value: '🥗', label: 'Салат', category: 'food' },
  { value: '☕', label: 'Кофе', category: 'food' },
  { value: '🍺', label: 'Пиво', category: 'food' },
  { value: '🍷', label: 'Вино', category: 'food' },
  { value: '🧁', label: 'Кекс', category: 'food' },
  { value: '🍳', label: 'Завтрак', category: 'food' },
  { value: '🥐', label: 'Круассан', category: 'food' },
  { value: '🍣', label: 'Суши', category: 'food' },
  { value: '🥩', label: 'Мясо', category: 'food' },
  
  // Shopping
  { value: '🛒', label: 'Продукты', category: 'shopping' },
  { value: '👕', label: 'Одежда', category: 'shopping' },
  { value: '👗', label: 'Платье', category: 'shopping' },
  { value: '👟', label: 'Обувь', category: 'shopping' },
  { value: '💄', label: 'Косметика', category: 'shopping' },
  { value: '🎁', label: 'Подарок', category: 'shopping' },
  { value: '📦', label: 'Посылка', category: 'shopping' },
  { value: '🛍️', label: 'Шоппинг', category: 'shopping' },
  { value: '💍', label: 'Украшения', category: 'shopping' },
  { value: '👜', label: 'Сумка', category: 'shopping' },
  { value: '🧥', label: 'Верхняя одежда', category: 'shopping' },
  { value: '👒', label: 'Шляпа', category: 'shopping' },
  
  // Home
  { value: '🏠', label: 'Дом', category: 'home' },
  { value: '🛋️', label: 'Мебель', category: 'home' },
  { value: '🔧', label: 'Ремонт', category: 'home' },
  { value: '💡', label: 'Электричество', category: 'home' },
  { value: '🚰', label: 'Вода', category: 'home' },
  { value: '🧹', label: 'Уборка', category: 'home' },
  { value: '🪴', label: 'Растения', category: 'home' },
  { value: '🛏️', label: 'Спальня', category: 'home' },
  { value: '🔥', label: 'Отопление', category: 'home' },
  { value: '🧺', label: 'Стирка', category: 'home' },
  { value: '🚿', label: 'Душ', category: 'home' },
  { value: '🏡', label: 'Дача', category: 'home' },
  
  // Transport
  { value: '🚗', label: 'Авто', category: 'transport' },
  { value: '🚌', label: 'Автобус', category: 'transport' },
  { value: '⛽', label: 'Бензин', category: 'transport' },
  { value: '✈️', label: 'Самолёт', category: 'transport' },
  { value: '🚕', label: 'Такси', category: 'transport' },
  { value: '🚲', label: 'Велосипед', category: 'transport' },
  { value: '🛴', label: 'Самокат', category: 'transport' },
  { value: '🚇', label: 'Метро', category: 'transport' },
  { value: '🚂', label: 'Поезд', category: 'transport' },
  { value: '🛵', label: 'Мотоцикл', category: 'transport' },
  { value: '🚢', label: 'Корабль', category: 'transport' },
  { value: '🅿️', label: 'Парковка', category: 'transport' },
  
  // Health & Sports
  { value: '💊', label: 'Лекарства', category: 'health' },
  { value: '🏥', label: 'Больница', category: 'health' },
  { value: '🧘', label: 'Йога', category: 'health' },
  { value: '🏋️', label: 'Спортзал', category: 'health' },
  { value: '💪', label: 'Фитнес', category: 'health' },
  { value: '🏃', label: 'Бег', category: 'health' },
  { value: '⚽', label: 'Футбол', category: 'health' },
  { value: '🎾', label: 'Теннис', category: 'health' },
  { value: '🩺', label: 'Врач', category: 'health' },
  { value: '💉', label: 'Прививка', category: 'health' },
  { value: '🦷', label: 'Стоматолог', category: 'health' },
  { value: '👁️', label: 'Окулист', category: 'health' },
  
  // Entertainment
  { value: '🎬', label: 'Кино', category: 'entertainment' },
  { value: '🎮', label: 'Игры', category: 'entertainment' },
  { value: '🎵', label: 'Музыка', category: 'entertainment' },
  { value: '📚', label: 'Книги', category: 'entertainment' },
  { value: '🎨', label: 'Искусство', category: 'entertainment' },
  { value: '🎭', label: 'Театр', category: 'entertainment' },
  { value: '🎪', label: 'Цирк', category: 'entertainment' },
  { value: '🎯', label: 'Хобби', category: 'entertainment' },
  { value: '🎤', label: 'Концерт', category: 'entertainment' },
  { value: '🎧', label: 'Подкасты', category: 'entertainment' },
  { value: '📺', label: 'ТВ', category: 'entertainment' },
  { value: '🎰', label: 'Казино', category: 'entertainment' },
  
  // Tech
  { value: '📱', label: 'Телефон', category: 'tech' },
  { value: '💻', label: 'Ноутбук', category: 'tech' },
  { value: '🖥️', label: 'Компьютер', category: 'tech' },
  { value: '🎧', label: 'Наушники', category: 'tech' },
  { value: '📷', label: 'Камера', category: 'tech' },
  { value: '🔌', label: 'Электроника', category: 'tech' },
  { value: '📡', label: 'Интернет', category: 'tech' },
  { value: '🌐', label: 'Сеть', category: 'tech' },
  { value: '⌚', label: 'Часы', category: 'tech' },
  { value: '🖨️', label: 'Принтер', category: 'tech' },
  { value: '💾', label: 'Хранение', category: 'tech' },
  { value: '🔋', label: 'Батарея', category: 'tech' },
  
  // Finance
  { value: '💰', label: 'Деньги', category: 'finance' },
  { value: '💵', label: 'Наличные', category: 'finance' },
  { value: '💳', label: 'Карта', category: 'finance' },
  { value: '🏦', label: 'Банк', category: 'finance' },
  { value: '📊', label: 'Инвестиции', category: 'finance' },
  { value: '📈', label: 'Рост', category: 'finance' },
  { value: '💸', label: 'Расходы', category: 'finance' },
  { value: '🪙', label: 'Монеты', category: 'finance' },
  { value: '🧾', label: 'Чек', category: 'finance' },
  { value: '💹', label: 'Биржа', category: 'finance' },
  { value: '🏧', label: 'Банкомат', category: 'finance' },
  { value: '💲', label: 'Доллар', category: 'finance' },
  
  // Other
  { value: '💇', label: 'Парикмахер', category: 'other' },
  { value: '💅', label: 'Маникюр', category: 'other' },
  { value: '🔑', label: 'Ключи', category: 'other' },
  { value: '📅', label: 'Календарь', category: 'other' },
  { value: '⭐', label: 'Избранное', category: 'other' },
  { value: '❤️', label: 'Любовь', category: 'other' },
  { value: '🎉', label: 'Праздник', category: 'other' },
  { value: '🐕', label: 'Собака', category: 'other' },
  { value: '🐈', label: 'Кошка', category: 'other' },
  { value: '👶', label: 'Ребёнок', category: 'other' },
  { value: '🎓', label: 'Образование', category: 'other' },
  { value: '✈️', label: 'Путешествие', category: 'other' },
  { value: '🏖️', label: 'Отпуск', category: 'other' },
  { value: '🎂', label: 'День рождения', category: 'other' },
  { value: '💒', label: 'Свадьба', category: 'other' },
  { value: '⚰️', label: 'Похороны', category: 'other' },
];

export const COLOR_SET: PickerItem[] = [
  '#6C5CE7', '#E74C3C', '#00B894', '#F39C12', '#3498DB',
  '#9B59B6', '#1ABC9C', '#E91E63', '#FF5722', '#607D8B',
].map(color => ({ value: color }));

// Add styles
const style = document.createElement('style');
style.textContent = `
  .picker-wrapper {
    background: var(--bg-input, #252542);
    border-radius: 8px;
    overflow: hidden;
  }
  
  .picker-search {
    width: 100%;
    padding: 10px 12px;
    border: none;
    border-bottom: 1px solid var(--border-color, #333);
    background: transparent;
    color: var(--text, #fff);
    font-size: 14px;
    outline: none;
  }
  
  .picker-search::placeholder {
    color: var(--text-secondary, #888);
  }
  
  .picker-tabs {
    display: flex;
    gap: 2px;
    padding: 8px;
    border-bottom: 1px solid var(--border-color, #333);
    overflow-x: auto;
    scrollbar-width: none;
  }
  
  .picker-tabs::-webkit-scrollbar {
    display: none;
  }
  
  .picker-tab {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1.1rem;
    transition: background 0.15s;
  }
  
  .picker-tab:hover {
    background: var(--bg, #1a1a2e);
  }
  
  .picker-tab.active {
    background: var(--primary, #6C5CE7);
  }
  
  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 12px;
    max-height: 200px;
    overflow-y: auto;
  }
  
  .picker-item {
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
    border: 2px solid transparent;
  }
  
  .picker-item:hover {
    transform: scale(1.15);
  }
  
  .picker-item.selected {
    transform: scale(1.1);
  }
  
  /* Emoji picker */
  .picker-emoji .picker-item {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
    border-radius: 6px;
  }
  
  .picker-emoji .picker-item.selected {
    background: var(--primary, #6C5CE7);
    border-color: var(--primary, #6C5CE7);
  }
  
  /* Color picker */
  .picker-color .picker-item {
    width: 32px;
    height: 32px;
    border-radius: 50%;
  }
  
  .picker-color .picker-item.selected {
    border-color: white;
    box-shadow: 0 0 0 2px var(--primary, #6C5CE7);
  }
`;
document.head.appendChild(style);
