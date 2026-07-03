import { database } from "../data/database.js";

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ru-RU");
}

function getActionById(actionId) {
  return database.action.find(action => action.id === actionId);
}

function getActionPoints(action, item) {
  const ipkPoints = action?.points?.ipk ?? 0;

  if (item.option !== undefined && typeof ipkPoints === "object") {
    return ipkPoints[item.option] ?? 0;
  }

  return typeof ipkPoints === "number" ? ipkPoints : 0;
}

function createRows(category) {
  return category.actions.map(item => {
    const action = getActionById(item.id);
    const points = getActionPoints(action, item);

    return {
      id: item.id,
      option: item.option,
      label: item.label || action?.name || item.id,
      value: "",
      need: points > 0 ? Math.ceil(category.target / points) : 0,
    };
  });
}

function createCard(category) {
  const rows = createRows(category);
  const card = document.createElement("article");
  card.className = "ipk-card card";
  card.dataset.categoryId = category.id;

  card.innerHTML = `
    <header class="ipk-card-header">
      <h3>${category.name}</h3>
      <button class="ipk-card-toggle" type="button" aria-label="Свернуть категорию">⌄</button>
    </header>

    <div class="ipk-card-body">
      <div class="ipk-stats">
        <div><span>Очков нужно:</span><strong>${formatNumber(category.target)}</strong></div>
        <div><span>Не хватает:</span><strong>${formatNumber(category.target)}</strong></div>
        <div><span>Получу:</span><strong>0</strong></div>
      </div>

      <div class="ipk-rows">
        ${rows.map(row => `
          <div class="ipk-row" data-action-id="${row.id}" data-option="${row.option ?? ""}">
            <label>${row.label}</label>
            <input type="number" min="0" value="${row.value}">
            <div class="ipk-need">${formatNumber(row.need)}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  const toggleButton = card.querySelector(".ipk-card-toggle");
  toggleButton.addEventListener("click", () => {
    card.classList.toggle("is-collapsed");
    toggleButton.textContent = card.classList.contains("is-collapsed") ? "›" : "⌄";
  });

  return card;
}

function createCategoryCheckbox(category) {
  const label = document.createElement("label");
  label.className = "ipk-category-item";
  label.dataset.categoryId = category.id;

  label.innerHTML = `
    <span>${category.name}</span>
    <span class="ipk-switch">
      <input type="checkbox" checked>
      <span class="ipk-switch-track">
        <span class="ipk-switch-thumb">✓</span>
      </span>
    </span>
  `;

  return label;
}

function renderCategoryList(container) {
  container.innerHTML = "";

  database.categoryIpk.forEach(category => {
    container.appendChild(createCategoryCheckbox(category));
  });
}

function setupMobileCategoryCollapse() {
  const button = document.getElementById("ipkToggleCategories");
  const icon = document.getElementById("ipkToggleIcon");
  const list = document.getElementById("ipkMobileCategoriesList");

  if (!button || !icon || !list) return;

  button.addEventListener("click", () => {
    list.classList.toggle("is-collapsed");
    icon.textContent = list.classList.contains("is-collapsed") ? "Показать" : "Свернуть";
  });
}

function renderIpk() {
  const cardsContainer = document.getElementById("ipkCards");
  const desktopCategories = document.getElementById("ipkDesktopCategoriesList");
  const mobileCategories = document.getElementById("ipkMobileCategoriesList");
  const total = document.getElementById("ipkTotal");

  if (!cardsContainer || !desktopCategories || !mobileCategories) return;

  cardsContainer.innerHTML = "";

  database.categoryIpk.forEach(category => {
    cardsContainer.appendChild(createCard(category));
  });

  renderCategoryList(desktopCategories);
  renderCategoryList(mobileCategories);
  setupMobileCategoryCollapse();

  if (total) {
    total.textContent = "0";
  }
}

export function init() {
  renderIpk();
}
