(() => {
  const SECONDARY_LOCATIONS = new Set(["central", "development", "military"]);
  let draggedPlayerId = "";
  let dragSourceLocation = "";
  let draggedPlayerTab = "main";

  function detectPlayerTab(player) {
    const labels = [...(player?.querySelectorAll?.("small") || [])]
      .map(item => String(item.textContent || "").trim().toLowerCase());
    return labels.some(label => label === "р" || label.includes("резерв")) ? "reserve" : "main";
  }

  function addThroughExistingPickerLogic(targetLocation) {
    const addButton = document.querySelector(`[data-add-player="${CSS.escape(targetLocation)}"]`);
    if (!addButton || !draggedPlayerId) return;

    addButton.click();

    const picker = document.getElementById("reservoirPlayerPicker");
    if (picker) picker.hidden = true;

    const tabButton = document.querySelector(`[data-picker-tab="${draggedPlayerTab}"]`);
    tabButton?.click();

    const playerButton = document.querySelector(`[data-picker-player="${CSS.escape(draggedPlayerId)}"]`);
    playerButton?.click();

    if (picker) picker.hidden = true;
  }

  document.addEventListener("dragstart", event => {
    const player = event.target.closest?.("[draggable=true][data-player-id]");
    draggedPlayerId = player?.dataset.playerId || "";
    dragSourceLocation = player?.dataset.sourceLocation || "";
    draggedPlayerTab = detectPlayerTab(player);
  }, true);

  document.addEventListener("dragend", () => {
    draggedPlayerId = "";
    dragSourceLocation = "";
    draggedPlayerTab = "main";
  }, true);

  document.addEventListener("drop", event => {
    const target = event.target.closest?.("[data-location-key]");
    const targetLocation = target?.dataset.locationKey;
    if (!targetLocation || !SECONDARY_LOCATIONS.has(targetLocation)) return;
    if (!dragSourceLocation || SECONDARY_LOCATIONS.has(dragSourceLocation)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    target.classList.remove("is-drop-target");
    addThroughExistingPickerLogic(targetLocation);
  }, true);
})();
