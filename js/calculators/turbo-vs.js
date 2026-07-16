const moduleVersion = new URL(import.meta.url).searchParams.get("v") || "dev";
const { database } = await import(`../../data/database.js?v=${encodeURIComponent(moduleVersion)}`);

const TURBO_WEEK_STATE_PREFIX = "harvesthub_turbo_vs_week_state:";
const TROOP_TRANSFER_STORAGE_KEY = "harvesthub_troop_training_transfer";
const TROOP_TRANSFER_APPLIED_KEY = "harvesthub_troop_training_transfer_applied_turbo_vs";
const TROOP_LEVEL_DEFAULTS = [8, 9, 10];

let isSyncingControls = false;
let currentDayId = "";
let selectedManually = false;
let timerId = null;
let transferTimerId = null;

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
  return row.dataset.actionId ||
    getQuantityControl(row)?.dataset.actionId ||
    row.querySelector(".action-level-select")?.dataset.levelActionId ||
    "";
}

function getRowEventType(row) {
  return row.dataset.eventType || row.querySelector("[data-event-type]")?.dataset.eventType || "";
}

function getTroopRowsFromState(state = {}) {
  const sourceRows = Array.isArray(state.rows)
    ? state.rows
    : Array.isArray(state.stages)
      ? state.stages.map(stage => ({ level: stage.level, value: stage.troops ?? stage.value }))
      : [];

  if (sourceRows.length > 0) {
    return sourceRows
      .slice(0, 3)
      .map((row, index) => ({
        level: String(row.level ?? TROOP_LEVEL_DEFAULTS[index] ?? 10),
        value: String(row.value ?? row.troops ?? "0")
      }));
  }

  if (state.value != null || state.level != null) {
    return [{ level: String(state.level ?? 10), value: String(state.value ?? "0") }];
  }

  return [];
}

function getRowState(row) {
  if (row.classList.contains("action-row-multi-level")) {
    const rows = Array.from(row.querySelectorAll(".action-multi-line")).map(line => ({
      level: line.querySelector("select")?.value || "",
      value: line.querySelector("input")?.value || "0"
    }));
    const filledRows = rows.filter(item => Number(item.value) > 0);
    const lastFilled = filledRows[filledRows.length - 1] || rows[rows.length - 1] || { level: "", value: "0" };

    return {
      value: String(Math.max(0, ...rows.map(item => Number(item.value) || 0))),
      level: lastFilled.level || null,
      rows
    };
  }

  const quantityControl = getQuantityControl(row);
  const levelSelect = row.querySelector(".action-level-select");

  return {
    value: quantityControl?.value || "0",
    level: levelSelect?.value || null
  };
}

function setRowState(row, state = {}) {
  if (row.classList.contains("action-row-multi-level")) {
    const savedRows = getTroopRowsFromState(state);
    const lines = Array.from(row.querySelectorAll(".action-multi-line"));

    lines.forEach((line, index) => {
      const levelSelect = line.querySelector("select");
      const quantityInput = line.querySelector("input");
      const saved = savedRows[index];

      if (levelSelect) levelSelect.value = String(saved?.level ?? TROOP_LEVEL_DEFAULTS[index] ?? 10);
      if (quantityInput) quantityInput.value = String(saved?.value ?? "0");
    });

    return;
  }

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
    const eventType = getRowEventType(row);

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
    const eventType = getRowEventType(row);

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

function createLevelSelect(action, eventType, defaultLevel) {
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

  levelSelect.value = String(defaultLevel);
  return levelSelect;
}

function createTroopMultiControls(action, eventType) {
  const controls = document.createElement("div");
  controls.className = "action-controls action-multi-controls";

  TROOP_LEVEL_DEFAULTS.forEach(defaultLevel => {
    const line = document.createElement("div");
    line.className = "action-multi-line";

    const levelSelect = createLevelSelect(action, eventType, defaultLevel);
    const quantityInput = createNumberInput(action, eventType);
    quantityInput.className = "action-quantity-input";
    quantityInput.dataset.hasLevel = "true";

    line.append(levelSelect, quantityInput);
    controls.appendChild(line);
  });

  return controls;
}

function createActionRow(action, eventType) {
  const row = document.createElement("div");
  row.className = "action-row";
  row.dataset.actionId = action.id;
  row.dataset.eventType = eventType;

  const label = document.createElement("label");
  label.textContent = action.name;

  let controls;

  if (action.id === "troop_upgrade" && action.options) {
    row.classList.add("action-row-multi-level");
    controls = createTroopMultiControls(action, eventType);
  } else {
    controls = document.createElement("div");
    controls.className = "action-controls";

    if (action.options) {
      row.classList.add("action-row-with-level");
      const levelSelect = createLevelSelect(action, eventType, action.options[0]?.value ?? 1);
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
  }

  row.append(label, controls);

  row.querySelectorAll("input, select").forEach(control => {
    control.addEventListener(control.tagName === "SELECT" ? "change" : "input", () => {
      handleControlChange(action.id, control);
    });
  });

  return row;
}

function syncActionControls(actionId, sourceControl) {
  if (isSyncingControls) return;

  isSyncingControls = true;

  const sourceRow = sourceControl.closest(".action-row");
  const sourceState = getRowState(sourceRow);

  document.querySelectorAll(".action-row").forEach(row => {
    if (row === sourceRow) return;
    if (getRowActionId(row) !== actionId) return;

    setRowState(row, sourceState);
  });

  isSyncingControls = false;
}

function calculateRowTotal(row) {
  const eventType = getRowEventType(row);
  const actionId = getRowActionId(row);

  if (row.classList.contains("action-row-multi-level")) {
    return Array.from(row.querySelectorAll(".action-multi-line")).reduce((sum, line) => {
      const level = line.querySelector("select")?.value || null;
      const quantity = Number(line.querySelector("input")?.value) || 0;
      return sum + quantity * getPoints(actionId, eventType, level);
    }, 0);
  }

  const quantityControl = getQuantityControl(row);
  const level = row.querySelector(".action-level-select")?.value || null;

  return (Number(quantityControl?.value) || 0) * getPoints(actionId, eventType, level);
}

function updateTotals() {
  let turtleTotal = 0;
  let vsTotal = 0;

  document.querySelectorAll(".action-row").forEach(row => {
    const eventType = getRowEventType(row);
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
  const rows = actionId === "troop_upgrade" ? getTroopRowsFromState(itemState) : [];

  if (rows.length > 0) {
    return rows.reduce((sum, row) => {
      return sum + (Number(row.value) || 0) * getPoints(actionId, eventType, row.level ?? null);
    }, 0);
  }

  const value = Number(itemState.value) || 0;
  return value * getPoints(actionId, eventType, itemState.level ?? null);
}

function updateWeeklyTotals() {
  if (localStorage.getItem("currentPage") !== "calculator/turbo-vs.html") return;

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

function findTransferDay(eventType, preferredDay) {
  if (preferredDay && database.days[preferredDay] && resolveDayList(database.days[preferredDay][eventType]).includes("troop_upgrade")) {
    return preferredDay;
  }

  return database.dayOrder.find(dayId => resolveDayList(database.days[dayId]?.[eventType]).includes("troop_upgrade")) || "";
}

function applyTroopTransferPreset() {
  const preset = readTroopTransferPreset();
  const presetId = preset?.id || preset?.createdAt || "";

  if (!preset || !presetId || localStorage.getItem(TROOP_TRANSFER_APPLIED_KEY) === presetId) return "";

  const shouldApplyTurtle = preset.targets?.turtle || preset.target === "turtle";
  const shouldApplyVs = preset.targets?.vs || preset.target === "vs";
  const rows = Array.isArray(preset.stages)
    ? preset.stages
      .filter(stage => Number(stage.level) > 0 && Number(stage.troops) > 0)
      .map(stage => ({ level: String(stage.level), value: String(Number(stage.troops) || 0) }))
    : [];

  if (!rows.length || (!shouldApplyTurtle && !shouldApplyVs)) return "";

  const state = readWeekState();
  const itemState = {
    value: String(Math.max(...rows.map(row => Number(row.value) || 0))),
    level: rows[rows.length - 1].level,
    rows
  };
  let openedDay = "";

  database.dayOrder.forEach(dayId => {
    if (shouldApplyTurtle && state[dayId]?.turtle?.troop_upgrade) delete state[dayId].turtle.troop_upgrade;
    if (shouldApplyVs && state[dayId]?.vs?.troop_upgrade) delete state[dayId].vs.troop_upgrade;
  });

  if (shouldApplyTurtle) {
    const dayId = findTransferDay("turtle", preset.preferredDay || "mon");
    if (dayId) {
      state[dayId] = state[dayId] || { turtle: {}, vs: {} };
      state[dayId].turtle = state[dayId].turtle || {};
      state[dayId].turtle.troop_upgrade = itemState;
      openedDay = openedDay || dayId;
    }
  }

  if (shouldApplyVs) {
    const dayId = findTransferDay("vs", preset.preferredDay || "fri");
    if (dayId) {
      state[dayId] = state[dayId] || { turtle: {}, vs: {} };
      state[dayId].vs = state[dayId].vs || {};
      state[dayId].vs.troop_upgrade = itemState;
      openedDay = openedDay || dayId;
    }
  }

  writeWeekState(state);
  localStorage.setItem(TROOP_TRANSFER_APPLIED_KEY, presetId);
  return openedDay;
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

function renderDay(dayId, { skipSave = false } = {}) {
  const day = database.days[dayId];
  const turtleList = document.getElementById("turtleList");
  const vsList = document.getElementById("vsList");

  if (!day || !turtleList || !vsList) return;

  if (!skipSave) saveCurrentDayState();
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

function selectDay(dayId, options = {}) {
  const daySelector = document.getElementById("daySelector");
  if (!daySelector || !database.days[dayId]) return false;

  selectedManually = true;
  daySelector.value = dayId;
  renderDay(dayId, options);
  return true;
}

function applyPendingTroopTransferAfterRestore() {
  const transferDay = applyTroopTransferPreset();
  if (!transferDay) return;

  selectDay(transferDay, { skipSave: true });

  if (typeof window.savePageFormState === "function") {
    window.savePageFormState("calculator/turbo-vs.html");
  }
}

export function init() {
  if (timerId) window.clearInterval(timerId);
  if (transferTimerId) window.clearTimeout(transferTimerId);

  fillDaySelector();
  selectCurrentUtcDay();

  transferTimerId = window.setTimeout(applyPendingTroopTransferAfterRestore, 300);

  window.addEventListener("harvesthub:utc-day-change", () => {
    if (!selectedManually) selectCurrentUtcDay();
  });

  window.addEventListener("harvesthub:profile-change", () => {
    renderDay(currentDayId || getCurrentUtcDayId());
    window.setTimeout(applyPendingTroopTransferAfterRestore, 50);
  });

  timerId = window.setInterval(updateWeeklyTotals, 30000);
}
