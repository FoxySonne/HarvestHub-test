export function parseNumber(value) {
  const text = String(value || "").trim().replace(/\s+/g, "").replace(/,/g, ".");
  const match = text.match(/^(\d+(?:\.\d+)?)([кkmм])?$/i);

  if (!match) {
    const fallback = Number(text);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  }

  const base = Number(match[1]);
  const suffix = (match[2] || "").toLowerCase();
  const multiplier = suffix === "к" || suffix === "k" ? 1000 : suffix === "м" || suffix === "m" ? 1000000 : 1;
  const number = base * multiplier;

  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function getTimeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function clampTimePart(value) {
  return Math.min(Math.max(Number(value) || 0, 0), 59);
}

function normalizeClockParts(digits) {
  const padded = digits.padStart(6, "0");

  return {
    hours: Math.max(Number(padded.slice(0, -4)) || 0, 0),
    minutes: clampTimePart(padded.slice(-4, -2)),
    seconds: clampTimePart(padded.slice(-2))
  };
}

function formatClockParts({ hours, minutes, seconds }) {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatClockDigits(digits) {
  return formatClockParts(normalizeClockParts(digits));
}

export function formatAvailableTimeInput(value) {
  const digits = getTimeDigits(value);
  if (!digits) return "";

  if (digits.length <= 3) return `${Number(digits) || 0}д 00:00:00`;
  if (digits.length <= 6) return `00д ${formatClockDigits(digits)}`;

  const dayDigits = digits.slice(0, -6);
  const timeDigits = digits.slice(-6);
  return `${Number(dayDigits) || 0}д ${formatClockDigits(timeDigits)}`;
}

export function formatStageTimeInput(value) {
  const digits = getTimeDigits(value);
  if (!digits) return "";

  return formatClockDigits(digits.slice(-6));
}

export function parseTimeToSeconds(value, allowDays = false) {
  const text = String(value || "").trim().toLowerCase();

  if (!text) return 0;

  const digits = getTimeDigits(text);
  if (digits && !text.includes(":")) {
    return parseTimeToSeconds(allowDays ? formatAvailableTimeInput(digits) : formatStageTimeInput(digits), allowDays);
  }

  let days = 0;
  let timeText = text;
  const dayMatch = text.match(/^(\d+)\s*д\.?\s*(.*)$/);

  if (allowDays && dayMatch) {
    days = Number(dayMatch[1]) || 0;
    timeText = dayMatch[2] || "00:00:00";
  }

  const parts = timeText.split(":").map(part => Number(part) || 0);
  while (parts.length < 3) parts.unshift(0);

  const [rawHours, rawMinutes, rawSeconds] = parts.slice(-3);
  const hours = Math.max(rawHours, 0);
  const minutes = clampTimePart(rawMinutes);
  const seconds = clampTimePart(rawSeconds);

  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

export function formatNumber(value) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("ru-RU");
}

export function formatResource(value) {
  const number = Math.max(0, Math.ceil(Number(value) || 0));

  if (number >= 1000000) {
    const millions = number / 1000000;
    return `${millions.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} М`;
  }

  return formatNumber(number);
}

export function formatDuration(totalSeconds, { showDays = true } = {}) {
  const secondsValue = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  const days = Math.floor(secondsValue / 86400);
  const hours = Math.floor((secondsValue % 86400) / 3600);
  const minutes = Math.floor((secondsValue % 3600) / 60);
  const seconds = secondsValue % 60;
  const time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return showDays && days > 0 ? `${days}д ${time}` : time;
}

export function roundTroops(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}