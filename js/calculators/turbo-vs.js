import { createTurboVsDataModel } from "../turbo-vs/data-model.js?v=20260720-1";
import {
  isTroopTransferApplied,
  markTroopTransferApplied,
  readAllianceDuelBranchEnabled,
  readTroopTransferPreset,
  readWeekState,
  writeAllianceDuelBranchEnabled,
  writeWeekState
} from "../turbo-vs/storage.js?v=20260720-1";
import { createTurboVsView } from "../turbo-vs/view.js";

const moduleVersion = new URL(import.meta.url).searchParams.get("v") || "dev";
const { database } = await import(`../../data/database.js?v=${encodeURIComponent(moduleVersion)}`);

let allianceDuelBranchEnabled = false;

const {
  calculateSavedItemTotal,
  getActionById,
  getPoints,
  getTroopRowsFromState,
  resolveDayList,
  sortDayItems
} = createTurboVsDataModel(database, {
  isAllianceDuelBranchEnabled: () => allianceDuelBranchEnabled && window.getAdvancedMode?.() === true
});

let isSyncingControls = false;
let currentDayId = "";
let selectedManually = false;
let timerId = null;
let transferTimerId = null;

const {
  calculateRowTotal,
  createActionRow,
  createTextRow,
  getRowActionId,
  getRowEventType,
  getRowState,
  setRowState
} = createTurboVsView({
  getPoints,
  getTroopRowsFromState,
  onControlChange: (actionId, control) => handleControlChange(actionId, control)
});

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString("ru-RU");
}

function getCurrentUtcDayId() {
  const utcDayId = typeof window.getHarvestHubUtcDayId === "function"
    ? window.getHarvestHubUtcDayId()
    : null;

  return utcDayId && database.days[utcDayId] ? utcDayId : database.dayOrder[0];
}

function initAllianceDuelBranchToggle() {
  const toggle = document.getElementById("allianceDuelBranchToggle");
  allianceDuelBranchEnabled = readAllianceDuelBranchEnabled();

  if (!toggle) return;

  toggle.checked = allianceDuelBranchEnabled;
  toggle.addEventListener("change", () => {
    allianceDuelBranchEnabled = toggle.checked;
    writeAllianceDuelBranchEnabled(allianceDuelBranchEnabled);
    updateTotals();
    updateWeeklyTotals();
  });
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

  if (!preset || !presetId || isTroopTransferApplied(presetId)) return "";

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
  markTroopTransferApplied(presetId);
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
  initAllianceDuelBranchToggle();
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
