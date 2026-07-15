(() => {
  const CALCULATOR_PAGES = new Set([
    "calculator/ipk.html",
    "calculator/turbo-vs.html",
    "calculator/season-resources.html",
    "calculator/troop-training.html"
  ]);
  const CLOUD_SAVE_DELAY = 650;
  const MIN_SYNC_VISIBLE_MS = 450;
  const REMOTE_DEBOUNCE_MS = 250;

  let currentPageName = "";
  let activeProfileId = "";
  let activeProfileData = {};
  let currentUserId = "";
  let saveTimer = null;
  let remoteTimer = null;
  let realtimeChannel = null;
  let controller = null;
  let applyingCloudState = false;
  let localWriteUntil = 0;
  let lastAppliedSavedAt = "";
  let lastActiveProfileId = "";
  let pageReloadInProgress = false;

  function getAccountProfile() {
    return window.harvestHubAccount?.getProfile?.() || null;
  }

  function isFullAccount() {
    return getAccountProfile()?.type === "account";
  }

  function getContainer() {
    return document.getElementById("page-content");
  }

  function getPersistableFields(container = getContainer()) {
    if (!container) return [];
    return Array.from(container.querySelectorAll("input, select, textarea")).filter(field => {
      const type = String(field.type || "").toLowerCase();
      if (field.dataset.noPersist === "true") return false;
      return !["button", "submit", "reset", "hidden", "file"].includes(type);
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

  function getFieldValue(field) {
    const type = String(field.type || "").toLowerCase();
    if (type === "checkbox" || type === "radio") return Boolean(field.checked);
    return field.value;
  }

  function setFieldValue(field, value) {
    const type = String(field.type || "").toLowerCase();
    if (type === "checkbox" || type === "radio") field.checked = Boolean(value);
    else field.value = String(value ?? "");
  }

  function resetFieldsToDefaults(container = getContainer()) {
    applyingCloudState = true;
    try {
      getPersistableFields(container).forEach(field => {
        const type = String(field.type || "").toLowerCase();
        if (type === "checkbox" || type === "radio") field.checked = field.defaultChecked;
        else if (field.tagName === "SELECT") {
          const defaultOption = Array.from(field.options).find(option => option.defaultSelected);
          field.value = defaultOption ? defaultOption.value : (field.options[0]?.value ?? "");
        } else field.value = field.defaultValue ?? "";
      });
      getPersistableFields(container).forEach(field => {
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      });
    } finally {
      applyingCloudState = false;
    }
  }

  function serializeFields(container = getContainer()) {
    const state = {};
    getPersistableFields(container).forEach((field, index) => {
      state[getFieldKey(field, index)] = getFieldValue(field);
    });
    return state;
  }

  function applyFields(state, container = getContainer()) {
    applyingCloudState = true;
    try {
      resetFieldsToDefaults(container);
      if (state && typeof state === "object") {
        getPersistableFields(container).forEach((field, index) => {
          const key = getFieldKey(field, index);
          if (Object.prototype.hasOwnProperty.call(state, key)) setFieldValue(field, state[key]);
        });
      }
      getPersistableFields(container).forEach(field => {
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      });
    } finally {
      applyingCloudState = false;
    }
  }

  async function getSessionUser() {
    if (!window.harvestHubSupabase) return null;
    const { data, error } = await window.harvestHubSupabase.auth.getSession();
    if (error) throw error;
    return data.session?.user || null;
  }

  async function fetchActiveProfile() {
    const user = await getSessionUser();
    if (!user || !isFullAccount()) return null;
    currentUserId = user.id;

    const { data, error } = await window.harvestHubSupabase
      .from("game_profiles")
      .select("id,data,is_active,updated_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    if (!data?.id) return null;

    activeProfileId = data.id;
    activeProfileData = data.data && typeof data.data === "object" ? data.data : {};
    return data;
  }

  function getSavedPageState(pageName = currentPageName, data = activeProfileData) {
    return data?.calculators?.[pageName] || null;
  }

  async function saveCurrentPageNow() {
    if (!activeProfileId || !currentPageName || currentPageName === "calculator/ipk.html") return;
    const container = getContainer();
    if (!container) return;

    const startedAt = Date.now();
    window.harvestHubSyncStatus?.markSaving?.();

    try {
      const { data: freshRow, error: freshError } = await window.harvestHubSupabase
        .from("game_profiles")
        .select("data")
        .eq("id", activeProfileId)
        .maybeSingle();
      if (freshError) throw freshError;

      const freshData = freshRow?.data && typeof freshRow.data === "object" ? freshRow.data : {};
      const calculators = freshData.calculators && typeof freshData.calculators === "object" ? freshData.calculators : {};
      const savedAt = new Date().toISOString();
      const nextData = {
        ...freshData,
        calculators: {
          ...calculators,
          [currentPageName]: {
            fields: serializeFields(container),
            savedAt
          }
        }
      };

      localWriteUntil = Date.now() + 1800;
      const { error } = await window.harvestHubSupabase
        .from("game_profiles")
        .update({ data: nextData })
        .eq("id", activeProfileId);
      if (error) throw error;

      activeProfileData = nextData;
      lastAppliedSavedAt = savedAt;

      const wait = Math.max(0, MIN_SYNC_VISIBLE_MS - (Date.now() - startedAt));
      window.setTimeout(() => window.harvestHubSyncStatus?.markSynced?.(), wait);
    } catch (error) {
      console.warn("Не удалось сохранить данные калькулятора:", error);
      window.harvestHubSyncStatus?.markError?.();
    }
  }

  function scheduleSave(event) {
    if (!event?.isTrusted || applyingCloudState || !activeProfileId || currentPageName === "calculator/ipk.html") return;
    window.clearTimeout(saveTimer);
    window.harvestHubSyncStatus?.markSaving?.();
    saveTimer = window.setTimeout(saveCurrentPageNow, CLOUD_SAVE_DELAY);
  }

  async function applyCurrentProfileData({ forceReload = false } = {}) {
    const page = localStorage.getItem("currentPage") || currentPageName;
    if (!CALCULATOR_PAGES.has(page)) return;

    const previousId = activeProfileId;
    const row = await fetchActiveProfile();
    if (!row?.id) return;

    const profileChanged = previousId && previousId !== row.id;
    if ((profileChanged || forceReload) && !pageReloadInProgress) {
      pageReloadInProgress = true;
      try {
        await originalLoadPage(page);
        await init(page);
      } finally {
        pageReloadInProgress = false;
      }
      return;
    }

    if (page === "calculator/ipk.html") return;

    const saved = getSavedPageState(page, activeProfileData);
    const savedAt = saved?.savedAt || "";
    if (savedAt && savedAt === lastAppliedSavedAt) return;

    applyFields(saved?.fields || null);
    lastAppliedSavedAt = savedAt;
    window.harvestHubSyncStatus?.markSynced?.();
  }

  function scheduleRemoteRefresh() {
    window.clearTimeout(remoteTimer);
    remoteTimer = window.setTimeout(async () => {
      if (Date.now() < localWriteUntil || applyingCloudState || pageReloadInProgress) return;
      try {
        await applyCurrentProfileData();
      } catch (error) {
        console.warn("Не удалось применить изменения с другого устройства:", error);
        window.harvestHubSyncStatus?.markError?.();
      }
    }, REMOTE_DEBOUNCE_MS);
  }

  async function ensureRealtimeSubscription() {
    if (!window.harvestHubSupabase || !currentUserId) return;
    if (realtimeChannel) await window.harvestHubSupabase.removeChannel(realtimeChannel);

    realtimeChannel = window.harvestHubSupabase
      .channel(`calculator-sync-${currentUserId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "game_profiles",
        filter: `user_id=eq.${currentUserId}`
      }, scheduleRemoteRefresh)
      .on("postgres_changes", {
        event: "DELETE",
        schema: "public",
        table: "game_profiles",
        filter: `user_id=eq.${currentUserId}`
      }, scheduleRemoteRefresh)
      .subscribe(status => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") window.harvestHubSyncStatus?.markError?.();
      });
  }

  async function resetPageData(pageName) {
    const label = pageName === "calculator/ipk.html" ? "ИПК" : "этого калькулятора";
    if (!confirm(`Сбросить все сохранённые данные ${label}? Это действие нельзя отменить.`)) return;

    window.clearTimeout(saveTimer);
    window.harvestHubSyncStatus?.markSaving?.();

    try {
      const row = await fetchActiveProfile();
      if (!row?.id) throw new Error("Активный игровой профиль не найден.");

      const nextData = { ...activeProfileData };
      if (pageName === "calculator/ipk.html") {
        delete nextData.ipk;
      } else {
        const calculators = nextData.calculators && typeof nextData.calculators === "object" ? { ...nextData.calculators } : {};
        delete calculators[pageName];
        nextData.calculators = calculators;
      }

      localWriteUntil = Date.now() + 1800;
      const { error } = await window.harvestHubSupabase
        .from("game_profiles")
        .update({ data: nextData })
        .eq("id", row.id);
      if (error) throw error;

      activeProfileData = nextData;
      lastAppliedSavedAt = "";
      window.harvestHubSyncStatus?.markSynced?.();

      pageReloadInProgress = true;
      try {
        await originalLoadPage(pageName);
        await init(pageName);
      } finally {
        pageReloadInProgress = false;
      }
    } catch (error) {
      console.warn("Не удалось сбросить данные калькулятора:", error);
      window.harvestHubSyncStatus?.markError?.();
      alert(error.message || "Не удалось сбросить сохранённые данные.");
    }
  }

  function injectResetButton(pageName) {
    const container = getContainer();
    if (!container || container.querySelector("[data-calculator-reset]")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "calculator-reset-section";
    wrapper.innerHTML = `
      <button type="button" class="calculator-reset-button" data-calculator-reset>Сбросить сохранённые данные</button>
      <p>Будут удалены данные только активного игрового профиля для этой страницы.</p>`;
    container.appendChild(wrapper);
    wrapper.querySelector("[data-calculator-reset]")?.addEventListener("click", () => resetPageData(pageName));
  }

  async function init(pageName) {
    if (!CALCULATOR_PAGES.has(pageName)) return;
    currentPageName = pageName;
    window.clearTimeout(saveTimer);
    controller?.abort();
    controller = new AbortController();

    try {
      const previousId = activeProfileId;
      const row = await fetchActiveProfile();
      if (!row?.id) return;

      await ensureRealtimeSubscription();
      injectResetButton(pageName);

      if (pageName !== "calculator/ipk.html") {
        const saved = getSavedPageState(pageName, activeProfileData);
        applyFields(saved?.fields || null);
        lastAppliedSavedAt = saved?.savedAt || "";

        const container = getContainer();
        container?.addEventListener("input", scheduleSave, { signal: controller.signal, capture: true });
        container?.addEventListener("change", scheduleSave, { signal: controller.signal, capture: true });
      }

      if (previousId && previousId !== row.id) lastAppliedSavedAt = getSavedPageState(pageName, activeProfileData)?.savedAt || "";
      lastActiveProfileId = row.id;
      window.harvestHubSyncStatus?.markSynced?.();
    } catch (error) {
      console.warn("Не удалось загрузить данные калькулятора:", error);
      injectResetButton(pageName);
      window.harvestHubSyncStatus?.markError?.();
    }
  }

  const originalLoadPage = window.loadPage;
  if (typeof originalLoadPage === "function") {
    window.loadPage = async function(pageName) {
      const result = await originalLoadPage(pageName);
      await init(pageName);
      return result;
    };
  }

  window.addEventListener("harvesthub:profile-change", () => {
    const page = localStorage.getItem("currentPage") || "";
    if (!CALCULATOR_PAGES.has(page)) return;
    window.setTimeout(() => applyCurrentProfileData({ forceReload: true }), 200);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && CALCULATOR_PAGES.has(localStorage.getItem("currentPage") || "")) scheduleRemoteRefresh();
  });

  window.harvestHubCalculatorCloud = {
    init,
    resetPageData,
    refresh: scheduleRemoteRefresh,
    noteLocalWrite() {
      localWriteUntil = Date.now() + 1800;
      window.harvestHubSyncStatus?.markSaving?.();
    }
  };
})();