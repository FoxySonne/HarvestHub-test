from pathlib import Path


def replace_once(path, old, new, label):
    file = Path(path)
    source = file.read_text(encoding="utf-8")
    if new in source:
        return
    if old not in source:
        raise SystemExit(f"Expected fragment not found: {label} ({path})")
    file.write_text(source.replace(old, new, 1), encoding="utf-8")


replace_once(
    "js/season/season-resources.js",
    'const RESOURCE_IDS = ["seasonOil", "seasonFood", "seasonIron", "seasonAlloy"];\n',
    'const RESOURCE_IDS = ["seasonOil", "seasonFood", "seasonIron", "seasonAlloy"];\nlet timerIntervalId = null;\n',
    "season timer state",
)

replace_once(
    "js/season/season-resources.js",
    '''function updateActiveSeasonTimer() {
  const endInput = byId("seasonTrackingEndAt");
  if (!endInput?.value || !byId("seasonTrackingEnabled")?.checked) return;
  const endMs = Date.parse(endInput.value);
  const remainingHours = Math.max((endMs - Date.now()) / 3600000, 0);
  const days = Math.floor(remainingHours / 24);
  const hours = Math.floor(remainingHours % 24);
  const minutes = Math.floor((remainingHours * 60) % 60);
  const productionHours = byId("seasonProductionHours");
  if (productionHours) productionHours.value = remainingHours.toFixed(4);
  const subtitle = byId("profileBlock")?.querySelector(".profile-subtitle");
  if (subtitle) subtitle.textContent = `До конца сезона: ${days} дн. ${hours} ч. ${minutes} мин.`;
  calculateSeasonResources();
}''',
    '''function ensureRemainingTimeOutput() {
  let output = byId("seasonRemainingTime");
  if (output) return output;
  const trackingToggle = byId("seasonTrackingEnabled");
  if (!trackingToggle) return null;
  output = document.createElement("p");
  output.id = "seasonRemainingTime";
  output.className = "profile-subtitle";
  output.setAttribute("aria-live", "polite");
  trackingToggle.closest("label, .form-group, .profile-field")?.insertAdjacentElement("afterend", output);
  return output;
}

function formatRemainingTime(milliseconds) {
  const totalMinutes = Math.max(Math.ceil(milliseconds / 60000), 0);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return days > 0
    ? `${days} дн. ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
    : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function updateActiveSeasonTimer() {
  const output = ensureRemainingTimeOutput();
  const endInput = byId("seasonTrackingEndAt");
  const trackingEnabled = Boolean(byId("seasonTrackingEnabled")?.checked);
  if (!output) return;
  if (!trackingEnabled || !endInput?.value) {
    output.textContent = "";
    return;
  }
  const endMs = Date.parse(endInput.value);
  if (!Number.isFinite(endMs)) {
    output.textContent = "Не удалось определить время окончания сезона.";
    return;
  }
  const remainingMs = Math.max(endMs - Date.now(), 0);
  output.textContent = `До конца сезона: ${formatRemainingTime(remainingMs)}`;
  calculateSeasonResources();
}''',
    "season timer display",
)

replace_once(
    "js/season/season-resources.js",
    '''  if (trackingEnabled && Number.isFinite(trackingEndMs)) {
    effectiveWaitHours = Math.max((trackingEndMs - Date.now()) / 3600000, 0);
    if (waitHoursInput) waitHoursInput.value = effectiveWaitHours.toFixed(4);
  }''',
    '''  if (trackingEnabled && Number.isFinite(trackingEndMs)) {
    effectiveWaitHours = Math.max((trackingEndMs - Date.now()) / 3600000, 0);
  }''',
    "do not overwrite season input",
)

replace_once(
    "js/season/season-resources.js",
    '''export function init() {
  bindInputs();
  window.refreshProfileBlock?.();
  requestAnimationFrame(() => {
    if (window.consumeProfileBlockStorageMigration?.()) window.refreshProfileBlock?.();
    updateActiveSeasonTimer();
    calculateSeasonResources();
  });
  window.setInterval(updateActiveSeasonTimer, 30000);
}''',
    '''export function init() {
  window.clearInterval(timerIntervalId);
  bindInputs();
  window.refreshProfileBlock?.();
  requestAnimationFrame(() => {
    if (window.consumeProfileBlockStorageMigration?.()) window.refreshProfileBlock?.();
    updateActiveSeasonTimer();
    calculateSeasonResources();
  });
  timerIntervalId = window.setInterval(updateActiveSeasonTimer, 30000);
  return () => {
    window.clearInterval(timerIntervalId);
    timerIntervalId = null;
  };
}''',
    "season timer cleanup",
)

replace_once(
    "js/troop-training/index.js",
    'const transferAppliedIds = new Set();\n',
    'const transferAppliedIds = new Set();\nlet advancedModeChangeHandler = null;\n',
    "troop handler state",
)

replace_once(
    "js/troop-training/index.js",
    '''  window.addEventListener("harvesthub:advanced-mode-change", () => {
    const currentItems = getTroopItems();
    renderRows(currentItems);
    updateResults();
  });
  applyTrainingPreset();
  updateResults();
  startTroopTrainingAutoUpdate(updateResults);
}''',
    '''  if (advancedModeChangeHandler) {
    window.removeEventListener("harvesthub:advanced-mode-change", advancedModeChangeHandler);
  }
  advancedModeChangeHandler = () => {
    const currentItems = getTroopItems();
    renderRows(currentItems);
    updateResults();
  };
  window.addEventListener("harvesthub:advanced-mode-change", advancedModeChangeHandler);
  applyTrainingPreset();
  updateResults();
  startTroopTrainingAutoUpdate(updateResults);
  return () => {
    if (advancedModeChangeHandler) {
      window.removeEventListener("harvesthub:advanced-mode-change", advancedModeChangeHandler);
      advancedModeChangeHandler = null;
    }
    stopTroopTrainingAutoUpdate();
  };
}''',
    "troop page cleanup",
)

replace_once(
    "js/alliance/vs-player-search.js",
    '''function observeTables() {
  document.querySelectorAll(".vs-table").forEach(setupVsPlayerSearch);
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
      if (!(node instanceof Element)) return;
      if (node.matches?.(".vs-table")) setupVsPlayerSearch(node);
      node.querySelectorAll?.(".vs-table").forEach(setupVsPlayerSearch);
    }));
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observeTables);
else observeTables();''',
    '''function setupVisibleVsTables() {
  document.querySelectorAll(".vs-table").forEach(setupVsPlayerSearch);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupVisibleVsTables, { once: true });
} else {
  setupVisibleVsTables();
}
window.addEventListener("harvesthub:page-rendered", setupVisibleVsTables);''',
    "remove global table observer",
)
