const CLOUD_SAVE_DELAY = 400;

function getLocalAccountProfile() {
  return window.harvestHubAccount?.getProfile?.() || window.getActiveProfile?.() || null;
}

export function createIpkCloudSync({ serialize, apply }) {
  let activeProfileId = "";
  let activeProfileData = {};
  let saveTimer = null;
  let savePromise = null;
  let saveRequested = false;
  let clearInProgress = false;
  let flusherRegistered = false;

  function reset() {
    window.clearTimeout(saveTimer);
    activeProfileId = "";
    activeProfileData = {};
    savePromise = null;
    saveRequested = false;
    clearInProgress = false;
  }

  async function load() {
    const accountProfile = getLocalAccountProfile();
    if (accountProfile?.type !== "account" || !accountProfile.gameProfileId || !window.harvestHubSupabase) return false;

    const { data: sessionData, error: sessionError } = await window.harvestHubSupabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (sessionError || !user) return false;

    const { data, error } = await window.harvestHubSupabase
      .from("game_profiles")
      .select("id,data")
      .eq("user_id", user.id)
      .eq("id", accountProfile.gameProfileId)
      .maybeSingle();

    if (error) {
      console.warn("Не удалось загрузить данные ИПК из профиля:", error);
      window.harvestHubNotifications?.error(error, "Не удалось загрузить данные ИПК из профиля.");
      return false;
    }
    if (!data?.id) return false;

    activeProfileId = data.id;
    activeProfileData = data.data && typeof data.data === "object" ? data.data : {};
    if (!flusherRegistered) {
      window.harvestHubCloudSync?.registerFlusher?.(() => saveNow({ throwOnError: true }));
      flusherRegistered = true;
    }
    apply(activeProfileData.ipk);
    return true;
  }

  function saveNow({ throwOnError = false } = {}) {
    window.clearTimeout(saveTimer);
    if (!activeProfileId || !window.harvestHubSupabase || clearInProgress) return Promise.resolve(true);
    saveRequested = true;

    if (!savePromise) {
      savePromise = (async () => {
        while (saveRequested) {
          saveRequested = false;
          const nextData = { ...activeProfileData, ipk: serialize() };
          const { error } = await window.harvestHubSupabase
            .from("game_profiles")
            .update({ data: nextData })
            .eq("id", activeProfileId)
            .eq("user_id", getLocalAccountProfile()?.supabaseUserId || "");
          if (error) throw error;
          activeProfileData = nextData;
        }
        return true;
      })().catch(error => {
        console.warn("Не удалось сохранить данные ИПК в профиле:", error);
        throw error;
      }).finally(() => {
        savePromise = null;
      });
    }

    return throwOnError
      ? savePromise
      : savePromise.catch(error => {
        window.harvestHubNotifications?.error(error, "Не удалось синхронизировать данные ИПК.");
        return false;
      });
  }

  function schedule() {
    if (!activeProfileId || clearInProgress) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveNow().catch(() => {}), CLOUD_SAVE_DELAY);
  }

  async function clear() {
    window.clearTimeout(saveTimer);
    saveRequested = false;
    if (!activeProfileId || !window.harvestHubSupabase) return false;

    clearInProgress = true;
    try {
      if (savePromise) await savePromise;
      const nextData = { ...activeProfileData };
      delete nextData.ipk;
      const { error } = await window.harvestHubSupabase
        .from("game_profiles")
        .update({ data: nextData })
        .eq("id", activeProfileId)
        .eq("user_id", getLocalAccountProfile()?.supabaseUserId || "");
      if (error) throw error;
      activeProfileData = nextData;
      return true;
    } finally {
      clearInProgress = false;
    }
  }

  return {
    hasStoredIpk: () => Boolean(activeProfileData.ipk),
    clear,
    load,
    reset,
    schedule,
    flush: () => saveNow({ throwOnError: true })
  };
}
