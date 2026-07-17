(() => {
  const PROFILE_COLUMNS = "id,nickname,state,is_primary,is_active,data,created_at,updated_at";
  let cloudSyncPromise = null;

  function getClient() {
    return window.harvestHubSupabase || null;
  }

  async function getAuthenticatedUser() {
    const client = getClient();
    if (!client) throw new Error("Supabase пока недоступен.");
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session?.user) throw new Error("Сессия аккаунта не найдена.");
    return data.session.user;
  }

  function normalizeProfileInput(nickname, state) {
    const cleanNickname = String(nickname || "").trim();
    const cleanState = String(state || "").trim();
    if (!cleanNickname || !cleanState) throw new Error("Заполни никнейм и номер штата.");
    return { nickname: cleanNickname, state: cleanState };
  }

  async function fetchProfiles(userId) {
    const { data, error } = await getClient()
      .from("game_profiles")
      .select(PROFILE_COLUMNS)
      .eq("user_id", userId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function createInitialProfile(user) {
    const profile = normalizeProfileInput(
      user.user_metadata?.nickname || user.email?.split("@")[0] || "Пользователь",
      user.user_metadata?.state || "—"
    );
    const { data, error } = await getClient()
      .from("game_profiles")
      .insert({
        user_id: user.id,
        ...profile,
        is_primary: true,
        is_active: true,
        data: {}
      })
      .select(PROFILE_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  }

  function toLocalAccountProfile(user, gameProfile, count) {
    const current = window.harvestHubAccountStorage.getActiveProfile();
    return {
      id: `account:${user.id}`,
      type: "account",
      supabaseUserId: user.id,
      gameProfileId: gameProfile.id,
      nickname: gameProfile.nickname,
      state: gameProfile.state,
      email: user.email || "",
      gameProfilesCount: count,
      isPrimaryGameProfile: Boolean(gameProfile.is_primary),
      createdAt: current?.type === "account" && current.supabaseUserId === user.id
        ? current.createdAt
        : new Date().toISOString()
    };
  }

  function saveActiveProfile(user, gameProfile, count, options) {
    return window.harvestHubAccountStorage.saveProfile(
      toLocalAccountProfile(user, gameProfile, count),
      options
    );
  }

  function migrateLegacyLocalData(userId, gameProfile) {
    if (!gameProfile?.is_primary) return;
    const marker = `harvesthub_game_profile_storage_migrated:${userId}`;
    if (localStorage.getItem(marker)) return;

    const legacyScope = `account:${userId}`;
    const nextScope = gameProfile.id;
    const prefixes = [
      "harvesthub_page_form_state:profile:",
      "harvesthub_turbo_vs_week_state:profile:",
      "harvesthub_profile_block_state:profile:"
    ];

    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter(Boolean)
      .forEach(key => {
        const prefix = prefixes.find(item => key.startsWith(`${item}${legacyScope}`));
        if (!prefix) return;
        const nextKey = `${prefix}${nextScope}${key.slice(`${prefix}${legacyScope}`.length)}`;
        if (localStorage.getItem(nextKey) == null) localStorage.setItem(nextKey, localStorage.getItem(key));
      });

    [
      "harvesthub_troop_training_transfer",
      "harvesthub_troop_training_transfer_applied_ipk",
      "harvesthub_troop_training_transfer_applied_turbo_vs"
    ].forEach(key => {
      const nextKey = `${key}:profile:${nextScope}`;
      if (localStorage.getItem(nextKey) == null && localStorage.getItem(key) != null) {
        localStorage.setItem(nextKey, localStorage.getItem(key));
      }
    });

    localStorage.setItem(marker, gameProfile.id);
  }

  async function markActiveProfile(userId, profileId) {
    const client = getClient();
    const { error: clearError } = await client
      .from("game_profiles")
      .update({ is_active: false })
      .eq("user_id", userId)
      .eq("is_active", true);
    if (clearError) throw clearError;

    const { data, error } = await client
      .from("game_profiles")
      .update({ is_active: true })
      .eq("user_id", userId)
      .eq("id", profileId)
      .select(PROFILE_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  }

  async function listGameProfiles() {
    const user = await getAuthenticatedUser();
    let profiles = await fetchProfiles(user.id);
    if (profiles.length === 0) profiles = [await createInitialProfile(user)];
    return { user, profiles };
  }

  async function syncCloudProfileNow(user) {
    let profiles = await fetchProfiles(user.id);
    if (profiles.length === 0) profiles = [await createInitialProfile(user)];

    const current = window.harvestHubAccountStorage.getActiveProfile();
    let active = profiles.find(profile => profile.is_active);
    if (!active && current?.supabaseUserId === user.id) {
      active = profiles.find(profile => profile.id === current.gameProfileId);
    }
    active ||= profiles.find(profile => profile.is_primary) || profiles[0];

    if (!active.is_active) {
      active = await markActiveProfile(user.id, active.id);
      profiles = profiles.map(profile => ({
        ...profile,
        is_active: profile.id === active.id
      }));
    }

    if (current?.type === "account" && current.gameProfileId && current.gameProfileId !== active.id) {
      await window.harvestHubCloudSync?.flushAll?.();
    }
    migrateLegacyLocalData(user.id, active);
    return saveActiveProfile(user, active, profiles.length);
  }

  function syncCloudProfile(user) {
    if (!user) return Promise.resolve(null);
    if (cloudSyncPromise) return cloudSyncPromise;
    cloudSyncPromise = syncCloudProfileNow(user).finally(() => {
      cloudSyncPromise = null;
    });
    return cloudSyncPromise;
  }

  async function activateGameProfile(profileId) {
    const { user, profiles } = await listGameProfiles();
    const requested = profiles.find(profile => profile.id === profileId);
    if (!requested) throw new Error("Игровой профиль не найден.");

    const current = window.harvestHubAccountStorage.getActiveProfile();
    if (current?.gameProfileId !== profileId) {
      await window.harvestHubCloudSync?.flushAll?.();
    }

    const active = requested.is_active ? requested : await markActiveProfile(user.id, profileId);
    return saveActiveProfile(user, active, profiles.length);
  }

  async function createGameProfile(nickname, state) {
    const values = normalizeProfileInput(nickname, state);
    const { user, profiles } = await listGameProfiles();
    await window.harvestHubCloudSync?.flushAll?.();

    const { data, error } = await getClient()
      .from("game_profiles")
      .insert({
        user_id: user.id,
        ...values,
        is_primary: profiles.length === 0,
        is_active: false,
        data: {}
      })
      .select(PROFILE_COLUMNS)
      .single();
    if (error) throw error;

    return activateGameProfile(data.id);
  }

  async function updateGameProfile(profileId, nickname, state) {
    const values = normalizeProfileInput(nickname, state);
    const { user, profiles } = await listGameProfiles();
    const existing = profiles.find(profile => profile.id === profileId);
    if (!existing) throw new Error("Игровой профиль не найден.");

    const { data, error } = await getClient()
      .from("game_profiles")
      .update(values)
      .eq("user_id", user.id)
      .eq("id", profileId)
      .select(PROFILE_COLUMNS)
      .single();
    if (error) throw error;

    if (data.is_primary) {
      const { error: userError } = await getClient().auth.updateUser({ data: values });
      if (userError) throw userError;
    }

    const current = window.harvestHubAccountStorage.getActiveProfile();
    if (current?.gameProfileId === data.id) saveActiveProfile(user, data, profiles.length);
    return data;
  }

  function clearLocalProfileData(profileId) {
    const plainScope = `:profile:${profileId}`;
    const cloudScope = `game_profile%3A${encodeURIComponent(profileId)}%3A`;
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter(key => key?.includes(plainScope) || key?.includes(cloudScope))
      .forEach(key => localStorage.removeItem(key));
  }

  async function clearCloudProfileState(userId, profileId) {
    const stateKeys = [
      `game_profile:${profileId}:turbo_vs_week`,
      `game_profile:${profileId}:calculator_forms`
    ];
    const { error } = await getClient()
      .from("user_app_state")
      .delete()
      .eq("user_id", userId)
      .in("state_key", stateKeys);
    if (error) console.warn("Не удалось удалить архивные данные игрового профиля:", error);
  }

  async function deleteGameProfile(profileId) {
    const { user, profiles } = await listGameProfiles();
    const requested = profiles.find(profile => profile.id === profileId);
    if (!requested) throw new Error("Игровой профиль не найден.");
    if (requested.is_primary) throw new Error("Основной игровой профиль нельзя удалить.");

    const current = window.harvestHubAccountStorage.getActiveProfile();
    const deletingActive = current?.gameProfileId === requested.id;
    let nextActive = profiles.find(profile => profile.is_primary)
      || profiles.find(profile => profile.id !== requested.id);
    if (!nextActive) throw new Error("Нельзя удалить единственный игровой профиль.");

    await window.harvestHubCloudSync?.flushAll?.();
    if (deletingActive) nextActive = await markActiveProfile(user.id, nextActive.id);

    const { error } = await getClient()
      .from("game_profiles")
      .delete()
      .eq("user_id", user.id)
      .eq("id", requested.id);
    if (error) {
      if (deletingActive) await markActiveProfile(user.id, requested.id);
      throw error;
    }

    await clearCloudProfileState(user.id, requested.id);
    clearLocalProfileData(requested.id);

    if (!deletingActive) {
      nextActive = profiles.find(profile => profile.id === current?.gameProfileId)
        || profiles.find(profile => profile.is_active)
        || nextActive;
    }
    saveActiveProfile(user, nextActive, profiles.length - 1);
    return nextActive;
  }

  window.harvestHubGameProfileManager = {
    syncCloudProfile,
    listGameProfiles,
    activateGameProfile,
    createGameProfile,
    updateGameProfile,
    deleteGameProfile
  };
})();
