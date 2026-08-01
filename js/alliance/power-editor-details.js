(() => {
  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-power-edit]");
    if (!button) return;
    const editor = document.getElementById("powerEditorCard");
    if (editor instanceof HTMLDetailsElement) editor.open = true;
  }, true);
})();
