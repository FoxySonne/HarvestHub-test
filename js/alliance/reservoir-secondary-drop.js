(() => {
  const SECONDARY_LOCATIONS = new Set(["central", "development", "military"]);
  let dragSourceLocation = "";

  document.addEventListener("dragstart", event => {
    const player = event.target.closest?.("[draggable=true][data-player-id]");
    dragSourceLocation = player?.dataset.sourceLocation || "";
  }, true);

  document.addEventListener("dragend", () => {
    dragSourceLocation = "";
  }, true);

  document.addEventListener("drop", event => {
    const target = event.target.closest?.("[data-location-key]");
    const targetLocation = target?.dataset.locationKey;
    if (!targetLocation || !SECONDARY_LOCATIONS.has(targetLocation)) return;
    if (!dragSourceLocation || SECONDARY_LOCATIONS.has(dragSourceLocation)) return;

    event.dataTransfer?.setData("application/x-reservoir-source", "");
  }, true);
})();
