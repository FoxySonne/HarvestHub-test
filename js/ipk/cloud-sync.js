const CLOUD_SAVE_DELAY = 400;

function getLocalAccountProfile() {
  return window.harvestHubAccount?.getProfile?.() || window.getActiveProfile?.() || null;
}

export function createIpkCloudSync({ serialize, apply }) {
  let activeProfileId = "";
  let activeProfileData = {};
  let saveTimer = null;
  let saveInProgress = false;
  let saveQueued = false;
  let flusherRegistered = false;

  function reset() {
    window.clearTimeout(saveTimer);
    activeProfileId = "";
    activeProfileData = {};
    saveInProgress = false;
    saveQueued = false;
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
      return false;
    }

    if (!data?.id) return false;

    activeProfileId = data.id;
    activeProfileData = data.data && typeof data.data === "object" ? data.data : {};
    if (!flusherRegistered) {
      window.harvestHubCloudSync?.registerFlusher?.(saveNow);
      flusherRegistered = true;
    }
    apply(activeProfileData.ipk);
    return true;
  }

  async function saveNow() {
    if (!activeProfileId || !window.harvestHubSupabase) return;

    if (saveInProgress) {
      saveQueued = true;
      return;
    }

    saveInProgress = true;
    saveQueued = false;

    try {
      const nextData = { ...activeProfileData, ipk: serialize() };
      const { error } = await window.harvestHubSupabase
        .from("game_profiles")
        .update({ data: nextData })
        .eq("id", activeProfileId)
        .eq("user_id", getLocalAccountProfile()?.supabaseUserId || "");

      if (error) throw error;
      activeProfileData = nextData;
    } catch (error) {
      console.warn("Не удалось сохранить данные ИПК в профиле:", error);
    } finally {
      saveInProgress = false;
      if (saveQueued) saveNow();
    }
  }

  function schedule() {
    if (!activeProfileId) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, CLOUD_SAVE_DELAY);
  }

  return {
    hasStoredIpk: () => Boolean(activeProfileData.ipk),
    load,
    reset,
    schedule,
    flush: saveNow
  };
}
