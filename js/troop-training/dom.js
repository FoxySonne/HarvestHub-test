export function getElement(id) {
  return document.getElementById(id);
}

export function getAdvancedMode() {
  return typeof window.getAdvancedMode === "function"
    ? window.getAdvancedMode()
    : document.body.classList.contains("advanced-mode");
}