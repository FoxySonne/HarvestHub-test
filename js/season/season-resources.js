import { seasonDatabase } from "../../data/season-database.js";
import { seasonBuildingsDatabase } from "../../data/season-buildings-database.js";

const MAX_DISCOUNT_CANS = 50;
let isRaidNeedManual = false;

const numberFormat = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1
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

function createLevelSelect(className, defaultValue) {
  const select = document.createElement("select");
  select.className = className;

  for (let level = 0; level <= 30; level++) {
    const option = document.createElement("option");
    option.value = String(level);
    option.textContent = level === 0 ? "0" : `${level}`;
    select.appendChild(option);
  }

  select.value = String(defaultValue);
  return select;
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

function getBuildingCurrentLevel(buildingId) {
  const row = document.querySelector(`.season-building-row[data-building-id="${buildingId}"]`);
  return Number(row?.querySelector(".season-building-current")?.value) || 0;
}

function getBuildingProductionByCurrentLevel(buildingId) {
  return getByLevel(seasonDatabase.productionByBuildingLevel, getBuildingCurrentLevel(buildingId));
}

function getFactoryProductionFromBuildingRows() {
  const secondaryFactory1 = getBuildingProductionByCurrentLevel("secondary_factory_1");
  const secondaryFactory2 = getBuildingProductionByCurrentLevel("secondary_factory_2");
  const primaryFactory1 = getBuildingProductionByCurrentLevel("primary_factory_1");
  const primaryFactory2 = getBuildingProductionByCurrentLevel("primary_factory_2");

  const hasBuildingRows = [
    "secondary_factory_1",
    "secondary_factory_2",
    "primary_factory_1",
    "primary_factory_2"
  ].every(buildingId => document.querySelector(`.season-building-row[data-building-id="${buildingId}"]`));

  if (!hasBuildingRows) return null;

  return {
    secondary: (Number(secondaryFactory1?.secondary) || 0) + (Number(secondaryFactory2?.secondary) || 0),
    primary: (Number(primaryFactory1?.primary) || 0) + (Number(primaryFactory2?.primary) || 0)
  };
}

function syncBuildingRow(row) {
  if (!row) return;

  const checkbox = row.querySelector(".season-building-enabled");
  const currentSelect = row.querySelector(".season-building-current");
  const targetSelect = row.querySelector(".season-building-target");

  if (!checkbox || !currentSelect || !targetSelect) return;

  const currentLevel = Number(currentSelect.value) || 0;
  let targetLevel = Number(targetSelect.value) || 0;

  Array.from(targetSelect.options).forEach(option => {
    const optionLevel = Number(option.value) || 0;
    option.disabled = optionLevel > 0 && optionLevel < currentLevel;
  });

  if (currentLevel > 0 && targetLevel < currentLevel) {
    targetLevel = currentLevel;
    targetSelect.value = String(currentLevel);
  }

  if (currentLevel > 0 || targetLevel > 0) {
    checkbox.checked = true;
  }
}

function syncAllBuildingRows() {
  document.querySelectorAll(".season-building-row").forEach(row => syncBuildingRow(row));
}

function renderBuildingRows() {
  const container = document.getElementById("seasonBuildingList");
  if (!container) return;

  container.innerHTML = "";

  seasonBuildingsDatabase.buildings.forEach(building => {
    const row = document.createElement("div");
    row.className = "season-building-row";
    row.dataset.buildingId = building.id;
    row.dataset.buildingType = building.type;

    const checkLabel = document.createElement("label");
    checkLabel.className = "season-building-check";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "season-building-enabled";

    const name = document.createElement("span");
    name.textContent = building.name;

    checkLabel.append(checkbox, name);

    const levels = document.createElement("div");
    levels.className = "season-building-levels";

    const currentWrap = document.createElement("label");
    currentWrap.className = "season-building-level";
    currentWrap.innerHTML = "<span>Есть</span>";
    currentWrap.appendChild(createLevelSelect("season-building-current", 0));

    const targetWrap = document.createElement("label");
    targetWrap.className = "season-building-level";
    targetWrap.innerHTML = "<span>Нужно</span>";
    targetWrap.appendChild(createLevelSelect("season-building-target", 0));

    levels.append(currentWrap, targetWrap);
    row.append(checkLabel, levels);
    container.appendChild(row);
    syncBuildingRow(row);
  });
}

function syncMainBuildingLevel() {
  const mainRow = document.querySelector('.season-building-row[data-building-id="main"]');
  const productionLevel = document.getElementById("productionBuildingLevel");
  if (!mainRow || !productionLevel) return;

  const targetLevel = Number(mainRow.querySelector(".season-building-target")?.value) || 0;
  const currentLevel = Number(mainRow.querySelector(".season-building-current")?.value) || 0;
  const syncedLevel = targetLevel || currentLevel || 1;

  productionLevel.value = String(Math.min(30, Math.max(1, syncedLevel)));
}

function normalizeDiscountCans() {
  const input = document.getElementById("raidDiscountCans");
  if (!input) return;

  const value = Math.min(MAX_DISCOUNT_CANS, Math.max(0, Number(input.value) || 0));
  if (Number(input.value) !== value) input.value = String(value);
}

function sumRequirementsForBuilding(type, currentLevel, targetLevel) {
  const table = seasonBuildingsDatabase.buildingTypes[type]?.requirements || [];
  const start = Math.max(1, currentLevel + 1);
  const end = Math.max(start - 1, targetLevel);
  let secondary = 0;
  let primary = 0;

  for (let level = start; level <= end; level++) {
    const requirement = getByLevel(table, level);
    secondary += Number(requirement?.secondary) || 0;
    primary += Number(requirement?.primary) || 0;
  }

  return { secondary, primary };
}

function getEngineeringReduction() {
  const level = Math.min(3, Math.max(0, num("buildingEfficiencyLevel")));
  return level / 100;
}

function applyEngineeringReduction(value) {
  return Math.ceil(value * (1 - getEngineeringReduction()));
}

function updateBuildingNeeds() {
  let secondaryTotal = 0;
  let primaryTotal = 0;

  document.querySelectorAll(".season-building-row").forEach(row => {
    const enabled = row.querySelector(".season-building-enabled")?.checked;
    if (!enabled) return;

    const currentLevel = Number(row.querySelector(".season-building-current")?.value) || 0;
    const targetLevel = Number(row.querySelector(".season-building-target")?.value) || 0;
    if (targetLevel <= currentLevel) return;

    const requirement = sumRequirementsForBuilding(row.dataset.buildingType, currentLevel, targetLevel);
    secondaryTotal += requirement.secondary;
    primaryTotal += requirement.primary;
  });

  const secondaryAfterEfficiency = applyEngineeringReduction(secondaryTotal);
  const primaryAfterEfficiency = applyEngineeringReduction(primaryTotal);
  const secondary = Math.max(0, secondaryAfterEfficiency - num("buildingOwnedSecondary"));
  const primary = Math.max(0, primaryAfterEfficiency - num("buildingOwnedPrimary"));

  setValue("productionNeedPrimary", primary);
  setValue("productionNeedSecondary", secondary);

  if (!isRaidNeedManual) {
    setValue("raidNeedPrimary", primary);
    setValue("raidNeedSecondary", secondary);
  }

  setText("buildingNeedPrimary", primary);
  setText("buildingNeedSecondary", secondary);
  setText("productionNeedPrimaryText", primary);
  setText("productionNeedSecondaryText", secondary);
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

function getBonus(list, level) {
  const item = getByLevel(list, level);
  return Number(item?.bonus) || 0;
}

function calculateProductionPerHour() {
  const factoryProduction = getFactoryProductionFromBuildingRows();
  const base = factoryProduction || getByLevel(seasonDatabase.productionByBuildingLevel, num("productionBuildingLevel"));
  const labBonus = getBonus(seasonDatabase.labProductionBonus, num("productionLabLevel"));
  const seasonBonus = getBonus(seasonDatabase.seasonalBuildingProductionBonus, num("productionSeasonLevel"));
  const village = num("productionVillage") === 2 ? seasonDatabase.territoryBuffs.villageProduction : 0;
  const factory = num("productionVillage") === 2 ? seasonDatabase.territoryBuffs.factoryProduction : 0;
  const megapolis = num("productionMegapolis") === 2 ? seasonDatabase.territoryBuffs.megapolisProduction : 0;
  const bull = num("productionBull") === 2 ? seasonDatabase.territoryBuffs.mightyBullProduction : 0;
  const premiumPass = num("productionPremiumPass") || 1;
  const weeklyPass = num("productionWeeklyPass") || 1;

  const secondaryPerHour = base.secondary * (1 + labBonus + seasonBonus + village + megapolis + bull) * premiumPass;
  const primaryPerHour = base.primary * (1 + labBonus + seasonBonus + factory + megapolis + bull) * weeklyPass;

  return { secondaryPerHour, primaryPerHour };
}

function updateProduction() {
  const production = calculateProductionPerHour();
  const hours = num("productionHours");
  const secondaryTotal = production.secondaryPerHour * hours;
  const primaryTotal = production.primaryPerHour * hours;
  const needSecondary = num("productionNeedSecondary");
  const needPrimary = num("productionNeedPrimary");
  const secondaryHours = production.secondaryPerHour > 0 ? needSecondary / production.secondaryPerHour : 0;
  const primaryHours = production.primaryPerHour > 0 ? needPrimary / production.primaryPerHour : 0;
  const needHours = Math.round(Math.max(secondaryHours, primaryHours) * 10) / 10;

  setText("productionSecondaryPerHour", Math.round(production.secondaryPerHour));
  setText("productionPrimaryPerHour", Math.round(production.primaryPerHour));
  setText("productionSecondaryTotal", Math.round(secondaryTotal));
  setText("productionPrimaryTotal", Math.round(primaryTotal));
  setText("productionNeedHours", needHours);
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
  updateProduction();
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

  renderBuildingRows();
  setDefaults();
  renderSeasonProfileBlock();
  bindCalculatorInputs();
  updateAll();
}
