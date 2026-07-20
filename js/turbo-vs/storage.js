const TURBO_WEEK_STATE_PREFIX = "harvesthub_turbo_vs_week_state:";
const TROOP_TRANSFER_STORAGE_KEY = "harvesthub_troop_training_transfer";
const TROOP_TRANSFER_APPLIED_KEY = "harvesthub_troop_training_transfer_applied_turbo_vs";
const TURBO_SETTINGS_KEY = "_settings";

function getWeekScope() {
  const profileId = window.getActiveDataProfileId?.() || "";
  return profileId ? `profile:${profileId}` : "local";
}

function getScopedTransferKey(key) {
  return `${key}:${getWeekScope()}`;
}

function getWeekStateKey() {
  return `${TURBO_WEEK_STATE_PREFIX}${getWeekScope()}`;
}

export function readWeekState() {
  try {
    return JSON.parse(localStorage.getItem(getWeekStateKey()) || "{}");
  } catch (error) {
    console.warn("Не удалось прочитать недельные данные Турбо/VS", error);
    return {};
  }
}

export function writeWeekState(state) {
  localStorage.setItem(getWeekStateKey(), JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("harvesthub:turbo-vs-state-change"));
}

export function readAllianceDuelBranchEnabled() {
  return readWeekState()?.[TURBO_SETTINGS_KEY]?.allianceDuelBranchEnabled === true;
}

export function writeAllianceDuelBranchEnabled(enabled) {
  const state = readWeekState();
  state[TURBO_SETTINGS_KEY] = {
    ...(state[TURBO_SETTINGS_KEY] || {}),
    allianceDuelBranchEnabled: Boolean(enabled)
  };
  writeWeekState(state);
}

export function readTroopTransferPreset() {
  try {
    return JSON.parse(localStorage.getItem(getScopedTransferKey(TROOP_TRANSFER_STORAGE_KEY)) || "null");
  } catch (error) {
    console.warn("Не удалось прочитать заготовку обучения войск", error);
    return null;
  }
}

export function isTroopTransferApplied(presetId) {
  return localStorage.getItem(getScopedTransferKey(TROOP_TRANSFER_APPLIED_KEY)) === presetId;
}

export function markTroopTransferApplied(presetId) {
  localStorage.setItem(getScopedTransferKey(TROOP_TRANSFER_APPLIED_KEY), presetId);
}
