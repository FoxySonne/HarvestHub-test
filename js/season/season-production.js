import { seasonDatabase } from "../../data/season-database.js";

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

function getByLevel(list, level) {
  return list.find(item => Number(item.level) === Number(level)) || null;
}

function getBuildingCurrentLevel(buildingId) {
  const row = document.querySelector(`.season-building-row[data-building-id="${buildingId}"]`);
  return Number(row?.querySelector(".season-building-current")?.value) || 0;
}

function getBuildingProduction(buildingId) {
  const level = getBuildingCurrentLevel(buildingId);

  if (level <= 0) {
    return { secondary: 0, primary: 0 };
  }

  return getByLevel(seasonDatabase.productionByBuildingLevel, level) || { secondary: 0, primary: 0 };
}

function getSelectedBuildingProduction() {
  const level = num("productionBuildingLevel");
  return getByLevel(seasonDatabase.productionByBuildingLevel, level) || { secondary: 0, primary: 0 };
}

function getFactoryProduction() {
  const ids = [
    "secondary_factory_1",
    "secondary_factory_2",
    "primary_factory_1",
    "primary_factory_2"
  ];

  const hasAllRows = ids.every(id => document.querySelector(`.season-building-row[data-building-id="${id}"]`));
  const fallback = getSelectedBuildingProduction();

  if (!hasAllRows) {
    return fallback;
  }

  const secondaryLevels = [
    getBuildingCurrentLevel("secondary_factory_1"),
    getBuildingCurrentLevel("secondary_factory_2")
  ];
  const primaryLevels = [
    getBuildingCurrentLevel("primary_factory_1"),
    getBuildingCurrentLevel("primary_factory_2")
  ];

  const secondary = secondaryLevels.some(level => level > 0)
    ? (Number(getBuildingProduction("secondary_factory_1").secondary) || 0) +
      (Number(getBuildingProduction("secondary_factory_2").secondary) || 0)
    : Number(fallback.secondary) || 0;

  const primary = primaryLevels.some(level => level > 0)
    ? (Number(getBuildingProduction("primary_factory_1").primary) || 0) +
      (Number(getBuildingProduction("primary_factory_2").primary) || 0)
    : Number(fallback.primary) || 0;

  return { secondary, primary };
}

function getBonus(list, level) {
  return Number(getByLevel(list, level)?.bonus) || 0;
}

function positionOceanAbundanceField() {
  const oceanField = document.getElementById("productionOceanAbundance")?.closest(".season-field");
  const bullField = document.getElementById("productionBull")?.closest(".season-field");

  if (!oceanField || !bullField || oceanField.previousElementSibling === bullField) return;

  bullField.insertAdjacentElement("afterend", oceanField);
}

function calculateProductionPerHour() {
  const base = getFactoryProduction();
  const labBonus = getBonus(seasonDatabase.labProductionBonus, num("productionLabLevel"));
  const seasonBonus = getBonus(seasonDatabase.seasonalBuildingProductionBonus, num("productionSeasonLevel"));
  const oceanBonus = getBonus(seasonDatabase.oceanAbundanceProductionBonus, num("productionOceanAbundance"));
  const villageBonus = num("productionVillage") === 2 ? seasonDatabase.territoryBuffs.villageProduction : 0;
  const megapolisBonus = num("productionMegapolis") === 2 ? seasonDatabase.territoryBuffs.megapolisProduction : 0;
  const bullBonus = num("productionBull") === 2 ? seasonDatabase.territoryBuffs.mightyBullProduction : 0;
  const premiumPass = num("productionPremiumPass") || 1;
  const weeklyPass = num("productionWeeklyPass") || 1;
  const totalBonus = 1 + labBonus + seasonBonus + villageBonus + megapolisBonus + oceanBonus + bullBonus;

  return {
    secondaryPerHour: (Number(base.secondary) || 0) * totalBonus * premiumPass,
    primaryPerHour: (Number(base.primary) || 0) * totalBonus * weeklyPass
  };
}

function updateProduction() {
  if (!document.querySelector(".season-page")) return;

  positionOceanAbundanceField();

  const production = calculateProductionPerHour();
  const hours = num("productionHours");
  const needSecondary = num("productionNeedSecondary");
  const needPrimary = num("productionNeedPrimary");
  const secondaryHours = production.secondaryPerHour > 0 ? needSecondary / production.secondaryPerHour : 0;
  const primaryHours = production.primaryPerHour > 0 ? needPrimary / production.primaryPerHour : 0;
  const needHours = Math.round(Math.max(secondaryHours, primaryHours) * 10) / 10;

  setText("productionSecondaryPerHour", Math.round(production.secondaryPerHour));
  setText("productionPrimaryPerHour", Math.round(production.primaryPerHour));
  setText("productionSecondaryTotal", Math.round(production.secondaryPerHour * hours));
  setText("productionPrimaryTotal", Math.round(production.primaryPerHour * hours));
  setText("productionNeedHours", needHours);
}

function scheduleUpdate() {
  window.setTimeout(updateProduction, 0);
}

document.addEventListener("input", event => {
  if (event.target.closest?.(".season-page")) scheduleUpdate();
});

document.addEventListener("change", event => {
  if (event.target.closest?.(".season-page")) scheduleUpdate();
});

const observer = new MutationObserver(mutations => {
  const seasonPageAdded = mutations.some(mutation =>
    Array.from(mutation.addedNodes).some(node =>
      node.nodeType === Node.ELEMENT_NODE &&
      (node.matches?.(".season-page") || node.querySelector?.(".season-page"))
    )
  );

  if (seasonPageAdded) scheduleUpdate();
});

function start() {
  const pageContent = document.getElementById("page-content");
  if (!pageContent) return;
  observer.observe(pageContent, { childList: true, subtree: true });
  scheduleUpdate();
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
