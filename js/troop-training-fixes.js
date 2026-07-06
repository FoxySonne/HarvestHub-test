(() => {
  const RESOURCE_CONFIG = [
    { key: "food", label: "Еда", shortageLabel: "Еды", availableId: "troopAvailableFood" },
    { key: "wood", label: "Дерево", shortageLabel: "Дерева", availableId: "troopAvailableWood" },
    { key: "metal", label: "Металл", shortageLabel: "Металла", availableId: "troopAvailableMetal" },
    { key: "fuel", label: "Топливо", shortageLabel: "Топлива", availableId: "troopAvailableFuel" }
  ];

  function getElement(id) {
    return document.getElementById(id);
  }

  function parseNumber(value) {
    const text = String(value || "").trim().replace(/\s+/g, "").replace(/,/g, ".");
    const match = text.match(/^(\d+(?:\.\d+)?)([кkmм])?$/i);

    if (!match) {
      const fallback = Number(text);
      return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
    }

    const base = Number(match[1]);
    const suffix = (match[2] || "").toLowerCase();
    const multiplier = suffix === "к" || suffix === "k" ? 1000 : suffix === "м" || suffix === "m" ? 1000000 : 1;
    const number = base * multiplier;

    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function getTimeDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function clampTimePart(value) {
    return Math.min(Math.max(Number(value) || 0, 0), 59);
  }

  function formatClockDigits(digits) {
    const padded = String(digits || "").padStart(6, "0");
    const hours = Math.max(Number(padded.slice(0, -4)) || 0, 0);
    const minutes = clampTimePart(padded.slice(-4, -2));
    const seconds = clampTimePart(padded.slice(-2));

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function formatAvailableTimeInput(value) {
    const digits = getTimeDigits(value);
    if (!digits) return "";

    if (digits.length <= 3) return `${Number(digits) || 0}д 00:00:00`;
    if (digits.length <= 6) return `00д ${formatClockDigits(digits)}`;

    return `${Number(digits.slice(0, -6)) || 0}д ${formatClockDigits(digits.slice(-6))}`;
  }

  function formatStageTimeInput(value) {
    const digits = getTimeDigits(value);
    return digits ? formatClockDigits(digits.slice(-6)) : "";
  }

  function parseTimeToSeconds(value, allowDays = false) {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return 0;

    const digits = getTimeDigits(text);
    if (digits && !text.includes(":")) {
      return parseTimeToSeconds(allowDays ? formatAvailableTimeInput(digits) : formatStageTimeInput(digits), allowDays);
    }

    let days = 0;
    let timeText = text;
    const dayMatch = text.match(/^(\d+)\s*д\.?\s*(.*)$/);

    if (allowDays && dayMatch) {
      days = Number(dayMatch[1]) || 0;
      timeText = dayMatch[2] || "00:00:00";
    }

    const parts = timeText.split(":").map(part => Number(part) || 0);
    while (parts.length < 3) parts.unshift(0);

    const [rawHours, rawMinutes, rawSeconds] = parts.slice(-3);
    const hours = Math.max(rawHours, 0);
    const minutes = clampTimePart(rawMinutes);
    const seconds = clampTimePart(rawSeconds);

    return days * 86400 + hours * 3600 + minutes * 60 + seconds;
  }

  function parseAvailableResource(inputId) {
    const value = parseNumber(getElement(inputId)?.value);
    const activeUnit = document.querySelector(`[data-unit-for="${inputId}"] .is-active`)?.dataset.unit || "raw";

    return activeUnit === "m" ? value * 1000000 : value;
  }

  function formatNumber(value) {
    return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("ru-RU");
  }

  function formatResource(value) {
    const number = Math.max(0, Math.ceil(Number(value) || 0));

    if (number >= 1000000) {
      return `${(number / 1000000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} М`;
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

  function isAdvancedMode() {
    return typeof window.getAdvancedMode === "function"
      ? window.getAdvancedMode()
      : document.body.classList.contains("advanced-mode");
  }

  function isStageEnabled(stage) {
    const checkbox = getElement(`troopStage${stage}Enabled`);
    return checkbox ? checkbox.checked : true;
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
      currentAmount: parseNumber(getElement("troopCurrentAmount")?.value)
    };
  }

  function getStageData(card) {
    const stage = Number(card.dataset.stage);
    const costs = {
      food: parseNumber(getElement(`troopStage${stage}Food`)?.value),
      wood: parseNumber(getElement(`troopStage${stage}Wood`)?.value),
      metal: parseNumber(getElement(`troopStage${stage}Metal`)?.value),
      fuel: parseNumber(getElement(`troopStage${stage}Fuel`)?.value)
    };
    const time = parseTimeToSeconds(getElement(`troopStage${stage}Time`)?.value, false);
    const hasCost = Object.values(costs).some(value => value > 0) || time > 0;

    return {
      stage,
      costs,
      time,
      isActive: isStageEnabled(stage) && (stage === 1 || hasCost)
    };
  }

  function getActiveStages() {
    const advanced = isAdvancedMode();

    return Array.from(document.querySelectorAll(".troop-stage-card"))
      .filter(card => advanced || Number(card.dataset.stage) === 1)
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

    return limits.length ? roundTroops(Math.min(...limits)) : 0;
  }

  function buildCalculation() {
    const available = getAvailableData();
    const stages = getActiveStages();
    const maxTroops = getMaxTroopsByAvailable(stages, available);
    const desiredMode = available.desired > 0;
    const possibleTroops = desiredMode ? Math.min(available.desired, maxTroops) : maxTroops;
    const targetTroops = desiredMode ? available.desired : possibleTroops;
    const required = getCostForTroops(stages, targetTroops);
    const spent = getCostForTroops(stages, possibleTroops);
    const remainders = { resources: {}, time: Math.max(available.time - spent.time, 0) };
    const missing = { resources: {}, time: Math.max(required.time - available.time, 0), garrison: 0 };
    const freeGarrison = Math.max(available.garrisonCapacity - available.currentAmount, 0);

    RESOURCE_CONFIG.forEach(resource => {
      remainders.resources[resource.key] = Math.max(available.resources[resource.key] - spent.resources[resource.key], 0);
      missing.resources[resource.key] = Math.max(required.resources[resource.key] - available.resources[resource.key], 0);
    });

    if (available.garrisonCapacity > 0) {
      missing.garrison = Math.max(targetTroops - freeGarrison, 0);
    }

    return {
      available,
      stages,
      possibleTroops: roundTroops(possibleTroops),
      targetTroops: roundTroops(targetTroops),
      remainders,
      missing,
      desiredMode
    };
  }

  function calculateExtraTraining(calculation) {
    const perThousand = getCostForTroops(calculation.stages, 1000);
    const limits = [];

    RESOURCE_CONFIG.forEach(resource => {
      const cost = perThousand.resources[resource.key];
      if (cost > 0) limits.push((calculation.remainders.resources[resource.key] / cost) * 1000);
    });

    if (perThousand.time > 0) limits.push((calculation.remainders.time / perThousand.time) * 1000);

    const freeGarrison = Math.max(
      calculation.available.garrisonCapacity - calculation.available.currentAmount - calculation.possibleTroops,
      0
    );

    if (calculation.available.garrisonCapacity > 0) limits.push(freeGarrison);

    const extraTroops = limits.length ? roundTroops(Math.min(...limits)) : 0;
    const nextBatchTroops = calculation.stages.length > 0 ? extraTroops + 1000 : 0;
    const nextBatchRequired = getCostForTroops(calculation.stages, nextBatchTroops);
    const shortages = { resources: {}, time: 0, garrison: 0 };

    RESOURCE_CONFIG.forEach(resource => {
      shortages.resources[resource.key] = Math.max(
        nextBatchRequired.resources[resource.key] - calculation.remainders.resources[resource.key],
        0
      );
    });

    shortages.time = Math.max(nextBatchRequired.time - calculation.remainders.time, 0);
    shortages.garrison = Math.max(nextBatchTroops - freeGarrison, 0);

    return { extraTroops, nextBatchTroops, shortages };
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

  function buildShortageItems(shortages) {
    return [
      { label: "Еды", value: formatResource(shortages.resources.food) },
      { label: "Дерева", value: formatResource(shortages.resources.wood) },
      { label: "Металла", value: formatResource(shortages.resources.metal) },
      { label: "Топлива", value: formatResource(shortages.resources.fuel) },
      { label: "Ускорений", value: formatDuration(shortages.time, { showDays: false }) },
      { label: "Вместимости гарнизона", value: formatNumber(shortages.garrison) }
    ];
  }

  function setShortageTitle(text) {
    const shortagesContainer = getElement("troopShortages");
    const title = shortagesContainer?.previousElementSibling;

    if (title && title.tagName === "P") {
      title.textContent = text;
    }
  }

  function patchTroopTrainingResults() {
    if (!document.querySelector(".troop-page")) return;

    const calculation = buildCalculation();
    const extra = calculateExtraTraining(calculation);
    const extraTitle = getElement("troopExtraTitle");

    if (calculation.desiredMode) {
      if (extraTitle) extraTitle.textContent = `Цель: ${formatNumber(calculation.targetTroops)} войск`;
      setShortageTitle(`Не хватает для цели ${formatNumber(calculation.targetTroops)} войск:`);
      renderResourceList(getElement("troopShortages"), buildShortageItems(calculation.missing));
      return;
    }

    if (extraTitle) extraTitle.textContent = `Ещё можно обучить: ${formatNumber(extra.extraTroops)} войск`;
    setShortageTitle(`Не хватает, чтобы обучить ещё ${formatNumber(extra.nextBatchTroops)} войск:`);
    renderResourceList(getElement("troopShortages"), buildShortageItems(extra.shortages));
  }

  function schedulePatch() {
    window.setTimeout(patchTroopTrainingResults, 0);
  }

  document.addEventListener("input", event => {
    if (event.target.closest?.(".troop-page")) schedulePatch();
  });

  document.addEventListener("change", event => {
    if (event.target.closest?.(".troop-page")) schedulePatch();
  });

  window.addEventListener("harvesthub:advanced-mode-change", schedulePatch);

  const observer = new MutationObserver(() => schedulePatch());

  function startPatchObserver() {
    const pageContent = document.getElementById("page-content");
    if (!pageContent) return;
    observer.observe(pageContent, { childList: true, subtree: true });
    schedulePatch();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startPatchObserver);
  } else {
    startPatchObserver();
  }
})();
