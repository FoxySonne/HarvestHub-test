import { seasonDatabase } from "../data/season-database.js";

let seasonBuildBuffObserver = null;

function populateEngineeringEfficiency() {
  const select = document.getElementById("buildingEfficiencyLevel");
  if (!select) return;

  const currentValue = select.value;
  const options = seasonDatabase.seasonalBuildingBuildReduction || [];

  select.innerHTML = "";

  options.forEach(item => {
    const option = document.createElement("option");
    option.value = String(item.level);
    option.textContent = item.label || `${item.level} уровень`;
    option.dataset.reduction = String(Number(item.reduction) || 0);
    select.appendChild(option);
  });

  const hasCurrentValue = options.some(item => String(item.level) === String(currentValue));
  select.value = hasCurrentValue ? String(currentValue) : String(options[0]?.level ?? 0);
}

function prepareSeasonBuildBuffs() {
  if (!document.querySelector(".season-page")) return;
  populateEngineeringEfficiency();
}

function startSeasonBuildBuffs() {
  const pageContent = document.getElementById("page-content");
  if (!pageContent) return;

  seasonBuildBuffObserver?.disconnect();
  seasonBuildBuffObserver = new MutationObserver(prepareSeasonBuildBuffs);
  seasonBuildBuffObserver.observe(pageContent, { childList: true, subtree: true });

  prepareSeasonBuildBuffs();
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", startSeasonBuildBuffs);
} else {
  startSeasonBuildBuffs();
}

window.addEventListener("harvesthub:profile-block-ready", prepareSeasonBuildBuffs);
window.addEventListener("harvesthub:advanced-mode-change", prepareSeasonBuildBuffs);
