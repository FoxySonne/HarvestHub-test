(() => {
  const TABLE = "user_app_state";
  const STATE_KEY = "calculator_forms";
  const PAGE_STATE_PREFIX = "harvesthub_page_form_state:";
  const META_PREFIX = "harvesthub_cloud_meta:calculator_forms:";
  const DEBOUNCE_MS = 1500;
  const PULL_INTERVAL_MS = 60000;
  const CALCULATOR_PAGES = new Set([
    "calculator/ipk.html",
    "calculator/season-resources.html",
    "calculator/troop-training.html"
  ]);

  let activeUserId = "";
  let activeProfileId = "";
  let remoteRevision = 0;
  let dirty = false;
  let isApplyingRemote = false;
  let isUploading = false;
  let isPulling = false;
  let uploadTimer = null;

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

  function getMetaKey() {
    return activeUserId ? `${META_PREFIX}${activeUserId}` : "";
  }

  function readMeta() {
    return readJson(getMetaKey(), {});
  }

  function writeMeta(values) {
    const key = getMetaKey();
    if (!key) return;
    localStorage.setItem(key, JSON.stringify({ ...readMeta(), ...values }));
  }

  function getProfileScope() {
    return activeProfileId ? `profile:${activeProfileId}` : "";
  }

  function getPageStorageKey(pageName) {
    const scope = getProfileScope();
    return scope ? `${PAGE_STATE_PREFIX}${scope}:${pageName}` : "";
  }

  function collectLocalState() {
    const pages = {};

    CALCULATOR_PAGES.forEach(pageName => {
      const key = getPageStorageKey(pageName);
      if (!key) return;
      const raw = localStorage.getItem(key);
      if (raw == null) return;
      pages[pageName] = readJson(key, {});
    });

    return { schemaVersion: 1, pages };
  }

  function hasMeaningfulState(state) {
    return Boolean(state?.pages && Object.keys(state.pages).length > 0);
  }

  function applyLocalState(state) {
    const pages = state?.pages || {};

    Object.entries(pages).forEach(([pageName, pageState]) => {
      if (!CALCULATOR_PAGES.has(pageName)) return;
      const key = getPageStorageKey(pageName);
      if (key) localStorage.setItem(key, JSON.stringify(pageState || {}));
    });
  }

  async function getSessionContext() {
    const client = getClient();
    if (!client) return null;

    const { data, error } = await client.auth.getSession();
    if (error) throw error;

    const user = data.session?.user || null;
    const profile = typeof window.getActiveProfile === "function" ? window.getActiveProfile() : null;

    return {
      userId: user?.id || "",
      profileId: profile?.id || ""
    };
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

  async function uploadNow() {
    if (isApplyingRemote || isUploading || !dirty || !activeUserId || !activeProfileId) return;

    const client = getClient();
    if (!client) return;

    isUploading = true;
    emitStatus("syncing");

    try {
      const nextRevision = Math.max(remoteRevision + 1, 1);
      const { data, error } = await client
        .from(TABLE)
        .upsert({
          user_id: activeUserId,
          state_key: STATE_KEY,
          data: collectLocalState(),
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
      console.error("Calculator forms cloud sync upload failed:", error);
      emitStatus("error", error?.message || "Ошибка синхронизации");
    } finally {
      isUploading = false;
    }
  }

  function scheduleUpload() {
    if (isApplyingRemote || !activeUserId || !activeProfileId) return;

    dirty = true;
    writeMeta({ changedAt: new Date().toISOString() });
    emitStatus("pending");
    window.clearTimeout(uploadTimer);
    uploadTimer = window.setTimeout(uploadNow, DEBOUNCE_MS);
  }

  async function applyRemote(row) {
    if (!row || !activeProfileId) return;

    isApplyingRemote = true;
    try {
      applyLocalState(row.data || {});
      remoteRevision = Number(row.revision) || 0;
      dirty = false;
      writeMeta({ revision: remoteRevision, syncedAt: row.updated_at || new Date().toISOString() });
      emitStatus("synced");

      const currentPage = localStorage.getItem("currentPage") || "";
      if (CALCULATOR_PAGES.has(currentPage) && typeof window.loadPage === "function") {
        await window.loadPage(currentPage);
      }
    } finally {
      isApplyingRemote = false;
    }
  }

  async function pullRemote({ initial = false } = {}) {
    if (isPulling || isUploading || dirty || !activeUserId || !activeProfileId) return;

    isPulling = true;
    try {
      const remote = await fetchRemote();
      const local = collectLocalState();
      const localHasData = hasMeaningfulState(local);
      const metaRevision = Number(readMeta().revision) || 0;

      if (!remote) {
        dirty = true;
        await uploadNow();
        return;
      }

      const nextRevision = Number(remote.revision) || 0;
      remoteRevision = Math.max(remoteRevision, nextRevision);

      if (!localHasData || nextRevision > metaRevision) {
        await applyRemote(remote);
      } else if (initial && localHasData && metaRevision === 0) {
        dirty = true;
        await uploadNow();
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
    dirty = false;
    remoteRevision = 0;

    try {
      const context = await getSessionContext();
      activeUserId = context?.userId || "";
      activeProfileId = context?.profileId || "";

      if (!activeUserId || !activeProfileId) {
        emitStatus("local");
        return;
      }

      await pullRemote({ initial: true });
    } catch (error) {
      console.error("Calculator forms cloud sync initialization failed:", error);
      emitStatus("error", error?.message || "Ошибка запуска");
    }
  }

  function isCalculatorField(target) {
    if (!(target instanceof Element)) return false;
    const currentPage = localStorage.getItem("currentPage") || "";
    if (!CALCULATOR_PAGES.has(currentPage)) return false;
    return Boolean(target.closest("#page-content"));
  }

  function handleFieldChange(event) {
    if (!isCalculatorField(event.target)) return;
    window.setTimeout(scheduleUpload, 50);
  }

  document.addEventListener("input", handleFieldChange, true);
  document.addEventListener("change", handleFieldChange, true);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pullRemote();
    else uploadNow();
  });

  window.addEventListener("online", () => {
    pullRemote();
    if (dirty) scheduleUpload();
  });

  window.addEventListener("harvesthub:profile-change", initializeForSession);
  window.addEventListener("harvesthub:advanced-mode-change", () => {
    window.setTimeout(scheduleUpload, 100);
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
    get isApplyingRemote() { return isApplyingRemote; }
  };
})();