from pathlib import Path


def replace_once(path, old, new, label):
    file = Path(path)
    source = file.read_text(encoding="utf-8")
    if new in source:
        return
    if old not in source:
        raise SystemExit(f"Expected fragment not found: {label} ({path})")
    file.write_text(source.replace(old, new, 1), encoding="utf-8")


Path("js/sync/sync-engine.js").write_text(r'''(() => {
  const TABLE = "user_app_state";
  const DEBOUNCE_MS = 1500;
  const PULL_INTERVAL_MS = 60000;
  const engines = new Set();
  const externalFlushers = new Set();

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function mergeStateValues(remoteValue, localValue) {
    if (!isPlainObject(remoteValue) || !isPlainObject(localValue)) {
      return localValue === undefined ? remoteValue : localValue;
    }
    const result = { ...remoteValue };
    Object.keys(localValue).forEach(key => {
      result[key] = Object.prototype.hasOwnProperty.call(remoteValue, key)
        ? mergeStateValues(remoteValue[key], localValue[key])
        : localValue[key];
    });
    return result;
  }

  function sameState(left, right) {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }

  function createSyncEngine(config) {
    let uploadTimer = null;
    let activeUserId = "";
    let activeContext = null;
    let remoteRevision = 0;
    let isApplyingRemote = false;
    let isUploading = false;
    let isPulling = false;
    let dirty = false;
    let started = false;
    let uploadPromise = null;
    let pullPromise = null;
    let initializePromise = null;

    function getClient() {
      return window.harvestHubSupabase || null;
    }

    function getStateKey(context = activeContext) {
      return config.getStateKey?.(context) || config.stateKey;
    }

    function emitStatus(status, detail = "") {
      window.dispatchEvent(new CustomEvent("harvesthub:cloud-sync-status", {
        detail: { scope: getStateKey(), status, detail }
      }));
    }

    function readJson(key, fallback) {
      if (!key) return fallback;
      try {
        return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
      } catch {
        return fallback;
      }
    }

    function getMetaKey(userId = activeUserId, stateKey = getStateKey()) {
      return userId && stateKey ? `${config.metaPrefix}${userId}:${encodeURIComponent(stateKey)}` : "";
    }

    function readMeta(userId = activeUserId, stateKey = getStateKey()) {
      return readJson(getMetaKey(userId, stateKey), {});
    }

    function writeMeta(values, stateKey = getStateKey()) {
      const key = getMetaKey(activeUserId, stateKey);
      if (!key) return;
      localStorage.setItem(key, JSON.stringify({ ...readJson(key, {}), ...values }));
    }

    function hasPendingMeta(meta) {
      if (meta?.pending) return true;
      const changedAt = Date.parse(meta?.changedAt || "");
      const syncedAt = Date.parse(meta?.syncedAt || "");
      return Number.isFinite(changedAt) && (!Number.isFinite(syncedAt) || changedAt > syncedAt);
    }

    async function getAuthenticatedUser() {
      const client = getClient();
      if (!client) return null;
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session?.user || null;
    }

    async function ensureSession() {
      if (activeUserId && activeContext) return true;
      const user = await getAuthenticatedUser();
      activeUserId = user?.id || "";
      activeContext = activeUserId ? await config.resolveContext(user) : null;
      return Boolean(activeUserId && activeContext && getStateKey());
    }

    async function fetchRemote(stateKey = getStateKey()) {
      const client = getClient();
      if (!client || !activeUserId || !stateKey) return null;
      const { data, error } = await client
        .from(TABLE)
        .select("data, revision, updated_at")
        .eq("user_id", activeUserId)
        .eq("state_key", stateKey)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    }

    async function saveState(state, expectedRevision, stateKey = getStateKey()) {
      const client = getClient();
      if (!client) throw new Error("Supabase недоступен");
      const { data, error } = await client.rpc("save_user_app_state_if_revision", {
        target_state_key: stateKey,
        expected_revision: expectedRevision,
        target_data: state || {}
      });
      if (error) throw error;
      return data || {};
    }

    async function applyStateLocally(state, context = activeContext) {
      if (!context) return;
      isApplyingRemote = true;
      try {
        await config.applyRemoteState(state || {}, context);
        await config.afterRemoteApplied?.(context);
      } finally {
        isApplyingRemote = false;
      }
    }

    async function applyRemote(row, context = activeContext, stateKey = getStateKey(context)) {
      if (!row || !activeUserId || !context) return;
      remoteRevision = Number(row.revision) || 0;
      await applyStateLocally(row.data || {}, context);
      writeMeta({
        revision: remoteRevision,
        syncedAt: row.updated_at || new Date().toISOString(),
        pending: false,
        lastError: ""
      }, stateKey);
      dirty = false;
      emitStatus("synced");
    }

    function uploadNow({ force = false } = {}) {
      window.clearTimeout(uploadTimer);
      if (uploadPromise) return uploadPromise;
      if (isApplyingRemote || (!force && !dirty)) return Promise.resolve(true);

      uploadPromise = (async () => {
        try {
          if (!await ensureSession()) {
            emitStatus("local");
            return true;
          }

          isUploading = true;
          emitStatus("syncing");
          const context = activeContext;
          const stateKey = getStateKey(context);
          const localState = await config.readLocalState(context);
          let stateToSave = localState || {};
          let result = await saveState(stateToSave, remoteRevision, stateKey);

          if (result.conflict) {
            remoteRevision = Number(result.revision) || 0;
            const remoteState = result.data || {};
            stateToSave = config.mergeConflictStates
              ? await config.mergeConflictStates(remoteState, stateToSave, context)
              : mergeStateValues(remoteState, stateToSave);
            result = await saveState(stateToSave, remoteRevision, stateKey);
            if (result.conflict) {
              throw new Error("Данные изменились на другом устройстве. Повтори синхронизацию.");
            }
            if (!sameState(stateToSave, localState)) await applyStateLocally(stateToSave, context);
          }

          if (!result.saved) throw new Error("Сервер не подтвердил сохранение данных.");
          remoteRevision = Number(result.revision) || Math.max(remoteRevision + 1, 1);
          dirty = false;
          writeMeta({
            revision: remoteRevision,
            syncedAt: result.updated_at || new Date().toISOString(),
            pending: false,
            lastError: ""
          }, stateKey);
          emitStatus("synced");
          return true;
        } catch (error) {
          dirty = true;
          writeMeta({ pending: true, lastError: error?.message || "Ошибка синхронизации" });
          console.error(`${config.label} cloud sync upload failed:`, error);
          emitStatus("error", error?.message || "Ошибка синхронизации");
          throw error;
        } finally {
          isUploading = false;
          uploadPromise = null;
        }
      })();

      return uploadPromise;
    }

    async function scheduleUpload() {
      if (isApplyingRemote) return;
      try {
        await ensureSession();
      } catch (error) {
        console.error(`${config.label} cloud sync session failed:`, error);
      }
      if (!activeUserId || !activeContext) return;

      dirty = true;
      writeMeta({ changedAt: new Date().toISOString(), pending: true });
      emitStatus("pending");
      window.clearTimeout(uploadTimer);
      uploadTimer = window.setTimeout(() => uploadNow().catch(() => {}), DEBOUNCE_MS);
    }

    function pullRemote({ initial = false } = {}) {
      if (pullPromise) return pullPromise;
      if (isUploading) return uploadPromise || Promise.resolve(true);
      if (dirty) return uploadNow();

      pullPromise = (async () => {
        try {
          if (!await ensureSession()) {
            emitStatus("local");
            return true;
          }

          isPulling = true;
          const context = activeContext;
          const stateKey = getStateKey(context);
          let remote = await fetchRemote(stateKey);

          if (!remote) {
            const legacyStateKey = config.getLegacyStateKey?.(context) || "";
            if (legacyStateKey) {
              const legacy = await fetchRemote(legacyStateKey);
              if (legacy) {
                await applyRemote(legacy, context, stateKey);
                dirty = true;
                writeMeta({ pending: true }, stateKey);
                await uploadNow({ force: true });
                return true;
              }
            }

            remoteRevision = 0;
            dirty = true;
            writeMeta({ pending: true }, stateKey);
            await uploadNow({ force: true });
            return true;
          }

          const meta = readMeta(activeUserId, stateKey);
          const metaRevision = Number(meta.revision || 0);
          const nextRemoteRevision = Number(remote.revision) || 0;
          remoteRevision = nextRemoteRevision;

          if (hasPendingMeta(meta)) {
            dirty = true;
            await uploadNow({ force: true });
          } else if (nextRemoteRevision > metaRevision || (initial && metaRevision === 0)) {
            await applyRemote(remote, context, stateKey);
          } else {
            writeMeta({ pending: false, lastError: "" }, stateKey);
            emitStatus("synced");
          }
          return true;
        } catch (error) {
          console.error(`${config.label} cloud sync pull failed:`, error);
          emitStatus("error", error?.message || "Ошибка загрузки");
          throw error;
        } finally {
          isPulling = false;
          pullPromise = null;
        }
      })();

      return pullPromise;
    }

    function initializeForSession() {
      if (initializePromise) return initializePromise;
      initializePromise = (async () => {
        window.clearTimeout(uploadTimer);
        const nextUser = await getAuthenticatedUser();

        if (dirty && nextUser?.id === activeUserId) await uploadNow();
        else if (dirty) writeMeta({ pending: true });

        activeUserId = nextUser?.id || "";
        activeContext = activeUserId ? await config.resolveContext(nextUser) : null;
        remoteRevision = 0;
        dirty = false;
        uploadPromise = null;
        pullPromise = null;

        if (!activeUserId || !activeContext || !getStateKey()) {
          emitStatus("local");
          return true;
        }

        dirty = hasPendingMeta(readMeta());
        await pullRemote({ initial: true });
        return true;
      })().catch(error => {
        console.error(`${config.label} cloud sync initialization failed:`, error);
        emitStatus("error", error?.message || "Ошибка запуска");
        throw error;
      }).finally(() => {
        initializePromise = null;
      });
      return initializePromise;
    }

    function start() {
      if (started) return;
      started = true;

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") pullRemote().catch(() => {});
        else uploadNow().catch(() => {});
      });
      window.addEventListener("online", () => {
        pullRemote().catch(() => {});
        if (dirty) scheduleUpload();
      });

      getClient()?.auth.onAuthStateChange((_event, session) => {
        if ((session?.user?.id || "") !== activeUserId) {
          window.setTimeout(() => initializeForSession().catch(() => {}), 0);
        }
      });

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => initializeForSession().catch(() => {}), { once: true });
      } else initializeForSession().catch(() => {});

      window.setInterval(() => {
        if (document.visibilityState === "visible") pullRemote().catch(() => {});
      }, PULL_INTERVAL_MS);
    }

    const engine = {
      start,
      scheduleUpload,
      uploadNow,
      pullRemote,
      initializeForSession,
      forceUpload: () => {
        dirty = true;
        writeMeta({ changedAt: new Date().toISOString(), pending: true });
        return uploadNow({ force: true });
      },
      getState: () => ({
        activeUserId,
        activeContext,
        stateKey: getStateKey(),
        remoteRevision,
        dirty,
        isApplyingRemote,
        isUploading,
        isPulling,
        localState: activeContext ? config.readLocalState(activeContext) : null
      }),
      get isApplyingRemote() {
        return isApplyingRemote;
      }
    };

    engines.add(engine);
    return engine;
  }

  window.harvestHubCloudSync = {
    flushAll: async () => {
      await Promise.all([
        ...Array.from(engines, engine => engine.uploadNow()),
        ...Array.from(externalFlushers, flusher => flusher())
      ]);
      return true;
    },
    initializeAll: async () => {
      await Promise.all(Array.from(engines, engine => engine.initializeForSession()));
      return true;
    },
    registerFlusher(flusher) {
      if (typeof flusher === "function") externalFlushers.add(flusher);
      return () => externalFlushers.delete(flusher);
    }
  };
  window.harvestHubCreateSyncEngine = createSyncEngine;
})();
''', encoding="utf-8")


replace_once(
    "js/core/local-storage.js",
    '''  function normalizeProfileNickname(nickname) {''',
    '''  function readStorageValue(key, fallback = "") {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : value;
    } catch (error) {
      console.warn(`Не удалось прочитать значение localStorage: ${key}`, error);
      return fallback;
    }
  }

  function writeStorageValue(key, value) {
    try {
      localStorage.setItem(key, String(value));
      return true;
    } catch (error) {
      console.warn(`Не удалось сохранить значение localStorage: ${key}`, error);
      window.dispatchEvent(new CustomEvent("harvesthub:storage-warning", { detail: { key, error } }));
      return false;
    }
  }

  function removeStorageValue(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn(`Не удалось удалить значение localStorage: ${key}`, error);
      window.dispatchEvent(new CustomEvent("harvesthub:storage-warning", { detail: { key, error } }));
      return false;
    }
  }

  function listStorageKeys() {
    try {
      return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(Boolean);
    } catch (error) {
      console.warn("Не удалось получить список ключей localStorage", error);
      return [];
    }
  }

  function normalizeProfileNickname(nickname) {''',
    "safe primitive storage helpers"
)
replace_once(
    "js/core/local-storage.js",
    '''    readJsonStorage,
    writeJsonStorage,
    clearPageFormState,''',
    '''    readJsonStorage,
    writeJsonStorage,
    readStorageValue,
    writeStorageValue,
    removeStorageValue,
    listStorageKeys,
    clearPageFormState,''',
    "storage exports"
)


Path("js/account/account-storage.js").write_text(r'''(() => {
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
''', encoding="utf-8")


Path("js/account/game-profile-manager.js").write_text(r'''(() => {
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
    return callProfileRpc("create_and_activate_game_profile", {
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
''', encoding="utf-8")


Path("js/account/account-session.js").write_text(r'''(() => {
  function getClient() {
    return window.harvestHubSupabase || null;
  }

  function getAuthRedirectUrl() {
    return new URL("./", window.location.href).toString().split("#")[0].split("?")[0];
  }

  function validatePassword(password, confirmation = password) {
    if (String(password || "").length < 8) throw new Error("Пароль должен содержать не менее 8 символов.");
    if (password !== confirmation) throw new Error("Пароли не совпадают.");
  }

  function clearStoredAccountProfile() {
    const profile = window.harvestHubAccountStorage.getActiveProfile();
    if (profile?.type === "account") window.harvestHubAccountStorage.removeProfile(profile.id);
  }

  async function syncCloudProfileWithRetry(user, attempts = 3) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await window.harvestHubGameProfileManager.syncCloudProfile(user);
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await new Promise(resolve => window.setTimeout(resolve, 700 * attempt));
      }
    }
    throw lastError;
  }

  async function signUpWithPassword(email, password, confirmation, nickname, state) {
    const cleanEmail = String(email || "").trim();
    const cleanNickname = String(nickname || "").trim();
    const cleanState = String(state || "").trim();
    if (!cleanEmail || !cleanNickname || !cleanState) throw new Error("Заполни никнейм, номер штата и email.");
    validatePassword(password, confirmation);

    const client = getClient();
    if (!client) throw new Error("Supabase пока недоступен.");

    const { data, error } = await client.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
        data: { nickname: cleanNickname, state: cleanState }
      }
    });
    if (error) throw error;
    return data;
  }

  async function signInWithPassword(email, password) {
    const cleanEmail = String(email || "").trim();
    if (!cleanEmail || !password) throw new Error("Укажи email и пароль.");

    const client = getClient();
    if (!client) throw new Error("Supabase пока недоступен.");

    const { data, error } = await client.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) throw error;

    if (data.user) {
      try {
        await syncCloudProfileWithRetry(data.user);
      } catch (profileError) {
        console.warn("Вход выполнен, но профиль пока не загрузился:", profileError);
        window.setTimeout(() => {
          syncCloudProfileWithRetry(data.user).catch(retryError => {
            console.warn("Не удалось повторно загрузить игровой профиль аккаунта:", retryError);
          });
        }, 2000);
      }
    }

    return data;
  }

  async function sendPasswordReset(email) {
    const cleanEmail = String(email || "").trim();
    if (!cleanEmail) throw new Error("Сначала укажи email профиля.");

    const client = getClient();
    if (!client) throw new Error("Supabase пока недоступен.");

    const { error } = await client.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: getAuthRedirectUrl()
    });
    if (error) throw error;
  }

  async function updateRecoveredPassword(password, confirmation) {
    validatePassword(password, confirmation);
    const client = getClient();
    if (!client) throw new Error("Supabase пока недоступен.");
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
  }

  async function signOutAccount() {
    const profile = window.harvestHubAccountStorage.getActiveProfile();
    const client = getClient();
    let syncWarning = null;

    if (profile?.type === "account") {
      try {
        await window.harvestHubCloudSync?.flushAll?.();
      } catch (error) {
        syncWarning = error;
        const continueExit = window.confirm(
          "Последние изменения не удалось сохранить в облаке. Нажми «ОК», чтобы всё равно выйти, или «Отмена», чтобы остаться и повторить сохранение."
        );
        if (!continueExit) {
          const cancelled = new Error("Выход отменён: данные ещё не сохранены.");
          cancelled.code = "SYNC_EXIT_CANCELLED";
          throw cancelled;
        }
      }
    }

    try {
      if (profile?.type === "account" && client) {
        const { error } = await client.auth.signOut();
        if (error) throw error;
      }
    } catch (error) {
      console.warn("Не удалось завершить все серверные сессии, выполняется локальный выход:", error);
      if (client) {
        const { error: localError } = await client.auth.signOut({ scope: "local" });
        if (localError) console.warn("Локальный выход Supabase завершился с ошибкой:", localError);
      }
    } finally {
      if (profile?.type === "account") window.harvestHubAccountStorage.removeProfile(profile.id);
      else window.harvestHubAccountStorage.clearActiveProfile();
    }

    return { syncWarning };
  }

  async function refreshCloudProfile() {
    const client = getClient();
    if (!client) return;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session?.user) await syncCloudProfileWithRetry(data.session.user);
    else clearStoredAccountProfile();
  }

  async function init() {
    const client = getClient();
    if (!client) return;

    await refreshCloudProfile().catch(error => {
      console.warn("Не удалось восстановить профиль аккаунта при загрузке:", error);
    });

    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") window.harvestHubAccountModal?.openRecoveryMode?.();
      if (event === "SIGNED_OUT" || !session?.user) {
        clearStoredAccountProfile();
        return;
      }
      syncCloudProfileWithRetry(session.user).catch(error => {
        console.warn("Не удалось обновить игровой профиль аккаунта:", error);
      });
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshCloudProfile().catch(() => {});
    });
    window.setInterval(() => refreshCloudProfile().catch(() => {}), 60000);
  }

  window.harvestHubAccountSession = {
    signUpWithPassword,
    signInWithPassword,
    sendPasswordReset,
    updateRecoveredPassword,
    signOutAccount,
    init
  };
})();
''', encoding="utf-8")


Path("js/core/app-loader.js").write_text(r'''(() => {
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
''', encoding="utf-8")


replace_once(
    "js/core/navigation.js",
    'const SITE_ASSET_VERSION = "20260724-player-profile-editing-2";',
    'const SITE_ASSET_VERSION = "20260725-profile-sync-1";',
    "navigation asset version"
)
replace_once(
    "js/core/navigation.js",
    '''    trackPageVisit(pageName);
    renderQuickLinks(pageName);''',
    '''    if (options.trackVisit !== false) trackPageVisit(pageName);
    renderQuickLinks(pageName);''',
    "technical reload visit guard"
)


Path("js/ipk/cloud-sync.js").write_text(r'''const CLOUD_SAVE_DELAY = 400;

function getLocalAccountProfile() {
  return window.harvestHubAccount?.getProfile?.() || window.getActiveProfile?.() || null;
}

export function createIpkCloudSync({ serialize, apply }) {
  let activeProfileId = "";
  let activeProfileData = {};
  let saveTimer = null;
  let savePromise = null;
  let saveQueued = false;
  let clearInProgress = false;
  let flusherRegistered = false;

  function reset() {
    window.clearTimeout(saveTimer);
    activeProfileId = "";
    activeProfileData = {};
    savePromise = null;
    saveQueued = false;
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
    if (savePromise) {
      saveQueued = true;
      return throwOnError ? savePromise : savePromise.catch(() => false);
    }

    savePromise = (async () => {
      const nextData = { ...activeProfileData, ipk: serialize() };
      const { error } = await window.harvestHubSupabase
        .from("game_profiles")
        .update({ data: nextData })
        .eq("id", activeProfileId)
        .eq("user_id", getLocalAccountProfile()?.supabaseUserId || "");
      if (error) throw error;
      activeProfileData = nextData;
      return true;
    })().catch(error => {
      console.warn("Не удалось сохранить данные ИПК в профиле:", error);
      throw error;
    }).finally(() => {
      savePromise = null;
      if (saveQueued) {
        saveQueued = false;
        saveNow().catch(() => {});
      }
    });

    return throwOnError ? savePromise : savePromise.catch(() => false);
  }

  function schedule() {
    if (!activeProfileId || clearInProgress) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveNow().catch(() => {}), CLOUD_SAVE_DELAY);
  }

  async function clear() {
    window.clearTimeout(saveTimer);
    saveQueued = false;
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
''', encoding="utf-8")


replace_once(
    "js/calculators/ipk.js",
    'import { createIpkCloudSync } from "../ipk/cloud-sync.js?v=20260717-25";',
    'import { createIpkCloudSync } from "../ipk/cloud-sync.js?v=20260725-profile-sync-1";',
    "IPK sync cache version"
)


replace_once(
    "js/pages/profile.js",
    '''        <div class="profile-page-actions"><button type="button" id="profileLogoutButton">Выйти</button></div>''',
    '''        <div class="profile-page-actions"><button type="button" id="profileLogoutButton">Закрыть профиль</button><button type="button" id="deleteQuickProfileButton" class="danger-button">Удалить быстрый профиль</button></div>''',
    "quick profile actions"
)
replace_once(
    "js/pages/profile.js",
    '''  document.getElementById("profileLogoutButton")?.addEventListener("click", async () => {
    await window.harvestHubCloudSync?.flushAll?.();
    await window.harvestHubAccount?.signOut?.();
    await renderProfilePage();
  });''',
    '''  document.getElementById("profileLogoutButton")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await window.harvestHubAccount?.signOut?.();
      await renderProfilePage();
    } catch (error) {
      window.alert(error.message || "Не удалось выйти из профиля.");
      button.disabled = false;
    }
  });

  document.getElementById("deleteQuickProfileButton")?.addEventListener("click", async event => {
    if (profile.type !== "quick") return;
    if (!window.confirm(`Удалить быстрый профиль «${profile.nickname}» и все его данные с этого устройства?`)) return;
    event.currentTarget.disabled = true;
    try {
      window.harvestHubAccountStorage.deleteQuickProfile(profile.id);
      await renderProfilePage();
    } catch (error) {
      window.alert(error.message || "Не удалось удалить быстрый профиль.");
      event.currentTarget.disabled = false;
    }
  });''',
    "profile logout and quick delete"
)


replace_once(
    "index.html",
    'js/core/navigation.js?v=20260724-navigation-global-fix-1',
    'js/core/navigation.js?v=20260725-profile-sync-1',
    "navigation script version"
)
replace_once(
    "index.html",
    'js/core/app-loader.js?v=20260721-light-theme-1',
    'js/core/app-loader.js?v=20260725-profile-sync-1',
    "app loader script version"
)
replace_once(
    "index.html",
    'js/core/local-storage.js?v=20260721-light-theme-1',
    'js/core/local-storage.js?v=20260725-profile-sync-1',
    "local storage script version"
)
replace_once(
    "index.html",
    'js/account/account-storage.js?v=20260721-light-theme-1',
    'js/account/account-storage.js?v=20260725-profile-sync-1',
    "account storage script version"
)
replace_once(
    "index.html",
    'js/account/game-profile-manager.js?v=20260721-light-theme-1',
    'js/account/game-profile-manager.js?v=20260725-profile-sync-1',
    "game profile manager script version"
)
replace_once(
    "index.html",
    'js/account/account-session.js?v=20260723-login-retry-1',
    'js/account/account-session.js?v=20260725-profile-sync-1',
    "account session script version"
)
replace_once(
    "index.html",
    'js/sync/sync-engine.js?v=20260721-light-theme-1',
    'js/sync/sync-engine.js?v=20260725-profile-sync-1',
    "sync engine script version"
)
replace_once(
    "index.html",
    'js/sync/calculator-sync.js?v=20260723-advanced-access-2',
    'js/sync/calculator-sync.js?v=20260725-profile-sync-1',
    "calculator sync script version"
)
