(() => {
  const CALCULATOR_PAGES = new Set([
    "calculator/ipk.html",
    "calculator/turbo-vs.html",
    "calculator/season-resources.html",
    "calculator/troop-training.html"
  ]);
  const VERIFY_DELAY = 1300;
  const VERIFY_RETRIES = 3;
  const LOCAL_EVENT_IGNORE_MS = 2200;

  let state = "synced";
  let activeProfileId = "";
  let lastKnownUpdatedAt = "";
  let localEditAt = 0;
  let verifyTimer = null;
  let realtimeChannel = null;
  let applyingRemoteUpdate = false;

  function currentPage() {
    return localStorage.getItem("currentPage") || "";
  }

  function isCalculatorPage() {
    return CALCULATOR_PAGES.has(currentPage());
  }

  function statusMarkup() {
    return `<span class="sync-state-icon" aria-hidden="true"><span></span><span></span></span><span class="sync-state-text"></span>`;
  }

  function ensureStatusElements() {
    document.querySelectorAll(".profile-sync-status").forEach(element => {
      if (!element.classList.contains("sync-state")) {
        element.classList.add("sync-state");
        element.innerHTML = statusMarkup();
      }
    });

    const page = currentPage();
    const container = document.getElementById("page-content");
    if (container && CALCULATOR_PAGES.has(page) && !container.querySelector("[data-calculator-sync-status]")) {
      const element = document.createElement("p");
      element.className = "sync-state calculator-sync-state";
      element.dataset.calculatorSyncStatus = "";
      element.innerHTML = statusMarkup();
      container.prepend(element);
    }

    render();
  }

  function render() {
    const labels = {
      synced: "Данные синхронизированы",
      syncing: "Данные синхронизируются",
      error: "Ошибка синхронизации"
    };
    document.querySelectorAll(".sync-state").forEach(element => {
      element.dataset.syncState = state;
      const text = element.querySelector(".sync-state-text");
      if (text) text.textContent = labels[state];
      element.setAttribute("aria-label", labels[state]);
    });
  }

  function setState(nextState) {
    state = nextState;
    ensureStatusElements();
  }

  async function getActiveProfileRow() {
    if (!window.harvestHubSupabase) return null;
    const profile = window.harvestHubAccount?.getProfile?.();
    if (profile?.type !== "account") return null;

    const { data: sessionData, error: sessionError } = await window.harvestHubSupabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (sessionError || !user) return null;

    const { data, error } = await window.harvestHubSupabase
      .from("game_profiles")
      .select("id,updated_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async function verifySaved(retry = 0) {
    try {
      const row = await getActiveProfileRow();
      if (!row?.id) return;
      activeProfileId = row.id;
      if (row.updated_at && row.updated_at !== lastKnownUpdatedAt) {
        lastKnownUpdatedAt = row.updated_at;
        setState("synced");
        return;
      }
      if (retry < VERIFY_RETRIES) {
        verifyTimer = window.setTimeout(() => verifySaved(retry + 1), 800);
      } else {
        setState("error");
      }
    } catch (error) {
      console.warn("Не удалось проверить синхронизацию:", error);
      setState("error");
    }
  }

  function markLocalEdit() {
    if (!isCalculatorPage() || applyingRemoteUpdate) return;
    const profile = window.harvestHubAccount?.getProfile?.();
    if (profile?.type !== "account") return;
    localEditAt = Date.now();
    setState("syncing");
    window.clearTimeout(verifyTimer);
    verifyTimer = window.setTimeout(() => verifySaved(0), VERIFY_DELAY);
  }

  async function subscribeRealtime() {
    if (!window.harvestHubSupabase) return;
    try {
      const row = await getActiveProfileRow();
      if (!row?.id) return;
      activeProfileId = row.id;
      lastKnownUpdatedAt = row.updated_at || "";
      setState("synced");

      if (realtimeChannel) {
        await window.harvestHubSupabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }

      realtimeChannel = window.harvestHubSupabase
        .channel(`game-profile-sync-${activeProfileId}`)
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "game_profiles",
          filter: `id=eq.${activeProfileId}`
        }, async payload => {
          const updatedAt = payload.new?.updated_at || "";
          if (updatedAt) lastKnownUpdatedAt = updatedAt;

          if (Date.now() - localEditAt < LOCAL_EVENT_IGNORE_MS) {
            setState("synced");
            return;
          }

          const page = currentPage();
          if (!CALCULATOR_PAGES.has(page)) {
            setState("synced");
            return;
          }

          applyingRemoteUpdate = true;
          setState("syncing");
          try {
            await window.loadPage?.(page);
            setState("synced");
          } catch (error) {
            console.warn("Не удалось применить изменения с другого устройства:", error);
            setState("error");
          } finally {
            window.setTimeout(() => { applyingRemoteUpdate = false; }, 200);
          }
        })
        .subscribe(status => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setState("error");
        });
    } catch (error) {
      console.warn("Не удалось подключить Realtime:", error);
      setState("error");
    }
  }

  document.addEventListener("input", event => {
    if (event.target.closest("#page-content")) markLocalEdit();
  }, true);
  document.addEventListener("change", event => {
    if (event.target.closest("#page-content")) markLocalEdit();
  }, true);

  window.addEventListener("harvesthub:profile-change", () => {
    window.clearTimeout(verifyTimer);
    window.setTimeout(subscribeRealtime, 100);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) subscribeRealtime();
  });

  const observer = new MutationObserver(ensureStatusElements);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.harvestHubSyncStatus = {
    setState,
    markSaving: () => setState("syncing"),
    markSynced: () => setState("synced"),
    markError: () => setState("error"),
    reconnect: subscribeRealtime
  };

  ensureStatusElements();
  window.setTimeout(subscribeRealtime, 300);
})();