const TURBO_WEEK_STATE_PREFIX = "harvesthub_turbo_vs_week_state:";
const TROOP_TRANSFER_STORAGE_KEY = "harvesthub_troop_training_transfer";
const TROOP_TRANSFER_APPLIED_KEY = "harvesthub_troop_training_transfer_applied_turbo_vs";

function getWeekScope() {
  const profile = typeof window.getActiveProfile === "function" ? window.getActiveProfile() : null;
  return profile?.id ? `profile:${profile.id}` : "local";
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
}

export function readTroopTransferPreset() {
  try {
    return JSON.parse(localStorage.getItem(TROOP_TRANSFER_STORAGE_KEY) || "null");
  } catch (error) {
    console.warn("Не удалось прочитать заготовку обучения войск", error);
    return null;
  }
}

export function isTroopTransferApplied(presetId) {
  return localStorage.getItem(TROOP_TRANSFER_APPLIED_KEY) === presetId;
}

export function markTroopTransferApplied(presetId) {
  localStorage.setItem(TROOP_TRANSFER_APPLIED_KEY, presetId);
}
