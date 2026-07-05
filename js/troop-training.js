const RESOURCE_CONFIG = [
  { key: "food", label: "Еда", availableId: "troopAvailableFood" },
  { key: "wood", label: "Дерево", availableId: "troopAvailableWood" },
  { key: "metal", label: "Металл", availableId: "troopAvailableMetal" },
  { key: "fuel", label: "Топливо", availableId: "troopAvailableFuel" }
];

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const TRANSFER_STORAGE_KEY = "harvesthub_troop_training_transfer";

function getElement(id) {
  return document.getElementById(id);
}

function getAdvancedMode() {
  return typeof window.getAdvancedMode === "function" ? window.getAdvancedMode() : document.body.classList.contains("advanced-mode");
}

function normalizeNumberText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/[кk]$/i, "000")
    .replace(/[мm]$/i, "000000");
}

function parseNumber(value) {
  const number = Number(normalizeNumberText(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function parseAvailableResource(inputId) {
  const input = getElement(inputId);
  const value = parseNumber(input?.value);
  const activeUnit = document.querySelector(`[data-unit-for="${inputId}"] .is-active`)?.dataset.unit || "raw";

  return activeUnit === "m" ? value * 1000000 : value;
}

function parseTimeToSeconds(value, allowDays = false) {
  const text = String(value || "").trim().toLowerCase();

  if (!text) return 0;

  let days = 0;
  let timeText = text;
  const dayMatch = text.match(/^(\d+)\s*д\s*(.*)$/);

  if (allowDays && dayMatch) {
    days = Number(dayMatch[1]) || 0;
    timeText = dayMatch[2] || "00:00:00";
  }

  const parts = timeText.split(":").map(part => Number(part) || 0);

  while (parts.length < 3) parts.unshift(0);

  const [hours, minutes, seconds] = parts.slice(-3);

  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

function formatNumber(value) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("ru-RU");
}

function formatResource(value) {
  const number = Math.max(0, Math.ceil(Number(value) || 0));

  if (number >= 1000000) {
    const millions = number / 1000000;
    return `${millions.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} М`;
  }

  return formatNumber(number);
}

function formatDuration(totalSeconds, { showDays = true } = {}) {
  const secondsValue = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  const days = Math.floor(secondsValue / 86400);
  const hours = Math.floor((secondsValue % 86400) / 3600);
  const minutes = Math.floor((secondsValue % 3600) / 60);
  const seconds = secondsValue % 60;
  const time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return showDays && days > 0 ? `${days}д ${time}` : time;
}

function roundTroops(value) {
  return Math.max(0, Math.floor((Number(value) || 0) / 1000) * 1000);
}

function fillLevelSelect(select, defaultLevel) {
  if (!select) return;

  select.innerHTML = "";

  LEVELS.forEach(level => {
    const option = document.createElement("option");
    option.value = String(level);
    option.textContent = `${level} ур.`;
    select.appendChild(option);
  });

  select.value = String(defaultLevel);
}

function createStageFields(stageCard) {
  const stage = Number(stageCard.dataset.stage);
  const container = stageCard.querySelector(".troop-stage-grid");

  if (!container) return;

  container.innerHTML = `
    <label class="troop-field">
      <span>Уровень войск</span>
      <select id="troopStage${stage}Level"></select>
    </label>
    <label class="troop-field">
      <span>Еда на 1000</span>
      <input id="troopStage${stage}Food" type="text" inputmode="decimal" autocomplete="off">
    </label>
    <label class="troop-field">
      <span>Дерево на 1000</span>
      <input id="troopStage${stage}Wood" type="text" inputmode="decimal" autocomplete="off">
    </label>
    <label class="troop-field">
      <span>Металл на 1000</span>
      <input id="troopStage${stage}Metal" type="text" inputmode="decimal" autocomplete="off">
    </label>
    <label class="troop-field">
      <span>Топливо на 1000</span>
      <input id="troopStage${stage}Fuel" type="text" inputmode="decimal" autocomplete="off">
    </label>
    <label class="troop-field">
      <span>Время на 1000</span>
      <input id="troopStage${stage}Time" type="text" placeholder="00:00:00" inputmode="numeric" autocomplete="off">
    </label>
  `;

  fillLevelSelect(getElement(`troopStage${stage}Level`), stage === 1 ? 8 : stage === 2 ? 9 : 10);
}

function getAvailableData() {
  const resources = {};

  RESOURCE_CONFIG.forEach(resource => {
    resources[resource.key] = parseAvailableResource(resource.availableId);
  });

  return {
    resources,
    time: parseTimeToSeconds(getElement("troopAvailableTime")?.value, true),
    garrisonCapacity: parseNumber(getElement("troopGarrisonCapacity")?.value),
    desired: parseNumber(getElement("troopDesiredAmount")?.value),
    currentAmount: parseNumber(getElement("troopCurrentAmount")?.value),
    currentLevel: getElement("troopCurrentLevel")?.value || ""
  };
}

function getStageData(stageCard) {
  const stage = Number(stageCard.dataset.stage);
  const costs = {
    food: parseNumber(getElement(`troopStage${stage}Food`)?.value),
    wood: parseNumber(getElement(`troopStage${stage}Wood`)?.value),
    metal: parseNumber(getElement(`troopStage${stage}Metal`)?.value),
    fuel: parseNumber(getElement(`troopStage${stage}Fuel`)?.value)
  };
  const time = parseTimeToSeconds(getElement(`troopStage${stage}Time`)?.value, false);
  const level = getElement(`troopStage${stage}Level`)?.value || "";
  const hasCost = Object.values(costs).some(value => value > 0) || time > 0;

  return {
    stage,
    level,
    title: stage === 1 ? "Обучение" : "Улучшение",
    costs,
    time,
    isActive: stage === 1 || hasCost
  };
}

function getActiveStages() {
  const isAdvanced = getAdvancedMode();

  return Array.from(document.querySelectorAll(".troop-stage-card"))
    .filter(card => isAdvanced || Number(card.dataset.stage) === 1)
    .map(getStageData)
    .filter(stage => stage.isActive);
}

function getCostForTroops(stages, troops) {
  const multiplier = troops / 1000;
  const resources = { food: 0, wood: 0, metal: 0, fuel: 0 };
  let time = 0;

  stages.forEach(stage => {
    RESOURCE_CONFIG.forEach(resource => {
      resources[resource.key] += stage.costs[resource.key] * multiplier;
    });

    time += stage.time * multiplier;
  });

  return { resources, time };
}

function getMaxTroopsByAvailable(stages, available) {
  if (stages.length === 0) return 0;

  const perThousand = getCostForTroops(stages, 1000);
  const limits = [];

  RESOURCE_CONFIG.forEach(resource => {
    const cost = perThousand.resources[resource.key];
    if (cost > 0) limits.push((available.resources[resource.key] / cost) * 1000);
  });

  if (perThousand.time > 0) limits.push((available.time / perThousand.time) * 1000);

  const freeGarrison = Math.max(available.garrisonCapacity - available.currentAmount, 0);
  if (available.garrisonCapacity > 0) limits.push(freeGarrison);

  if (limits.length === 0) return 0;

  return roundTroops(Math.min(...limits));
}

function buildCalculation() {
  const available = getAvailableData();
  const stages = getActiveStages();
  const maxTroops = getMaxTroopsByAvailable(stages, available);
  const desired = available.desired;
  const possibleTroops = desired > 0 ? Math.min(desired, maxTroops || desired) : maxTroops;
  const targetTroops = desired > 0 ? desired : possibleTroops;
  const required = getCostForTroops(stages, targetTroops);
  const spent = getCostForTroops(stages, possibleTroops);
  const remainders = { resources: {}, time: Math.max(available.time - spent.time, 0) };
  const missing = { resources: {}, time: Math.max(required.time - available.time, 0), garrison: 0 };
  const freeGarrison = Math.max(available.garrisonCapacity - available.currentAmount, 0);

  RESOURCE_CONFIG.forEach(resource => {
    const key = resource.key;
    remainders.resources[key] = Math.max(available.resources[key] - spent.resources[key], 0);
    missing.resources[key] = Math.max(required.resources[key] - available.resources[key], 0);
  });

  if (available.garrisonCapacity > 0) {
    missing.garrison = Math.max(targetTroops - freeGarrison, 0);
  }

  return {
    available,
    stages,
    possibleTroops: roundTroops(possibleTroops),
    targetTroops: roundTroops(targetTroops),
    required,
    spent,
    remainders,
    missing,
    desiredMode: desired > 0
  };
}

function calculateExtraTraining(calculation) {
  const stages = calculation.stages;
  const perThousand = getCostForTroops(stages, 1000);
  const capacities = [];

  RESOURCE_CONFIG.forEach(resource => {
    const cost = perThousand.resources[resource.key];
    if (cost > 0) capacities.push((calculation.remainders.resources[resource.key] / cost) * 1000);
  });

  if (perThousand.time > 0) capacities.push((calculation.remainders.time / perThousand.time) * 1000);

  const freeGarrison = Math.max(calculation.available.garrisonCapacity - calculation.available.currentAmount - calculation.possibleTroops, 0);
  const rawExtra = capacities.length > 0 ? Math.max(...capacities) : 0;
  const extraTroops = roundTroops(rawExtra);
  const extraRequired = getCostForTroops(stages, extraTroops);
  const shortages = { resources: {}, time: 0, garrison: 0 };

  RESOURCE_CONFIG.forEach(resource => {
    const key = resource.key;
    shortages.resources[key] = Math.max(extraRequired.resources[key] - calculation.remainders.resources[key], 0);
  });

  shortages.time = Math.max(extraRequired.time - calculation.remainders.time, 0);
  shortages.garrison = Math.max(extraTroops - freeGarrison, 0);

  return { extraTroops, shortages };
}

function renderResourceList(container, items) {
  if (!container) return;

  container.innerHTML = items.map(item => `
    <div>
      <span>${item.label}</span>
      <strong>${item.value}</strong>
    </div>
  `).join("");
}

function renderResults() {
  const calculation = buildCalculation();
  const possibleElement = getElement("troopPossibleTotal");
  const stageResults = getElement("troopStageResults");
  const extra = calculateExtraTraining(calculation);

  if (possibleElement) possibleElement.textContent = formatNumber(calculation.possibleTroops);

  if (stageResults) {
    stageResults.innerHTML = calculation.stages.map(stage => `
      <div>
        <span>${stage.level || stage.stage} уровень</span>
        <strong>${formatNumber(calculation.possibleTroops)}</strong>
      </div>
    `).join("");
  }

  renderResourceList(getElement("troopRemainders"), [
    { label: "Еда", value: formatResource(calculation.remainders.resources.food) },
    { label: "Дерево", value: formatResource(calculation.remainders.resources.wood) },
    { label: "Металл", value: formatResource(calculation.remainders.resources.metal) },
    { label: "Топливо", value: formatResource(calculation.remainders.resources.fuel) },
    { label: "Время / ускорения", value: formatDuration(calculation.remainders.time) }
  ]);

  const extraTitle = getElement("troopExtraTitle");
  if (extraTitle) extraTitle.textContent = `Еще можно обучить: ${formatNumber(extra.extraTroops)} войск`;

  renderResourceList(getElement("troopShortages"), [
    { label: "Еды", value: formatResource(extra.shortages.resources.food) },
    { label: "Дерева", value: formatResource(extra.shortages.resources.wood) },
    { label: "Металла", value: formatResource(extra.shortages.resources.metal) },
    { label: "Топлива", value: formatResource(extra.shortages.resources.fuel) },
    { label: "Ускорений", value: formatDuration(extra.shortages.time, { showDays: false }) },
    { label: "Вместимости гарнизона", value: formatNumber(extra.shortages.garrison) }
  ]);

  return calculation;
}

function bindUnitToggles() {
  document.querySelectorAll(".troop-unit-toggle button").forEach(button => {
    button.addEventListener("click", () => {
      const group = button.closest(".troop-unit-toggle");
      group.querySelectorAll("button").forEach(item => item.classList.toggle("is-active", item === button));
      renderResults();
      if (typeof window.savePageFormState === "function") window.savePageFormState();
    });
  });
}

function bindInputs() {
  document.querySelectorAll(".troop-page input, .troop-page select").forEach(field => {
    field.addEventListener("input", renderResults);
    field.addEventListener("change", renderResults);
  });
}

function bindTransferButtons() {
  document.querySelectorAll("[data-transfer-target]").forEach(button => {
    button.addEventListener("click", () => {
      const calculation = renderResults();
      const payload = {
        target: button.dataset.transferTarget,
        troops: calculation.possibleTroops,
        stages: calculation.stages.map(stage => ({ stage: stage.stage, level: stage.level, troops: calculation.possibleTroops })),
        createdAt: new Date().toISOString()
      };

      localStorage.setItem(TRANSFER_STORAGE_KEY, JSON.stringify(payload));

      if (button.dataset.transferTarget.includes("ipk")) {
        loadPage("calculator/ipk.html");
      } else {
        loadPage("calculator/turbo-vs.html");
      }
    });
  });
}

function syncAdvancedMode() {
  const advanced = getAdvancedMode();
  document.querySelectorAll(".troop-stage-card[data-stage='2'], .troop-stage-card[data-stage='3']").forEach(card => {
    card.hidden = !advanced;
  });

  renderResults();
}

function initStages() {
  document.querySelectorAll(".troop-stage-card").forEach(createStageFields);
  fillLevelSelect(getElement("troopCurrentLevel"), 8);
}

export function init() {
  initStages();
  bindUnitToggles();
  bindInputs();
  bindTransferButtons();
  syncAdvancedMode();

  window.addEventListener("harvesthub:advanced-mode-change", syncAdvancedMode);

  if (typeof window.bindCollapsibleCards === "function") window.bindCollapsibleCards();
}
