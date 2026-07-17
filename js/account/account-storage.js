(() => {
  const PROFILES_KEY = "harvesthub_profiles";
  const ACTIVE_KEY = "harvesthub_active_profile";

  function readProfiles() {
    try {
      return JSON.parse(localStorage.getItem(PROFILES_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writeProfiles(profiles) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  }

  function getActiveProfile() {
    const id = localStorage.getItem(ACTIVE_KEY) || "";
    return readProfiles()[id] || null;
  }

  function getDataProfileId(profile = getActiveProfile()) {
    if (!profile) return "";
    if (profile.type === "account") return profile.gameProfileId || profile.id;
    return profile.id || "";
  }

  function dispatchChange(profile = getActiveProfile(), previousDataProfileId = "") {
    window.dispatchEvent(new CustomEvent("harvesthub:profile-change", {
      detail: {
        profile,
        dataProfileId: getDataProfileId(profile),
        previousDataProfileId
      }
    }));
    window.harvestHubAccountUI?.render?.();
  }

  function saveProfile(profile, { forceProfileChange = false } = {}) {
    const previousDataProfileId = getDataProfileId();
    const profiles = readProfiles();
    profiles[profile.id] = profile;
    writeProfiles(profiles);
    localStorage.setItem(ACTIVE_KEY, profile.id);
    const nextDataProfileId = getDataProfileId(profile);

    if (forceProfileChange || previousDataProfileId !== nextDataProfileId) {
      dispatchChange(profile, previousDataProfileId);
    } else {
      window.dispatchEvent(new CustomEvent("harvesthub:account-profile-render", { detail: { profile } }));
      window.harvestHubAccountUI?.render?.();
    }
    return profile;
  }

  function createQuickProfile(nickname, state) {
    const cleanNickname = String(nickname || "").trim();
    const cleanState = String(state || "").trim();
    if (!cleanNickname || !cleanState) throw new Error("Заполни никнейм и номер штата.");

    return saveProfile({
      id: `quick:${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
      type: "quick",
      nickname: cleanNickname,
      state: cleanState,
      createdAt: new Date().toISOString()
    });
  }

  function clearActiveProfile() {
    const previousDataProfileId = getDataProfileId();
    localStorage.removeItem(ACTIVE_KEY);
    dispatchChange(null, previousDataProfileId);
  }

  window.harvestHubAccountStorage = {
    readProfiles,
    writeProfiles,
    getActiveProfile,
    getDataProfileId,
    saveProfile,
    createQuickProfile,
    clearActiveProfile,
    dispatchChange
  };
})();
