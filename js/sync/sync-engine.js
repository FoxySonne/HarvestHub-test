(() => {
  const TABLE = "user_app_state";
  const DEBOUNCE_MS = 1500;
  const PULL_INTERVAL_MS = 60000;

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

    function getClient() {
      return window.harvestHubSupabase || null;
    }

    function emitStatus(status, detail = "") {
      window.dispatchEvent(new CustomEvent("harvesthub:cloud-sync-status", {
        detail: { scope: config.stateKey, status, detail }
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

    function getMetaKey(userId = activeUserId) {
      return userId ? `${config.metaPrefix}${userId}` : "";
    }

    function writeMeta(values) {
      const key = getMetaKey();
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
      return Boolean(activeUserId && activeContext);
    }

    async function fetchRemote() {
      const client = getClient();
      if (!client || !activeUserId) return null;

      const { data, error } = await client
        .from(TABLE)
        .select("data, revision, updated_at")
        .eq("user_id", activeUserId)
        .eq("state_key", config.stateKey)
        .maybeSingle();

      if (error) throw error;
      return data || null;
    }

    async function upsertState(state, revision) {
      const client = getClient();
      if (!client) throw new Error("Supabase недоступен");

      const { data, error } = await client
        .from(TABLE)
        .upsert({
          user_id: activeUserId,
          state_key: config.stateKey,
          data: state || {},
          revision
        }, { onConflict: "user_id,state_key" })
        .select("revision, updated_at")
        .single();

      if (error) throw error;
      return data;
    }

    async function applyRemote(row) {
      if (!row || !activeUserId || !activeContext) return;

      isApplyingRemote = true;
      try {
        remoteRevision = Number(row.revision) || 0;
        await config.applyRemoteState(row.data || {}, activeContext);
        writeMeta({ revision: remoteRevision, syncedAt: row.updated_at || new Date().toISOString() });
        dirty = false;
        emitStatus("synced");
        await config.afterRemoteApplied?.(activeContext);
      } finally {
        isApplyingRemote = false;
      }
    }

    async function uploadNow({ force = false } = {}) {
      window.clearTimeout(uploadTimer);
      if (isApplyingRemote || isUploading) return;
      if (!force && !dirty) return;

      try {
        if (!await ensureSession()) {
          emitStatus("local");
          return;
        }

        isUploading = true;
        emitStatus("syncing");
        const state = await config.readLocalState(activeContext);
        const nextRevision = Math.max(remoteRevision + 1, 1);
        const data = await upsertState(state, nextRevision);

        remoteRevision = Number(data?.revision) || nextRevision;
        dirty = false;
        writeMeta({ revision: remoteRevision, syncedAt: data?.updated_at || new Date().toISOString() });
        emitStatus("synced");
      } catch (error) {
        console.error(`${config.label} cloud sync upload failed:`, error);
        emitStatus("error", error?.message || "Ошибка синхронизации");
      } finally {
        isUploading = false;
      }
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

    async function pullRemote({ initial = false } = {}) {
      if (isPulling || isUploading || dirty) return;

      try {
        if (!await ensureSession()) {
          emitStatus("local");
          return;
        }

        isPulling = true;
        const remote = await fetchRemote();
        const metaRevision = Number(readJson(getMetaKey(), {}).revision || 0);

        if (!remote) {
          dirty = true;
          await uploadNow({ force: true });
          return;
        }

        const nextRemoteRevision = Number(remote.revision) || 0;
        remoteRevision = nextRemoteRevision;

        if (nextRemoteRevision > metaRevision) await applyRemote(remote);
        else if (initial && metaRevision === 0) {
          dirty = true;
          await uploadNow({ force: true });
        } else emitStatus("synced");
      } catch (error) {
        console.error(`${config.label} cloud sync pull failed:`, error);
        emitStatus("error", error?.message || "Ошибка загрузки");
      } finally {
        isPulling = false;
      }
    }

    async function initializeForSession() {
      window.clearTimeout(uploadTimer);
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

      const client = getClient();
      client?.auth.onAuthStateChange(() => window.setTimeout(initializeForSession, 0));

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeForSession, { once: true });
      } else initializeForSession();

      window.setInterval(() => {
        if (document.visibilityState === "visible") pullRemote();
      }, PULL_INTERVAL_MS);
    }

    return {
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
  }

  window.harvestHubCreateSyncEngine = createSyncEngine;
})();
