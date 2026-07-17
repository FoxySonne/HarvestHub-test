export function createSeasonBuildings({
  database,
  getByLevel,
  num,
  setText,
  setValue
}) {
  function createLevelSelect(className, defaultValue) {
    const select = document.createElement("select");
    select.className = className;
    for (let level = 0; level <= 30; level++) {
      const option = document.createElement("option");
      option.value = String(level);
      option.textContent = level === 0 ? "0" : `${level}`;
      select.appendChild(option);
    }
    select.value = String(defaultValue);
    return select;
  }

  function syncBuildingRow(row) {
    if (!row) return;
    const checkbox = row.querySelector(".season-building-enabled");
    const currentSelect = row.querySelector(".season-building-current");
    const targetSelect = row.querySelector(".season-building-target");
    if (!checkbox || !currentSelect || !targetSelect) return;

    const currentLevel = Number(currentSelect.value) || 0;
    let targetLevel = Number(targetSelect.value) || 0;
    Array.from(targetSelect.options).forEach(option => {
      const optionLevel = Number(option.value) || 0;
      option.disabled = optionLevel > 0 && optionLevel < currentLevel;
    });
    if (currentLevel > 0 && targetLevel < currentLevel) {
      targetLevel = currentLevel;
      targetSelect.value = String(currentLevel);
    }
  }

  function syncAllBuildingRows() {
    document.querySelectorAll(".season-building-row").forEach(syncBuildingRow);
  }

  function renderBuildingRows() {
    const container = document.getElementById("seasonBuildingList");
    if (!container) return;
    container.innerHTML = "";

    database.buildings.forEach(building => {
      const row = document.createElement("div");
      row.className = "season-building-row";
      row.dataset.buildingId = building.id;
      row.dataset.buildingType = building.type;

      const checkLabel = document.createElement("label");
      checkLabel.className = "season-building-check";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "season-building-enabled";
      const name = document.createElement("span");
      name.textContent = building.name;
      checkLabel.append(checkbox, name);

      const levels = document.createElement("div");
      levels.className = "season-building-levels";
      const currentWrap = document.createElement("label");
      currentWrap.className = "season-building-level";
      currentWrap.innerHTML = "<span>Есть</span>";
      currentWrap.appendChild(createLevelSelect("season-building-current", 0));
      const targetWrap = document.createElement("label");
      targetWrap.className = "season-building-level";
      targetWrap.innerHTML = "<span>Нужно</span>";
      targetWrap.appendChild(createLevelSelect("season-building-target", 30));
      levels.append(currentWrap, targetWrap);
      row.append(checkLabel, levels);
      container.appendChild(row);
      syncBuildingRow(row);
    });
  }

  function syncMainBuildingLevel() {
    const mainRow = document.querySelector('.season-building-row[data-building-id="main"]');
    const productionLevel = document.getElementById("productionBuildingLevel");
    if (!mainRow || !productionLevel) return;
    const targetLevel = Number(mainRow.querySelector(".season-building-target")?.value) || 0;
    const currentLevel = Number(mainRow.querySelector(".season-building-current")?.value) || 0;
    productionLevel.value = String(Math.min(30, Math.max(1, targetLevel || currentLevel || 1)));
  }

  function sumRequirements(type, currentLevel, targetLevel) {
    const table = database.buildingTypes[type]?.requirements || [];
    let secondary = 0;
    let primary = 0;
    for (let level = Math.max(1, currentLevel + 1); level <= targetLevel; level++) {
      const requirement = getByLevel(table, level);
      secondary += Number(requirement?.secondary) || 0;
      primary += Number(requirement?.primary) || 0;
    }
    return { secondary, primary };
  }

  function updateBuildingNeeds() {
    let secondaryTotal = 0;
    let primaryTotal = 0;
    let selectedCount = 0;
    document.querySelectorAll(".season-building-row").forEach(row => {
      if (!row.querySelector(".season-building-enabled")?.checked) return;
      selectedCount += 1;
      const currentLevel = Number(row.querySelector(".season-building-current")?.value) || 0;
      const targetLevel = Number(row.querySelector(".season-building-target")?.value) || 0;
      if (targetLevel <= currentLevel) return;
      const requirement = sumRequirements(row.dataset.buildingType, currentLevel, targetLevel);
      secondaryTotal += requirement.secondary;
      primaryTotal += requirement.primary;
    });

    const reduction = Math.min(3, Math.max(0, num("buildingEfficiencyLevel"))) / 100;
    const secondary = Math.max(0, Math.ceil(secondaryTotal * (1 - reduction)) - num("buildingOwnedSecondary"));
    const primary = Math.max(0, Math.ceil(primaryTotal * (1 - reduction)) - num("buildingOwnedPrimary"));
    setValue("productionNeedPrimary", primary);
    setValue("productionNeedSecondary", secondary);
    setText("buildingNeedPrimary", primary);
    setText("buildingNeedSecondary", secondary);
    setText("productionNeedPrimaryText", primary);
    setText("productionNeedSecondaryText", secondary);
    return { selectedCount, primary, secondary };
  }

  return {
    renderBuildingRows,
    syncAllBuildingRows,
    syncBuildingRow,
    syncMainBuildingLevel,
    updateBuildingNeeds
  };
}
