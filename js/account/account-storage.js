(() => {
  const PROFILES_KEY = "harvesthub_profiles";
  const ACTIVE_KEY = "harvesthub_active_profile";

  function storage() {
    return window.harvestHubStorage;
  }

  function storageError() {
    return new Error("Браузер не смог сохранить локальные данные. Освободи место или разреши хранилище сайта.");
  }

  function readProfiles() {
    return storage()?.readJsonStorage?.(PROFILES_KEY, {}) || {};
  }

  function writeProfiles(profiles) {
    if (!storage()?.writeJsonStorage?.(PROFILES_KEY, profiles)) throw storageError();
  }

  function getActiveProfileId() {
    return storage()?.readStorageValue?.(ACTIVE_KEY, "") || "";
  }

  function writeActiveProfileId(profileId) {
    const ok = profileId
      ? storage()?.writeStorageValue?.(ACTIVE_KEY, profileId)
      : storage()?.removeStorageValue?.(ACTIVE_KEY);
    if (!ok) throw storageError();
  }

  function getActiveProfile() {
    return readProfiles()[getActiveProfileId()] || null;
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
    if (!profile?.id) throw new Error("Профиль не содержит идентификатор.");
    const previousDataProfileId = getDataProfileId();
    const previousProfiles = readProfiles();
    const previousActiveId = getActiveProfileId();
    const profiles = { ...previousProfiles, [profile.id]: profile };

    try {
      writeProfiles(profiles);
      writeActiveProfileId(profile.id);
    } catch (error) {
      try {
        writeProfiles(previousProfiles);
        writeActiveProfileId(previousActiveId);
      } catch {}
      throw error;
    }

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

  function getProfileStorageKeys(dataProfileId, userId = "") {
    if (!dataProfileId) return [];
    const exactKeys = new Set([
      `harvesthub_turbo_vs_week_state:profile:${dataProfileId}`,
      `harvesthub_troop_training_transfer:profile:${dataProfileId}`,
      `harvesthub_troop_training_transfer_applied_ipk:profile:${dataProfileId}`,
      `harvesthub_troop_training_transfer_applied_turbo_vs:profile:${dataProfileId}`
    ]);
    const prefixes = [
      `harvesthub_page_form_state:profile:${dataProfileId}:`,
      `harvesthub_profile_block_state:profile:${dataProfileId}:`
    ];
    if (userId) {
      const encodedScope = encodeURIComponent(`game_profile:${dataProfileId}:`);
      prefixes.push(
        `harvesthub_cloud_meta:turbo_vs:${userId}:${encodedScope}`,
        `harvesthub_cloud_meta:calculator_forms:${userId}:${encodedScope}`
      );
    }
    return storage()?.listStorageKeys?.().filter(key => exactKeys.has(key) || prefixes.some(prefix => key.startsWith(prefix))) || [];
  }

  function clearDataProfileStorage(dataProfileId, userId = "") {
    getProfileStorageKeys(dataProfileId, userId).forEach(key => storage()?.removeStorageValue?.(key));
  }

  function removeProfile(profileId, { clearData = false } = {}) {
    const profiles = readProfiles();
    const profile = profiles[profileId];
    if (!profile) return null;
    const previousDataProfileId = getDataProfileId();
    const wasActive = getActiveProfileId() === profileId;
    const nextProfiles = { ...profiles };
    delete nextProfiles[profileId];
    writeProfiles(nextProfiles);
    if (wasActive) writeActiveProfileId("");
    if (clearData) clearDataProfileStorage(getDataProfileId(profile), profile.supabaseUserId || "");

    if (wasActive) dispatchChange(null, previousDataProfileId);
    else window.harvestHubAccountUI?.render?.();
    return profile;
  }

  function clearActiveProfile({ removeStoredProfile = false, clearData = false } = {}) {
    const activeId = getActiveProfileId();
    const profile = getActiveProfile();
    if (removeStoredProfile && activeId) return removeProfile(activeId, { clearData });
    const previousDataProfileId = getDataProfileId(profile);
    writeActiveProfileId("");
    dispatchChange(null, previousDataProfileId);
    return profile;
  }

  function deleteQuickProfile(profileId) {
    const profile = readProfiles()[profileId];
    if (!profile || profile.type !== "quick") throw new Error("Быстрый профиль не найден.");
    return removeProfile(profileId, { clearData: true });
  }

  window.harvestHubAccountStorage = {
    readProfiles,
    writeProfiles,
    getActiveProfile,
    getDataProfileId,
    saveProfile,
    createQuickProfile,
    removeProfile,
    clearActiveProfile,
    clearDataProfileStorage,
    deleteQuickProfile,
    dispatchChange
  };
})();
