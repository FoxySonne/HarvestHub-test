# HarvestHub — карта проекта

> Файл создаётся автоматически.  
> Описания бери из `PROJECT_DESCRIPTIONS.json`.

---

## 1. Структура файлов

- 📄 `PROJECT_DESCRIPTIONS.json` — Ручной словарь описаний для карты проекта. Генератор PROJECT_MAP.md берёт отсюда пояснения к файлам и подставляет их при обновлении карты.
- 📄 `PROJECT_MAP.md` — Автоматически сгенерированная карта проекта: структура папок, список файлов, найденные HTML-блоки, CSS-классы, media-запросы, JS-функции, импорты и экспорты. Файл лучше не редактировать вручную.
- 📁 **components**
  - 📄 `components/main-title.html` — Верхний hero-блок центральной области: заголовок Stop fighting / Start farming, короткое описание сайта и кнопки быстрого перехода в базу знаний и калькулятор.
  - 📄 `components/rightbar.html` — Правая боковая панель сайта с небольшими информационными карточками: быстрые ссылки и совет дня. Подгружается в правый aside через loader.js.
  - 📄 `components/sidebar.html` — Левое навигационное меню HarvestHub: логотип, слоган и ссылки на основные страницы сайта. Использует loadPage() для подгрузки страниц без перезагрузки index.html.
- 📁 **css**
  - 📄 `css/base.css` — Базовые стили сайта: reset, box-sizing, фон body, основной текст, заголовки, ссылки, изображения и оформление скроллбара. Здесь лежит фундамент внешнего вида.
  - 📄 `css/buttons.css` — Стили кнопок и групп кнопок: общий вид button/.button/input-кнопок, hover/disabled-состояния, кнопка на всю ширину и адаптация кнопочных групп под мобильную и десктопную версии.
  - 📄 `css/components.css` — Стили повторяемых визуальных компонентов: шапки страниц, секции, карточки, правые информационные box-блоки, info-block и футер.
  - 📄 `css/desktop.css` — Десктопная адаптивность от 900px: трёхколоночный каркас с левым меню, центральной областью и правой панелью; adaptive-grid; закрепление результатов справа; отдельные настройки для 900–1600px и 1600px+.
  - 📄 `css/forms.css` — Стили форм: form/form-group, поля ввода, textarea, select, размеры input-small/input-medium/input-large, checkbox/radio и мобильное поведение полей.
  - 📄 `css/layout.css` — Общий каркас сайта без привязки к конкретной странице: topbar, левое меню, overlay, main/content, базовые grid/flex-классы и правая панель. Часть поведения переопределяется в mobile.css и desktop.css.
  - 📄 `css/mobile.css` — Мобильная адаптивность до 899px: центральные блоки выстраиваются вертикально, левое меню становится выезжающим, правая панель и результаты переходят в вертикальный порядок.
  - 📄 `css/style.css` — Главный CSS-файл-агрегатор. Через @import подключает переменные, базу, layout, компоненты, формы, кнопки, утилиты и адаптивные файлы desktop/mobile. Именно его подключает index.html.
  - 📄 `css/utilities.css` — Набор вспомогательных классов: tooltip, badge, alert, divider, stat, icon, breadcrumbs, tags, empty state, отступы, выравнивание текста и ширина 100%.
  - 📄 `css/variables.css` — Глобальные CSS-переменные проекта: цвета, фон, панели, карточки, текст, акцент, кнопки, рамки, тени, радиусы, ширина сайта и скорость transition. Главная точка настройки темы.
- 📁 **data**
  - 📄 `data/database.js` — Единая база игровых данных: категории, действия, очки для Турбочерепашки/VS/IPK, dayOrder и списки действий по дням. Используется калькулятором turbo-vs.js.
- 📄 `index.html` — Основная оболочка сайта. Подключает css/style.css, содержит topbar, overlay, левый sidebar, центральную область page-content и правый rightbar, а также подключает JS-модули меню, загрузчика, приложения и настроек.
- 📁 **js**
  - 📄 `js/app.js` — Стартовый скрипт приложения. После загрузки DOM подгружает sidebar, rightbar и main-title, затем открывает последнюю сохранённую страницу из localStorage или home.html по умолчанию.
  - 📄 `js/loader.js` — Загрузчик HTML-блоков и страниц. loadBlock() вставляет HTML в нужный контейнер и пытается подключить одноимённый JS-модуль с init(); loadPage() подгружает страницу в page-content и запоминает её в localStorage.
  - 📄 `js/menu.js` — Логика мобильного бокового меню: открытие по кнопке, закрытие по overlay, закрытие по Escape и управление классом active у sidebar/overlay.
  - 📄 `js/settings.js` — Скрипт страницы настроек. clearSiteCache() очищает Cache Storage, сбрасывает сохранённую текущую страницу в localStorage и перезагружает сайт.
  - 📄 `js/turbo-vs.js` — Логика калькулятора Турбочерепашки и VS. Заполняет выбор дня, разворачивает списки действий/категорий из database.js, создаёт строки действий и поля ввода для обычных значений, диапазонов и уровней войск.
- 📁 **pages**
  - 📁 **calculator**
    - 📄 `pages/calculator/turbo-vs.html` — Страница калькулятора Турбочерепашка & VS Дуэль союза: выбор дня недели, центральный список действий в трёх колонках и правый блок результатов. Данные и строки заполняются через js/turbo-vs.js.
  - 📄 `pages/calculator.html` — Раздел калькуляторов. Сейчас содержит заголовок и ссылку на калькулятор Турбочерепашка&VS, который подгружается как pages/calculator/turbo-vs.html.
  - 📄 `pages/events.html` — Заготовка страницы ивентов. Пока файл пустой и готов для будущего контента по событиям игры.
  - 📄 `pages/home.html` — Главная страница центрального контента. Сейчас содержит блоки-заголовки для популярных гайдов и последних обновлений.
  - 📄 `pages/knowledge.html` — Заготовка страницы базы знаний. Пока файл пустой и предназначен для будущих гайдов, справочников и игровых таблиц.
  - 📄 `pages/settings.html` — Страница настроек сайта. Сейчас содержит карточку очистки кэша и кнопку, которая вызывает clearSiteCache() из js/settings.js.
  - 📄 `pages/timeline.html` — Заготовка страницы событий/таймлайна. Пока файл пустой и готов для будущего расписания или истории игровых активностей.
  - 📄 `pages/tips.html` — Заготовка страницы полезных советов. Пока файл пустой и предназначен для будущих коротких подсказок и рекомендаций.
  - 📄 `pages/todo.html` — Заготовка страницы списка дел. Пока файл пустой и готов для будущего чек-листа игровых задач.
- 📁 **scripts**
  - 📄 `scripts/generate-project-map.js` — Node.js-скрипт генерации PROJECT_MAP.md. Сканирует структуру проекта, читает PROJECT_DESCRIPTIONS.json, извлекает из HTML id/class/подключения, из CSS классы/media/import/секции, из JS функции/импорты/экспорты и записывает обновлённую карту проекта.


---

## 2. Подробная карта файлов


---

### `PROJECT_DESCRIPTIONS.json`

Ручной словарь описаний для карты проекта. Генератор PROJECT_MAP.md берёт отсюда пояснения к файлам и подставляет их при обновлении карты.

---

### `PROJECT_MAP.md`

Автоматически сгенерированная карта проекта: структура папок, список файлов, найденные HTML-блоки, CSS-классы, media-запросы, JS-функции, импорты и экспорты. Файл лучше не редактировать вручную.

---

### `components/main-title.html`

Верхний hero-блок центральной области: заголовок Stop fighting / Start farming, короткое описание сайта и кнопки быстрого перехода в базу знаний и калькулятор.

**HTML-теги блоков:**
- `section`

**Классы:**
- `page-header`
- `button-group`
- `button`

---

### `components/rightbar.html`

Правая боковая панель сайта с небольшими информационными карточками: быстрые ссылки и совет дня. Подгружается в правый aside через loader.js.

**Классы:**
- `right`
- `box`

---

### `components/sidebar.html`

Левое навигационное меню HarvestHub: логотип, слоган и ссылки на основные страницы сайта. Использует loadPage() для подгрузки страниц без перезагрузки index.html.

**Классы:**
- `logo`
- `menu-item`

---

### `css/base.css`

Базовые стили сайта: reset, box-sizing, фон body, основной текст, заголовки, ссылки, изображения и оформление скроллбара. Здесь лежит фундамент внешнего вида.

**CSS-секции из комментариев:**
- `Отвечает за: базовые стили сайта — reset, шрифты, заголовки, ссылки, изображения и скроллбар.`
- `RESET — базовые стили, чтобы сайт везде выглядел одинаково Убираем «сюрпризы» от браузеров и задаём общие настройки страницы.`
- `TYPOGRAPHY - размеры текста`
- `LINKS`
- `IMAGES`
- `SCROLLBAR`

---

### `css/buttons.css`

Стили кнопок и групп кнопок: общий вид button/.button/input-кнопок, hover/disabled-состояния, кнопка на всю ширину и адаптация кнопочных групп под мобильную и десктопную версии.

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

Стили повторяемых визуальных компонентов: шапки страниц, секции, карточки, правые информационные box-блоки, info-block и футер.

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

Десктопная адаптивность от 900px: трёхколоночный каркас с левым меню, центральной областью и правой панелью; adaptive-grid; закрепление результатов справа; отдельные настройки для 900–1600px и 1600px+.

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

Стили форм: form/form-group, поля ввода, textarea, select, размеры input-small/input-medium/input-large, checkbox/radio и мобильное поведение полей.

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

Общий каркас сайта без привязки к конкретной странице: topbar, левое меню, overlay, main/content, базовые grid/flex-классы и правая панель. Часть поведения переопределяется в mobile.css и desktop.css.

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

Мобильная адаптивность до 899px: центральные блоки выстраиваются вертикально, левое меню становится выезжающим, правая панель и результаты переходят в вертикальный порядок.

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

Главный CSS-файл-агрегатор. Через @import подключает переменные, базу, layout, компоненты, формы, кнопки, утилиты и адаптивные файлы desktop/mobile. Именно его подключает index.html.

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

Набор вспомогательных классов: tooltip, badge, alert, divider, stat, icon, breadcrumbs, tags, empty state, отступы, выравнивание текста и ширина 100%.

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

Глобальные CSS-переменные проекта: цвета, фон, панели, карточки, текст, акцент, кнопки, рамки, тени, радиусы, ширина сайта и скорость transition. Главная точка настройки темы.

**CSS-секции из комментариев:**
- `VARIABLES Отвечает за: все переменные проекта (цвета, размеры, отступы, радиусы, анимации). Если захотите сменить тему сайта, почти все изменится только здесь.`

---

### `data/database.js`

Единая база игровых данных: категории, действия, очки для Турбочерепашки/VS/IPK, dayOrder и списки действий по дням. Используется калькулятором turbo-vs.js.

**Экспорты:**
- `database`

---

### `index.html`

Основная оболочка сайта. Подключает css/style.css, содержит topbar, overlay, левый sidebar, центральную область page-content и правый rightbar, а также подключает JS-модули меню, загрузчика, приложения и настроек.

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

Стартовый скрипт приложения. После загрузки DOM подгружает sidebar, rightbar и main-title, затем открывает последнюю сохранённую страницу из localStorage или home.html по умолчанию.

---

### `js/loader.js`

Загрузчик HTML-блоков и страниц. loadBlock() вставляет HTML в нужный контейнер и пытается подключить одноимённый JS-модуль с init(); loadPage() подгружает страницу в page-content и запоминает её в localStorage.

**Функции:**
- `loadBlock`
- `loadPage`

---

### `js/menu.js`

Логика мобильного бокового меню: открытие по кнопке, закрытие по overlay, закрытие по Escape и управление классом active у sidebar/overlay.

**Функции:**
- `openMenu`
- `closeMenu`

---

### `js/settings.js`

Скрипт страницы настроек. clearSiteCache() очищает Cache Storage, сбрасывает сохранённую текущую страницу в localStorage и перезагружает сайт.

**Функции:**
- `clearSiteCache`

---

### `js/turbo-vs.js`

Логика калькулятора Турбочерепашки и VS. Заполняет выбор дня, разворачивает списки действий/категорий из database.js, создаёт строки действий и поля ввода для обычных значений, диапазонов и уровней войск.

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

Страница калькулятора Турбочерепашка & VS Дуэль союза: выбор дня недели, центральный список действий в трёх колонках и правый блок результатов. Данные и строки заполняются через js/turbo-vs.js.

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

Раздел калькуляторов. Сейчас содержит заголовок и ссылку на калькулятор Турбочерепашка&VS, который подгружается как pages/calculator/turbo-vs.html.

**Классы:**
- `a`

---

### `pages/events.html`

Заготовка страницы ивентов. Пока файл пустой и готов для будущего контента по событиям игры.

---

### `pages/home.html`

Главная страница центрального контента. Сейчас содержит блоки-заголовки для популярных гайдов и последних обновлений.

---

### `pages/knowledge.html`

Заготовка страницы базы знаний. Пока файл пустой и предназначен для будущих гайдов, справочников и игровых таблиц.

---

### `pages/settings.html`

Страница настроек сайта. Сейчас содержит карточку очистки кэша и кнопку, которая вызывает clearSiteCache() из js/settings.js.

**Классы:**
- `card`
- `button`

---

### `pages/timeline.html`

Заготовка страницы событий/таймлайна. Пока файл пустой и готов для будущего расписания или истории игровых активностей.

---

### `pages/tips.html`

Заготовка страницы полезных советов. Пока файл пустой и предназначен для будущих коротких подсказок и рекомендаций.

---

### `pages/todo.html`

Заготовка страницы списка дел. Пока файл пустой и готов для будущего чек-листа игровых задач.

---

### `scripts/generate-project-map.js`

Node.js-скрипт генерации PROJECT_MAP.md. Сканирует структуру проекта, читает PROJECT_DESCRIPTIONS.json, извлекает из HTML id/class/подключения, из CSS классы/media/import/секции, из JS функции/импорты/экспорты и записывает обновлённую карту проекта.

**Функции:**
- `readFileSafe`
- `scanDirectory`
- `renderTree`
- `getAllFiles`
- `extractHtmlInfo`
- `extractCssInfo`
- `extractJsInfo`
- `listBlock`
