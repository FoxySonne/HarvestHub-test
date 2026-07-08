(() => {
  const STORAGE_KEY = "harvesthub_turbo_vs_mobile_tab";
  const VALID_TABS = new Set(["turtle", "vs"]);

  function readSavedTab() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return VALID_TABS.has(saved) ? saved : "turtle";
  }

  function saveTab(tab) {
    if (VALID_TABS.has(tab)) localStorage.setItem(STORAGE_KEY, tab);
  }

  function getPageRoot() {
    return document.querySelector(".turbo-content");
  }

  function applyTab(tab = readSavedTab()) {
    if (!VALID_TABS.has(tab)) tab = "turtle";

    const root = getPageRoot();
    if (!root) return;

    root.dataset.activeEvent = tab;

    root.querySelectorAll("[data-turbo-mobile-tab]").forEach(button => {
      const isActive = button.dataset.turboMobileTab === tab;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  function bindTabs() {
    const root = getPageRoot();
    if (!root) return;

    root.querySelectorAll("[data-turbo-mobile-tab]").forEach(button => {
      if (button.dataset.turboMobileTabBound === "true") return;
      button.dataset.turboMobileTabBound = "true";

      button.addEventListener("click", () => {
        const tab = button.dataset.turboMobileTab;
        saveTab(tab);
        applyTab(tab);
      });
    });

    applyTab();
  }

  function scheduleBind() {
    window.setTimeout(bindTabs, 0);
  }

  const observer = new MutationObserver(scheduleBind);

  function start() {
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleBind();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  window.harvestHubTurboVsApplyMobileTab = applyTab;
})();
