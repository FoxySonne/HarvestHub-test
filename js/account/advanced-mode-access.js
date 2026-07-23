(() => {
  const baseGetAdvancedMode = window.getAdvancedMode;
  const baseSetAdvancedMode = window.setAdvancedMode;
  const baseApplyAdvancedMode = window.applyAdvancedModeSetting;

  let status = {
    loaded: false,
    hasAccess: false,
    isAdmin: false,
    requestStatus: null,
    requestedAt: null,
    grantedAt: null,
    expiresOn: null,
    isExpired: false
  };
  let refreshPromise = null;

  function getClient() {
    return window.harvestHubSupabase || null;
  }

  function getPreference() {
    return typeof baseGetAdvancedMode === "function" && baseGetAdvancedMode() === true;
  }

  function forceDocumentState(enabled) {
    document.documentElement.classList.toggle("advanced-mode", enabled);
    document.documentElement.dataset.advancedMode = enabled ? "on" : "off";
    if (document.body) {
      document.body.classList.toggle("advanced-mode", enabled);
      document.body.dataset.advancedMode = enabled ? "on" : "off";
    }
    return enabled;
  }

  function applyAuthorizedMode() {
    if (typeof baseApplyAdvancedMode === "function") baseApplyAdvancedMode();
    return forceDocumentState(status.loaded && status.hasAccess && getPreference());
  }

  function getAdvancedMode() {
    return status.loaded && status.hasAccess && getPreference();
  }

  function setAdvancedModePreference(enabled) {
    if (typeof baseSetAdvancedMode === "function") baseSetAdvancedMode(Boolean(enabled));
    const applied = applyAuthorizedMode();
    if (Boolean(enabled) !== applied) {
      window.dispatchEvent(new CustomEvent("harvesthub:advanced-mode-change", {
        detail: { enabled: applied, preference: Boolean(enabled), accessGranted: status.hasAccess }
      }));
    }
    return applied;
  }

  function statusesDiffer(previous, next) {
    return previous.loaded !== next.loaded
      || previous.hasAccess !== next.hasAccess
      || previous.isAdmin !== next.isAdmin
      || previous.requestStatus !== next.requestStatus
      || previous.requestedAt !== next.requestedAt
      || previous.grantedAt !== next.grantedAt
      || previous.expiresOn !== next.expiresOn
      || previous.isExpired !== next.isExpired;
  }

  function refreshOpenProfile(previous, next) {
    if (!previous.loaded || !statusesDiffer(previous, next)) return;
    if (window.harvestHubNavigation?.getCurrentPage?.() !== "profile.html") return;

    window.setTimeout(() => {
      if (window.harvestHubNavigation?.getCurrentPage?.() !== "profile.html") return;
      window.loadPage?.("profile.html", {
        skipCurrentSave: true,
        skipProfileRefresh: true,
        skipVisit: true
      });
    }, 0);
  }

  function updateStatus(nextStatus) {
    const previousStatus = status;
    const next = {
      loaded: true,
      hasAccess: Boolean(nextStatus?.has_access ?? nextStatus?.hasAccess),
      isAdmin: Boolean(nextStatus?.is_admin ?? nextStatus?.isAdmin),
      requestStatus: nextStatus?.request_status ?? nextStatus?.requestStatus ?? null,
      requestedAt: nextStatus?.requested_at ?? nextStatus?.requestedAt ?? null,
      grantedAt: nextStatus?.granted_at ?? nextStatus?.grantedAt ?? null,
      expiresOn: nextStatus?.expires_on ?? nextStatus?.expiresOn ?? null,
      isExpired: Boolean(nextStatus?.is_expired ?? nextStatus?.isExpired)
    };
    status = next;

    const enabled = applyAuthorizedMode();
    window.dispatchEvent(new CustomEvent("harvesthub:advanced-mode-access-change", {
      detail: { ...status, enabled }
    }));

    if (previousStatus.hasAccess && !status.hasAccess) {
      window.dispatchEvent(new CustomEvent("harvesthub:advanced-mode-change", {
        detail: { enabled: false, preference: getPreference(), accessGranted: false }
      }));
    }

    refreshOpenProfile(previousStatus, status);
    return { ...status };
  }

  async function refresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const client = getClient();
      if (!client) return updateStatus(null);
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError || !sessionData.session?.user) return updateStatus(null);
      const { data, error } = await client.rpc("get_my_advanced_mode_status");
      if (error) {
        console.warn("Не удалось проверить доступ к продвинутому режиму:", error);
        return updateStatus(null);
      }
      return updateStatus(data || null);
    })().finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  async function listAccounts() {
    const client = getClient();
    if (!client) throw new Error("Supabase пока недоступен.");
    const { data, error } = await client.rpc("list_advanced_mode_accounts");
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function setAccess(userId, enabled) {
    const client = getClient();
    if (!client) throw new Error("Supabase пока недоступен.");
    const { data, error } = await client.rpc("set_advanced_mode_access", {
      target_user_id: userId,
      enabled: Boolean(enabled)
    });
    if (error) throw error;
    return data;
  }

  window.getAdvancedModePreference = getPreference;
  window.setAdvancedModePreference = setAdvancedModePreference;
  window.getAdvancedMode = getAdvancedMode;
  window.setAdvancedMode = setAdvancedModePreference;
  window.applyAdvancedModeSetting = applyAuthorizedMode;

  window.harvestHubAdvancedModeAccess = {
    refresh,
    listAccounts,
    setAccess,
    getStatus: () => ({ ...status }),
    get ready() {
      return refreshPromise || Promise.resolve({ ...status });
    }
  };

  if (getClient()) {
    getClient().auth.onAuthStateChange(() => {
      window.setTimeout(() => refresh().catch(() => {}), 0);
    });
  }
  window.addEventListener("harvesthub:profile-change", () => refresh().catch(() => {}));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh().catch(() => {});
  });
  window.setInterval(() => {
    if (document.visibilityState === "visible") refresh().catch(() => {});
  }, 60000);
  refresh().catch(() => updateStatus(null));
})();