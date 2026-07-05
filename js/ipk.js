const moduleVersion = new URL(import.meta.url).searchParams.get("v") || "dev";
const { database } = await import(`../data/database.js?v=${encodeURIComponent(moduleVersion)}`);

const TROOP_TRANSFER_STORAGE_KEY = "harvesthub_troop_training_transfer";
const TROOP_TRANSFER_APPLIED_KEY = "harvesthub_troop_training_transfer_applied_ipk";

let selectedCategoryIds = new Set();
const ipkValues = new Map();
const ipkResultOverrides = new Map();

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ru-RU");
}

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function readTroopTransferPreset() {
  try {
    return JSON.parse(localStorage.getItem(TROOP_TRANSFER_STORAGE_KEY) || "null");
  } catch (error) {
    console.warn("Не удалось прочитать заготовку обучения войск для ИПК", error);
    return null;
  }
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

function getRowKey(categoryId, item) {
  return `${categoryId}:${item.id}:${item.option ?? ""}`;
}

function createRows(category) {
  return category.actions.map(item => {
    const action = getActionById(item.id);
    const points = getActionPoints(action, item);
    const key = getRowKey(category.id, item);

    return {
      id: item.id,
      option: item.option,
      key,
      label: item.label || action?.name || item.id,
      points,
      value: ipkValues.get(key) || "",
    };
  });
}

function saveCardValues(card) {
  card.querySelectorAll(".ipk-row").forEach(row => {
    const key = row.dataset.key;
    const input = row.querySelector("input");

    if (!key || !input) return;

    if (input.value === "") {
      ipkValues.delete(key);
    } else {
      ipkValues.set(key, input.value);
    }
  });
}

function saveCardResultOverride(card) {
  const categoryId = card.dataset.categoryId;
  const resultInput = card.querySelector("[data-ipk-result]");

  if (!categoryId || !resultInput) return;

  if (card.dataset.resultManual === "true" && resultInput.value !== "") {
    ipkResultOverrides.set(categoryId, resultInput.value);
  } else {
    ipkResultOverrides.delete(categoryId);
  }
}

function saveAllValues() {
  document.querySelectorAll(".ipk-card").forEach(card => {
    saveCardValues(card);
    saveCardResultOverride(card);
  });
}

function createCard(category) {
  const rows = createRows(category);
  const card = document.createElement("article");
  const manualResult = ipkResultOverrides.get(category.id);

  card.className = "ipk-card card";
  card.dataset.categoryId = category.id;
  card.dataset.target = category.target;
  card.dataset.resultManual = manualResult != null ? "true" : "false";

  card.innerHTML = `
    <header class="ipk-card-header">
      <h3>${category.name}</h3>
      <button class="ipk-card-toggle" type="button" aria-label="Свернуть категорию">⌄</button>
    </header>

    <div class="ipk-card-body">
      <div class="ipk-stats">
        <div><span>Очков нужно:</span><strong data-ipk-target>${formatNumber(category.target)}</strong></div>
        <div><span>Не хватает:</span><strong data-ipk-missing>${formatNumber(category.target)}</strong></div>
        <div><span>Получу:</span><input class="ipk-result-input" type="number" min="0" value="${manualResult ?? 0}" inputmode="numeric" data-ipk-result data-no-persist="true"></div>
      </div>

      <div class="ipk-rows">
        ${rows.map(row => `
          <div class="ipk-row" data-key="${row.key}" data-action-id="${row.id}" data-option="${row.option ?? ""}" data-points="${row.points}">
            <label>${row.label}</label>
            <input type="number" min="0" value="${row.value}" inputmode="numeric">
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

  card.addEventListener("input", event => {
    if (event.target.matches("[data-ipk-result]")) {
      card.dataset.resultManual = "true";
      saveCardResultOverride(card);
    } else {
      card.dataset.resultManual = "false";
      ipkResultOverrides.delete(category.id);
      saveCardValues(card);
    }

    updateIpkResults();
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
      <input type="checkbox" ${selectedCategoryIds.has(category.id) ? "checked" : ""}>
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

function renderSelectedCards() {
  const cardsContainer = document.getElementById("ipkCards");

  if (!cardsContainer) return;

  saveAllValues();
  cardsContainer.innerHTML = "";

  database.categoryIpk
    .filter(category => selectedCategoryIds.has(category.id))
    .forEach(category => {
      cardsContainer.appendChild(createCard(category));
    });

  updateIpkResults();
}

function setCategoryEnabled(categoryId, isEnabled) {
  if (isEnabled) {
    selectedCategoryIds.add(categoryId);
  } else {
    selectedCategoryIds.delete(categoryId);
  }

  document.querySelectorAll(`.ipk-category-item[data-category-id="${categoryId}"] input`).forEach(input => {
    input.checked = isEnabled;
  });

  renderSelectedCards();
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
  let autoResult = 0;

  const rows = Array.from(card.querySelectorAll(".ipk-row"));

  rows.forEach(row => {
    const input = row.querySelector("input");
    const quantity = parseNumber(input?.value);
    const points = Number(row.dataset.points || 0);

    autoResult += quantity * points;
  });

  const resultInput = card.querySelector("[data-ipk-result]");
  const isManual = card.dataset.resultManual === "true";
  const result = isManual ? parseNumber(resultInput?.value) : autoResult;
  const missing = Math.max(target - result, 0);

  if (resultInput && !isManual) {
    resultInput.value = String(autoResult);
  }

  rows.forEach(row => {
    const need = row.querySelector(".ipk-need");
    const points = Number(row.dataset.points || 0);

    if (need) {
      need.textContent = points > 0 ? formatNumber(Math.ceil(missing / points)) : "0";
    }
  });

  card.querySelector("[data-ipk-missing]").textContent = formatNumber(missing);

  return result;
}

function updateIpkResults() {
  const total = document.getElementById("ipkTotal");
  let totalResult = 0;

  document.querySelectorAll(".ipk-card").forEach(card => {
    totalResult += calculateCard(card);
  });

  if (total) {
    total.textContent = formatNumber(totalResult);
  }
}

function applyTroopTransferPreset() {
  const preset = readTroopTransferPreset();
  const presetId = preset?.id || preset?.createdAt || "";

  if (!preset || !presetId || localStorage.getItem(TROOP_TRANSFER_APPLIED_KEY) === presetId) return;

  const shouldApplyIpk = preset.targets?.ipk || preset.target === "turtle-ipk" || preset.target === "vs-ipk";
  if (!shouldApplyIpk) return;

  const stages = Array.isArray(preset.stages) ? preset.stages : [];

  stages.forEach(stage => {
    const level = Number(stage.level) || 0;
    const troops = Number(stage.troops) || 0;

    if (level <= 0 || troops <= 0) return;

    ipkValues.set(`troops:troop_upgrade:${level}`, String(troops));
  });

  selectedCategoryIds.add("troops");
  localStorage.setItem(TROOP_TRANSFER_APPLIED_KEY, presetId);
  renderCategoryList(document.getElementById("ipkDesktopCategoriesList"));
  renderCategoryList(document.getElementById("ipkMobileCategoriesList"));
  renderSelectedCards();
}

function renderIpk() {
  const desktopCategories = document.getElementById("ipkDesktopCategoriesList");
  const mobileCategories = document.getElementById("ipkMobileCategoriesList");

  if (!desktopCategories || !mobileCategories) return;

  selectedCategoryIds = new Set(database.categoryIpk.map(category => category.id));

  renderCategoryList(desktopCategories);
  renderCategoryList(mobileCategories);
  setupMobileCategoryCollapse();
  renderSelectedCards();
}

export function init() {
  renderIpk();
  window.setTimeout(applyTroopTransferPreset, 0);
}
