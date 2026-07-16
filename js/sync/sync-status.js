(() => {
  const scopeStates = new Map();
  const COLORS = {
    pending: "#d7a93b",
    syncing: "#78d65b",
    synced: "#78d65b",
    error: "#ff7676",
    offline: "#ff7676",
    reauth: "#d7a93b",
    local: ""
  };

  let currentStatus = "local";
  let currentDetail = "";
  let animationTimer = null;
  let animationFrame = 0;

  function getProfile() {
    return window.harvestHubAccount?.getProfile?.()
      || (typeof window.getActiveProfile === "function" ? window.getActiveProfile() : null);
  }

  function getPriorityStatus() {
    const values = Array.from(scopeStates.values());
    if (values.some(item => item.status === "error")) return values.find(item => item.status === "error");
    if (values.some(item => item.status === "syncing")) return { status: "syncing", detail: "" };
    if (values.some(item => item.status === "pending")) return { status: "pending", detail: "" };
    if (values.some(item => item.status === "offline")) return { status: "offline", detail: "" };
    if (values.some(item => item.status === "synced")) return { status: "synced", detail: "" };
    return { status: "local", detail: "" };
  }

  function getText(status, detail = "") {
    switch (status) {
      case "pending": return "Ожидает синхронизации";
      case "syncing": return `Данные синхронизируются${".".repeat((animationFrame % 3) + 1)}`;
      case "synced": return "Данные синхронизованы";
      case "error": return detail ? `Ошибка синхронизации: ${detail}` : "Ошибка синхронизации";
      case "offline": return "Нет сети — изменения сохранены на устройстве";
      case "reauth": return "Сессия истекла — войдите снова";
      default: return "";
    }
  }

  function getIcon(status) {
    switch (status) {
      case "pending":
      case "syncing":
        return `<svg class="sync-status-icon sync-status-icon--${status}" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7"></circle></svg>`;
      case "synced":
        return `<svg class="sync-status-icon sync-status-icon--synced" viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 10.5 8 15l8.5-10"></path></svg>`;
      case "error":
        return `<svg class="sync-status-icon sync-status-icon--error" viewBox="0 0 20 20" aria-hidden="true"><line x1="4" y1="4" x2="16" y2="16"></line><line x1="16" y1="4" x2="4" y2="16"></line></svg>`;
      case "offline":
        return `<svg class="sync-status-icon sync-status-icon--offline" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"></circle><path class="sync-alert-mark" d="M10 5.5v5.5"></path><line class="sync-alert-mark" x1="10" y1="14.3" x2="10" y2="14.4"></line></svg>`;
      case "reauth":
        return `<svg class="sync-status-icon sync-status-icon--reauth" viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="9" width="11" height="8" rx="2"></rect><path class="sync-lock-shackle" d="M7 9V6.8a3.2 3.2 0 0 1 5.9-1.7"></path></svg>`;
      default:
        return "";
    }
  }

  function updateElements() {
    const profile = getProfile();
    const elements = document.querySelectorAll(".desktop-profile-status, .profile-sync-status");

    elements.forEach(element => {
      if (!profile) {
        element.textContent = "";
        element.dataset.syncStatus = "local";
        element.style.color = "";
        return;
      }

      if (profile.type === "quick") {
        element.textContent = "Быстрый профиль — данные только на этом устройстве";
        element.dataset.syncStatus = "local";
        element.style.color = "";
        return;
      }

      const statusChanged = element.dataset.renderedSyncStatus !== currentStatus;
      if (statusChanged) {
        element.innerHTML = `${getIcon(currentStatus)}<span class="sync-status-text"></span>`;
        element.dataset.renderedSyncStatus = currentStatus;
      }

      const textElement = element.querySelector(".sync-status-text");
      if (textElement) textElement.textContent = getText(currentStatus, currentDetail);

      element.dataset.syncStatus = currentStatus;
      element.style.color = COLORS[currentStatus] || "";
      element.title = currentStatus === "error" && currentDetail ? currentDetail : "";
      element.setAttribute("aria-live", "polite");
    });
  }

  function manageAnimation() {
    if (currentStatus === "syncing") {
      if (animationTimer) return;
      animationTimer = window.setInterval(() => {
        animationFrame += 1;
        updateElements();
      }, 450);
      return;
    }

    if (animationTimer) {
      window.clearInterval(animationTimer);
      animationTimer = null;
      animationFrame = 0;
    }
  }

  function render() {
    const next = getPriorityStatus();
    currentStatus = next.status;
    currentDetail = next.detail || "";
    manageAnimation();
    updateElements();
  }

  async function verifySession() {
    const profile = getProfile();
    if (!profile || profile.type !== "account") {
      render();
      return;
    }

    const client = window.harvestHubSupabase;
    if (!client) {
      currentStatus = "error";
      currentDetail = "Supabase недоступен";
      manageAnimation();
      updateElements();
      return;
    }

    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (!data.session?.user) {
        currentStatus = "reauth";
        currentDetail = "";
        manageAnimation();
        updateElements();
        return;
      }
      if (scopeStates.size === 0) scopeStates.set("session", { status: "synced", detail: "" });
      render();
    } catch (error) {
      currentStatus = "error";
      currentDetail = error?.message || "Не удалось проверить сессию";
      manageAnimation();
      updateElements();
    }
  }

  window.addEventListener("harvesthub:cloud-sync-status", event => {
    const scope = event.detail?.scope || "general";
    const status = event.detail?.status || "local";
    const detail = event.detail?.detail || "";
    scopeStates.set(scope, { status, detail });
    render();
  });

  window.addEventListener("harvesthub:profile-change", () => {
    scopeStates.clear();
    window.setTimeout(verifySession, 0);
    window.setTimeout(updateElements, 100);
    window.setTimeout(updateElements, 500);
  });

  window.addEventListener("online", () => {
    scopeStates.delete("network");
    verifySession();
  });

  window.addEventListener("offline", () => {
    scopeStates.set("network", { status: "offline", detail: "" });
    render();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") verifySession();
  });

  window.harvestHubSyncStatus = {
    refresh: verifySession,
    markSynced() {
      if (scopeStates.size === 0) scopeStates.set("manual", { status: "synced", detail: "" });
      render();
    },
    getState() {
      return {
        status: currentStatus,
        detail: currentDetail,
        scopes: Object.fromEntries(scopeStates)
      };
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", verifySession, { once: true });
  } else {
    verifySession();
  }
})();
