(() => {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  const openButton = document.getElementById("openMenu");

  function isProfileSwitcherOpen() {
    return document.getElementById("mobileProfileSwitcher")?.classList.contains("active") || false;
  }

  function isOpen() {
    return sidebar?.classList.contains("active") || false;
  }

  function syncOverlay() {
    const anyPanelOpen = isOpen() || isProfileSwitcherOpen();
    overlay?.classList.toggle("active", anyPanelOpen);
    document.body?.classList.toggle("mobile-panel-open", anyPanelOpen);
  }

  function openMenu() {
    if (!sidebar || window.matchMedia("(min-width: 900px)").matches) return;
    window.dispatchEvent(new CustomEvent("harvesthub:left-menu-open"));
    sidebar.classList.add("active");
    sidebar.setAttribute("aria-hidden", "false");
    syncOverlay();
  }

  function closeMenu() {
    sidebar?.classList.remove("active");
    sidebar?.setAttribute("aria-hidden", "true");
    syncOverlay();
  }

  openButton?.addEventListener("click", openMenu);
  overlay?.addEventListener("click", closeMenu);

  document.addEventListener("click", event => {
    if (event.target.closest("#sidebar [data-page-path]")) closeMenu();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMenu();
  });

  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 900px)").matches) closeMenu();
  });

  window.harvestHubMenu = {
    open: openMenu,
    close: closeMenu,
    isOpen,
    syncOverlay
  };
})();
