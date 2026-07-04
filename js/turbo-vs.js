import { database } from "../data/database.js";

const TURBO_WEEK_STATE_PREFIX = "harvesthub_turbo_vs_week_state:";

let isSyncingControls = false;
let isDaySelectedManually = false;
let currentDayId = "";

/* ==========================================================
ХРАНЕНИЕ ДАННЫХ НЕДЕЛИ
========================================================== */

function getTurboWeekScope() {
  const profile = typeof window.getActiveProfile === "function" ? window.getActiveProfile() : null;
  return profile?.id ? `profile:${profile.id}` : "local";
}

function getTurboWeekStateKey() {
  return `${TURBO_WEEK_STATE_PREFIX}${getTurboWeekScope()}`;
}

function readTurboWeekState() {
  try {
    return JSON.parse(localStorage.getItem(getTurboWeekStateKey()) || "{}");
  } catch (error) {
    console.warn("Не удалось прочитать недельные данные Турбо/VS", error);
    return {};
  }
}

function writeTurboWeekState(state) {
  localStorage.setItem(getTurboWeekStateKey(), JSON.stringify(state));
}

function getRowActionId(row) {
  return row?.querySelector("[data-action-id]")?.dataset.actionId ||
    row?.querySelector("[data-level-action-id]")?.dataset.levelActionId ||
    "";
}

function getRowState(row) {
  const quantityControl = row.querySelector("input[data-action-id], select[data-action-id]");
  const levelSelect = row.querySelector(".action-level-select");

  return {
    value: quantityControl?.value || "0",
    level: levelSelect?.value || null
  };
}

function setRowState(row, state) {
  const quantityControl = row.querySelector("input[data-action-id], select[data-action-id]");
  const levelSelect = row.querySelector(".action-level-select");

  if (quantityControl) quantityControl.value = String(state?.value ?? "0");
  if (levelSelect && state?.level != null) levelSelect.value = String(state.level);
}

function saveCurrentDayState() {
  if (!currentDayId) return;

  const state = readTurboWeekState();
  state[currentDayId] = { turtle: {}, vs: {} };

  document.querySelectorAll(".action-row").forEach(row => {
    const actionId = getRowActionId(row);
    const eventType = row.querySelector("[data-event-type]")?.dataset.eventType;

    if (!actionId || !eventType) return;

    state[currentDayId][eventType][actionId] = getRowState(row);
  });

  writeTurboWeekState(state);
}

function restoreDayState(dayId) {
  const state = readTurboWeekState();
  const dayState = state[dayId];

  if (!dayState) return;

  document.querySelectorAll(".action-row").forEach(row => {
    const actionId = getRowActionId(row);
    const eventType = row.querySelector("[data-event-type]")?.dataset.eventType;

    if (!actionId || !eventType) return;

    setRowState(row, dayState[eventType]?.[actionId]);
  });
}

/* ==========================================================
РАЗВОРАЧИВАЕМ СПИСОК ДНЯ
Поддерживает:
- "blue_bolt"
- { type: "action", id: "blue_bolt" }
- { type: "category", id: "equipment" }
- { type: "text", text: "..." }
========================================================== */

function resolveDayList(list = []) {
  return list.flatMap(item => {
    if (typeof item === "string") {
      return item;
    }

    if (item.type === "action") {
      return item.id;
    }

    if (item.type === "category") {
      return database.action
        .filter(action => action.categoryId === item.id)
        .map(action => action.id);
    }

    if (item.type === "text") {
      return item;
    }

    return [];
  });
}

/* ==========================================================
ПОЛУЧАЕМ ТЕКУЩИЙ ДЕНЬ ПО ГРИНВИЧУ
========================================================== */

function getCurrentUtcDayId() {
  const utcDayId = typeof window.getHarvestHubUtcDayId === "function"
    ? window.getHarvestHubUtcDayId()
    : null;

  if (utcDayId && database.days[utcDayId]) {
    return utcDayId;
  }

  return database.dayOrder[0];
}

/* ==========================================================
ПОЛУЧАЕМ ДЕЙСТВИЕ ПО ID
========================================================== */

function getActionById(actionId) {
  return database.action.find(action => action.id === actionId);
}

/* ==========================================================
СОРТИРУЕМ ДЕЙСТВИЯ ПО ПОРЯДКУ В DATABASE.JS
Сначала порядок категорий из database.category,
внутри категории — порядок действий из database.action.
Текстовые строки оставляем после действий.
========================================================== */

function sortDayItemsByDatabaseOrder(items) {
  return [...items].sort((firstItem, secondItem) => {
    if (typeof firstItem !== "string" && typeof secondItem !== "string") return 0;
    if (typeof firstItem !== "string") return 1;
    if (typeof secondItem !== "string") return -1;

    const firstAction = getActionById(firstItem);
    const secondAction = getActionById(secondItem);

    if (!firstAction || !secondAction) return 0;

    const firstCategoryIndex = database.category.findIndex(category => category.id === firstAction.categoryId);
    const secondCategoryIndex = database.category.findIndex(category => category.id === secondAction.categoryId);

    if (firstCategoryIndex !== secondCategoryIndex) {
      return firstCategoryIndex - secondCategoryIndex;
    }

    const firstActionIndex = database.action.findIndex(action => action.id === firstItem);
    const secondActionIndex = database.action.findIndex(action => action.id === secondItem);

    return firstActionIndex - secondActionIndex;
  });
}

/* ==========================================================
СИНХРОНИЗИРУЕМ ОДИНАКОВЫЕ ДЕЙСТВИЯ
Если действие есть и в Черепашке, и в VS, значение дублируется.
========================================================== */

function getQuantityControl(row) {
  return row.querySelector("input[data-action-id], select[data-action-id]");
}

function syncActionControls(actionId, sourceControl) {
  if (isSyncingControls) return;

  isSyncingControls = true;

  const sourceRow = sourceControl.closest(".action-row");
  const sourceQuantityControl = sourceControl.matches("input[data-action-id], select[data-action-id]")
    ? sourceControl
    : null;
  const sourceLevelSelect = sourceControl.classList.contains("action-level-select")
    ? sourceControl
    : null;

  const rows = document.querySelectorAll(".action-row");

  rows.forEach(row => {
    if (row === sourceRow) return;

    const rowQuantityControl = getQuantityControl(row);
    const rowLevelSelect = row.querySelector(".action-level-select");
    const rowActionId = rowQuantityControl?.dataset.actionId || rowLevelSelect?.dataset.levelActionId;

    if (rowActionId !== actionId) return;

    if (sourceQuantityControl && rowQuantityControl) {
      rowQuantityControl.value = sourceQuantityControl.value;
    }

    if (sourceLevelSelect && rowLevelSelect) {
      rowLevelSelect.value = sourceLevelSelect.value;
    }
  });

  isSyncingControls = false;
}

function handleControlChange(actionId, sourceControl) {
  syncActionControls(actionId, sourceControl);
  updateTotals();
  saveCurrentDayState();
  updateWeeklyTotals();
}

/* ==========================================================
СОЗДАЁМ ТЕКСТОВУЮ СТРОКУ
========================================================== */

function createTextRow(text) {
  const row = document.createElement("div");
  row.className = "action-row action-row-text";
  row.textContent = text;

  return row;
}

/* ==========================================================
СОЗДАЁМ СТРОКУ ДЕЙСТВИЯ
========================================================== */

function createActionRow(action, eventType) {
  const row = document.createElement("div");
  row.className = "action-row";

  const label = document.createElement("label");
  label.textContent = action.name;

  const controls = document.createElement("div");
  controls.className = "action-controls";

  if (action.options) {
    row.classList.add("action-row-with-level");

    const levelSelect = document.createElement("select");
    levelSelect.className = "action-level-select";
    levelSelect.dataset.levelActionId = action.id;
    levelSelect.dataset.eventType = eventType;
    levelSelect.dataset.noPersist = "true";

    action.options.forEach(optionData => {
      const option = document.createElement("option");
      option.value = optionData.value;
      option.textContent = optionData.label;
      levelSelect.appendChild(option);
    });

    const quantityInput = document.createElement("input");
    quantityInput.type = "number";
    quantityInput.min = "0";
    quantityInput.value = "0";
    quantityInput.className = "action-quantity-input";

    quantityInput.dataset.actionId = action.id;
    quantityInput.dataset.eventType = eventType;
    quantityInput.dataset.hasLevel = "true";
    quantityInput.dataset.noPersist = "true";

    levelSelect.addEventListener("change", () => {
      handleControlChange(action.id, levelSelect);
    });

    quantityInput.addEventListener("input", () => {
      handleControlChange(action.id, quantityInput);
    });

    controls.append(levelSelect, quantityInput);
    row.append(label, controls);

    return row;
  }

  if (action.quantityOptions) {
    const quantitySelect = document.createElement("select");
    quantitySelect.className = "action-quantity-select";

    const zeroOption = document.createElement("option");
    zeroOption.value = "0";
    zeroOption.textContent = "0";
    quantitySelect.appendChild(zeroOption);

    for (let i = action.quantityOptions.min; i <= action.quantityOptions.max; i++) {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = i;
      quantitySelect.appendChild(option);
    }

    quantitySelect.dataset.actionId = action.id;
    quantitySelect.dataset.eventType = eventType;
    quantitySelect.dataset.noPersist = "true";

    quantitySelect.addEventListener("change", () => {
      handleControlChange(action.id, quantitySelect);
    });

    controls.appendChild(quantitySelect);
    row.append(label, controls);

    return row;
  }

  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.value = "0";

  input.dataset.actionId = action.id;
  input.dataset.eventType = eventType;
  input.dataset.noPersist = "true";

  input.addEventListener("input", () => {
    handleControlChange(action.id, input);
  });

  controls.appendChild(input);
  row.append(label, controls);

  return row;
}

/* ==========================================================
ПОЛУЧАЕМ ОЧКИ ЗА ДЕЙСТВИЕ
Берём очки из самого действия: action.points.
Для действий с уровнями берём action.points[eventType][level].
========================================================== */

function getPoints(actionId, eventType, level = null) {
  const action = getActionById(actionId);

  if (!action || !action.points) return 0;

  const points = action.points[eventType];

  if (points == null) return 0;

  if (typeof points === "object") {
    return Number(points[level]) || 0;
  }

  return Number(points) || 0;
}

function calculateSavedItemTotal(actionId, eventType, itemState = {}) {
  const value = Number(itemState.value) || 0;
  const points = getPoints(actionId, eventType, itemState.level ?? null);

  return value * points;
}

/* ==========================================================
ОБНОВЛЯЕМ ИТОГИ
========================================================== */

function updateTotals() {
  let turtleTotal = 0;
  let vsTotal = 0;

  const controls = document.querySelectorAll(
    ".action-row input[data-action-id], .action-row select[data-action-id]"
  );

  controls.forEach(control => {
    const value = Number(control.value) || 0;
    const actionId = control.dataset.actionId;
    const eventType = control.dataset.eventType;
    const row = control.closest(".action-row");
    const levelSelect = row?.querySelector(".action-level-select");
    const level = levelSelect ? levelSelect.value : null;

    const points = getPoints(actionId, eventType, level);
    const total = value * points;

    if (eventType === "turtle") {
      turtleTotal += total;
    }

    if (eventType === "vs") {
      vsTotal += total;
    }
  });

  const turtleTotalElement = document.getElementById("turtleTotal");
  const vsTotalElement = document.getElementById("vsTotal");

  if (turtleTotalElement) {
    turtleTotalElement.textContent = turtleTotal.toLocaleString("ru-RU");
  }

  if (vsTotalElement) {
    vsTotalElement.textContent = vsTotal.toLocaleString("ru-RU");
  }
}

function calculateWeeklyTotals() {
  saveCurrentDayState();

  const state = readTurboWeekState();
  let turtleTotal = 0;
  let vsTotal = 0;

  database.dayOrder.forEach(dayId => {
    const dayState = state[dayId];
    if (!dayState) return;

    Object.entries(dayState.turtle || {}).forEach(([actionId, itemState]) => {
      turtleTotal += calculateSavedItemTotal(actionId, "turtle", itemState);
    });

    Object.entries(dayState.vs || {}).forEach(([actionId, itemState]) => {
      vsTotal += calculateSavedItemTotal(actionId, "vs", itemState);
    });
  });

  return { turtleTotal, vsTotal };
}

function updateWeeklyTotals() {
  const turtleWeekTotalElement = document.getElementById("turboProfileTurtleWeekTotal");
  const vsWeekTotalElement = document.getElementById("turboProfileVsWeekTotal");

  if (!turtleWeekTotalElement || !vsWeekTotalElement) return;

  const totals = calculateWeeklyTotals();

  turtleWeekTotalElement.textContent = totals.turtleTotal.toLocaleString("ru-RU");
  vsWeekTotalElement.textContent = totals.vsTotal.toLocaleString("ru-RU");
}

function renderTurboProfileBlock() {
  if (typeof window.setProfileBlockContent !== "function") return;

  const container = document.createElement("div");
  container.className = "turbo-profile-block";

  container.innerHTML = `
    <div class="profile-block-grid">
      <div class="profile-block-result">
        <span>Всего Турбочерепашка за неделю</span><br>
        <strong id="turboProfileTurtleWeekTotal">0</strong>
      </div>

      <div class="profile-block-result">
        <span>Всего VS Дуэль союза за неделю</span><br>
        <strong id="turboProfileVsWeekTotal">0</strong>
      </div>
    </div>

    <p class="profile-block-note">Заполни значения по каждому дню недели. Калькулятор сохранит введённые данные отдельно по дням и покажет общую сумму очков за неделю.</p>
  `;

  window.setProfileBlockContent({
    description: "Сумма очков по всем заполненным дням недели.",
    content: container
  });

  updateWeeklyTotals();
}

/* ==========================================================
РИСУЕМ СПИСОК
========================================================== */

function renderList(container, items, eventType) {
  items.forEach(item => {
    if (typeof item !== "string") {
      if (item.type === "text") {
        container.appendChild(createTextRow(item.text));
      }

      return;
    }

    const action = getActionById(item);
    if (!action) return;

    container.appendChild(createActionRow(action, eventType));
  });
}

/* ==========================================================
РИСУЕМ ДЕНЬ
========================================================== */

function renderDay(dayId) {
  saveCurrentDayState();

  const day = database.days[dayId];

  if (!day) return;

  currentDayId = dayId;

  const turtleList = document.getElementById("turtleList");
  const vsList = document.getElementById("vsList");

  if (!turtleList || !vsList) {
    console.error("Не найдены контейнеры turtleList или vsList");
    return;
  }

  turtleList.innerHTML = "";
  vsList.innerHTML = "";

  const turtleItems = sortDayItemsByDatabaseOrder(resolveDayList(day.turtle || []));
  const vsItems = sortDayItemsByDatabaseOrder(resolveDayList(day.vs || []));

  renderList(turtleList, turtleItems, "turtle");
  renderList(vsList, vsItems, "vs");
  restoreDayState(dayId);

  updateTotals();
  updateWeeklyTotals();
}

/* ==========================================================
ЗАПУСК КАЛЬКУЛЯТОРА
========================================================== */

export function init() {
  const daySelector = document.getElementById("daySelector");

  if (!daySelector) return;

  currentDayId = "";
  daySelector.innerHTML = "";

  database.dayOrder.forEach(dayId => {
    const day = database.days[dayId];

    if (!day) return;

    const option = document.createElement("option");
    option.value = dayId;
    option.textContent = day.name;

    daySelector.appendChild(option);
  });

  renderTurboProfileBlock();
  daySelector.value = getCurrentUtcDayId();

  daySelector.addEventListener("change", () => {
    isDaySelectedManually = true;
    renderDay(daySelector.value);
  });

  window.addEventListener("harvesthub:utc-day-change", event => {
    if (isDaySelectedManually) return;

    const dayId = event.detail?.dayId;

    if (!dayId || !database.days[dayId]) return;

    daySelector.value = dayId;
    renderDay(dayId);
  });

  window.addEventListener("harvesthub:profile-change", () => {
    renderTurboProfileBlock();
    renderDay(daySelector.value);
  });

  renderDay(daySelector.value);
}
