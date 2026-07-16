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

  function dispatchChange(profile = getActiveProfile()) {
    window.dispatchEvent(new CustomEvent("harvesthub:profile-change", { detail: { profile } }));
    window.harvestHubAccountUI?.render?.();
  }

  function saveProfile(profile) {
    const profiles = readProfiles();
    profiles[profile.id] = profile;
    writeProfiles(profiles);
    localStorage.setItem(ACTIVE_KEY, profile.id);
    dispatchChange(profile);
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
    localStorage.removeItem(ACTIVE_KEY);
    dispatchChange(null);
  }

  window.harvestHubAccountStorage = {
    readProfiles,
    writeProfiles,
    getActiveProfile,
    saveProfile,
    createQuickProfile,
    clearActiveProfile,
    dispatchChange
  };
})();
