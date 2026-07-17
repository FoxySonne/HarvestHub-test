import { TRANSFER_STORAGE_KEY, TURBO_WEEK_STATE_PREFIX } from "./config.js";
import { formatNumber } from "./format.js";

function getTransferScope() {
  const profileId = window.getActiveDataProfileId?.() || "";
  return profileId ? `profile:${profileId}` : "local";
}

function getTransferStorageKey() {
  return `${TRANSFER_STORAGE_KEY}:${getTransferScope()}`;
}

function getTurboWeekStateKey() {
  return `${TURBO_WEEK_STATE_PREFIX}${getTransferScope()}`;
}

function readTurboWeekState() {
  try {
    return JSON.parse(localStorage.getItem(getTurboWeekStateKey()) || "{}");
  } catch (error) {
    console.warn("Не удалось прочитать данные Турбочерепашки/VS", error);
    return {};
  }
}

function writeTurboWeekState(state) {
  localStorage.setItem(getTurboWeekStateKey(), JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("harvesthub:turbo-vs-state-change"));
}

export function saveTurboVsTransfer(target, payload) {
  if (target !== "turtle" && target !== "vs") return false;

  const rows = Array.isArray(payload.stages)
    ? payload.stages
      .filter(stage => Number(stage.level) > 0 && Number(stage.troops) > 0)
      .map(stage => ({ level: String(stage.level), value: String(Number(stage.troops) || 0) }))
    : [];

  if (!rows.length) return false;

  const dayId = target === "turtle" ? "mon" : "fri";
  const eventType = target === "turtle" ? "turtle" : "vs";
  const state = readTurboWeekState();

  Object.keys(state).forEach(savedDayId => {
    if (state[savedDayId]?.[eventType]?.troop_upgrade) {
      delete state[savedDayId][eventType].troop_upgrade;
    }
  });

  state[dayId] = state[dayId] || { turtle: {}, vs: {} };
  state[dayId][eventType] = state[dayId][eventType] || {};
  state[dayId][eventType].troop_upgrade = {
    value: String(Math.max(...rows.map(row => Number(row.value) || 0))),
    level: rows[rows.length - 1].level,
    rows
  };

  writeTurboWeekState(state);
  return true;
}

export function getTransferTargets(target) {
  return {
    turtle: target === "turtle",
    vs: target === "vs",
    ipk: target === "ipk"
  };
}

export function getPreferredDay(target) {
  if (target === "turtle") return "mon";
  if (target === "vs") return "fri";
  return "";
}

function getTransferTargetName(target) {
  if (target === "turtle") return "Турбочерепашки";
  if (target === "vs") return "VS";
  if (target === "ipk") return "ИПК";
  return "выбранного калькулятора";
}

export function saveTransferPayload(payload) {
  localStorage.setItem(getTransferStorageKey(), JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent("harvesthub:calculator-transfer-change", {
    detail: { target: payload?.target || "", id: payload?.id || "" }
  }));
}

export function getTransferStatusHtml(target, calculation, directSaveResult) {
  const troops = formatNumber(calculation.possibleTroops);
  const stages = calculation.stages
    .map(stage => `${stage.level || stage.stage} ур. — ${troops}`)
    .join("<br>");

  if (target === "turtle") {
    return `
      <strong>Данные сохранены для Турбочерепашки.</strong><br>
      Записано в день: понедельник.<br>
      Действие: Улучшение войск.<br>
      Уровень и количество:<br>${stages || "нет активных этапов"}<br>
      Статус прямой записи: ${directSaveResult ? "успешно" : "не выполнено"}.<br>
      При открытии калькулятора Турбочерепашки данные дополнительно проверятся и подставятся повторно, если это нужно.
    `;
  }

  if (target === "vs") {
    return `
      <strong>Данные сохранены для VS.</strong><br>
      Записано в день: пятница.<br>
      Действие: Улучшение войск.<br>
      Уровень и количество:<br>${stages || "нет активных этапов"}<br>
      Статус прямой записи: ${directSaveResult ? "успешно" : "не выполнено"}.<br>
      При открытии калькулятора Турбочерепашки & VS данные дополнительно проверятся и подставятся повторно, если это нужно.
    `;
  }

  if (target === "ipk") {
    return `
      <strong>Данные сохранены для ИПК.</strong><br>
      Раздел: Улучшение войск.<br>
      Уровень и количество:<br>${stages || "нет активных этапов"}<br>
      Открой страницу ИПК — данные будут подставлены в строки обучения войск по соответствующим уровням.<br>
      Старые значения по уровням войск будут перезаписаны.
    `;
  }

  return `Данные сохранены для ${getTransferTargetName(target)}.`;
}
