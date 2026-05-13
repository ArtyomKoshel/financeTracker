# Desktop Layout Implementation

## Обзор

Реализован базовый desktop layout для Finance Tracker с адаптивным дизайном:
- **Mobile (< 768px)**: Bottom tabs (существующий функционал)
- **Desktop (≥ 768px)**: Sidebar слева + main content справа

## Архитектура

### Компоненты

#### 1. Sidebar Component (`web/src/components/sidebar.ts`)
- **Тип**: UI Component (kebab-case naming)
- **Ответственность**: Только рендер навигации, без API-вызовов
- **Интеграция**: 
  - Использует Store для определения активной вкладки (`currentTab`)
  - Подписывается на изменения `experimentalFeatures` для динамического обновления меню
  - Подписывается на `me` для отображения имени пользователя
- **Экспорт**: `export const sidebar = new Sidebar()`

#### 2. App Integration (`web/src/app.ts`)
- Импорт: `import { sidebar } from '@/components/sidebar'`
- Инициализация в `setupSidebar()`:
  - Установка user info из Store
  - Регистрация logout handler
  - Регистрация admin handler (если `localStorage.user_is_admin === '1'`)

### CSS Стили (`web/public/static/style.css`)

#### Переменные
```css
:root {
    --sidebar-width: 240px;
    --desktop-breakpoint: 768px;
}
```

#### Sidebar Styles
- `.sidebar`: Fixed position, скрыт на mobile (`display: none`)
- `.sidebar-header`: Логотип + имя пользователя
- `.sidebar-nav`: Навигационные элементы
- `.sidebar-item`: Кнопки навигации с hover/active состояниями
- `.sidebar-footer`: Кнопки выхода и админки

#### Desktop Media Query (`@media (min-width: 768px)`)
```css
.sidebar { display: flex; }
.app { margin-left: var(--sidebar-width); max-width: none; }
.header { display: none; }
.tabs { display: none; }
.content { padding: 24px; max-width: 1200px; }
```

## Особенности реализации

### 1. Responsive Design
- **Mobile-first**: Существующий bottom tabs остаётся по умолчанию
- **Desktop**: Sidebar появляется автоматически при ≥768px
- **CSS Grid/Flexbox**: Используется для layout (НЕ inline styles)

### 2. Store Integration
- `store.get('currentTab')` → определяет активный пункт меню
- `store.subscribe('currentTab', ...)` → автоматическое обновление UI
- `store.get('experimentalFeatures')` → показ/скрытие экспериментальных вкладок

### 3. Навигация
- Клик по `.sidebar-item[data-tab]` → делегируется в `app.ts`
- `app.switchTab(tabId)` → обновляет Store → sidebar автоматически обновляется
- Синхронизация между sidebar и bottom tabs через Store

### 4. Experimental Features
- Вкладка "Чеки" (`bank-receipts`) показывается только если:
  - `experimentalFeatures.includes('bank_receipt_import')`
- Sidebar автоматически обновляется при изменении `experimentalFeatures`

## Файлы

| Файл | Описание |
|------|----------|
| `web/src/components/sidebar.ts` | Sidebar компонент (новый) |
| `web/src/app.ts` | Интеграция sidebar, метод `setupSidebar()` |
| `web/public/static/style.css` | Desktop layout CSS (добавлено ~160 строк) |
| `web/index.html` | Без изменений (sidebar инжектится через JS) |

## Соответствие .cursorrules

✅ **Vanilla TypeScript** — без фреймворков  
✅ **Kebab-case naming** — `sidebar.ts`  
✅ **View-слой без API** — только рендер, Store для данных  
✅ **CSS без inline styles** — только CSS классы  
✅ **Store для состояния** — `currentTab`, `experimentalFeatures`, `me`  
✅ **TypeScript strict mode** — без ошибок компиляции  

## Тестирование

### Запуск проверок
```powershell
# TypeScript компиляция
cd web
npx tsc --noEmit

# Линтер (требует Docker или npm install)
docker compose -f docker/docker-compose.yml exec web npm run lint

# Сборка
docker compose -f docker/docker-compose.yml exec web npm run build
```

### Проверка в браузере
1. Запустить приложение: `.\docker-dev.ps1`
2. Открыть http://localhost:4001
3. **Mobile**: Изменить ширину окна < 768px → bottom tabs видны
4. **Desktop**: Изменить ширину окна ≥ 768px → sidebar слева, bottom tabs скрыты
5. Проверить навигацию: клик по пунктам меню → переключение вкладок
6. Проверить активное состояние: текущая вкладка подсвечена в sidebar

## Дальнейшие улучшения

### Возможные доработки (не реализовано)
- [ ] Анимация появления sidebar
- [ ] Collapse/expand sidebar (узкий режим с иконками)
- [ ] Сохранение состояния sidebar в localStorage
- [ ] Keyboard navigation (Tab, Arrow keys)
- [ ] Badge с количеством уведомлений на пунктах меню
- [ ] Drag-to-reorder для пунктов меню
- [ ] Темы (светлая/тёмная) — переключатель в sidebar footer

### Tablet Layout (768px - 1024px)
- Можно добавить промежуточный breakpoint для планшетов
- Узкий sidebar (только иконки) или collapsible sidebar

## Примечания

- **Без изменений HTML**: Sidebar инжектится через JavaScript при инициализации
- **Обратная совместимость**: Mobile layout остаётся без изменений
- **Performance**: Sidebar рендерится один раз, обновляется только активное состояние
- **Accessibility**: `role="navigation"`, `aria-current`, `aria-label` добавлены
