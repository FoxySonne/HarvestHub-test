(() => {
  const CALCULATOR_PAGES = new Set([
    "calculator/ipk.html",
    "calculator/turbo-vs.html",
    "calculator/season-resources.html",
    "calculator/troop-training.html"
  ]);
  const CLOUD_SAVE_DELAY = 500;
  let activeController = null;
  let saveTimer = null;
  let currentPageName = "";
  let activeCloudProfileId = "";
  let activeCloudProfileData = {};

  function getAccountProfile() {
    return window.harvestHubAccount?.getProfile?.() || window.getActiveProfile?.() || null;
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

  async function loadActiveCloudProfile() {
    activeCloudProfileId = "";
    activeCloudProfileData = {};
    const profile = getAccountProfile();
    if (profile?.type !== "account" || !window.harvestHubSupabase) return false;

    const { data: sessionData, error: sessionError } = await window.harvestHubSupabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (sessionError || !user) return false;

    const { data, error } = await window.harvestHubSupabase
      .from("game_profiles")
      .select("id,data")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !data?.id) {
      if (error) console.warn("Не удалось загрузить данные калькулятора:", error);
      return false;
    }

    activeCloudProfileId = data.id;
    activeCloudProfileData = data.data && typeof data.data === "object" ? data.data : {};
    return true;
  }

  async function saveCurrentPageNow() {
    if (!activeCloudProfileId || !currentPageName || currentPageName === "calculator/ipk.html") return;
    const container = document.getElementById("page-content");
    if (!container) return;

    const calculators = activeCloudProfileData.calculators && typeof activeCloudProfileData.calculators === "object"
      ? activeCloudProfileData.calculators
      : {};
    const nextData = {
      ...activeCloudProfileData,
      calculators: {
        ...calculators,
        [currentPageName]: {
          fields: serializeFields(container),
          savedAt: new Date().toISOString()
        }
      }
    };

    const { error } = await window.harvestHubSupabase
      .from("game_profiles")
      .update({ data: nextData })
      .eq("id", activeCloudProfileId);

    if (error) {
      console.warn("Не удалось сохранить данные калькулятора:", error);
      return;
    }
    activeCloudProfileData = nextData;
  }

  function scheduleSave() {
    if (!activeCloudProfileId || currentPageName === "calculator/ipk.html") return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveCurrentPageNow, CLOUD_SAVE_DELAY);
  }

  function clearLocalPageState(pageName) {
    const profile = getAccountProfile();
    const scope = profile?.id ? `profile:${profile.id}` : "local";
    localStorage.removeItem(`harvesthub_page_form_state:${scope}:${pageName}`);
  }

  async function resetPageData(pageName) {
    const label = pageName === "calculator/ipk.html" ? "ИПК" : "этого калькулятора";
    if (!confirm(`Сбросить все сохранённые данные ${label}? Это действие нельзя отменить.`)) return;

    clearLocalPageState(pageName);

    if (activeCloudProfileId && window.harvestHubSupabase) {
      const nextData = { ...activeCloudProfileData };
      if (pageName === "calculator/ipk.html") {
        delete nextData.ipk;
      } else {
        const calculators = nextData.calculators && typeof nextData.calculators === "object"
          ? { ...nextData.calculators }
          : {};
        delete calculators[pageName];
        nextData.calculators = calculators;
      }

      const { error } = await window.harvestHubSupabase
        .from("game_profiles")
        .update({ data: nextData })
        .eq("id", activeCloudProfileId);
      if (error) {
        alert(error.message || "Не удалось сбросить сохранённые данные.");
        return;
      }
      activeCloudProfileData = nextData;
    }

    await window.loadPage?.(pageName);
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

    await loadActiveCloudProfile();

    if (pageName !== "calculator/ipk.html" && activeCloudProfileId) {
      const savedState = activeCloudProfileData.calculators?.[pageName]?.fields;
      if (savedState) restoreFields(container, savedState);
    }

    injectResetButton(pageName);

    if (pageName !== "calculator/ipk.html") {
      container.addEventListener("input", scheduleSave, { signal: activeController.signal });
      container.addEventListener("change", scheduleSave, { signal: activeController.signal });
      if (activeCloudProfileId && !activeCloudProfileData.calculators?.[pageName]) scheduleSave();
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

  window.harvestHubCalculatorCloud = { init, resetPageData };
})();