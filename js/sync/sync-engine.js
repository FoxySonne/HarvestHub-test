(() => {
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
