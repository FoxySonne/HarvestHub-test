import { seasonDatabase } from "../../data/season-database.js";

let isPopulatingEngineeringEfficiency = false;

function getExpectedOptions() {
  return (seasonDatabase.seasonalBuildingBuildReduction || []).map(item => ({
    value: String(item.level),
    label: item.label || `${item.level} уровень`,
    reduction: String(Number(item.reduction) || 0)
  }));
}

function optionsAreCurrent(select, expectedOptions) {
  const currentOptions = Array.from(select.options);

  if (currentOptions.length !== expectedOptions.length) return false;

  return currentOptions.every((option, index) => {
    const expected = expectedOptions[index];
    return option.value === expected.value &&
      option.textContent === expected.label &&
      (option.dataset.reduction || "0") === expected.reduction;
  });
}

function populateEngineeringEfficiency() {
  if (isPopulatingEngineeringEfficiency) return;

  const select = document.getElementById("buildingEfficiencyLevel");
  if (!select) return;

  const expectedOptions = getExpectedOptions();
  if (!expectedOptions.length || optionsAreCurrent(select, expectedOptions)) return;

  isPopulatingEngineeringEfficiency = true;

  try {
    const currentValue = select.value;
    const fragment = document.createDocumentFragment();

    expectedOptions.forEach(item => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      option.dataset.reduction = item.reduction;
      fragment.appendChild(option);
    });

    select.replaceChildren(fragment);

    const hasCurrentValue = expectedOptions.some(item => item.value === String(currentValue));
    select.value = hasCurrentValue ? String(currentValue) : expectedOptions[0].value;
  } finally {
    isPopulatingEngineeringEfficiency = false;
  }
}

export function initSeasonBuildBuffs() {
  if (!document.querySelector(".season-page")) return;
  populateEngineeringEfficiency();
}
