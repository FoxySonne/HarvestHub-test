function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function requiredHours(need, rate) {
  if (need <= 0) return 0;
  return rate > 0 ? need / rate : Number.POSITIVE_INFINITY;
}

function missingAfterHours(need, rate, hours) {
  return Math.ceil(Math.max(0, need - rate * Math.max(0, hours)));
}

export function calculateSeasonResourcePlan({
  selectedCount = 0,
  needPrimary = 0,
  needSecondary = 0,
  primaryPerHour = 0,
  secondaryPerHour = 0,
  plannedHours = 0,
  seasonHours = null
} = {}) {
  const selected = Math.max(0, Number(selectedCount) || 0);
  const needs = {
    primary: safeNumber(needPrimary),
    secondary: safeNumber(needSecondary)
  };
  const rates = {
    primary: safeNumber(primaryPerHour),
    secondary: safeNumber(secondaryPerHour)
  };
  const waitHours = safeNumber(plannedHours);
  const hasSeasonDeadline = seasonHours !== null && Number.isFinite(Number(seasonHours));
  const availableSeasonHours = hasSeasonDeadline ? safeNumber(seasonHours) : null;
  const effectiveHours = hasSeasonDeadline
    ? Math.min(waitHours, availableSeasonHours)
    : waitHours;
  const hoursByResource = {
    primary: requiredHours(needs.primary, rates.primary),
    secondary: requiredHours(needs.secondary, rates.secondary)
  };
  const totalRequiredHours = Math.max(hoursByResource.primary, hoursByResource.secondary);
  const deadlineMissing = hasSeasonDeadline ? {
    primary: missingAfterHours(needs.primary, rates.primary, availableSeasonHours),
    secondary: missingAfterHours(needs.secondary, rates.secondary, availableSeasonHours)
  } : null;
  const raidMissing = selected > 0 ? {
    primary: missingAfterHours(needs.primary, rates.primary, effectiveHours),
    secondary: missingAfterHours(needs.secondary, rates.secondary, effectiveHours)
  } : { primary: 0, secondary: 0 };

  return {
    selectedCount: selected,
    needs,
    rates,
    plannedHours: waitHours,
    hasSeasonDeadline,
    seasonHours: availableSeasonHours,
    effectiveHours,
    hoursByResource,
    totalRequiredHours,
    deadlineMissing,
    canFinishBySeason: selected > 0
      && hasSeasonDeadline
      && deadlineMissing.primary === 0
      && deadlineMissing.secondary === 0,
    raidMissing
  };
}
