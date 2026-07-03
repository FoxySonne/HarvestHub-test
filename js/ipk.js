import { database } from "../data/database.js";

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ru-RU");
}

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
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
      points,
    };
  });
}

function createCard(category) {
  const rows = createRows(category);
  const card = document.createElement("article");
  card.className = "ipk-card card";
  card.dataset.categoryId = category.id;
  card.dataset.target = category.target;

  card.innerHTML = `
    <header class="ipk-card-header">
      <h3>${category.name}</h3>
      <button class="ipk-card-toggle" type="button" aria-label="Свернуть категорию">⌄</button>
    </header>

    <div class="ipk-card-body">
      <div class="ipk-stats">
        <div><span>Очков нужно:</span><strong data-ipk-target>${formatNumber(category.target)}</strong></div>
        <div><span>Не хватает:</span><strong data-ipk-missing>${formatNumber(category.target)}</strong></div>
        <div><span>Получу:</span><strong data-ipk-result>0</strong></div>
      </div>

      <div class="ipk-rows">
        ${rows.map(row => `
          <div class="ipk-row" data-action-id="${row.id}" data-option="${row.option ?? ""}" data-points="${row.points}">
            <label>${row.label}</label>
            <input type="number" min="0" value="" inputmode="numeric">
            <div class="ipk-need">${row.points > 0 ? formatNumber(Math.ceil(category.target / row.points)) : "0"}</div>
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

  card.addEventListener("input", updateIpkResults);

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

  const checkbox = label.querySelector("input");
  checkbox.addEventListener("change", () => {
    setCategoryEnabled(category.id, checkbox.checked);
  });

  return label;
}

function renderCategoryList(container) {
  container.innerHTML = "";

  database.categoryIpk.forEach(category => {
    container.appendChild(createCategoryCheckbox(category));
  });
}

function setCategoryEnabled(categoryId, isEnabled) {
  document.querySelectorAll(`.ipk-category-item[data-category-id="${categoryId}"] input`).forEach(input => {
    input.checked = isEnabled;
  });

  const card = document.querySelector(`.ipk-card[data-category-id="${categoryId}"]`);

  if (card) {
    card.hidden = !isEnabled;
  }

  updateIpkResults();
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

function calculateCard(card) {
  const target = Number(card.dataset.target || 0);
  let result = 0;

  const rows = Array.from(card.querySelectorAll(".ipk-row"));

  rows.forEach(row => {
    const input = row.querySelector("input");
    const quantity = parseNumber(input?.value);
    const points = Number(row.dataset.points || 0);

    result += quantity * points;
  });

  const missing = Math.max(target - result, 0);

  rows.forEach(row => {
    const need = row.querySelector(".ipk-need");
    const points = Number(row.dataset.points || 0);

    if (need) {
      need.textContent = points > 0 ? formatNumber(Math.ceil(missing / points)) : "0";
    }
  });

  card.querySelector("[data-ipk-result]").textContent = formatNumber(result);
  card.querySelector("[data-ipk-missing]").textContent = formatNumber(missing);

  return result;
}

function updateIpkResults() {
  const total = document.getElementById("ipkTotal");
  let totalResult = 0;

  document.querySelectorAll(".ipk-card").forEach(card => {
    const result = calculateCard(card);

    if (!card.hidden) {
      totalResult += result;
    }
  });

  if (total) {
    total.textContent = formatNumber(totalResult);
  }
}

function renderIpk() {
  const cardsContainer = document.getElementById("ipkCards");
  const desktopCategories = document.getElementById("ipkDesktopCategoriesList");
  const mobileCategories = document.getElementById("ipkMobileCategoriesList");

  if (!cardsContainer || !desktopCategories || !mobileCategories) return;

  cardsContainer.innerHTML = "";

  database.categoryIpk.forEach(category => {
    cardsContainer.appendChild(createCard(category));
  });

  renderCategoryList(desktopCategories);
  renderCategoryList(mobileCategories);
  setupMobileCategoryCollapse();
  updateIpkResults();
}

export function init() {
  renderIpk();
}
