(() => {
  const TABLE = "user_app_state";
  const STATE_KEY = "calculator_forms";
  const LOCAL_PREFIX = "harvesthub_page_form_state:";
  const META_PREFIX = "harvesthub_cloud_meta:calculator_forms:";
  const DEBOUNCE_MS = 1500;
  const PULL_INTERVAL_MS = 60000;
  const CALCULATOR_PAGES = new Set([
    "calculator/ipk.html",
    "calculator/season-resources.html",
    "calculator/troop-training.html"
  ]);

  let uploadTimer = null;
  let activeUserId = "";
  let activeProfileId = "";
  let remoteRevision = 0;
  let isApplyingRemote = false;
  let isUploading = false;
  let isPulling = false;
  let dirty = false;

  function getClient() {
    return window.harvestHubSupabase || null;
  }

  function emitStatus(status, detail = "") {
    window.dispatchEvent(new CustomEvent("harvesthub:cloud-sync-status", {
      detail: { scope: STATE_KEY, status, detail }
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

  function resolveProfileId(userId = activeUserId) {
    const storedId = localStorage.getItem("harvesthub_active_profile") || "";
    if (storedId) return storedId;

    const profile = typeof window.getActiveProfile === "function"
      ? window.getActiveProfile()
      : null;

    if (profile?.id) return profile.id;
    return userId ? `account:${userId}` : "";
  }

  function getPageStorageKey(pageName) {
    if (!activeProfileId) return "";
    return `${LOCAL_PREFIX}profile:${activeProfileId}:${pageName}`;
  }

  function getMetaKey(userId = activeUserId) {
    return userId ? `${META_PREFIX}${userId}` : "";
  }

  function writeMeta(values) {
    const key = getMetaKey();
    if (!key) return;
    localStorage.setItem(key, JSON.stringify({ ...readJson(key, {}), ...values }));
  }

  function collectLocalState() {
    const pages = {};

    CALCULATOR_PAGES.forEach(pageName => {
      const key = getPageStorageKey(pageName);
      if (!key) return;
      const raw = localStorage.getItem(key);
      if (raw != null) pages[pageName] = readJson(key, {});
    });

    return {
      schemaVersion: 1,
      profileId: activeProfileId,
      pages
    };
  }

  function applyLocalState(state) {
    const pages = state?.pages || {};

    CALCULATOR_PAGES.forEach(pageName => {
      if (!Object.prototype.hasOwnProperty.call(pages, pageName)) return;
      const key = getPageStorageKey(pageName);
      if (key) localStorage.setItem(key, JSON.stringify(pages[pageName] || {}));
    });
  }

  async function getAuthenticatedUser() {
    const client = getClient();
    if (!client) return null;

    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session?.user || null;
  }

  async function ensureSession() {
    if (activeUserId && activeProfileId) return true;

    const user = await getAuthenticatedUser();
    activeUserId = user?.id || "";
    activeProfileId = resolveProfileId(activeUserId);

    return Boolean(activeUserId && activeProfileId);
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

  async function upsertState(state, revision) {
    const client = getClient();
    if (!client) throw new Error("Supabase недоступен");

    const { data, error } = await client
      .from(TABLE)
      .upsert({
        user_id: activeUserId,
        state_key: STATE_KEY,
        data: state || {},
        revision
      }, { onConflict: "user_id,state_key" })
      .select("revision, updated_at")
      .single();

    if (error) throw error;
    return data;
  }

  async function applyRemote(row) {
    if (!row || !activeUserId || !activeProfileId) return;

    isApplyingRemote = true;
    try {
      remoteRevision = Number(row.revision) || 0;
      applyLocalState(row.data || {});
      writeMeta({ revision: remoteRevision, syncedAt: row.updated_at || new Date().toISOString() });
      dirty = false;
      emitStatus("synced");

      const currentPage = localStorage.getItem("currentPage") || "";
      if (CALCULATOR_PAGES.has(currentPage) && typeof window.loadPage === "function") {
        const container = document.getElementById("page-content");
        if (container) container.innerHTML = "";
        await window.loadPage(currentPage);
      }
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

      const state = collectLocalState();
      const nextRevision = Math.max(remoteRevision + 1, 1);
      const data = await upsertState(state, nextRevision);

      remoteRevision = Number(data?.revision) || nextRevision;
      dirty = false;
      writeMeta({ revision: remoteRevision, syncedAt: data?.updated_at || new Date().toISOString() });
      emitStatus("synced");
    } catch (error) {
      console.error("Calculator forms cloud sync upload failed:", error);
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
      console.error("Calculator forms cloud sync session failed:", error);
    }

    if (!activeUserId || !activeProfileId) return;

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

      if (nextRemoteRevision > metaRevision) {
        await applyRemote(remote);
      } else if (initial && metaRevision === 0) {
        dirty = true;
        await uploadNow({ force: true });
      } else {
        emitStatus("synced");
      }
    } catch (error) {
      console.error("Calculator forms cloud sync pull failed:", error);
      emitStatus("error", error?.message || "Ошибка загрузки");
    } finally {
      isPulling = false;
    }
  }

  async function initializeForSession() {
    window.clearTimeout(uploadTimer);
    activeUserId = "";
    activeProfileId = "";
    remoteRevision = 0;
    dirty = false;

    try {
      if (!await ensureSession()) {
        emitStatus("local");
        return;
      }
      await pullRemote({ initial: true });
    } catch (error) {
      console.error("Calculator forms cloud sync initialization failed:", error);
      emitStatus("error", error?.message || "Ошибка запуска");
    }
  }

  function isCalculatorControl(target) {
    if (!(target instanceof Element)) return false;
    const currentPage = localStorage.getItem("currentPage") || "";
    if (!CALCULATOR_PAGES.has(currentPage)) return false;
    return Boolean(target.closest("#page-content"));
  }

  document.addEventListener("input", event => {
    if (isCalculatorControl(event.target)) scheduleUpload();
  }, true);

  document.addEventListener("change", event => {
    if (isCalculatorControl(event.target)) scheduleUpload();
  }, true);

  window.addEventListener("harvesthub:profile-change", initializeForSession);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pullRemote();
    else uploadNow();
  });

  window.addEventListener("online", () => {
    pullRemote();
    if (dirty) scheduleUpload();
  });

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

  window.setInterval(() => {
    if (document.visibilityState === "visible") pullRemote();
  }, PULL_INTERVAL_MS);

  window.harvestHubCalculatorFormsCloudSync = {
    scheduleUpload,
    uploadNow,
    pullRemote,
    forceUpload: () => {
      dirty = true;
      return uploadNow({ force: true });
    },
    getState: () => ({
      activeUserId,
      activeProfileId,
      remoteRevision,
      dirty,
      isApplyingRemote,
      isUploading,
      isPulling,
      currentPage: localStorage.getItem("currentPage") || "",
      localState: collectLocalState()
    })
  };
})();