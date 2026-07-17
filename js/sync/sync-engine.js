(() => {
  const TABLE = "user_app_state";
  const DEBOUNCE_MS = 1500;
  const PULL_INTERVAL_MS = 60000;
  const engines = new Set();
  const externalFlushers = new Set();

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

    function writeMeta(values, stateKey = getStateKey()) {
      const key = getMetaKey(activeUserId, stateKey);
      if (!key) return;
      localStorage.setItem(key, JSON.stringify({ ...readJson(key, {}), ...values }));
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

    async function upsertState(state, revision, stateKey = getStateKey()) {
      const client = getClient();
      if (!client) throw new Error("Supabase недоступен");
      const { data, error } = await client
        .from(TABLE)
        .upsert({
          user_id: activeUserId,
          state_key: stateKey,
          data: state || {},
          revision
        }, { onConflict: "user_id,state_key" })
        .select("revision, updated_at")
        .single();
      if (error) throw error;
      return data;
    }

    async function applyRemote(row, context = activeContext, stateKey = getStateKey(context)) {
      if (!row || !activeUserId || !context) return;
      isApplyingRemote = true;
      try {
        remoteRevision = Number(row.revision) || 0;
        await config.applyRemoteState(row.data || {}, context);
        writeMeta({ revision: remoteRevision, syncedAt: row.updated_at || new Date().toISOString() }, stateKey);
        dirty = false;
        emitStatus("synced");
        await config.afterRemoteApplied?.(context);
      } finally {
        isApplyingRemote = false;
      }
    }

    function uploadNow({ force = false } = {}) {
      window.clearTimeout(uploadTimer);
      if (uploadPromise) return uploadPromise;
      if (isApplyingRemote || (!force && !dirty)) return Promise.resolve();

      uploadPromise = (async () => {
        try {
          if (!await ensureSession()) {
            emitStatus("local");
            return;
          }

          isUploading = true;
          emitStatus("syncing");
          const context = activeContext;
          const stateKey = getStateKey(context);
          const state = await config.readLocalState(context);
          const nextRevision = Math.max(remoteRevision + 1, 1);
          const data = await upsertState(state, nextRevision, stateKey);

          remoteRevision = Number(data?.revision) || nextRevision;
          dirty = false;
          writeMeta({ revision: remoteRevision, syncedAt: data?.updated_at || new Date().toISOString() }, stateKey);
          emitStatus("synced");
        } catch (error) {
          console.error(`${config.label} cloud sync upload failed:`, error);
          emitStatus("error", error?.message || "Ошибка синхронизации");
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
      writeMeta({ changedAt: new Date().toISOString() });
      emitStatus("pending");
      window.clearTimeout(uploadTimer);
      uploadTimer = window.setTimeout(() => uploadNow(), DEBOUNCE_MS);
    }

    function pullRemote({ initial = false } = {}) {
      if (pullPromise) return pullPromise;
      if (isUploading || dirty) return Promise.resolve();

      pullPromise = (async () => {
        try {
          if (!await ensureSession()) {
            emitStatus("local");
            return;
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
                await uploadNow({ force: true });
                return;
              }
            }

            dirty = true;
            await uploadNow({ force: true });
            return;
          }

          const metaRevision = Number(readJson(getMetaKey(activeUserId, stateKey), {}).revision || 0);
          const nextRemoteRevision = Number(remote.revision) || 0;
          remoteRevision = nextRemoteRevision;

          if (nextRemoteRevision > metaRevision) await applyRemote(remote, context, stateKey);
          else if (initial && metaRevision === 0) {
            dirty = true;
            await uploadNow({ force: true });
          } else emitStatus("synced");
        } catch (error) {
          console.error(`${config.label} cloud sync pull failed:`, error);
          emitStatus("error", error?.message || "Ошибка загрузки");
        } finally {
          isPulling = false;
          pullPromise = null;
        }
      })();

      return pullPromise;
    }

    async function initializeForSession() {
      window.clearTimeout(uploadTimer);
      if (dirty) await uploadNow();
      activeUserId = "";
      activeContext = null;
      remoteRevision = 0;
      dirty = false;

      try {
        if (!await ensureSession()) {
          emitStatus("local");
          return;
        }
        await pullRemote({ initial: true });
      } catch (error) {
        console.error(`${config.label} cloud sync initialization failed:`, error);
        emitStatus("error", error?.message || "Ошибка запуска");
      }
    }

    function start() {
      if (started) return;
      started = true;

      window.addEventListener("harvesthub:profile-change", initializeForSession);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") pullRemote();
        else uploadNow();
      });
      window.addEventListener("online", () => {
        pullRemote();
        if (dirty) scheduleUpload();
      });

      getClient()?.auth.onAuthStateChange((_event, session) => {
        if ((session?.user?.id || "") !== activeUserId) window.setTimeout(initializeForSession, 0);
      });

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeForSession, { once: true });
      } else initializeForSession();

      window.setInterval(() => {
        if (document.visibilityState === "visible") pullRemote();
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
    flushAll: () => Promise.all([
      ...Array.from(engines, engine => engine.uploadNow()),
      ...Array.from(externalFlushers, flusher => flusher())
    ]),
    registerFlusher(flusher) {
      if (typeof flusher === "function") externalFlushers.add(flusher);
      return () => externalFlushers.delete(flusher);
    }
  };
  window.harvestHubCreateSyncEngine = createSyncEngine;
})();
