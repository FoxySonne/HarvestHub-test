(() => {
  const CALCULATOR_PAGES = new Set([
    "calculator/ipk.html",
    "calculator/turbo-vs.html",
    "calculator/season-resources.html",
    "calculator/troop-training.html"
  ]);
  const CLOUD_SAVE_DELAY = 500;
  const REMOTE_REFRESH_DELAY = 180;

  let activeController = null;
  let saveTimer = null;
  let profileRefreshTimer = null;
  let currentPageName = "";
  let activeCloudProfileId = "";
  let activeCloudProfileData = {};
  let currentUserId = "";
  let realtimeChannel = null;
  let pageLoadInProgress = false;
  let remoteReloadInProgress = false;
  let localWriteUntil = 0;

  function getAccountProfile() {
    return window.harvestHubAccount?.getProfile?.() || window.getActiveProfile?.() || null;
  }

  function isFullAccount() {
    return getAccountProfile()?.type === "account";
  }

  function getPersistableFields(container) {
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

  function serializeFields(container) {
    const state = {};
    getPersistableFields(container).forEach((field, index) => {
      state[getFieldKey(field, index)] = getFieldValue(field);
    });
    return state;
  }

  function restoreFields(container, state) {
    if (!state || typeof state !== "object") return;
    getPersistableFields(container).forEach((field, index) => {
      const key = getFieldKey(field, index);
      if (!Object.prototype.hasOwnProperty.call(state, key)) return;
      setFieldValue(field, state[key]);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function clearLegacyAccountLocalState(pageName) {
    const profile = getAccountProfile();
    if (profile?.type !== "account" || !profile.id || !pageName) return;
    localStorage.removeItem(`harvesthub_page_form_state:profile:${profile.id}:${pageName}`);
  }

  function clearCurrentGameProfileLocalState(pageName) {
    if (!pageName) return;
    const profile = getAccountProfile();
    const possibleScopes = new Set([
      profile?.id ? `profile:${profile.id}` : "",
      profile?.gameProfileId ? `profile:${profile.gameProfileId}` : "",
      activeCloudProfileId ? `profile:${activeCloudProfileId}` : "",
      "local"
    ]);
    possibleScopes.forEach(scope => {
      if (scope) localStorage.removeItem(`harvesthub_page_form_state:${scope}:${pageName}`);
    });
  }

  async function getSessionUser() {
    if (!window.harvestHubSupabase) return null;
    const { data, error } = await window.harvestHubSupabase.auth.getSession();
    if (error) throw error;
    return data.session?.user || null;
  }

  async function fetchActiveCloudProfile() {
    activeCloudProfileId = "";
    activeCloudProfileData = {};
    const profile = getAccountProfile();
    if (profile?.type !== "account" || !window.harvestHubSupabase) return null;

    const user = await getSessionUser();
    if (!user) return null;
    currentUserId = user.id;

    const { data, error } = await window.harvestHubSupabase
      .from("game_profiles")
      .select("id,data,updated_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    if (!data?.id) return null;

    activeCloudProfileId = data.id;
    activeCloudProfileData = data.data && typeof data.data === "object" ? data.data : {};
    return data;
  }

  async function ensureRealtimeSubscription() {
    if (!window.harvestHubSupabase || !currentUserId) return;
    if (realtimeChannel) await window.harvestHubSupabase.removeChannel(realtimeChannel);

    realtimeChannel = window.harvestHubSupabase
      .channel(`calculator-profiles-${currentUserId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "game_profiles",
        filter: `user_id=eq.${currentUserId}`
      }, payload => {
        if (Date.now() < localWriteUntil) return;
        const changed = payload.new || {};
        if (changed.is_active === true || changed.id === activeCloudProfileId) scheduleRemoteRefresh();
      })
      .on("postgres_changes", {
        event: "DELETE",
        schema: "public",
        table: "game_profiles",
        filter: `user_id=eq.${currentUserId}`
      }, () => scheduleRemoteRefresh())
      .subscribe();
  }

  async function readFreshProfileData(profileId) {
    const { data, error } = await window.harvestHubSupabase
      .from("game_profiles")
      .select("data")
      .eq("id", profileId)
      .maybeSingle();
    if (error) throw error;
    return data?.data && typeof data.data === "object" ? data.data : {};
  }

  async function saveCurrentPageNow() {
    if (!activeCloudProfileId || !currentPageName || currentPageName === "calculator/ipk.html") return;
    const container = document.getElementById("page-content");
    if (!container) return;

    window.harvestHubSyncStatus?.markSaving?.();
    try {
      const freshData = await readFreshProfileData(activeCloudProfileId);
      const calculators = freshData.calculators && typeof freshData.calculators === "object"
        ? freshData.calculators
        : {};
      const nextData = {
        ...freshData,
        calculators: {
          ...calculators,
          [currentPageName]: {
            fields: serializeFields(container),
            savedAt: new Date().toISOString()
          }
        }
      };

      localWriteUntil = Date.now() + 2500;
      const { error } = await window.harvestHubSupabase
        .from("game_profiles")
        .update({ data: nextData })
        .eq("id", activeCloudProfileId);
      if (error) throw error;

      activeCloudProfileData = nextData;
      window.harvestHubSyncStatus?.markSynced?.();
    } catch (error) {
      console.warn("Не удалось сохранить данные калькулятора:", error);
      window.harvestHubSyncStatus?.markError?.();
    }
  }

  function scheduleSave() {
    if (!activeCloudProfileId || currentPageName === "calculator/ipk.html" || remoteReloadInProgress) return;
    window.clearTimeout(saveTimer);
    window.harvestHubSyncStatus?.markSaving?.();
    saveTimer = window.setTimeout(saveCurrentPageNow, CLOUD_SAVE_DELAY);
  }

  async function resetPageData(pageName) {
    const label = pageName === "calculator/ipk.html" ? "ИПК" : "этого калькулятора";
    if (!confirm(`Сбросить все сохранённые данные ${label}? Это действие нельзя отменить.`)) return;

    window.clearTimeout(saveTimer);
    clearCurrentGameProfileLocalState(pageName);
    window.harvestHubSyncStatus?.markSaving?.();

    try {
      const row = await fetchActiveCloudProfile();
      if (row?.id && window.harvestHubSupabase) {
        const freshData = await readFreshProfileData(row.id);
        const nextData = { ...freshData };
        if (pageName === "calculator/ipk.html") {
          delete nextData.ipk;
        } else {
          const calculators = nextData.calculators && typeof nextData.calculators === "object"
            ? { ...nextData.calculators }
            : {};
          delete calculators[pageName];
          nextData.calculators = calculators;
        }

        localWriteUntil = Date.now() + 2500;
        const { error } = await window.harvestHubSupabase
          .from("game_profiles")
          .update({ data: nextData })
          .eq("id", row.id);
        if (error) throw error;
        activeCloudProfileData = nextData;
      }

      window.harvestHubSyncStatus?.markSynced?.();
      await reloadCalculatorPage(pageName);
    } catch (error) {
      console.warn("Не удалось сбросить сохранённые данные:", error);
      window.harvestHubSyncStatus?.markError?.();
      alert(error.message || "Не удалось сбросить сохранённые данные.");
    }
  }

  function injectResetButton(pageName) {
    const container = document.getElementById("page-content");
    if (!container || container.querySelector("[data-calculator-reset]")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "calculator-reset-section";
    wrapper.innerHTML = `
      <button type="button" class="calculator-reset-button" data-calculator-reset>
        Сбросить сохранённые данные
      </button>
      <p>Будут удалены данные только активного игрового профиля для этой страницы.</p>`;
    container.appendChild(wrapper);
    wrapper.querySelector("[data-calculator-reset]")?.addEventListener("click", () => resetPageData(pageName));
  }

  async function init(pageName) {
    if (!CALCULATOR_PAGES.has(pageName)) return;
    currentPageName = pageName;
    window.clearTimeout(saveTimer);
    activeController?.abort();
    activeController = new AbortController();

    const container = document.getElementById("page-content");
    if (!container) return;

    try {
      const row = await fetchActiveCloudProfile();
      await ensureRealtimeSubscription();

      if (pageName !== "calculator/ipk.html" && row?.id) {
        const savedState = activeCloudProfileData.calculators?.[pageName]?.fields;
        if (savedState && typeof savedState === "object") restoreFields(container, savedState);
      }

      injectResetButton(pageName);

      if (pageName !== "calculator/ipk.html") {
        container.addEventListener("input", scheduleSave, { signal: activeController.signal });
        container.addEventListener("change", scheduleSave, { signal: activeController.signal });
      }

      window.harvestHubSyncStatus?.markSynced?.();
    } catch (error) {
      console.warn("Не удалось загрузить данные калькулятора:", error);
      injectResetButton(pageName);
      window.harvestHubSyncStatus?.markError?.();
    }
  }

  async function reloadCalculatorPage(pageName = currentPageName) {
    if (!CALCULATOR_PAGES.has(pageName) || pageLoadInProgress || remoteReloadInProgress) return;
    remoteReloadInProgress = true;
    try {
      await window.loadPage?.(pageName);
    } finally {
      window.setTimeout(() => { remoteReloadInProgress = false; }, 250);
    }
  }

  function scheduleRemoteRefresh() {
    if (!CALCULATOR_PAGES.has(localStorage.getItem("currentPage") || "")) return;
    window.clearTimeout(profileRefreshTimer);
    profileRefreshTimer = window.setTimeout(async () => {
      if (pageLoadInProgress || remoteReloadInProgress) return;
      try {
        const previousId = activeCloudProfileId;
        const row = await fetchActiveCloudProfile();
        if (!row?.id) return;
        const activeChanged = previousId !== row.id;
        const page = localStorage.getItem("currentPage") || currentPageName;
        if (activeChanged || Date.now() >= localWriteUntil) await reloadCalculatorPage(page);
      } catch (error) {
        console.warn("Не удалось применить изменения с другого устройства:", error);
        window.harvestHubSyncStatus?.markError?.();
      }
    }, REMOTE_REFRESH_DELAY);
  }

  const originalLoadPage = window.loadPage;
  if (typeof originalLoadPage === "function") {
    window.loadPage = async function(pageName) {
      if (CALCULATOR_PAGES.has(pageName) && isFullAccount()) clearLegacyAccountLocalState(pageName);
      pageLoadInProgress = true;
      try {
        const result = await originalLoadPage(pageName);
        await init(pageName);
        return result;
      } finally {
        pageLoadInProgress = false;
      }
    };
  }

  window.addEventListener("harvesthub:profile-change", () => {
    if (!CALCULATOR_PAGES.has(localStorage.getItem("currentPage") || "")) return;
    window.clearTimeout(profileRefreshTimer);
    profileRefreshTimer = window.setTimeout(scheduleRemoteRefresh, 250);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleRemoteRefresh();
  });

  window.harvestHubCalculatorCloud = { init, resetPageData, refresh: scheduleRemoteRefresh };
})();