(() => {
  function cleanupAlliancePage() {
    if (document.querySelector(".alliance-page")) return;
    if (typeof window.harvestHubAllianceCleanup !== "function") return;

    const cleanup = window.harvestHubAllianceCleanup;
    window.harvestHubAllianceCleanup = null;
    cleanup();
  }

  function startObserver() {
    const pageContent = document.getElementById("page-content");
    if (!pageContent) return;

    const observer = new MutationObserver(cleanupAlliancePage);
    observer.observe(pageContent, { childList: true, subtree: false });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else {
    startObserver();
  }
})();
