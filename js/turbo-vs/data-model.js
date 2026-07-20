export const TROOP_LEVEL_DEFAULTS = [8, 9, 10];

export function createTurboVsDataModel(database, { isAllianceDuelBranchEnabled = () => false } = {}) {
  function getActionById(actionId) {
    return database.action.find(action => action.id === actionId);
  }

  function resolveDayList(list = []) {
    return list.flatMap(item => {
      if (typeof item === "string") return item;
      if (item.type === "action") return item.id;
      if (item.type === "category") {
        return database.action
          .filter(action => action.categoryId === item.id)
          .map(action => action.id);
      }
      if (item.type === "text") return item;
      return [];
    });
  }

  function sortDayItems(items) {
    return [...items].sort((firstItem, secondItem) => {
      if (typeof firstItem !== "string" && typeof secondItem !== "string") return 0;
      if (typeof firstItem !== "string") return 1;
      if (typeof secondItem !== "string") return -1;

      const firstAction = getActionById(firstItem);
      const secondAction = getActionById(secondItem);

      if (!firstAction || !secondAction) return 0;

      const firstCategoryIndex = database.category.findIndex(category => category.id === firstAction.categoryId);
      const secondCategoryIndex = database.category.findIndex(category => category.id === secondAction.categoryId);

      if (firstCategoryIndex !== secondCategoryIndex) {
        return firstCategoryIndex - secondCategoryIndex;
      }

      return database.action.findIndex(action => action.id === firstItem) -
        database.action.findIndex(action => action.id === secondItem);
    });
  }

  function getPoints(actionId, eventType, level = null) {
    const action = getActionById(actionId);
    const points = action?.points?.[eventType];

    if (points == null) return 0;

    const basePoints = typeof points === "object"
      ? Number(points[level]) || 0
      : Number(points) || 0;

    if (eventType !== "vs" || !isAllianceDuelBranchEnabled()) return basePoints;

    const bonusPercent = Number(action?.vsBranchBonusPercent) || 0;
    if (bonusPercent <= 0) return basePoints;

    return Math.round(basePoints * (1 + bonusPercent / 100));
  }

  function getTroopRowsFromState(state = {}) {
    const sourceRows = Array.isArray(state.rows)
      ? state.rows
      : Array.isArray(state.stages)
        ? state.stages.map(stage => ({ level: stage.level, value: stage.troops ?? stage.value }))
        : [];

    if (sourceRows.length > 0) {
      return sourceRows
        .slice(0, 3)
        .map((row, index) => ({
          level: String(row.level ?? TROOP_LEVEL_DEFAULTS[index] ?? 10),
          value: String(row.value ?? row.troops ?? "0")
        }));
    }

    if (state.value != null || state.level != null) {
      return [{ level: String(state.level ?? 10), value: String(state.value ?? "0") }];
    }

    return [];
  }

  function calculateSavedItemTotal(actionId, eventType, itemState = {}) {
    const rows = actionId === "troop_upgrade" ? getTroopRowsFromState(itemState) : [];

    if (rows.length > 0) {
      return rows.reduce((sum, row) => {
        return sum + (Number(row.value) || 0) * getPoints(actionId, eventType, row.level ?? null);
      }, 0);
    }

    const value = Number(itemState.value) || 0;
    return value * getPoints(actionId, eventType, itemState.level ?? null);
  }

  return {
    calculateSavedItemTotal,
    getActionById,
    getPoints,
    getTroopRowsFromState,
    resolveDayList,
    sortDayItems
  };
}
