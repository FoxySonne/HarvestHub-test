import { LEVELS, RESOURCE_CONFIG, TROOP_COST_PRESETS } from "./config.js";
import { getElement } from "./dom.js";
import { calculateExtraTraining, buildCalculation, isStageEnabled } from "./calculator.js";
import { formatDuration, formatNumber, formatResource } from "./format.js";

export function fillLevelSelect(select, defaultLevel) {
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

export function getStagePreset(stage, level) {
  return stage === 1
    ? TROOP_COST_PRESETS.training[level]
    : TROOP_COST_PRESETS.upgrade[level];
}

export function applyStagePreset(stage) {
  const level = Number(getElement(`troopStage${stage}Level`)?.value) || 0;
  const preset = getStagePreset(stage, level);

  if (!preset) return;

  const fieldValues = {
    Food: preset.food,
    Wood: preset.wood,
    Metal: preset.metal,
    Fuel: preset.fuel,
    Time: preset.time
  };

  Object.entries(fieldValues).forEach(([suffix, value]) => {
    const field = getElement(`troopStage${stage}${suffix}`);
    if (field) field.value = String(value);
  });
}

export function syncStageEnabledState(stage) {
  const card = document.querySelector(`.troop-stage-card[data-stage="${stage}"]`);
  if (!card) return;

  card.classList.toggle("is-disabled", !isStageEnabled(stage));
}

export function createStageFields(stageCard) {
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
      <input id="troopStage${stage}Time" type="text" placeholder="00:00:00" inputmode="numeric" autocomplete="off" data-time-format="stage">
    </label>
  `;

  fillLevelSelect(getElement(`troopStage${stage}Level`), stage === 1 ? 8 : stage === 2 ? 9 : 10);
  applyStagePreset(stage);
  syncStageEnabledState(stage);
}

export function renderResourceList(container, items) {
  if (!container) return;

  container.innerHTML = items.map(item => `
    <div>
      <span>${item.label}</span>
      <strong>${item.value}</strong>
    </div>
  `).join("");
}

export function buildShortageItems(shortages) {
  return [
    { label: "Еды", value: formatResource(shortages.resources.food) },
    { label: "Дерева", value: formatResource(shortages.resources.wood) },
    { label: "Металла", value: formatResource(shortages.resources.metal) },
    { label: "Топлива", value: formatResource(shortages.resources.fuel) },
    { label: "Ускорений", value: formatDuration(shortages.time, { showDays: false }) },
    { label: "Вместимости гарнизона", value: formatNumber(shortages.garrison) }
  ];
}

export function setShortageSubtitle(text) {
  const shortages = getElement("troopShortages");
  const subtitle = shortages?.previousElementSibling;

  if (subtitle && subtitle.tagName === "P") {
    subtitle.textContent = text;
  }
}

export function renderResults() {
  const calculation = buildCalculation();
  const possibleElement = getElement("troopPossibleTotal");
  const stageResults = getElement("troopStageResults");
  const extra = calculateExtraTraining(calculation);

  if (possibleElement) possibleElement.textContent = formatNumber(calculation.possibleTroops);

  if (stageResults) {
    stageResults.innerHTML = calculation.distribution.map(item => `
      <div>
        <span>${item.level || item.stage} уровень</span>
        <strong>${formatNumber(item.amount)}</strong>
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

  if (calculation.desiredMode) {
    if (extraTitle) extraTitle.textContent = `Цель: ${formatNumber(calculation.targetTroops)} войск`;
    setShortageSubtitle(`Не хватает для цели ${formatNumber(calculation.targetTroops)} войск:`);
    renderResourceList(getElement("troopShortages"), buildShortageItems(calculation.missing));
    return calculation;
  }

  if (extraTitle) {
    extraTitle.textContent = `Для обучения ещё ${formatNumber(extra.nextBatchTroops)} войск не хватает:`;
  }

  setShortageSubtitle("Нужно добавить:");
  renderResourceList(getElement("troopShortages"), buildShortageItems(extra.shortages));

  return calculation;
}

export function initStages() {
  document.querySelectorAll(".troop-stage-card").forEach(createStageFields);
  fillLevelSelect(getElement("troopCurrentLevel"), 8);
}