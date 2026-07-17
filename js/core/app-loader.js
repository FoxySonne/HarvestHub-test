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
  let profileReloadScheduled = false;

  function handleProfileChange(event) {
    const profile = event.detail?.profile;
    const nextProfileId = event.detail?.dataProfileId
      || (profile?.type === "account" ? profile.gameProfileId || profile.id : profile?.id)
      || "";

    if (nextProfileId === lastProfileId) {
      event.stopImmediatePropagation();
      return;
    }

    lastProfileId = nextProfileId;
    event.stopImmediatePropagation();

    if (profileReloadScheduled) return;
    profileReloadScheduled = true;
    window.setTimeout(() => window.location.reload(), 0);
  }

  window.addEventListener("harvesthub:profile-change", handleProfileChange, true);

  window.addEventListener("beforeunload", () => {
    const currentPage = window.harvestHubNavigation?.getCurrentPage?.()
      || localStorage.getItem("currentPage")
      || "";
    window.savePageFormState(currentPage);
  });

  window.applyAdvancedModeSetting();
  window.applyActiveProfileSetting();
})();
