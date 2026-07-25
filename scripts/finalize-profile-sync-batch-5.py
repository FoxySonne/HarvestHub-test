from pathlib import Path


def replace_once(path, old, new, label):
    file = Path(path)
    source = file.read_text(encoding="utf-8")
    if new in source:
        return
    if old not in source:
        raise SystemExit(f"Expected fragment not found: {label} ({path})")
    file.write_text(source.replace(old, new, 1), encoding="utf-8")


replace_once(
    "js/sync/sync-engine.js",
    '''    let dirty = false;
    let started = false;''',
    '''    let dirty = false;
    let changeVersion = 0;
    let started = false;''',
    "change version state"
)
replace_once(
    "js/sync/sync-engine.js",
    '''    function writeMeta(values, stateKey = getStateKey()) {
      const key = getMetaKey(activeUserId, stateKey);
      if (!key) return;
      localStorage.setItem(key, JSON.stringify({ ...readJson(key, {}), ...values }));
    }''',
    '''    function writeMeta(values, stateKey = getStateKey()) {
      const key = getMetaKey(activeUserId, stateKey);
      if (!key) return;
      const serialized = JSON.stringify({ ...readJson(key, {}), ...values });
      if (window.harvestHubStorage?.writeStorageValue) {
        window.harvestHubStorage.writeStorageValue(key, serialized);
      } else {
        try { localStorage.setItem(key, serialized); } catch (error) {
          console.warn(`Не удалось сохранить состояние синхронизации: ${key}`, error);
        }
      }
    }''',
    "safe sync meta storage"
)
old_upload = '''    function uploadNow({ force = false } = {}) {
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
    }'''
new_upload = '''    function uploadNow({ force = false } = {}) {
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
          let mustSave = force || dirty;

          while (mustSave) {
            const uploadVersion = changeVersion;
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
            dirty = changeVersion !== uploadVersion;
            writeMeta({
              revision: remoteRevision,
              syncedAt: result.updated_at || new Date().toISOString(),
              pending: dirty,
              lastError: ""
            }, stateKey);
            mustSave = dirty;
          }

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
    }'''
replace_once("js/sync/sync-engine.js", old_upload, new_upload, "stable upload loop")
replace_once(
    "js/sync/sync-engine.js",
    '''      dirty = true;
      writeMeta({ changedAt: new Date().toISOString(), pending: true });''',
    '''      dirty = true;
      changeVersion += 1;
      writeMeta({ changedAt: new Date().toISOString(), pending: true });''',
    "schedule change version"
)
replace_once(
    "js/sync/sync-engine.js",
    '''        remoteRevision = 0;
        dirty = false;
        uploadPromise = null;''',
    '''        remoteRevision = 0;
        dirty = false;
        changeVersion = 0;
        uploadPromise = null;''',
    "reset change version"
)
replace_once(
    "js/sync/sync-engine.js",
    '''        dirty = hasPendingMeta(readMeta());
        await pullRemote({ initial: true });''',
    '''        dirty = hasPendingMeta(readMeta());
        if (dirty) changeVersion = 1;
        await pullRemote({ initial: true });''',
    "restore pending change version"
)
replace_once(
    "js/sync/sync-engine.js",
    '''      forceUpload: () => {
        dirty = true;
        writeMeta({ changedAt: new Date().toISOString(), pending: true });''',
    '''      forceUpload: () => {
        dirty = true;
        changeVersion += 1;
        writeMeta({ changedAt: new Date().toISOString(), pending: true });''',
    "force upload change version"
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

    return throwOnError ? savePromise : savePromise.catch(() => false);
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
''', encoding="utf-8")


replace_once(
    "js/account/account-storage.js",
    '''    const profiles = readProfiles();
    const profile = profiles[profileId];
    if (!profile) return null;
    const previousDataProfileId = getDataProfileId();
    const wasActive = getActiveProfileId() === profileId;
    const nextProfiles = { ...profiles };
    delete nextProfiles[profileId];
    writeProfiles(nextProfiles);
    if (wasActive) writeActiveProfileId("");
    if (clearData) clearDataProfileStorage(getDataProfileId(profile), profile.supabaseUserId || "");''',
    '''    const profiles = readProfiles();
    const profile = profiles[profileId];
    if (!profile) return null;
    const previousDataProfileId = getDataProfileId();
    const previousActiveId = getActiveProfileId();
    const wasActive = previousActiveId === profileId;
    const nextProfiles = { ...profiles };
    delete nextProfiles[profileId];
    try {
      writeProfiles(nextProfiles);
      if (wasActive) writeActiveProfileId("");
    } catch (error) {
      try {
        writeProfiles(profiles);
        writeActiveProfileId(previousActiveId);
      } catch {}
      throw error;
    }
    if (clearData) clearDataProfileStorage(getDataProfileId(profile), profile.supabaseUserId || "");''',
    "remove profile rollback"
)
