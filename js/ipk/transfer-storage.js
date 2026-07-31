const TROOP_TRANSFER_STORAGE_KEY = "harvesthub_troop_training_transfer";
const TROOP_TRANSFER_APPLIED_KEY = "harvesthub_troop_training_transfer_applied_ipk";

function getTransferScope() {
  const profileId = window.getActiveDataProfileId?.() || "";
  return profileId ? `profile:${profileId}` : "local";
}

function getScopedKey(key) {
  return `${key}:${getTransferScope()}`;
}

export function readTroopTransferPreset() {
  try {
    return JSON.parse(localStorage.getItem(getScopedKey(TROOP_TRANSFER_STORAGE_KEY)) || "null");
  } catch (error) {
    console.warn("Не удалось прочитать заготовку обучения войск для ИПК", error);
    window.harvestHubNotifications?.error(error, "Не удалось прочитать сохранённую заготовку обучения войск.");
    return null;
  }
}

export function isTroopTransferApplied(presetId) {
  return localStorage.getItem(getScopedKey(TROOP_TRANSFER_APPLIED_KEY)) === presetId;
}

export function markTroopTransferApplied(presetId) {
  localStorage.setItem(getScopedKey(TROOP_TRANSFER_APPLIED_KEY), presetId);
}
