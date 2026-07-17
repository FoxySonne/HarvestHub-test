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

  const days = Math.floor(totalMinutes / (24 * 60));
  const remainingMinutes = totalMinutes % (24 * 60);
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;

  if (days > 0) {
    const formattedDays = days.toLocaleString("ru-RU");
    const formattedHours = String(hours).padStart(2, "0");
    const formattedMinutes = String(minutes).padStart(2, "0");
    return `${formattedDays} д. ${formattedHours}:${formattedMinutes}`;
  }

  if (hours === 0) return `${minutes} мин`;
  if (minutes === 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
}
