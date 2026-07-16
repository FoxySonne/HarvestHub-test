(() => {
  const ACTIVE_PROFILE_STORAGE_KEY = "harvesthub_active_profile";
  let lastProfileId = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) || "";
  let profileReloadScheduled = false;

  function handleProfileChange(event) {
    const nextProfileId = event.detail?.profile?.id || "";

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
