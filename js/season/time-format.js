export function formatHoursMinutes(value, { rounding = "round", unavailableText = "недоступно при текущем производстве" } = {}) {
  if (!Number.isFinite(value)) return unavailableText;

  const rawMinutes = Math.max(0, value) * 60;
  let totalMinutes;

  if (rounding === "ceil") {
    totalMinutes = Math.ceil(rawMinutes - 1e-9);
  } else if (rounding === "floor") {
    totalMinutes = Math.floor(rawMinutes + 1e-9);
  } else {
    totalMinutes = Math.round(rawMinutes);
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const formattedHours = hours.toLocaleString("ru-RU");

  if (hours === 0) return `${minutes} мин`;
  if (minutes === 0) return `${formattedHours} ч`;
  return `${formattedHours} ч ${minutes} мин`;
}
