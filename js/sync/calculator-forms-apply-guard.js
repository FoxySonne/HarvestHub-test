(() => {
  const CALCULATOR_PAGES = new Set([
    "calculator/ipk.html",
    "calculator/season-resources.html",
    "calculator/troop-training.html"
  ]);

  let cloudReloadPending = false;
  let resetTimer = null;

  function markCloudReload() {
    cloudReloadPending = true;
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      cloudReloadPending = false;
    }, 250);
  }

  window.addEventListener("harvesthub:cloud-sync-status", event => {
    const detail = event.detail || {};
    if (detail.scope !== "calculator_forms" || detail.status !== "synced") return;
    markCloudReload();
  });

  const originalLoadPage = window.loadPage;
  if (typeof originalLoadPage !== "function") return;

  window.loadPage = function guardedLoadPage(pageName, ...args) {
    if (cloudReloadPending && CALCULATOR_PAGES.has(pageName)) {
      cloudReloadPending = false;
      window.clearTimeout(resetTimer);

      const container = document.getElementById("page-content");
      if (container) container.innerHTML = "";
    }

    return originalLoadPage.call(this, pageName, ...args);
  };
})();