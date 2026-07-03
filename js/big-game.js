const bigGameCategories = [
  {
    id: "building",
    name: "Строительство поселения",
    target: 250000,
    missing: 224800,
    result: 25200,
    enabled: true,
    rows: [
      {label: "Увеличьте силу на 1 с помощью строительства", value: "", need: "74 934"},
      {label: "Ускорьте строительство на 1 мин.", value: "600", need: "5 353"},
      {label: "Получайте алмазы x1", value: "", need: "3 747"},
    ],
  },
  {
    id: "research",
    name: "Исследование технологий",
    target: 300000,
    missing: 300000,
    result: 0,
    enabled: false,
    rows: [
      {label: "Увеличьте силу на 1 с помощью исследования", value: "", need: "33 334"},
      {label: "Ускорьте исследование на 1 мин.", value: "", need: "1 200"},
      {label: "Получайте алмазы x1", value: "", need: "4 286"},
    ],
  },
  {
    id: "equipment",
    name: "Усиление снаряжения",
    target: 200000,
    missing: 171430,
    result: 28570,
    enabled: true,
    rows: [
      {label: "Синий болт", value: "", need: "241"},
      {label: "Фиолетовый болт", value: "10", need: "61"},
      {label: "Золотой болт", value: "12", need: "12"},
      {label: "? болт", value: "", need: "3"},
      {label: "Получайте алмазы x1", value: "", need: "2 856"},
    ],
  },
  {
    id: "titan",
    name: "Развитие титана",
    target: 300000,
    missing: 300000,
    result: 0,
    enabled: false,
    rows: [
      {label: "Опыт титана 100 ед", value: "", need: "300"},
      {label: "Клетки титана", value: "", need: "25"},
      {label: "1 ед. биогенного белка", value: "", need: "30"},
    ],
  },
  {
    id: "heroes",
    name: "Улучшение героя",
    target: 300000,
    missing: 300000,
    result: 0,
    enabled: false,
    rows: [
      {label: "Желаемый призыв", value: "", need: "23"},
      {label: "Продвинутый призыв", value: "", need: "100"},
      {label: "Золотой фрагмент героя", value: "", need: "20"},
      {label: "Книги героев", value: "", need: "60"},
    ],
  },
  {
    id: "chief",
    name: "Шеф коллекция",
    target: 300000,
    missing: 10000,
    result: 290000,
    enabled: true,
    rows: [
      {label: "Используйте общие детали", value: "", need: "16"},
      {label: "Используйте чертежи", value: "10", need: "1"},
      {label: "Получайте алмазы x1", value: "", need: "167"},
    ],
  },
  {
    id: "troops",
    name: "Улучшение войск",
    target: 300000,
    missing: 258000,
    result: 42000,
    enabled: true,
    rows: [
      {label: "Ускорьте обучение на 1 мин.", value: "1000", need: "6 143"},
      {label: "Обучить солдат 1 ур.", value: "", need: "64 500"},
      {label: "Обучить солдат 2 ур.", value: "", need: "36 858"},
      {label: "Обучить солдат 3 ур.", value: "", need: "21 500"},
    ],
  },
];

function formatNumber(value) {
  return Number(value).toLocaleString("ru-RU");
}

function createCard(category) {
  const card = document.createElement("article");
  card.className = "big-game-card card";
  card.dataset.categoryId = category.id;

  card.innerHTML = `
    <header class="big-game-card-header">
      <h3>${category.name}</h3>
      <button class="big-game-card-toggle" type="button" aria-label="Свернуть категорию">⌄</button>
    </header>

    <div class="big-game-card-body">
      <div class="big-game-stats">
        <div><span>Очков нужно:</span><strong>${formatNumber(category.target)}</strong></div>
        <div><span>Не хватает:</span><strong>${formatNumber(category.missing)}</strong></div>
        <div><span>Получу:</span><strong>${formatNumber(category.result)}</strong></div>
      </div>

      <div class="big-game-rows">
        ${category.rows.map(row => `
          <div class="big-game-row">
            <label>${row.label}</label>
            <input type="number" min="0" value="${row.value}">
            <div class="big-game-need">${row.need}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  const toggleButton = card.querySelector(".big-game-card-toggle");
  toggleButton.addEventListener("click", () => {
    card.classList.toggle("is-collapsed");
    toggleButton.textContent = card.classList.contains("is-collapsed") ? "›" : "⌄";
  });

  return card;
}

function createCategoryCheckbox(category) {
  const label = document.createElement("label");
  label.className = "big-game-category-item";
  label.dataset.categoryId = category.id;

  label.innerHTML = `
    <span>${category.name}</span>
    <span class="big-game-switch">
      <input type="checkbox" ${category.enabled ? "checked" : ""}>
      <span class="big-game-switch-track">
        <span class="big-game-switch-thumb">✓</span>
      </span>
    </span>
  `;

  return label;
}

function renderCategoryList(container) {
  container.innerHTML = "";

  bigGameCategories.forEach(category => {
    container.appendChild(createCategoryCheckbox(category));
  });
}

function setupMobileCategoryCollapse() {
  const button = document.getElementById("bigGameToggleCategories");
  const icon = document.getElementById("bigGameToggleIcon");
  const list = document.getElementById("bigGameMobileCategoriesList");

  if (!button || !icon || !list) return;

  button.addEventListener("click", () => {
    list.classList.toggle("is-collapsed");
    icon.textContent = list.classList.contains("is-collapsed") ? "Показать" : "Свернуть";
  });
}

function renderBigGame() {
  const cardsContainer = document.getElementById("bigGameCards");
  const desktopCategories = document.getElementById("bigGameDesktopCategoriesList");
  const mobileCategories = document.getElementById("bigGameMobileCategoriesList");

  if (!cardsContainer || !desktopCategories || !mobileCategories) return;

  cardsContainer.innerHTML = "";

  bigGameCategories.forEach(category => {
    cardsContainer.appendChild(createCard(category));
  });

  renderCategoryList(desktopCategories);
  renderCategoryList(mobileCategories);
  setupMobileCategoryCollapse();
}

export function init() {
  renderBigGame();
}
