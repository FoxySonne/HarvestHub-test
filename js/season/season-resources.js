import { seasonDatabase } from "../../data/season-database.js";
import { seasonBuildingsDatabase } from "../../data/season-buildings-database.js";
import { findByLevel, num, setText } from "./dom.js";
import { initSeasonBuildBuffs } from "./season-build-buffs.js";
import { createSeasonBuildings } from "./season-buildings.js?v=20260717-27";
import { initSeasonBuildingLinks } from "./season-building-links.js";
import { updateSeasonProduction } from "./season-production.js?v=20260717-27";
import { calculateSeasonCountdown, calculateSeasonEndUtc, parseSeasonEnd } from "./season-tracking.js?v=20260717-26";
import { calculateSeasonResourcePlan } from "./season-planning.js?v=20260717-27";

const MAX_DISCOUNT_CANS = 50;
const SEASON_PAGE = "calculator/season-resources.html";
const TRACKING_INTERVAL_MS = 60 * 1000;

const {
  renderBuildingRows,
  syncAllBuildingRows,
  syncBuildingRow,
  syncMainBuildingLevel,
  updateBuildingNeeds
} = createSeasonBuildings({
  database: seasonBuildingsDatabase,
  getByLevel,
  num,
  setText,
  setValue
});

function setValue(id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  element.value = String(Math.round(value));
}

function syncValue(sourceId, targetId) {
  const source = document.getElementById(sourceId);
  const target = document.getElementById(targetId);
  if (!source || !target) return;
  target.value = source.value;
}

function syncLinkedRaidInputs(target) {
  if (!target || !target.id) return;

  const linkedPairs = {
    alphaNeedLevel: "alphaFarmLevel",
    alphaFarmLevel: "alphaNeedLevel",
    alphaNeedEnergy: "alphaFarmEnergy",
    alphaFarmEnergy: "alphaNeedEnergy",
    infectedNeedLevel: "infectedFarmLevel",
    infectedFarmLevel: "infectedNeedLevel",
    infectedNeedEnergy: "infectedFarmEnergy",
    infectedFarmEnergy: "infectedNeedEnergy"
  };

  const linkedId = linkedPairs[target.id];
  if (!linkedId) return;
  syncValue(target.id, linkedId);
}

function isRaidNeedInput(target) {
  return target?.id === "raidNeedPrimary" || target?.id === "raidNeedSecondary";
}

function shouldSyncMainBuildingLevel(target) {
  if (!target) return true;
  return Boolean(target.closest?.('.season-building-row[data-building-id="main"]'));
}

function getByLevel(list, level) {
  return findByLevel(list, level, list[0]);
}

function fillSelect(id, list, defaultValue = null) {
  const select = document.getElementById(id);
  if (!select) return;

  select.innerHTML = "";

  list.forEach(item => {
    const option = document.createElement("option");
    option.value = item.level;
    option.textContent = `${item.level} уровень`;
    select.appendChild(option);
  });

  if (defaultValue !== null) {
    select.value = String(defaultValue);
  }
}

function getCurrentUtcDate() {
  return typeof window.getHarvestHubUtcTime === "function"
    ? window.getHarvestHubUtcTime().date
    : new Date();
}

function getTrackedSeasonEnd() {
  return parseSeasonEnd(document.getElementById("seasonProfileEndAt")?.value || "");
}

function getSeasonEndUtcTime() {
  return getTrackedSeasonEnd() || calculateSeasonEndUtc(
    getCurrentUtcDate(),
    num("seasonProfileDaysLeft"),
    num("seasonProfileHoursLeft")
  );
}

function formatUtcDate(date) {
  return date.toLocaleString("ru-RU", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function updateSeasonProfileBlockSummary() {
  const summary = document.getElementById("seasonProfileEndSummary");
  const trackingStatus = document.getElementById("seasonTrackingStatus");
  const trackingButton = document.getElementById("seasonTrackButton");
  if (!summary) return;

  const trackedEnd = getTrackedSeasonEnd();
  const end = trackedEnd || getSeasonEndUtcTime();
  summary.innerHTML = `Конец сезона: <strong>${formatUtcDate(end)} UTC</strong>`;

  if (!trackedEnd) {
    const replaceableStatus = !trackingStatus?.textContent
      || trackingStatus.textContent.startsWith("Отслеживание включено")
      || trackingStatus.textContent === "Сезон завершён.";
    if (trackingStatus && !trackingStatus.classList.contains("is-error") && replaceableStatus) {
      trackingStatus.textContent = "Дата окончания пока не отслеживается.";
    }
    if (trackingButton) {
      trackingButton.textContent = "Отслеживать сезон";
      trackingButton.disabled = false;
    }
    return;
  }

  const countdown = calculateSeasonCountdown(trackedEnd, getCurrentUtcDate());
  if (!countdown) return;
  setValue("seasonProfileDaysLeft", countdown.days);
  setValue("seasonProfileHoursLeft", countdown.hours);
  if (trackingStatus) {
    trackingStatus.classList.remove("is-error");
    trackingStatus.textContent = countdown.ended
      ? "Сезон завершён."
      : `Отслеживание включено: осталось ${countdown.days} д. ${countdown.hours} ч.`;
  }
  if (trackingButton) {
    trackingButton.textContent = "Сезон отслеживается";
    trackingButton.disabled = true;
  }
}

function saveSeasonTrackingState() {
  window.saveProfileBlockState?.();
  window.harvestHubCalculatorFormsCloudSync?.scheduleUpload?.();
}

function startSeasonTracking() {
  const status = document.getElementById("seasonTrackingStatus");
  const days = Math.max(0, num("seasonProfileDaysLeft"));
  const hours = Math.max(0, num("seasonProfileHoursLeft"));
  if (days * 24 + hours <= 0) {
    if (status) {
      status.textContent = "Укажите, сколько дней или часов осталось до конца сезона.";
      status.classList.add("is-error");
    }
    return;
  }

  const endInput = document.getElementById("seasonProfileEndAt");
  if (!endInput) return;
  endInput.value = calculateSeasonEndUtc(getCurrentUtcDate(), days, hours).toISOString();
  if (status) status.classList.remove("is-error");
  saveSeasonTrackingState();
  updateSeasonProfileBlockSummary();
  updateAll();
}

function stopTrackingWhenEdited(target) {
  if (target?.id !== "seasonProfileDaysLeft" && target?.id !== "seasonProfileHoursLeft") return;
  const endInput = document.getElementById("seasonProfileEndAt");
  if (!endInput?.value) return;
  endInput.value = "";
  const status = document.getElementById("seasonTrackingStatus");
  if (status) {
    status.classList.remove("is-error");
    status.textContent = "Значение изменено. Нажмите «Отслеживать сезон», чтобы зафиксировать новую дату.";
  }
  saveSeasonTrackingState();
}

function scheduleSeasonCountdown() {
  window.clearInterval(window.harvestHubSeasonTrackingTimerId);
  window.harvestHubSeasonTrackingTimerId = window.setInterval(() => {
    if (localStorage.getItem("currentPage") !== SEASON_PAGE) {
      window.clearInterval(window.harvestHubSeasonTrackingTimerId);
      window.harvestHubSeasonTrackingTimerId = null;
      return;
    }
    updateSeasonProfileBlockSummary();
    updateAll();
  }, TRACKING_INTERVAL_MS);
}

function renderSeasonProfileBlock() {
  if (typeof window.setProfileBlockContent !== "function") return;

  const container = document.createElement("div");
  container.className = "season-profile-block";

  container.innerHTML = `
    <div class="profile-block-grid">
      <label class="profile-block-field">
        <span>Дней до конца сезона</span>
        <input id="seasonProfileDaysLeft" type="number" min="0" value="0">
      </label>

      <label class="profile-block-field">
        <span>Часов до конца сезона</span>
        <input id="seasonProfileHoursLeft" type="number" min="0" max="23" value="0">
      </label>
    </div>

    <input id="seasonProfileEndAt" type="hidden" value="">

    <div class="season-tracking-actions">
      <button id="seasonTrackButton" type="button">Отслеживать сезон</button>
      <p id="seasonTrackingStatus" aria-live="polite"></p>
    </div>

    <div id="seasonProfileEndSummary" class="profile-block-result"></div>

    <p class="profile-block-note">Укажи текущие и целевые уровни выбранных зданий. По текущим уровням заводов рассчитается производство, а по целевым — стоимость строительства.</p>
  `;

  window.setProfileBlockContent({
    description: "",
    content: container
  });

  updateSeasonProfileBlockSummary();
  scheduleSeasonCountdown();
  document.getElementById("seasonTrackButton")?.addEventListener("click", startSeasonTracking);

  container.addEventListener("input", event => {
    stopTrackingWhenEdited(event.target);
    handleCalculatorInput(event.target);
  });
  container.addEventListener("change", event => handleCalculatorInput(event.target));
}

function normalizeDiscountCans() {
  const input = document.getElementById("raidDiscountCans");
  if (!input) return;

  const value = Math.min(MAX_DISCOUNT_CANS, Math.max(0, Number(input.value) || 0));
  if (Number(input.value) !== value) input.value = String(value);
}

function calculateNeedByDrops(needPrimary, needSecondary, drop, energyPerRun) {
  const primaryRuns = drop.primary > 0 ? Math.ceil(needPrimary / drop.primary) : 0;
  const secondaryRuns = drop.secondary > 0 ? Math.ceil(needSecondary / drop.secondary) : 0;
  const runs = Math.max(primaryRuns, secondaryRuns);
  const energyNeeded = runs * energyPerRun;
  const cansNeeded = Math.ceil(energyNeeded / seasonDatabase.energy.canEnergy);

  return {
    runs,
    energyNeeded,
    cansNeeded,
    diamonds: cansNeeded * seasonDatabase.energy.regularCanCost,
    discountDiamonds: Math.min(cansNeeded * seasonDatabase.energy.discountCanCost, seasonDatabase.energy.maxDiscountDiamonds)
  };
}

function calculateAvailableEnergy() {
  const diamonds = num("raidDiamonds");
  const discountCansAvailable = Math.min(MAX_DISCOUNT_CANS, num("raidDiscountCans"));
  const existingCans = num("raidCans");
  const existingEnergy = num("raidEnergy");
  const discountCansBought = Math.min(discountCansAvailable, Math.floor(diamonds / seasonDatabase.energy.discountCanCost));
  const diamondsAfterDiscount = diamonds - discountCansBought * seasonDatabase.energy.discountCanCost;
  const regularCansBought = Math.floor(diamondsAfterDiscount / seasonDatabase.energy.regularCanCost);

  return existingEnergy +
    existingCans * seasonDatabase.energy.canEnergy +
    discountCansBought * seasonDatabase.energy.canEnergy +
    regularCansBought * seasonDatabase.energy.canEnergy;
}

function calculateFarmByDrops(drop, energyPerRun, availableEnergy) {
  const runs = energyPerRun > 0 ? Math.floor(availableEnergy / energyPerRun) : 0;
  return { runs, primary: runs * drop.primary, secondary: runs * drop.secondary };
}

function updateRaids() {
  const needPrimary = num("raidNeedPrimary");
  const needSecondary = num("raidNeedSecondary");
  const availableEnergy = calculateAvailableEnergy();

  const alphaNeedDrop = getByLevel(seasonDatabase.alphaDrops, num("alphaNeedLevel"));
  const alphaNeed = calculateNeedByDrops(needPrimary, needSecondary, alphaNeedDrop, num("alphaNeedEnergy"));
  setText("alphaNeedCans", alphaNeed.cansNeeded);
  setText("alphaNeedDiamonds", alphaNeed.diamonds);
  setText("alphaNeedDiscountDiamonds", alphaNeed.discountDiamonds);

  const alphaFarmDrop = getByLevel(seasonDatabase.alphaDrops, num("alphaFarmLevel"));
  const alphaFarm = calculateFarmByDrops(alphaFarmDrop, num("alphaFarmEnergy"), availableEnergy);
  setText("alphaFarmRuns", alphaFarm.runs);
  setText("alphaFarmPrimary", alphaFarm.primary);
  setText("alphaFarmSecondary", alphaFarm.secondary);

  const infectedNeedDrop = getByLevel(seasonDatabase.infectedDrops, num("infectedNeedLevel"));
  const infectedNeed = calculateNeedByDrops(needPrimary, needSecondary, infectedNeedDrop, num("infectedNeedEnergy"));
  setText("infectedNeedCans", infectedNeed.cansNeeded);
  setText("infectedNeedDiamonds", infectedNeed.diamonds);
  setText("infectedNeedDiscountDiamonds", infectedNeed.discountDiamonds);

  const infectedFarmDrop = getByLevel(seasonDatabase.infectedDrops, num("infectedFarmLevel"));
  const infectedFarm = calculateFarmByDrops(infectedFarmDrop, num("infectedFarmEnergy"), availableEnergy);
  setText("infectedFarmRuns", infectedFarm.runs);
  setText("infectedFarmPrimary", infectedFarm.primary);
  setText("infectedFarmSecondary", infectedFarm.secondary);

  setText("raidAvailableEnergy", availableEnergy);
}

function getSeasonHoursLeft() {
  const now = getCurrentUtcDate();
  const trackedEnd = getTrackedSeasonEnd();
  if (trackedEnd) return Math.max(0, (trackedEnd.getTime() - now.getTime()) / (60 * 60 * 1000));

  const days = Math.max(0, num("seasonProfileDaysLeft"));
  const hours = Math.max(0, num("seasonProfileHoursLeft"));
  if (days * 24 + hours <= 0) return null;
  const end = calculateSeasonEndUtc(now, days, hours);
  return Math.max(0, (end.getTime() - now.getTime()) / (60 * 60 * 1000));
}

function formatHours(value) {
  if (!Number.isFinite(value)) return "недоступно при текущем производстве";
  return `${(Math.round(value * 10) / 10).toLocaleString("ru-RU")} ч`;
}

function isRaidAutoEnabled() {
  return document.getElementById("seasonRaidAutoEnabled")?.checked !== false;
}

function syncRaidAutoControls(plan = null) {
  const automatic = isRaidAutoEnabled();
  const status = document.getElementById("seasonRaidAutoStatus");
  const restoreButton = document.getElementById("restoreSeasonRaidAuto");
  if (restoreButton) restoreButton.hidden = automatic;
  if (!status) return;

  if (!automatic) {
    status.textContent = "Ручной режим: значения рейдов не изменяются автоматически.";
    return;
  }
  if (!plan || plan.selectedCount === 0) {
    status.textContent = "Автоподстановка включена. Выберите здания для расчёта нехватки.";
    return;
  }

  const limitedBySeason = plan.hasSeasonDeadline && plan.seasonHours < plan.plannedHours;
  status.textContent = limitedBySeason
    ? `Автоподстановка рассчитана по времени до конца сезона: ${formatHours(plan.effectiveHours)}.`
    : `Автоподстановка рассчитана по времени ожидания: ${formatHours(plan.effectiveHours)}.`;
}

function setRaidAutoEnabled(enabled) {
  const checkbox = document.getElementById("seasonRaidAutoEnabled");
  if (checkbox) checkbox.checked = Boolean(enabled);
  syncRaidAutoControls();
}

function updateSeasonDeadline(plan) {
  const card = document.getElementById("seasonDeadlineCard");
  const title = document.getElementById("seasonDeadlineTitle");
  const message = document.getElementById("seasonDeadlineMessage");
  const missing = document.getElementById("seasonDeadlineMissing");
  if (!card || !title || !message || !missing) return;

  missing.hidden = true;
  card.dataset.state = "neutral";

  if (plan.selectedCount === 0) {
    title.textContent = "Успею ли до конца сезона?";
    message.textContent = "Выберите здания, которые хотите построить.";
    return;
  }

  if (!plan.hasSeasonDeadline) {
    title.textContent = "Укажите срок сезона";
    message.textContent = "Введите оставшиеся дни и часы или включите отслеживание сезона.";
    return;
  }

  if (plan.canFinishBySeason) {
    card.dataset.state = "success";
    title.textContent = "Вы успеете накопить ресурсы";
    message.textContent = `Потребуется ${formatHours(plan.totalRequiredHours)}. До конца сезона осталось ${formatHours(plan.seasonHours)}.`;
    return;
  }

  card.dataset.state = "danger";
  title.textContent = "До конца сезона ресурсов не хватит";
  message.textContent = Number.isFinite(plan.totalRequiredHours)
    ? `Потребуется ${formatHours(plan.totalRequiredHours)}, а осталось ${formatHours(plan.seasonHours)}.`
    : "Для необходимого ресурса производство равно нулю.";
  setText("seasonDeadlineMissingSecondary", plan.deadlineMissing.secondary);
  setText("seasonDeadlineMissingPrimary", plan.deadlineMissing.primary);
  missing.hidden = false;
}

function updateSeasonPlanning(buildingState, productionState) {
  const plan = calculateSeasonResourcePlan({
    selectedCount: buildingState?.selectedCount || 0,
    needPrimary: buildingState?.primary || 0,
    needSecondary: buildingState?.secondary || 0,
    primaryPerHour: productionState?.primaryPerHour || 0,
    secondaryPerHour: productionState?.secondaryPerHour || 0,
    plannedHours: productionState?.plannedHours || 0,
    seasonHours: getSeasonHoursLeft()
  });

  updateSeasonDeadline(plan);
  if (isRaidAutoEnabled()) {
    setValue("raidNeedPrimary", plan.raidMissing.primary);
    setValue("raidNeedSecondary", plan.raidMissing.secondary);
  }
  syncRaidAutoControls(plan);
  return plan;
}

function handleCalculatorInput(target) {
  const buildingRow = target?.closest?.(".season-building-row");
  if (buildingRow) syncBuildingRow(buildingRow);

  if (isRaidNeedInput(target)) {
    setRaidAutoEnabled(false);
  }

  updateSeasonProfileBlockSummary();
  syncLinkedRaidInputs(target);
  updateAll(target);
}

function bindCalculatorInputs() {
  const inputs = document.querySelectorAll(".season-page input, .season-page select");

  inputs.forEach(input => {
    input.addEventListener("input", event => handleCalculatorInput(event.target));
    input.addEventListener("change", event => handleCalculatorInput(event.target));
  });

  document.getElementById("restoreSeasonRaidAuto")?.addEventListener("click", () => {
    const checkbox = document.getElementById("seasonRaidAutoEnabled");
    if (!checkbox) return;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function setDefaults() {
  const defaults = {
    buildingEfficiencyLevel: 0,
    buildingOwnedSecondary: 0,
    buildingOwnedPrimary: 0,
    raidNeedPrimary: 0,
    raidNeedSecondary: 0,
    alphaNeedLevel: 10,
    alphaFarmLevel: 10,
    infectedNeedLevel: 30,
    infectedFarmLevel: 30,
    alphaNeedEnergy: 19,
    alphaFarmEnergy: 19,
    infectedNeedEnergy: 7,
    infectedFarmEnergy: 7,
    productionBuildingLevel: 1,
    productionLabLevel: 0,
    productionSeasonLevel: 0,
    productionPremiumPass: 1,
    productionWeeklyPass: 1,
    productionVillage: 1,
    productionMegapolis: 1,
    productionBull: 1,
    productionHours: 0
  };

  Object.entries(defaults).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = String(value);
  });
}

function updateAll(target = null) {
  normalizeDiscountCans();
  syncAllBuildingRows();

  if (shouldSyncMainBuildingLevel(target)) {
    syncMainBuildingLevel();
  }

  const buildingState = updateBuildingNeeds();
  const productionState = updateSeasonProduction();
  updateSeasonPlanning(buildingState, productionState);
  updateRaids();
}

export function init() {
  fillSelect("alphaNeedLevel", seasonDatabase.alphaDrops);
  fillSelect("alphaFarmLevel", seasonDatabase.alphaDrops);
  fillSelect("infectedNeedLevel", seasonDatabase.infectedDrops);
  fillSelect("infectedFarmLevel", seasonDatabase.infectedDrops);
  fillSelect("productionBuildingLevel", seasonDatabase.productionByBuildingLevel);
  fillSelect("productionLabLevel", seasonDatabase.labProductionBonus);
  fillSelect("productionSeasonLevel", seasonDatabase.seasonalBuildingProductionBonus);
  initSeasonBuildBuffs();

  renderBuildingRows();
  setDefaults();
  initSeasonBuildingLinks();
  renderSeasonProfileBlock();
  bindCalculatorInputs();
  updateAll();
}
