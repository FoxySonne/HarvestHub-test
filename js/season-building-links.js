let seasonLinksObserver = null;
let isApplyingSeasonLimits = false;

function getSeasonPage() {
  return document.querySelector(".season-page");
}

function getMainBuildingRow() {
  return document.querySelector('.season-building-row[data-building-id="main"]');
}

function getLevel(row, selector) {
  return Number(row?.querySelector(selector)?.value) || 0;
}

function flashAdjusted(select) {
  const row = select.closest(".season-building-row");
  select.classList.remove("season-level-auto-adjusted");
  row?.classList.remove("season-row-auto-adjusted");
  void select.offsetWidth;
  select.classList.add("season-level-auto-adjusted");
  row?.classList.add("season-row-auto-adjusted");

  window.setTimeout(() => {
    select.classList.remove("season-level-auto-adjusted");
    row?.classList.remove("season-row-auto-adjusted");
  }, 700);
}

function setOptionLimits(select, maximum) {
  if (!select) return;

  Array.from(select.options).forEach(option => {
    const level = Number(option.value) || 0;
    option.disabled = level > maximum;
  });
}

function notifyFieldChanged(select) {
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function clampSelect(select, maximum, changedFields) {
  if (!select) return;

  setOptionLimits(select, maximum);

  const value = Number(select.value) || 0;
  if (value <= maximum) return;

  select.value = String(maximum);
  changedFields.push(select);
  flashAdjusted(select);
}

function applyMainBuildingLimits({ notify = true } = {}) {
  if (isApplyingSeasonLimits) return;

  const mainRow = getMainBuildingRow();
  if (!mainRow) return;

  isApplyingSeasonLimits = true;

  try {
    const mainCurrent = getLevel(mainRow, ".season-building-current");
    const mainTarget = getLevel(mainRow, ".season-building-target");
    const changedFields = [];

    document.querySelectorAll(".season-building-row").forEach(row => {
      if (row === mainRow) return;

      const currentSelect = row.querySelector(".season-building-current");
      const targetSelect = row.querySelector(".season-building-target");

      clampSelect(currentSelect, mainCurrent, changedFields);
      clampSelect(targetSelect, mainTarget, changedFields);

      const currentLevel = Number(currentSelect?.value) || 0;
      const targetLevel = Number(targetSelect?.value) || 0;

      if (targetSelect && targetLevel < currentLevel) {
        targetSelect.value = String(currentLevel);
        changedFields.push(targetSelect);
        flashAdjusted(targetSelect);
      }
    });

    if (notify) {
      [...new Set(changedFields)].forEach(notifyFieldChanged);
    }
  } finally {
    isApplyingSeasonLimits = false;
  }
}

function removeDuplicateProductionLevel() {
  const select = document.getElementById("productionBuildingLevel");
  const field = select?.closest(".season-field");
  field?.remove();
}

function moveEngineeringEfficiency() {
  const field = document.querySelector(".season-efficiency-field");
  const productionGrid = document.querySelector(".season-production-card .season-form-grid");

  if (!field || !productionGrid || field.parentElement === productionGrid) return;

  field.classList.add("season-production-efficiency-field");
  productionGrid.appendChild(field);
}

function prepareSeasonPage() {
  if (!getSeasonPage()) return;

  removeDuplicateProductionLevel();
  moveEngineeringEfficiency();
  applyMainBuildingLimits({ notify: false });

  window.setTimeout(() => applyMainBuildingLimits({ notify: false }), 0);
  window.setTimeout(() => applyMainBuildingLimits({ notify: true }), 250);
}

function handleSeasonLevelChange(event) {
  const select = event.target.closest?.(".season-building-current, .season-building-target");
  if (!select || isApplyingSeasonLimits) return;

  applyMainBuildingLimits({ notify: true });
}

function startSeasonBuildingLinks() {
  const pageContent = document.getElementById("page-content");
  if (!pageContent) return;

  document.addEventListener("change", handleSeasonLevelChange);
  document.addEventListener("input", handleSeasonLevelChange);

  seasonLinksObserver?.disconnect();
  seasonLinksObserver = new MutationObserver(() => prepareSeasonPage());
  seasonLinksObserver.observe(pageContent, { childList: true, subtree: true });

  prepareSeasonPage();
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", startSeasonBuildingLinks);
} else {
  startSeasonBuildingLinks();
}

window.addEventListener("harvesthub:profile-block-ready", prepareSeasonPage);
window.addEventListener("harvesthub:advanced-mode-change", prepareSeasonPage);
