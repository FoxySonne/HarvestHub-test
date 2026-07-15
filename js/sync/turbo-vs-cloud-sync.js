(() => {
  const TABLE = "user_app_state";
  const STATE_KEY = "turbo_vs_week";
  const LOCAL_PREFIX = "harvesthub_turbo_vs_week_state:";
  const META_PREFIX = "harvesthub_cloud_meta:turbo_vs:";
  const DEBOUNCE_MS = 1500;
  const PULL_INTERVAL_MS = 60000;

  let uploadTimer = null;
  let pullTimer = null;
  let activeUserId = "";
  let remoteRevision = 0;
  let isApplyingRemote = false;
  let isUploading = false;
  let isPulling = false;
  let dirty = false;

  function emitStatus(status, detail = "") {
    window.dispatchEvent(new CustomEvent("harvesthub:cloud-sync-status", {
      detail: { scope: STATE_KEY, status, detail }
    }));
  }

  function getClient() {
    return window.harvestHubSupabase || null;
  }

  function getLocalKey(userId = activeUserId) {
    return userId ? `${LOCAL_PREFIX}profile:account:${userId}` : "";
  }

  function getMetaKey(userId = activeUserId) {
    return userId ? `${META_PREFIX}${userId}` : "";
  }

  function readJson(key, fallback) {
    if (!key) return fallback;
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  }

  function writeMeta(values) {
    const key = getMetaKey();
    if (!key) return;
    const current = readJson(key, {});
    localStorage.setItem(key, JSON.stringify({ ...current, ...values }));
  }

  function readLocalState() {
    return readJson(getLocalKey(), {});
  }

  function hasMeaningfulState(state) {
    if (!state || typeof state !== "object") return false;
    return Object.values(state).some(day => {
      const turtle = day?.turtle && Object.keys(day.turtle).length > 0;
      const vs = day?.vs && Object.keys(day.vs).length > 0;
      return turtle || vs;
    });
  }

  async function getAuthenticatedUser() {
    const client = getClient();
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session?.user || null;
  }

  async function fetchRemote() {
    const client = getClient();
    if (!client || !activeUserId) return null;

    const { data, error } = await client
      .from(TABLE)
      .select("data, revision, updated_at")
      .eq("user_id", activeUserId)
      .eq("state_key", STATE_KEY)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async function applyRemote(row) {
    if (!row || !activeUserId) return;

    isApplyingRemote = true;
    try {
      remoteRevision = Number(row.revision) || 0;
      localStorage.setItem(getLocalKey(), JSON.stringify(row.data || {}));
      writeMeta({ revision: remoteRevision, syncedAt: row.updated_at || new Date().toISOString() });
      dirty = false;
      emitStatus("synced");

      if (localStorage.getItem("currentPage") === "calculator/turbo-vs.html" && typeof window.loadPage === "function") {
        await window.loadPage("calculator/turbo-vs.html");
      }
    } finally {
      isApplyingRemote = false;
    }
  }

  async function uploadNow() {
    if (isApplyingRemote || isUploading || !dirty || !activeUserId) return;

    const client = getClient();
    if (!client) return;

    isUploading = true;
    emitStatus("syncing");

    try {
      const state = readLocalState();
      const nextRevision = Math.max(remoteRevision + 1, 1);
      const { data, error } = await client
        .from(TABLE)
        .upsert({
          user_id: activeUserId,
          state_key: STATE_KEY,
          data: state,
          revision: nextRevision
        }, { onConflict: "user_id,state_key" })
        .select("revision, updated_at")
        .single();

      if (error) throw error;

      remoteRevision = Number(data?.revision) || nextRevision;
      dirty = false;
      writeMeta({ revision: remoteRevision, syncedAt: data?.updated_at || new Date().toISOString() });
      emitStatus("synced");
    } catch (error) {
      console.warn("Не удалось синхронизировать Турбо/VS", error);
      emitStatus("error", error?.message || "Ошибка синхронизации");
    } finally {
      isUploading = false;
    }
  }

  function scheduleUpload() {
    if (isApplyingRemote || !activeUserId) return;
    dirty = true;
    writeMeta({ changedAt: new Date().toISOString() });
    emitStatus("pending");
    window.clearTimeout(uploadTimer);
    uploadTimer = window.setTimeout(uploadNow, DEBOUNCE_MS);
  }

  async function pullRemote({ initial = false } = {}) {
    if (isPulling || isUploading || dirty || !activeUserId) return;

    isPulling = true;
    try {
      const remote = await fetchRemote();
      const local = readLocalState();
      const localHasData = hasMeaningfulState(local);

      if (!remote) {
        if (localHasData) {
          dirty = true;
          await uploadNow();
        } else {
          emitStatus("synced");
        }
        return;
      }

      const nextRemoteRevision = Number(remote.revision) || 0;
      remoteRevision = Math.max(remoteRevision, nextRemoteRevision);

      if (!localHasData || nextRemoteRevision > Number(readJson(getMetaKey(), {}).revision || 0)) {
        await applyRemote(remote);
      } else if (initial && localHasData && !Number(readJson(getMetaKey(), {}).revision || 0)) {
        dirty = true;
        await uploadNow();
      } else {
        emitStatus("synced");
      }
    } catch (error) {
      console.warn("Не удалось загрузить облачные данные Турбо/VS", error);
      emitStatus("error", error?.message || "Ошибка загрузки");
    } finally {
      isPulling = false;
    }
  }

  async function initializeForSession() {
    window.clearTimeout(uploadTimer);
    dirty = false;
    remoteRevision = 0;

    try {
      const user = await getAuthenticatedUser();
      activeUserId = user?.id || "";
      if (!activeUserId) {
        emitStatus("local");
        return;
      }

      await pullRemote({ initial: true });
    } catch (error) {
      console.warn("Не удалось запустить облачную синхронизацию", error);
      emitStatus("error", error?.message || "Ошибка запуска");
    }
  }

  function isTurboControl(target) {
    if (!(target instanceof Element)) return false;
    if (localStorage.getItem("currentPage") !== "calculator/turbo-vs.html") return false;
    return Boolean(target.closest("#turtleList, #vsList"));
  }

  document.addEventListener("input", event => {
    if (isTurboControl(event.target)) scheduleUpload();
  }, true);

  document.addEventListener("change", event => {
    if (isTurboControl(event.target)) scheduleUpload();
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pullRemote();
    else uploadNow();
  });

  window.addEventListener("online", () => {
    pullRemote();
    if (dirty) scheduleUpload();
  });

  window.addEventListener("harvesthub:profile-change", initializeForSession);

  if (getClient()) {
    getClient().auth.onAuthStateChange(() => {
      window.setTimeout(initializeForSession, 0);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeForSession, { once: true });
  } else {
    initializeForSession();
  }

  pullTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") pullRemote();
  }, PULL_INTERVAL_MS);

  window.harvestHubTurboVsCloudSync = {
    scheduleUpload,
    uploadNow,
    pullRemote,
    get isApplyingRemote() { return isApplyingRemote; }
  };
})();
