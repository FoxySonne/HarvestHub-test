const TROOP_TRANSFER_STORAGE_KEY = "harvesthub_troop_training_transfer";
const TROOP_TRANSFER_APPLIED_KEY = "harvesthub_troop_training_transfer_applied_ipk";

export function readTroopTransferPreset() {
  try {
    return JSON.parse(localStorage.getItem(TROOP_TRANSFER_STORAGE_KEY) || "null");
  } catch (error) {
    console.warn("Не удалось прочитать заготовку обучения войск для ИПК", error);
    return null;
  }
}

export function isTroopTransferApplied(presetId) {
  return localStorage.getItem(TROOP_TRANSFER_APPLIED_KEY) === presetId;
}

export function markTroopTransferApplied(presetId) {
  localStorage.setItem(TROOP_TRANSFER_APPLIED_KEY, presetId);
}
