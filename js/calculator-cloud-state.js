(() => {
  const PAGES = new Set([
    "calculator/ipk.html",
    "calculator/turbo-vs.html",
    "calculator/season-resources.html",
    "calculator/troop-training.html"
  ]);
  const SAVE_DELAY = 700;

  let pageName = "";
  let profileId = "";
  let profileData = {};
  let saveTimer = null;
  let controller = null;
  let channel = null;
  let applying = false;
  let localWriteAt = 0;
  let lastSavedAt = "";

  function account() {
    return window.harvestHubAccount?.getProfile?.() || null;
  }

  function container() {
    return document.getElementById("page-content");
  }

  function fields() {
    const root = container();
    if (!root) return [];
    return Array.from(root.querySelectorAll("input, select, textarea")).filter(field => {
      const type = String(field.type || "").toLowerCase();
      return field.dataset.noPersist !== "true" && !["button", "submit", "reset", "hidden", "file"].includes(type);
    });
  }

  function key(field, index) {
    const row = field.closest?.(".season-building-row");
    if (row?.dataset?.buildingId) {
      if (field.classList.contains("season-building-enabled")) return `building:${row.dataset.buildingId}:enabled`;
      if (field.classList.contains("season-building-current")) return `building:${row.dataset.buildingId}:current`;
      if (field.classList.contains("season-building-target")) return `building:${row.dataset.buildingId}:target`;
    }
    if (field.id) return `id:${field.id}`;
    if (field.name) return `name:${field.name}`;
    return `field:${index}`;
  }

  function value(field) {
    const type = String(field.type || "").toLowerCase();
    return type === "checkbox" || type === "radio" ? Boolean(field.checked) : field.value;
  }

  function setValue(field, next) {
    const type = String(field.type || "").toLowerCase();
    if (type === "checkbox" || type === "radio") field.checked = Boolean(next);
    else field.value = String(next ?? "");
  }

  function resetFields() {
    fields().forEach(field => {
      const type = String(field.type || "").toLowerCase();
      if (type === "checkbox" || type === "radio") field.checked = field.defaultChecked;
      else if (field.tagName === "SELECT") field.selectedIndex = 0;
      else field.value = field.defaultValue || "";
    });
  }

  function serialize() {
    const result = {};
    fields().forEach((field, index) => { result[key(field, index)] = value(field); });
    return result;
  }

  function apply(savedFields) {
    applying = true;
    try {
      resetFields();
      if (savedFields && typeof savedFields === "object") {
        fields().forEach((field, index) => {
          const fieldKey = key(field, index);
          if (Object.prototype.hasOwnProperty.call(savedFields, fieldKey)) setValue(field, savedFields[fieldKey]);
        });
      }
      fields().forEach(field => field.dispatchEvent(new Event("input", { bubbles: true })));
    } finally {
      window.setTimeout(() => { applying = false; }, 0);
    }
  }

  function clearOldLocalState(currentPage) {
    const suffix = `:${currentPage}`;
    Object.keys(localStorage).forEach(storageKey => {
      if (storageKey.startsWith("harvesthub_page_form_state:") && storageKey.endsWith(suffix)) localStorage.removeItem(storageKey);
    });
  }

  async function fetchPrimaryProfile() {
    if (account()?.type !== "account" || !window.harvestHubSupabase) return null;
    const { data: sessionData, error: sessionError } = await window.harvestHubSupabase.auth.getSession();
    if (sessionError) throw sessionError;
    const user = sessionData.session?.user;
    if (!user) return null;

    const { data, error } = await window.harvestHubSupabase
      .from("game_profiles")
      .select("id,data,updated_at")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) return null;

    profileId = data.id;
    profileData = data.data && typeof data.data === "object" ? data.data : {};
    return data;
  }

  function savedPage(data = profileData) {
    return data?.calculators?.[pageName] || null;
  }

  async function saveNow() {
    if (!profileId || !pageName || pageName === "calculator/ipk.html") return;
    window.harvestHubSyncStatus?.markSaving?.();
    try {
      const { data: freshRow, error: readError } = await window.harvestHubSupabase
        .from("game_profiles").select("data").eq("id", profileId).maybeSingle();
      if (readError) throw readError;
      const fresh = freshRow?.data && typeof freshRow.data === "object" ? freshRow.data : {};
      const calculators = fresh.calculators && typeof fresh.calculators === "object" ? fresh.calculators : {};
      const savedAt = new Date().toISOString();
      const next = {
        ...fresh,
        calculators: {
          ...calculators,
          [pageName]: { fields: serialize(), savedAt }
        }
      };
      localWriteAt = Date.now();
      const { error } = await window.harvestHubSupabase.from("game_profiles").update({ data: next }).eq("id", profileId);
      if (error) throw error;
      profileData = next;
      lastSavedAt = savedAt;
      window.setTimeout(() => window.harvestHubSyncStatus?.markSynced?.(), 450);
    } catch (error) {
      console.warn("Не удалось сохранить калькулятор:", error);
      window.harvestHubSyncStatus?.markError?.();
    }
  }

  function scheduleSave(event) {
    if (!event.isTrusted || applying || pageName === "calculator/ipk.html" || !profileId) return;
    window.clearTimeout(saveTimer);
    window.harvestHubSyncStatus?.markSaving?.();
    saveTimer = window.setTimeout(saveNow, SAVE_DELAY);
  }

  async function subscribe() {
    if (!profileId || !window.harvestHubSupabase) return;
    if (channel) await window.harvestHubSupabase.removeChannel(channel);
    channel = window.harvestHubSupabase
      .channel(`primary-calculator-${profileId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "game_profiles",
        filter: `id=eq.${profileId}`
      }, payload => {
        const incoming = payload.new?.data && typeof payload.new.data === "object" ? payload.new.data : {};
        profileData = incoming;
        if (Date.now() - localWriteAt < 1800 || pageName === "calculator/ipk.html") return;
        const saved = incoming.calculators?.[pageName];
        const savedAt = saved?.savedAt || "";
        if (savedAt === lastSavedAt) return;
        apply(saved?.fields || null);
        lastSavedAt = savedAt;
        window.harvestHubSyncStatus?.markSynced?.();
      })
      .subscribe(status => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") window.harvestHubSyncStatus?.markError?.();
      });
  }

  async function resetPageData(targetPage) {
    if (!confirm("Сбросить все сохранённые данные этого калькулятора? Это действие нельзя отменить.")) return;
    window.clearTimeout(saveTimer);
    window.harvestHubSyncStatus?.markSaving?.();
    try {
      await fetchPrimaryProfile();
      const next = { ...profileData };
      if (targetPage === "calculator/ipk.html") delete next.ipk;
      else {
        const calculators = next.calculators && typeof next.calculators === "object" ? { ...next.calculators } : {};
        delete calculators[targetPage];
        next.calculators = calculators;
      }
      localWriteAt = Date.now();
      const { error } = await window.harvestHubSupabase.from("game_profiles").update({ data: next }).eq("id", profileId);
      if (error) throw error;
      profileData = next;
      lastSavedAt = "";
      if (targetPage !== "calculator/ipk.html") apply(null);
      window.harvestHubSyncStatus?.markSynced?.();
    } catch (error) {
      console.warn("Не удалось сбросить данные:", error);
      window.harvestHubSyncStatus?.markError?.();
      alert(error.message || "Не удалось сбросить сохранённые данные.");
    }
  }

  function addResetButton(targetPage) {
    const root = container();
    if (!root || root.querySelector("[data-calculator-reset]")) return;
    const section = document.createElement("div");
    section.className = "calculator-reset-section";
    section.innerHTML = `<button type="button" class="calculator-reset-button" data-calculator-reset>Сбросить сохранённые данные</button><p>Будут удалены сохранённые данные этой страницы.</p>`;
    root.appendChild(section);
    section.querySelector("button").addEventListener("click", () => resetPageData(targetPage));
  }

  async function init(targetPage) {
    if (!PAGES.has(targetPage)) return;
    pageName = targetPage;
    window.clearTimeout(saveTimer);
    controller?.abort();
    controller = new AbortController();
    clearOldLocalState(targetPage);
    addResetButton(targetPage);

    try {
      const row = await fetchPrimaryProfile();
      if (!row) return;
      if (targetPage !== "calculator/ipk.html") {
        const saved = savedPage();
        apply(saved?.fields || null);
        lastSavedAt = saved?.savedAt || "";
        const root = container();
        root?.addEventListener("input", scheduleSave, { capture: true, signal: controller.signal });
        root?.addEventListener("change", scheduleSave, { capture: true, signal: controller.signal });
      }
      await subscribe();
      window.harvestHubSyncStatus?.markSynced?.();
    } catch (error) {
      console.warn("Не удалось загрузить синхронизацию:", error);
      window.harvestHubSyncStatus?.markError?.();
    }
  }

  const originalLoadPage = window.loadPage;
  if (typeof originalLoadPage === "function") {
    window.loadPage = async function(targetPage) {
      const result = await originalLoadPage(targetPage);
      await init(targetPage);
      return result;
    };
  }

  window.harvestHubCalculatorCloud = { init, resetPageData };
})();