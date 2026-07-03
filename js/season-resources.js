import { seasonDatabase } from "../data/season-database.js";
import { seasonBuildingsDatabase } from "../data/season-buildings-database.js";

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

    const currentSelect = createLevelSelect("season-building-current", 0);
    currentWrap.appendChild(currentSelect);

    const targetWrap = document.createElement("label");
    targetWrap.className = "season-building-level";
    targetWrap.innerHTML = "<span>Нужно</span>";

    const targetSelect = createLevelSelect("season-building-target", 30);
    targetWrap.appendChild(targetSelect);

    levels.append(currentWrap, targetWrap);
    row.append(checkLabel, levels);
    container.appendChild(row);
  });
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

function updateBuildingNeeds() {
  let secondary = 0;
  let primary = 0;

  const rows = document.querySelectorAll(".season-building-row");

  rows.forEach(row => {
    const enabled = row.querySelector(".season-building-enabled")?.checked;

    if (!enabled) return;

    const currentLevel = Number(row.querySelector(".season-building-current")?.value) || 0;
    const targetLevel = Number(row.querySelector(".season-building-target")?.value) || 0;

    if (targetLevel <= currentLevel) return;

    const requirement = sumRequirementsForBuilding(
      row.dataset.buildingType,
      currentLevel,
      targetLevel
    );

    secondary += requirement.secondary;
    primary += requirement.primary;
  });

  setValue("raidNeedPrimary", primary);
  setValue("raidNeedSecondary", secondary);
  setValue("productionNeedPrimary", primary);
  setValue("productionNeedSecondary", secondary);

  setText("buildingNeedPrimary", primary);
  setText("buildingNeedSecondary", secondary);
  setText("raidNeedPrimaryText", primary);
  setText("raidNeedSecondaryText", secondary);
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
    discountDiamonds: Math.min(
      cansNeeded * seasonDatabase.energy.discountCanCost,
      seasonDatabase.energy.maxDiscountDiamonds
    )
  };
}

function calculateAvailableEnergy() {
  const diamonds = num("raidDiamonds");
  const discountCansAvailable = num("raidDiscountCans");
  const existingCans = num("raidCans");
  const existingEnergy = num("raidEnergy");

  const discountCansBought = Math.min(
    discountCansAvailable,
    Math.floor(diamonds / seasonDatabase.energy.discountCanCost)
  );

  const diamondsAfterDiscount = diamonds - discountCansBought * seasonDatabase.energy.discountCanCost;
  const regularCansBought = Math.floor(diamondsAfterDiscount / seasonDatabase.energy.regularCanCost);

  return existingEnergy +
    existingCans * seasonDatabase.energy.canEnergy +
    discountCansBought * seasonDatabase.energy.canEnergy +
    regularCansBought * seasonDatabase.energy.canEnergy;
}

function calculateFarmByDrops(drop, energyPerRun, availableEnergy) {
  const runs = energyPerRun > 0 ? Math.floor(availableEnergy / energyPerRun) : 0;

  return {
    runs,
    primary: runs * drop.primary,
    secondary: runs * drop.secondary
  };
}

function updateRaids() {
  const needPrimary = num("raidNeedPrimary");
  const needSecondary = num("raidNeedSecondary");
  const availableEnergy = calculateAvailableEnergy();

  const alphaNeedDrop = getByLevel(seasonDatabase.alphaDrops, num("alphaNeedLevel"));
  const alphaNeed = calculateNeedByDrops(
    needPrimary,
    needSecondary,
    alphaNeedDrop,
    num("alphaNeedEnergy")
  );

  setText("alphaNeedCans", alphaNeed.cansNeeded);
  setText("alphaNeedDiamonds", alphaNeed.diamonds);
  setText("alphaNeedDiscountDiamonds", alphaNeed.discountDiamonds);

  const alphaFarmDrop = getByLevel(seasonDatabase.alphaDrops, num("alphaFarmLevel"));
  const alphaFarm = calculateFarmByDrops(
    alphaFarmDrop,
    num("alphaFarmEnergy"),
    availableEnergy
  );

  setText("alphaFarmRuns", alphaFarm.runs);
  setText("alphaFarmPrimary", alphaFarm.primary);
  setText("alphaFarmSecondary", alphaFarm.secondary);

  const infectedNeedDrop = getByLevel(seasonDatabase.infectedDrops, num("infectedNeedLevel"));
  const infectedNeed = calculateNeedByDrops(
    needPrimary,
    needSecondary,
    infectedNeedDrop,
    num("infectedNeedEnergy")
  );

  setText("infectedNeedCans", infectedNeed.cansNeeded);
  setText("infectedNeedDiamonds", infectedNeed.diamonds);
  setText("infectedNeedDiscountDiamonds", infectedNeed.discountDiamonds);

  const infectedFarmDrop = getByLevel(seasonDatabase.infectedDrops, num("infectedFarmLevel"));
  const infectedFarm = calculateFarmByDrops(
    infectedFarmDrop,
    num("infectedFarmEnergy"),
    availableEnergy
  );

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
  const base = getByLevel(
    seasonDatabase.productionByBuildingLevel,
    num("productionBuildingLevel")
  );

  const labBonus = getBonus(seasonDatabase.labProductionBonus, num("productionLabLevel"));
  const seasonBonus = getBonus(
    seasonDatabase.seasonalBuildingProductionBonus,
    num("productionSeasonLevel")
  );

  const village = num("productionVillage") === 2 ? seasonDatabase.territoryBuffs.villageProduction : 0;
  const factory = num("productionVillage") === 2 ? seasonDatabase.territoryBuffs.factoryProduction : 0;
  const megapolis = num("productionMegapolis") === 2 ? seasonDatabase.territoryBuffs.megapolisProduction : 0;
  const bull = num("productionBull") === 2 ? seasonDatabase.territoryBuffs.mightyBullProduction : 0;

  const premiumPass = num("productionPremiumPass") || 1;
  const weeklyPass = num("productionWeeklyPass") || 1;

  const secondaryPerHour = base.secondary *
    (1 + labBonus + seasonBonus + village + megapolis + bull) *
    premiumPass;

  const primaryPerHour = base.primary *
    (1 + labBonus + seasonBonus + factory + megapolis + bull) *
    weeklyPass;

  return {
    secondaryPerHour,
    primaryPerHour
  };
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

function bindCalculatorInputs() {
  const inputs = document.querySelectorAll(".season-page input, .season-page select");

  inputs.forEach(input => {
    input.addEventListener("input", updateAll);
    input.addEventListener("change", updateAll);
  });
}

function setDefaults() {
  const defaults = {
    alphaNeedLevel: 8,
    alphaFarmLevel: 7,
    infectedNeedLevel: 30,
    infectedFarmLevel: 30,
    productionBuildingLevel: 29,
    productionLabLevel: 5,
    productionSeasonLevel: 3,
    productionPremiumPass: 2,
    productionWeeklyPass: 2,
    productionVillage: 2,
    productionMegapolis: 1,
    productionBull: 1
  };

  Object.entries(defaults).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = String(value);
  });
}

function updateAll() {
  updateBuildingNeeds();
  updateRaids();
  updateProduction();
}

export function init() {
  fillSelect("alphaNeedLevel", seasonDatabase.alphaDrops);
  fillSelect("alphaFarmLevel", seasonDatabase.alphaDrops);
  fillSelect("infectedNeedLevel", seasonDatabase.infectedDrops);
  fillSelect("infectedFarmLevel", seasonDatabase.infectedDrops);

  fillSelect("productionBuildingLevel", seasonDatabase.productionByBuildingLevel);
  fillSelect("productionLabLevel", seasonDatabase.labProductionBonus);
  fillSelect("productionSeasonLevel", seasonDatabase.seasonalBuildingProductionBonus);

  renderBuildingRows();
  setDefaults();
  bindCalculatorInputs();
  updateAll();
}
