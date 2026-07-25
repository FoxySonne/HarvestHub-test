(() => {
  const PROFILE_COLUMNS = "id,nickname,state,is_primary,is_active,data,created_at,updated_at";
  let cloudSyncTask = { userId: "", promise: null };

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
    if (cleanNickname.length > 80) throw new Error("Никнейм не должен быть длиннее 80 символов.");
    if (cleanState.length > 20) throw new Error("Номер штата не должен быть длиннее 20 символов.");
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

  async function callProfileRpc(name, args) {
    const { data, error } = await getClient().rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function createInitialProfile(user) {
    const profile = normalizeProfileInput(
      user.user_metadata?.nickname || user.email?.split("@")[0] || "Пользователь",
      user.user_metadata?.state || "—"
    );
    return callProfileRpc("ensure_initial_game_profile", {
      profile_nickname: profile.nickname,
      profile_state: profile.state
    });
  }

  function toLocalAccountProfile(user, gameProfile, profiles) {
    const current = window.harvestHubAccountStorage.getActiveProfile();
    return {
      id: `account:${user.id}`,
      type: "account",
      supabaseUserId: user.id,
      gameProfileId: gameProfile.id,
      gameProfileIds: profiles.map(profile => profile.id),
      nickname: gameProfile.nickname,
      state: gameProfile.state,
      email: user.email || "",
      gameProfilesCount: profiles.length,
      isPrimaryGameProfile: Boolean(gameProfile.is_primary),
      createdAt: current?.type === "account" && current.supabaseUserId === user.id
        ? current.createdAt
        : new Date().toISOString()
    };
  }

  function saveActiveProfile(user, gameProfile, profiles, options) {
    return window.harvestHubAccountStorage.saveProfile(
      toLocalAccountProfile(user, gameProfile, profiles),
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

  async function markActiveProfile(profileId) {
    return callProfileRpc("activate_game_profile", { target_profile_id: profileId });
  }

  async function listGameProfiles() {
    const user = await getAuthenticatedUser();
    let profiles = await fetchProfiles(user.id);
    if (profiles.length === 0) {
      await createInitialProfile(user);
      profiles = await fetchProfiles(user.id);
    }
    return { user, profiles };
  }

  async function syncCloudProfileNow(user) {
    let profiles = await fetchProfiles(user.id);
    if (profiles.length === 0) {
      await createInitialProfile(user);
      profiles = await fetchProfiles(user.id);
    }

    const current = window.harvestHubAccountStorage.getActiveProfile();
    let active = profiles.find(profile => profile.is_active)
      || profiles.find(profile => profile.is_primary)
      || profiles[0];

    if (!active.is_active) {
      active = await markActiveProfile(active.id);
      profiles = profiles.map(profile => ({ ...profile, is_active: profile.id === active.id }));
    }

    if (current?.type === "account"
      && current.supabaseUserId === user.id
      && current.gameProfileId
      && current.gameProfileId !== active.id) {
      await window.harvestHubCloudSync?.flushAll?.();
    }
    migrateLegacyLocalData(user.id, active);
    return saveActiveProfile(user, active, profiles);
  }

  function syncCloudProfile(user) {
    if (!user) return Promise.resolve(null);
    if (cloudSyncTask.promise && cloudSyncTask.userId === user.id) return cloudSyncTask.promise;
    const promise = syncCloudProfileNow(user).finally(() => {
      if (cloudSyncTask.promise === promise) cloudSyncTask = { userId: "", promise: null };
    });
    cloudSyncTask = { userId: user.id, promise };
    return promise;
  }

  async function activateGameProfile(profileId) {
    const { user, profiles } = await listGameProfiles();
    const requested = profiles.find(profile => profile.id === profileId);
    if (!requested) throw new Error("Игровой профиль не найден.");

    const current = window.harvestHubAccountStorage.getActiveProfile();
    if (current?.gameProfileId !== profileId) await window.harvestHubCloudSync?.flushAll?.();

    const active = requested.is_active ? requested : await markActiveProfile(profileId);
    const nextProfiles = profiles.map(profile => ({ ...profile, is_active: profile.id === active.id }));
    return saveActiveProfile(user, active, nextProfiles);
  }

  async function createGameProfile(nickname, state) {
    const values = normalizeProfileInput(nickname, state);
    const user = await getAuthenticatedUser();
    await window.harvestHubCloudSync?.flushAll?.();
    const created = await callProfileRpc("create_and_activate_game_profile", {
      profile_nickname: values.nickname,
      profile_state: values.state
    });
    const profiles = await fetchProfiles(user.id);
    const active = profiles.find(profile => profile.id === created.id) || created;
    return saveActiveProfile(user, active, profiles);
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

    const nextProfiles = profiles.map(profile => profile.id === data.id ? data : profile);
    const current = window.harvestHubAccountStorage.getActiveProfile();
    if (current?.gameProfileId === data.id) saveActiveProfile(user, data, nextProfiles);
    return data;
  }

  async function deleteGameProfile(profileId) {
    const { user, profiles } = await listGameProfiles();
    const requested = profiles.find(profile => profile.id === profileId);
    if (!requested) throw new Error("Игровой профиль не найден.");
    if (requested.is_primary) throw new Error("Основной игровой профиль нельзя удалить.");

    await window.harvestHubCloudSync?.flushAll?.();
    const result = await callProfileRpc("delete_game_profile", { target_profile_id: profileId });
    window.harvestHubAccountStorage.clearDataProfileStorage(profileId, user.id);

    const nextProfiles = await fetchProfiles(user.id);
    const active = nextProfiles.find(profile => profile.id === result?.active_profile?.id)
      || nextProfiles.find(profile => profile.is_active)
      || nextProfiles[0];
    if (!active) throw new Error("После удаления не найден активный игровой профиль.");
    saveActiveProfile(user, active, nextProfiles);
    return active;
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
