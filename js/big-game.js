const bigGameCategories = [
  {
    id: "building",
    icon: "⛏",
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
    icon: "🔬",
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
    icon: "♻",
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
    icon: "⚡",
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
    icon: "★",
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
    icon: "⌘",
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
    icon: "♙",
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
      <div class="big-game-card-title">
        <span class="big-game-icon">${category.icon}</span>
        <h3>${category.name}</h3>
      </div>
      <div class="big-game-card-status ${category.enabled ? "is-active" : ""}">✓</div>
    </header>

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
  `;

  return card;
}

function createCategoryItem(category) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = `big-game-category-item ${category.enabled ? "is-active" : ""}`;
  item.dataset.categoryId = category.id;

  item.innerHTML = `
    <span>${category.name}</span>
    <span class="big-game-category-check">✓</span>
  `;

  return item;
}

function fillFilter(select) {
  bigGameCategories.forEach(category => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    select.appendChild(option);
  });
}

function renderBigGame() {
  const cardsContainer = document.getElementById("bigGameCards");
  const categoriesContainer = document.getElementById("bigGameCategories");
  const categoryFilter = document.getElementById("bigGameCategoryFilter");

  if (!cardsContainer || !categoriesContainer || !categoryFilter) return;

  cardsContainer.innerHTML = "";
  categoriesContainer.innerHTML = "";

  fillFilter(categoryFilter);

  bigGameCategories.forEach(category => {
    cardsContainer.appendChild(createCard(category));
    categoriesContainer.appendChild(createCategoryItem(category));
  });

  categoryFilter.addEventListener("change", () => {
    const value = categoryFilter.value;

    document.querySelectorAll(".big-game-card").forEach(card => {
      card.hidden = value !== "all" && card.dataset.categoryId !== value;
    });
  });
}

export function init() {
  renderBigGame();
}
