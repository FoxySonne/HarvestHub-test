import { seasonDatabase } from "../data/season-database.js";

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

function getProductionForLevel(level) {
  if (level <= 0) return { secondary: 0, primary: 0 };
  return getByLevel(seasonDatabase.productionByBuildingLevel, level) || { secondary: 0, primary: 0 };
}

function getFactoryProduction() {
  const fallback = getProductionForLevel(num("productionBuildingLevel"));

  const secondaryLevels = [
    getBuildingCurrentLevel("secondary_factory_1"),
    getBuildingCurrentLevel("secondary_factory_2")
  ];

  const primaryLevels = [
    getBuildingCurrentLevel("primary_factory_1"),
    getBuildingCurrentLevel("primary_factory_2")
  ];

  const hasSecondaryFactoryLevels = secondaryLevels.some(level => level > 0);
  const hasPrimaryFactoryLevels = primaryLevels.some(level => level > 0);

  const secondary = hasSecondaryFactoryLevels
    ? secondaryLevels.reduce((total, level) => total + (Number(getProductionForLevel(level).secondary) || 0), 0)
    : Number(fallback.secondary) || 0;

  const primary = hasPrimaryFactoryLevels
    ? primaryLevels.reduce((total, level) => total + (Number(getProductionForLevel(level).primary) || 0), 0)
    : Number(fallback.primary) || 0;

  return { secondary, primary };
}

function getBonus(list, level) {
  return Number(getByLevel(list, level)?.bonus) || 0;
}

function ensureOceanAbundanceField() {
  if (!document.querySelector(".season-page") || document.getElementById("productionOceanAbundance")) return;

  const grid = document.querySelector(".season-production-card .season-form-grid");
  if (!grid) return;

  const label = document.createElement("label");
  label.className = "season-field";
  label.innerHTML = `
    <span class="tooltip" data-tooltip="Бафф производства за качество воды: менее 80 — 0%, от 80 до 99 — 4%, качество 100 — 8%">Океаническое изобилие</span>
    <select id="productionOceanAbundance">
      <option value="0">Нет — 0%</option>
      <option value="1">1 уровень — 4%</option>
      <option value="2">2 уровень — 8%</option>
    </select>
  `;

  grid.appendChild(label);
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
    secondaryPerHour: base.secondary * totalBonus * premiumPass,
    primaryPerHour: base.primary * totalBonus * weeklyPass
  };
}

function updateProduction() {
  if (!document.querySelector(".season-page")) return;

  ensureOceanAbundanceField();

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
