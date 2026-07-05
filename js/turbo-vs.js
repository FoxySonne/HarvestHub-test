const moduleVersion = new URL(import.meta.url).searchParams.get("v") || "dev";
const { database } = await import(`../data/database.js?v=${encodeURIComponent(moduleVersion)}`);

const TURBO_WEEK_STATE_PREFIX = "harvesthub_turbo_vs_week_state:";
const TROOP_TRANSFER_STORAGE_KEY = "harvesthub_troop_training_transfer";
const TROOP_TRANSFER_APPLIED_KEY = "harvesthub_troop_training_transfer_applied_turbo_vs";

let isSyncingControls = false;
let currentDayId = "";
let selectedManually = false;
let timerId = null;

function getWeekScope() {
  const profile = typeof window.getActiveProfile === "function" ? window.getActiveProfile() : null;
  return profile?.id ? `profile:${profile.id}` : "local";
}

function getWeekStateKey() {
  return `${TURBO_WEEK_STATE_PREFIX}${getWeekScope()}`;
}

function readWeekState() {
  try {
    return JSON.parse(localStorage.getItem(getWeekStateKey()) || "{}");
  } catch (error) {
    console.warn("Не удалось прочитать недельные данные Турбо/VS", error);
    return {};
  }
}

function writeWeekState(state) {
  localStorage.setItem(getWeekStateKey(), JSON.stringify(state));
}

function readTroopTransferPreset() {
  try {
    return JSON.parse(localStorage.getItem(TROOP_TRANSFER_STORAGE_KEY) || "null");
  } catch (error) {
    console.warn("Не удалось прочитать заготовку обучения войск", error);
    return null;
  }
}

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString("ru-RU");
}

function getActionById(actionId) {
  return database.action.find(action => action.id === actionId);
}

function resolveDayList(list = []) {
  return list.flatMap(item => {
    if (typeof item === "string") return item;
    if (item.type === "action") return item.id;
    if (item.type === "category") {
      return database.action
        .filter(action => action.categoryId === item.id)
        .map(action => action.id);
    }
    if (item.type === "text") return item;
    return [];
  });
}

function sortDayItems(items) {
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

    return database.action.findIndex(action => action.id === firstItem) -
      database.action.findIndex(action => action.id === secondItem);
  });
}

function getCurrentUtcDayId() {
  const utcDayId = typeof window.getHarvestHubUtcDayId === "function"
    ? window.getHarvestHubUtcDayId()
    : null;

  return utcDayId && database.days[utcDayId] ? utcDayId : database.dayOrder[0];
}

function getPoints(actionId, eventType, level = null) {
  const action = getActionById(actionId);
  const points = action?.points?.[eventType];

  if (points == null) return 0;
  if (typeof points === "object") return Number(points[level]) || 0;

  return Number(points) || 0;
}

function getQuantityControl(row) {
  return row.querySelector("input[data-action-id], select[data-action-id]");
}

function getRowActionId(row) {
  return getQuantityControl(row)?.dataset.actionId ||
    row.querySelector(".action-level-select")?.dataset.levelActionId ||
    "";
}

function getRowState(row) {
  const quantityControl = getQuantityControl(row);
  const levelSelect = row.querySelector(".action-level-select");

  return {
    value: quantityControl?.value || "0",
    level: levelSelect?.value || null
  };
}

function setRowState(row, state) {
  const quantityControl = getQuantityControl(row);
  const levelSelect = row.querySelector(".action-level-select");

  if (quantityControl) quantityControl.value = String(state?.value ?? "0");
  if (levelSelect && state?.level != null) levelSelect.value = String(state.level);
}

function saveCurrentDayState() {
  if (!currentDayId) return;

  const state = readWeekState();
  state[currentDayId] = { turtle: {}, vs: {} };

  document.querySelectorAll(".action-row").forEach(row => {
    const actionId = getRowActionId(row);
    const eventType = row.querySelector("[data-event-type]")?.dataset.eventType;

    if (!actionId || !eventType) return;

    state[currentDayId][eventType][actionId] = getRowState(row);
  });

  writeWeekState(state);
}

function restoreDayState(dayId) {
  const dayState = readWeekState()[dayId];

  if (!dayState) return;

  document.querySelectorAll(".action-row").forEach(row => {
    const actionId = getRowActionId(row);
    const eventType = row.querySelector("[data-event-type]")?.dataset.eventType;

    if (!actionId || !eventType) return;

    setRowState(row, dayState[eventType]?.[actionId]);
  });
}

function createTextRow(text) {
  const row = document.createElement("div");
  row.className = "action-row action-row-text";
  row.textContent = text;
  return row;
}

function createQuantitySelect(action, eventType) {
  const select = document.createElement("select");
  select.className = "action-quantity-select";
  select.dataset.actionId = action.id;
  select.dataset.eventType = eventType;
  select.dataset.noPersist = "true";

  const zeroOption = document.createElement("option");
  zeroOption.value = "0";
  zeroOption.textContent = "0";
  select.appendChild(zeroOption);

  for (let value = action.quantityOptions.min; value <= action.quantityOptions.max; value++) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }

  return select;
}

function createNumberInput(action, eventType) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.value = "0";
  input.dataset.actionId = action.id;
  input.dataset.eventType = eventType;
  input.dataset.noPersist = "true";
  return input;
}

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

    const quantityInput = createNumberInput(action, eventType);
    quantityInput.className = "action-quantity-input";
    quantityInput.dataset.hasLevel = "true";

    controls.append(levelSelect, quantityInput);
  } else {
    const quantityControl = action.quantityOptions
      ? createQuantitySelect(action, eventType)
      : createNumberInput(action, eventType);

    controls.appendChild(quantityControl);
  }

  row.append(label, controls);

  row.querySelectorAll("input, select").forEach(control => {
    const actionId = control.dataset.actionId || control.dataset.levelActionId;
    control.addEventListener(control.tagName === "SELECT" ? "change" : "input", () => {
      handleControlChange(actionId, control);
    });
  });

  return row;
}

function syncActionControls(actionId, sourceControl) {
  if (isSyncingControls) return;

  isSyncingControls = true;

  const sourceRow = sourceControl.closest(".action-row");
  const isQuantitySource = sourceControl.matches("input[data-action-id], select[data-action-id]");
  const isLevelSource = sourceControl.classList.contains("action-level-select");

  document.querySelectorAll(".action-row").forEach(row => {
    if (row === sourceRow) return;

    const quantityControl = getQuantityControl(row);
    const levelSelect = row.querySelector(".action-level-select");
    const rowActionId = quantityControl?.dataset.actionId || levelSelect?.dataset.levelActionId;

    if (rowActionId !== actionId) return;

    if (isQuantitySource && quantityControl) quantityControl.value = sourceControl.value;
    if (isLevelSource && levelSelect) levelSelect.value = sourceControl.value;
  });

  isSyncingControls = false;
}

function calculateRowTotal(row) {
  const quantityControl = getQuantityControl(row);
  const eventType = quantityControl?.dataset.eventType;
  const actionId = quantityControl?.dataset.actionId;
  const level = row.querySelector(".action-level-select")?.value || null;

  return (Number(quantityControl?.value) || 0) * getPoints(actionId, eventType, level);
}

function updateTotals() {
  let turtleTotal = 0;
  let vsTotal = 0;

  document.querySelectorAll(".action-row").forEach(row => {
    const eventType = getQuantityControl(row)?.dataset.eventType;
    const total = calculateRowTotal(row);

    if (eventType === "turtle") turtleTotal += total;
    if (eventType === "vs") vsTotal += total;
  });

  const turtleTotalElement = document.getElementById("turtleTotal");
  const vsTotalElement = document.getElementById("vsTotal");

  if (turtleTotalElement) turtleTotalElement.textContent = formatNumber(turtleTotal);
  if (vsTotalElement) vsTotalElement.textContent = formatNumber(vsTotal);
}

function calculateSavedItemTotal(actionId, eventType, itemState = {}) {
  const value = Number(itemState.value) || 0;
  return value * getPoints(actionId, eventType, itemState.level ?? null);
}

function updateWeeklyTotals() {
  const state = readWeekState();
  let turtleTotal = 0;
  let vsTotal = 0;

  Object.values(state).forEach(dayState => {
    Object.entries(dayState?.turtle || {}).forEach(([actionId, itemState]) => {
      turtleTotal += calculateSavedItemTotal(actionId, "turtle", itemState);
    });

    Object.entries(dayState?.vs || {}).forEach(([actionId, itemState]) => {
      vsTotal += calculateSavedItemTotal(actionId, "vs", itemState);
    });
  });

  if (typeof window.setProfileBlockContent === "function") {
    window.setProfileBlockContent({
      description: "Недельные итоги Турбочерепашки и VS сохраняются для текущего профиля или этого устройства.",
      content: `
        <div class="result-block">
          <h4>Всего Турбочерепашка за неделю:</h4>
          <div>${formatNumber(turtleTotal)}</div>
        </div>
        <div class="result-block">
          <h4>Всего VS Дуэль союза за неделю:</h4>
          <div>${formatNumber(vsTotal)}</div>
        </div>
      `
    });
  }
}

function applyTroopTransferPreset() {
  const preset = readTroopTransferPreset();
  const presetId = preset?.id || preset?.createdAt || "";

  if (!preset || !presetId || localStorage.getItem(TROOP_TRANSFER_APPLIED_KEY) === presetId) return;

  const shouldApplyTurtle = preset.targets?.turtle || preset.target === "turtle" || preset.target === "turtle-ipk";
  const shouldApplyVs = preset.targets?.vs || preset.target === "vs" || preset.target === "vs-ipk";
  const stages = Array.isArray(preset.stages) ? preset.stages.filter(stage => Number(stage.level) > 0 && Number(stage.troops) > 0) : [];
  const lastStage = stages[stages.length - 1];

  if (!lastStage || (!shouldApplyTurtle && !shouldApplyVs)) return;

  const state = readWeekState();
  const itemState = {
    value: String(Number(lastStage.troops) || 0),
    level: String(lastStage.level)
  };

  database.dayOrder.forEach(dayId => {
    const day = database.days[dayId];
    if (!day) return;

    [
      ["turtle", shouldApplyTurtle],
      ["vs", shouldApplyVs]
    ].forEach(([eventType, shouldApply]) => {
      if (!shouldApply) return;
      if (!resolveDayList(day[eventType]).includes("troop_upgrade")) return;

      state[dayId] = state[dayId] || { turtle: {}, vs: {} };
      state[dayId][eventType] = state[dayId][eventType] || {};
      state[dayId][eventType].troop_upgrade = itemState;
    });
  });

  writeWeekState(state);
  localStorage.setItem(TROOP_TRANSFER_APPLIED_KEY, presetId);
}

function handleControlChange(actionId, sourceControl) {
  syncActionControls(actionId, sourceControl);
  updateTotals();
  saveCurrentDayState();
  updateWeeklyTotals();
}

function renderEventList(container, list, eventType) {
  container.innerHTML = "";

  sortDayItems(resolveDayList(list)).forEach(item => {
    if (typeof item !== "string") {
      container.appendChild(createTextRow(item.text));
      return;
    }

    const action = getActionById(item);
    if (!action) return;

    container.appendChild(createActionRow(action, eventType));
  });
}

function renderDay(dayId) {
  const day = database.days[dayId];
  const turtleList = document.getElementById("turtleList");
  const vsList = document.getElementById("vsList");

  if (!day || !turtleList || !vsList) return;

  saveCurrentDayState();
  currentDayId = dayId;

  renderEventList(turtleList, day.turtle, "turtle");
  renderEventList(vsList, day.vs, "vs");

  restoreDayState(dayId);
  updateTotals();
  updateWeeklyTotals();
}

function fillDaySelector() {
  const daySelector = document.getElementById("daySelector");
  if (!daySelector) return;

  daySelector.innerHTML = "";

  database.dayOrder.forEach(dayId => {
    const option = document.createElement("option");
    option.value = dayId;
    option.textContent = database.days[dayId].name;
    daySelector.appendChild(option);
  });

  daySelector.addEventListener("change", () => {
    selectedManually = true;
    renderDay(daySelector.value);
  });
}

function selectCurrentUtcDay() {
  const daySelector = document.getElementById("daySelector");
  if (!daySelector) return;

  const dayId = getCurrentUtcDayId();
  daySelector.value = dayId;
  renderDay(dayId);
}

export function init() {
  if (timerId) window.clearInterval(timerId);

  applyTroopTransferPreset();
  fillDaySelector();
  selectCurrentUtcDay();

  window.addEventListener("harvesthub:utc-day-change", () => {
    if (!selectedManually) selectCurrentUtcDay();
  });

  window.addEventListener("harvesthub:profile-change", () => {
    renderDay(currentDayId || getCurrentUtcDayId());
  });

  timerId = window.setInterval(updateWeeklyTotals, 30000);
}
