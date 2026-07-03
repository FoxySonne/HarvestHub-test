# HarvestHub — карта проекта

> Файл создаётся автоматически.  
> Описания бери из `PROJECT_DESCRIPTIONS.json`.

---

## 1. Структура файлов

- 📄 `PROJECT_DESCRIPTIONS.json`
- 📄 `PROJECT_MAP.md`
- 📁 **components**
  - 📄 `components/main-title.html`
  - 📄 `components/rightbar.html`
  - 📄 `components/sidebar.html`
- 📁 **css**
  - 📄 `css/base.css`
  - 📄 `css/buttons.css`
  - 📄 `css/components.css`
  - 📄 `css/desktop.css`
  - 📄 `css/forms.css`
  - 📄 `css/layout.css`
  - 📄 `css/mobile.css`
  - 📄 `css/style.css`
  - 📄 `css/utilities.css`
  - 📄 `css/variables.css`
- 📁 **data**
  - 📄 `data/database.js`
- 📄 `index.html`
- 📁 **js**
  - 📄 `js/app.js`
  - 📄 `js/loader.js`
  - 📄 `js/menu.js`
  - 📄 `js/settings.js`
  - 📄 `js/turbo-vs.js`
- 📁 **pages**
  - 📁 **calculator**
    - 📄 `pages/calculator/turbo-vs.html`
  - 📄 `pages/calculator.html`
  - 📄 `pages/events.html`
  - 📄 `pages/home.html`
  - 📄 `pages/knowledge.html`
  - 📄 `pages/settings.html`
  - 📄 `pages/timeline.html`
  - 📄 `pages/tips.html`
  - 📄 `pages/todo.html`
- 📁 **scripts**
  - 📄 `scripts/generate-project-map.js`


---

## 2. Подробная карта файлов


---

### `PROJECT_DESCRIPTIONS.json`

Описание пока не добавлено.

---

### `PROJECT_MAP.md`

Описание пока не добавлено.

---

### `components/main-title.html`

Описание пока не добавлено.

**HTML-теги блоков:**
- `section`

**Классы:**
- `page-header`
- `button-group`
- `button`

---

### `components/rightbar.html`

Описание пока не добавлено.

**Классы:**
- `right`
- `box`

---

### `components/sidebar.html`

Описание пока не добавлено.

**Классы:**
- `logo`
- `menu-item`

---

### `css/base.css`

Описание пока не добавлено.

**CSS-секции из комментариев:**
- `Отвечает за: базовые стили сайта — reset, шрифты, заголовки, ссылки, изображения и скроллбар.`
- `RESET — базовые стили, чтобы сайт везде выглядел одинаково Убираем «сюрпризы» от браузеров и задаём общие настройки страницы.`
- `TYPOGRAPHY - размеры текста`
- `LINKS`
- `IMAGES`
- `SCROLLBAR`

---

### `css/buttons.css`

Описание пока не добавлено.

**CSS-секции из комментариев:**
- `BUTTONS`
- `BUTTON GROUP`
- `FULL WIDTH BUTTON`
- `DESKTOP`
- `MOBILE`

**CSS-классы:**
- `button`
- `button-group`
- `button-block`

**@media:**
- `@media (min-width:900px)`
- `@media (max-width:899px)`

---

### `css/components.css`

Описание пока не добавлено.

**CSS-секции из комментариев:**
- `Отвечает за: все визуальные блоки сайта — карточки, секции, шапки страниц, информационные блоки и футер.`
- `PAGE HEADER`
- `SECTIONS`
- `CARDS`
- `BOX`
- `INFO BLOCK`
- `FOOTER`

**CSS-классы:**
- `page-header`
- `page-subtitle`
- `section`
- `section-title`
- `card`
- `card-title`
- `card-text`
- `box`
- `info-block`
- `footer`

---

### `css/desktop.css`

Описание пока не добавлено.

**CSS-секции из комментариев:**
- `DESKTOP: 900px+`
- `DESKTOP: 900–1600px`
- `WIDE DESKTOP: 1600px+`

**CSS-классы:**
- `topbar`
- `overlay`
- `container`
- `left`
- `main`
- `right`
- `adaptive-grid`
- `desktop-fixed-right`
- `turbo-content`
- `results`

**@media:**
- `@media (min-width: 900px)`
- `@media (min-width: 900px) and (max-width: 1599px)`
- `@media (min-width: 1600px)`

---

### `css/forms.css`

Описание пока не добавлено.

**CSS-секции из комментариев:**
- `Отвечает за: все формы сайта — поля ввода, textarea, select, checkbox, radio, а также размеры инпутов.`
- `FORMS`
- `INPUTS`
- `INPUT WIDTHS`
- `SELECT`
- `CHECKBOX`
- `RADIO - галочки`
- `MOBILE`

**CSS-классы:**
- `form`
- `form-group`
- `input-small`
- `input-medium`
- `input-large`
- `checkbox`
- `radio`

**@media:**
- `@media (max-width:899px)`

---

### `css/layout.css`

Описание пока не добавлено.

**CSS-секции из комментариев:**
- `LAYOUT Отвечает за: весь каркас сайта — меню, боковые панели, контейнеры, Grid, Flex и адаптивность.`
- `TOPBAR`
- `LEFT SIDEBAR`
- `OVERLAY`
- `MENU`
- `MAIN`
- `GRID`
- `FLEX`
- `RIGHT SIDEBAR`

**CSS-классы:**
- `page`
- `topbar`
- `menu-button`
- `left`
- `overlay`
- `logo`
- `menu-item`
- `main`
- `content`
- `grid`
- `grid-2`
- `grid-3`
- `grid-4`
- `flex`
- `flex-between`
- `flex-column`
- `right`
- `right-panel`

---

### `css/mobile.css`

Описание пока не добавлено.

**CSS-секции из комментариев:**
- `MOBILE: до 899px`

**CSS-классы:**
- `container`
- `topbar`
- `main`
- `left`
- `right`
- `grid`
- `grid-2`
- `grid-3`
- `grid-4`
- `adaptive-grid`
- `flex`
- `flex-between`
- `desktop-fixed-right`
- `turbo-content`
- `results`

**@media:**
- `@media (max-width: 899px)`

---

### `css/style.css`

Описание пока не добавлено.

**@import:**
- `variables.css`
- `base.css`
- `layout.css`
- `components.css`
- `forms.css`
- `buttons.css`
- `utilities.css`
- `desktop.css`
- `mobile.css`

---

### `css/utilities.css`

Описание пока не добавлено.

**CSS-секции из комментариев:**
- `TOOLTIPS - для всплывающих подсказок`
- `BADGES`
- `ALERTS`
- `LISTS - списки`
- `DIVIDER`
- `STAT - Это стили для блоков со статистикой — компактных карточек, где слева обычно идёт подпись, а справа — важное числовое значение. Можно показывать «Уровень: 5», «Ресурсы: 240», «Прогресс: 78%».`
- `ICON`
- `BREADCRUMBS`
- `TAGS`
- `EMPTY STATE`
- `HELPERS`

**CSS-классы:**
- `tooltip`
- `badge`
- `badge-success`
- `badge-danger`
- `badge-warning`
- `badge-info`
- `alert`
- `alert-success`
- `alert-danger`
- `alert-warning`
- `alert-info`
- `divider`
- `stat`
- `stat-value`
- `icon-box`
- `icon`
- `breadcrumbs`
- `tags`
- `tag`
- `empty`
- `mt-8`
- `mt-16`
- `mt-24`
- `mt-32`
- `mt-40`
- `mb-8`
- `mb-16`
- `mb-24`
- `mb-32`
- `mb-40`
- `pt-16`
- `pt-24`
- `pb-24`
- `text-center`
- `text-left`
- `text-right`
- `w-100`

---

### `css/variables.css`

Описание пока не добавлено.

**CSS-секции из комментариев:**
- `VARIABLES Отвечает за: все переменные проекта (цвета, размеры, отступы, радиусы, анимации). Если захотите сменить тему сайта, почти все изменится только здесь.`

---

### `data/database.js`

Описание пока не добавлено.

**Экспорты:**
- `database`

---

### `index.html`

Описание пока не добавлено.

**HTML-теги блоков:**
- `header`
- `aside`
- `main`

**ID:**
- `overlay`
- `openMenu`
- `sidebar`
- `sidebar-container`
- `main-title-container`
- `page-content`
- `right-sidebar`
- `rightbar-container`

**Классы:**
- `overlay`
- `topbar`
- `menu-button`
- `topbar-title`
- `container`
- `left`
- `main`
- `right`

**Подключённые CSS:**
- `css/style.css`

**Подключённые JS:**
- `js/menu.js`
- `js/loader.js`
- `js/app.js`
- `js/settings.js`

---

### `js/app.js`

Описание пока не добавлено.

---

### `js/loader.js`

Описание пока не добавлено.

**Функции:**
- `loadBlock`
- `loadPage`

---

### `js/menu.js`

Описание пока не добавлено.

**Функции:**
- `openMenu`
- `closeMenu`

---

### `js/settings.js`

Описание пока не добавлено.

**Функции:**
- `clearSiteCache`

---

### `js/turbo-vs.js`

Описание пока не добавлено.

**Функции:**
- `init`
- `renderDay`
- `resolveDayList`
- `appendInputs`
- `appendEmpty`
- `createRow`

**Импорты:**
- `../data/database.js`

**Экспорты:**
- `init`

---

### `pages/calculator/turbo-vs.html`

Описание пока не добавлено.

**ID:**
- `daySelector`
- `actionList`

**Классы:**
- `turbo-container`
- `title`
- `day-block`
- `day-label`
- `day-select`
- `turbo-content`
- `table-header`
- `col-left`
- `col-center`
- `col-right`
- `action-list`
- `results`
- `result-box`

---

### `pages/calculator.html`

Описание пока не добавлено.

**Классы:**
- `a`

---

### `pages/events.html`

Описание пока не добавлено.

---

### `pages/home.html`

Описание пока не добавлено.

---

### `pages/knowledge.html`

Описание пока не добавлено.

---

### `pages/settings.html`

Описание пока не добавлено.

**Классы:**
- `card`
- `button`

---

### `pages/timeline.html`

Описание пока не добавлено.

---

### `pages/tips.html`

Описание пока не добавлено.

---

### `pages/todo.html`

Описание пока не добавлено.

---

### `scripts/generate-project-map.js`

Описание пока не добавлено.

**Функции:**
- `readFileSafe`
- `scanDirectory`
- `renderTree`
- `getAllFiles`
- `extractHtmlInfo`
- `extractCssInfo`
- `extractJsInfo`
- `listBlock`
