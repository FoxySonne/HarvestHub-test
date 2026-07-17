const HOUR_MS = 60 * 60 * 1000;

export function calculateSeasonEndUtc(now, days, hours) {
  const safeNow = now instanceof Date ? now : new Date(now);
  const safeDays = Math.max(0, Number(days) || 0);
  const safeHours = Math.max(0, Number(hours) || 0);
  const rawEnd = new Date(safeNow.getTime() + (safeDays * 24 + safeHours) * HOUR_MS);

  return new Date(Date.UTC(
    rawEnd.getUTCFullYear(),
    rawEnd.getUTCMonth(),
    rawEnd.getUTCDate() + 1,
    0,
    0,
    0
  ));
}

export function parseSeasonEnd(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function calculateSeasonCountdown(end, now = new Date()) {
  const endDate = end instanceof Date ? end : parseSeasonEnd(end);
  const nowDate = now instanceof Date ? now : new Date(now);
  if (!endDate || !Number.isFinite(nowDate.getTime())) return null;

  const remainingMs = Math.max(0, endDate.getTime() - nowDate.getTime());
  const totalHours = Math.ceil(remainingMs / HOUR_MS);
  return {
    ended: remainingMs === 0,
    days: Math.floor(totalHours / 24),
    hours: totalHours % 24,
    remainingMs
  };
}
