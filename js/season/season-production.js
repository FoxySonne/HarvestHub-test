import { seasonDatabase } from "../../data/season-database.js";
import { findByLevel as getByLevel, num, setText } from "./dom.js";
import { formatHoursMinutes } from "./time-format.js?v=20260717-31";

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

export function updateSeasonProduction() {
  if (!document.querySelector(".season-page")) return null;

  positionOceanAbundanceField();

  const production = calculateProductionPerHour();
  const hours = num("productionHours");
  const needSecondary = num("productionNeedSecondary");
  const needPrimary = num("productionNeedPrimary");
  const secondaryHours = needSecondary <= 0
    ? 0
    : production.secondaryPerHour > 0 ? needSecondary / production.secondaryPerHour : Number.POSITIVE_INFINITY;
  const primaryHours = needPrimary <= 0
    ? 0
    : production.primaryPerHour > 0 ? needPrimary / production.primaryPerHour : Number.POSITIVE_INFINITY;
  const rawNeedHours = Math.max(secondaryHours, primaryHours);

  setText("productionSecondaryPerHour", Math.round(production.secondaryPerHour));
  setText("productionPrimaryPerHour", Math.round(production.primaryPerHour));
  setText("productionSecondaryTotal", Math.round(production.secondaryPerHour * hours));
  setText("productionPrimaryTotal", Math.round(production.primaryPerHour * hours));

  const needHoursElement = document.getElementById("productionNeedHours");
  if (needHoursElement) {
    needHoursElement.textContent = Number.isFinite(rawNeedHours)
      ? formatHoursMinutes(rawNeedHours, { rounding: "ceil" })
      : "—";
  }

  return {
    ...production,
    plannedHours: hours,
    needPrimary,
    needSecondary,
    primaryHours,
    secondaryHours,
    totalRequiredHours: rawNeedHours,
    primaryProduced: production.primaryPerHour * hours,
    secondaryProduced: production.secondaryPerHour * hours
  };
}
