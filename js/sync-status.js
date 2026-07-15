(() => {
  let state = "synced";
  let rendering = false;

  function statusMarkup() {
    return `<span class="sync-state-icon" aria-hidden="true"><span></span><span></span></span><span class="sync-state-text"></span>`;
  }

  function isAccountProfile() {
    return window.harvestHubAccount?.getProfile?.()?.type === "account";
  }

  function prepareStatusElement(element) {
    if (!element) return;
    if (!element.classList.contains("sync-state")) {
      element.classList.add("sync-state");
      element.innerHTML = statusMarkup();
    }
  }

  function ensureStatusElements() {
    if (rendering) return;
    rendering = true;
    try {
      if (isAccountProfile()) {
        document.querySelectorAll(".profile-sync-status, .desktop-profile-status").forEach(prepareStatusElement);
      }

      const page = localStorage.getItem("currentPage") || "";
      const calculatorPages = new Set([
        "calculator/ipk.html",
        "calculator/turbo-vs.html",
        "calculator/season-resources.html",
        "calculator/troop-training.html"
      ]);
      const container = document.getElementById("page-content");
      const profilePageOpen = Boolean(container?.querySelector("#profilePageContent"));
      const existing = container?.querySelector("[data-calculator-sync-status]");

      if (!isAccountProfile() || profilePageOpen || !calculatorPages.has(page)) {
        existing?.remove();
      } else if (container && !existing) {
        const element = document.createElement("p");
        element.className = "sync-state calculator-sync-state";
        element.dataset.calculatorSyncStatus = "";
        element.innerHTML = statusMarkup();
        container.prepend(element);
      }

      render();
    } finally {
      rendering = false;
    }
  }

  function render() {
    const labels = {
      synced: "Данные синхронизированы",
      syncing: "Данные синхронизируются",
      error: "Ошибка синхронизации"
    };

    document.querySelectorAll(".sync-state").forEach(element => {
      element.dataset.syncState = state;
      const text = element.querySelector(".sync-state-text");
      if (text) text.textContent = labels[state];
      element.setAttribute("aria-label", labels[state]);
    });
  }

  function setState(nextState) {
    if (!Object.prototype.hasOwnProperty.call({ synced: 1, syncing: 1, error: 1 }, nextState)) return;
    state = nextState;
    ensureStatusElements();
  }

  const observer = new MutationObserver(() => window.requestAnimationFrame(ensureStatusElements));
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("harvesthub:profile-change", ensureStatusElements);

  window.harvestHubSyncStatus = {
    setState,
    markSaving: () => setState("syncing"),
    markSynced: () => setState("synced"),
    markError: () => setState("error"),
    refresh: ensureStatusElements
  };

  ensureStatusElements();
})();