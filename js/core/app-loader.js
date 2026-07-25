(() => {
  const ACTIVE_PROFILE_STORAGE_KEY = "harvesthub_active_profile";

  function getStoredDataProfileId() {
    const activeId = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) || "";
    if (!activeId) return "";
    try {
      const profile = JSON.parse(localStorage.getItem("harvesthub_profiles") || "{}")[activeId];
      return profile?.type === "account" ? profile.gameProfileId || profile.id : profile?.id || activeId;
    } catch {
      return activeId;
    }
  }

  let lastProfileId = getStoredDataProfileId();
  let profileRefreshPromise = null;

  async function refreshProfileContext() {
    if (profileRefreshPromise) return profileRefreshPromise;
    profileRefreshPromise = (async () => {
      try {
        await window.harvestHubCloudSync?.initializeAll?.();
      } catch (error) {
        console.warn("Не удалось полностью обновить облачный контекст профиля:", error);
      }

      const currentPage = window.harvestHubNavigation?.getCurrentPage?.()
        || localStorage.getItem("currentPage")
        || "home.html";
      if (typeof window.loadPage === "function") {
        await window.loadPage(currentPage, {
          skipCurrentSave: true,
          trackVisit: false,
          behavior: "auto"
        });
      }
      window.harvestHubAccountUI?.render?.();
    })().finally(() => {
      profileRefreshPromise = null;
    });
    return profileRefreshPromise;
  }

  function handleProfileChange(event) {
    const profile = event.detail?.profile;
    const nextProfileId = event.detail?.dataProfileId
      || (profile?.type === "account" ? profile.gameProfileId || profile.id : profile?.id)
      || "";
    if (nextProfileId === lastProfileId) return;
    lastProfileId = nextProfileId;
    window.setTimeout(() => refreshProfileContext().catch(error => {
      console.warn("Не удалось обновить страницу после смены профиля:", error);
    }), 0);
  }

  window.addEventListener("harvesthub:profile-change", handleProfileChange);

  window.addEventListener("beforeunload", () => {
    const currentPage = window.harvestHubNavigation?.getCurrentPage?.()
      || localStorage.getItem("currentPage")
      || "";
    window.savePageFormState(currentPage);
  });

  window.applyAdvancedModeSetting();
  window.applyActiveProfileSetting();
})();
