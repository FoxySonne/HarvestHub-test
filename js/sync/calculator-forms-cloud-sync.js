(() => {
  const TABLE = "user_app_state";
  const STATE_KEY = "calculator_forms";
  const PAGE_STATE_PREFIX = "harvesthub_page_form_state:";
  const DEBOUNCE_MS = 1500;
  const LOCAL_CHECK_MS = 1000;
  const PULL_INTERVAL_MS = 10000;
  const CALCULATOR_PAGES = new Set([
    "calculator/ipk.html",
    "calculator/season-resources.html",
    "calculator/troop-training.html"
  ]);

  let activeUserId = "";
  let activeProfileId = "";
  let remoteRevision = 0;
  let initialized = false;
  let dirty = false;
  let isApplyingRemote = false;
  let isUploading = false;
  let isPulling = false;
  let uploadTimer = null;
  let lastLocalDigest = "";
  let lastRemoteDigest = "";

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

  function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function digest(value) {
    return stableJson(value || {});
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

    return { schemaVersion: 2, profileId: activeProfileId, pages };
  }

  function saveOpenPageToLocalStorage() {
    const currentPage = localStorage.getItem("currentPage") || "";
    if (!CALCULATOR_PAGES.has(currentPage)) return;
    if (typeof window.savePageFormState === "function") {
      window.savePageFormState(currentPage);
    }
  }

  function applyLocalState(state) {
    const pages = state?.pages || {};

    CALCULATOR_PAGES.forEach(pageName => {
      const key = getPageStorageKey(pageName);
      if (!key) return;

      if (Object.prototype.hasOwnProperty.call(pages, pageName)) {
        localStorage.setItem(key, JSON.stringify(pages[pageName] || {}));
      } else {
        localStorage.removeItem(key);
      }
    });
  }

  function getFieldKey(field, index) {
    const buildingRow = field.closest?.(".season-building-row");

    if (buildingRow?.dataset?.buildingId) {
      if (field.classList.contains("season-building-enabled")) return `building:${buildingRow.dataset.buildingId}:enabled`;
      if (field.classList.contains("season-building-current")) return `building:${buildingRow.dataset.buildingId}:current`;
      if (field.classList.contains("season-building-target")) return `building:${buildingRow.dataset.buildingId}:target`;
    }

    if (field.id) return `id:${field.id}`;
    if (field.name) return `name:${field.name}`;
    return `field:${field.tagName.toLowerCase()}:${field.type || "value"}:${index}`;
  }

  function getPersistableFields(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll("input, select, textarea")).filter(field => {
      const type = (field.type || "").toLowerCase();
      if (field.dataset.noPersist === "true") return false;
      return !["button", "submit", "reset", "hidden", "file"].includes(type);
    });
  }

  function setFieldValue(field, value) {
    const type = (field.type || "").toLowerCase();
    if (type === "checkbox" || type === "radio") field.checked = Boolean(value);
    else field.value = String(value ?? "");
  }

  function applyCurrentPageFields(state) {
    const currentPage = localStorage.getItem("currentPage") || "";
    if (!CALCULATOR_PAGES.has(currentPage)) return false;

    const pageState = state?.pages?.[currentPage];
    if (!pageState || typeof pageState !== "object") return false;

    const fields = getPersistableFields(document.getElementById("page-content"));
    if (!fields.length) return false;

    fields.forEach((field, index) => {
      const key = getFieldKey(field, index);
      if (Object.prototype.hasOwnProperty.call(pageState, key)) {
        setFieldValue(field, pageState[key]);
      }
    });

    fields.forEach(field => {
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });

    return true;
  }

  function applyCurrentPageRepeatedly(state) {
    applyCurrentPageFields(state);
    window.setTimeout(() => applyCurrentPageFields(state), 250);
    window.setTimeout(() => applyCurrentPageFields(state), 1000);
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
      profileId: profile?.id || (user?.id ? `account:${user.id}` : "")
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
    window.clearTimeout(uploadTimer);
    if (isApplyingRemote || isUploading || !dirty || !activeUserId || !activeProfileId) return;

    const client = getClient();
    if (!client) return;

    isUploading = true;
    emitStatus("syncing");

    try {
      saveOpenPageToLocalStorage();
      const payload = collectLocalState();
      const payloadDigest = digest(payload);
      const nextRevision = Math.max(remoteRevision + 1, 1);

      const { data, error } = await client
        .from(TABLE)
        .upsert({
          user_id: activeUserId,
          state_key: STATE_KEY,
          data: payload,
          revision: nextRevision
        }, { onConflict: "user_id,state_key" })
        .select("revision, updated_at")
        .single();

      if (error) throw error;

      remoteRevision = Number(data?.revision) || nextRevision;
      lastLocalDigest = payloadDigest;
      lastRemoteDigest = payloadDigest;
      dirty = false;
      emitStatus("synced");
    } catch (error) {
      console.error("Calculator forms cloud sync upload failed:", error);
      emitStatus("error", error?.message || "Ошибка синхронизации");
    } finally {
      isUploading = false;
    }
  }

  function scheduleUpload() {
    if (!initialized || isApplyingRemote || !activeUserId || !activeProfileId) return;
    dirty = true;
    emitStatus("pending");
    window.clearTimeout(uploadTimer);
    uploadTimer = window.setTimeout(uploadNow, DEBOUNCE_MS);
  }

  async function applyRemote(row) {
    if (!row || !activeProfileId) return;

    isApplyingRemote = true;
    try {
      const remoteState = row.data || {};
      applyLocalState(remoteState);
      remoteRevision = Number(row.revision) || 0;
      lastRemoteDigest = digest(remoteState);
      lastLocalDigest = digest(collectLocalState());
      dirty = false;
      applyCurrentPageRepeatedly(remoteState);
      emitStatus("synced");
    } finally {
      window.setTimeout(() => {
        lastLocalDigest = digest(collectLocalState());
        isApplyingRemote = false;
      }, 1200);
    }
  }

  async function pullRemote({ initial = false } = {}) {
    if (isPulling || isUploading || dirty || !activeUserId || !activeProfileId) return;

    isPulling = true;
    try {
      const remote = await fetchRemote();

      if (!remote) {
        if (initial) {
          lastLocalDigest = digest(collectLocalState());
          dirty = true;
          await uploadNow();
        }
        return;
      }

      const remoteState = remote.data || {};
      const remoteDigest = digest(remoteState);
      const nextRevision = Number(remote.revision) || 0;

      if (initial || nextRevision > remoteRevision || remoteDigest !== lastRemoteDigest) {
        await applyRemote(remote);
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
    initialized = false;
    dirty = false;
    remoteRevision = 0;
    lastLocalDigest = "";
    lastRemoteDigest = "";

    try {
      const context = await getSessionContext();
      activeUserId = context?.userId || "";
      activeProfileId = context?.profileId || "";

      if (!activeUserId || !activeProfileId) {
        emitStatus("local");
        return;
      }

      await pullRemote({ initial: true });
      lastLocalDigest = digest(collectLocalState());
      initialized = true;
    } catch (error) {
      console.error("Calculator forms cloud sync initialization failed:", error);
      emitStatus("error", error?.message || "Ошибка запуска");
    }
  }

  function checkLocalChanges() {
    if (!initialized || isApplyingRemote || isUploading || !activeProfileId) return;
    saveOpenPageToLocalStorage();
    const currentDigest = digest(collectLocalState());

    if (currentDigest !== lastLocalDigest) {
      lastLocalDigest = currentDigest;
      scheduleUpload();
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pullRemote();
    else uploadNow();
  });

  window.addEventListener("online", () => {
    pullRemote();
    if (dirty) scheduleUpload();
  });

  window.addEventListener("harvesthub:profile-change", () => {
    window.setTimeout(initializeForSession, 0);
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

  window.setInterval(checkLocalChanges, LOCAL_CHECK_MS);
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
