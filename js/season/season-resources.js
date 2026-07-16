import { seasonDatabase } from "../../data/season-database.js";
import { seasonBuildingsDatabase } from "../../data/season-buildings-database.js";
import { initSeasonBuildBuffs } from "./season-build-buffs.js";
import { createSeasonBuildings } from "./season-buildings.js";
import { initSeasonBuildingLinks } from "./season-building-links.js";
import { updateSeasonProduction } from "./season-production.js";

const MAX_DISCOUNT_CANS = 50;
let isRaidNeedManual = false;

const numberFormat = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1
});

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
  setValue,
  shouldSyncRaidNeeds: () => !isRaidNeedManual
});

function num(id) {
  const element = document.getElementById(id);
  return Number(element?.value) || 0;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = numberFormat.format(value);
}

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

function isBuildingNeedSource(target) {
  if (!target) return true;

  return target.id === "buildingOwnedPrimary" ||
    target.id === "buildingOwnedSecondary" ||
    target.id === "buildingEfficiencyLevel" ||
    Boolean(target.closest?.(".season-building-row"));
}

function shouldSyncMainBuildingLevel(target) {
  if (!target) return true;
  return Boolean(target.closest?.('.season-building-row[data-building-id="main"]'));
}

function getByLevel(list, level) {
  return list.find(item => Number(item.level) === Number(level)) || list[0];
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

function getSeasonEndUtcTime() {
  const now = typeof window.getHarvestHubUtcTime === "function"
    ? window.getHarvestHubUtcTime().date
    : new Date();

  const days = Math.max(0, num("seasonProfileDaysLeft"));
  const hours = Math.max(0, num("seasonProfileHoursLeft"));
  const rawEnd = new Date(now.getTime() + (days * 24 + hours) * 60 * 60 * 1000);

  return new Date(Date.UTC(
    rawEnd.getUTCFullYear(),
    rawEnd.getUTCMonth(),
    rawEnd.getUTCDate() + 1,
    0,
    0,
    0
  ));
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
  if (!summary) return;

  summary.innerHTML = `Конец сезона: <strong>${formatUtcDate(getSeasonEndUtcTime())} UTC</strong>`;
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

    <div id="seasonProfileEndSummary" class="profile-block-result"></div>

    <p class="profile-block-note">Чтобы расчёты работали точнее, ниже в блоке «Что нужно построить» укажи уровни зданий, которые у тебя уже есть, и уровни, до которых ты хочешь их поднять. По текущим уровням заводов калькулятор рассчитает производство ресурсов, а по целевым уровням — сколько ресурсов нужно на строительство.</p>
  `;

  window.setProfileBlockContent({
    description: "Данные продвинутого режима для сезонных расчётов.",
    content: container
  });

  updateSeasonProfileBlockSummary();

  container.addEventListener("input", event => handleCalculatorInput(event.target));
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

function handleCalculatorInput(target) {
  const buildingRow = target?.closest?.(".season-building-row");
  if (buildingRow) syncBuildingRow(buildingRow);

  if (isRaidNeedInput(target)) {
    isRaidNeedManual = true;
  }

  if (isBuildingNeedSource(target)) {
    isRaidNeedManual = false;
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
    productionBull: 1
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

  updateBuildingNeeds();
  updateRaids();
  updateSeasonProduction();
}

export function init() {
  isRaidNeedManual = false;

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
