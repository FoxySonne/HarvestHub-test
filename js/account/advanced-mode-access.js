(() => {
  const baseGetAdvancedMode = window.getAdvancedMode;
  const baseSetAdvancedMode = window.setAdvancedMode;
  const baseApplyAdvancedMode = window.applyAdvancedModeSetting;

  let status = {
    loaded: false,
    hasAccess: false,
    isAdmin: false
  };
  let refreshPromise = null;

  function getClient() {
    return window.harvestHubSupabase || null;
  }

  function getActiveAccount() {
    const profile = window.harvestHubAccount?.getProfile?.();
    return profile?.type === "account" ? profile : null;
  }

  function hasDraftAccess() {
    const account = getActiveAccount();
    return Boolean(account && window.harvestHubAdvancedAccessDraft?.getGrant?.(account));
  }

  function hasEffectiveAccess() {
    return status.hasAccess || hasDraftAccess();
  }

  function getPublicStatus() {
    return {
      ...status,
      hasAccess: hasEffectiveAccess(),
      serverHasAccess: status.hasAccess,
      draftHasAccess: hasDraftAccess()
    };
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
    return forceDocumentState(status.loaded && hasEffectiveAccess() && getPreference());
  }

  function getAdvancedMode() {
    return status.loaded && hasEffectiveAccess() && getPreference();
  }

  function setAdvancedModePreference(enabled) {
    if (typeof baseSetAdvancedMode === "function") baseSetAdvancedMode(Boolean(enabled));
    const applied = applyAuthorizedMode();

    if (Boolean(enabled) !== applied) {
      window.dispatchEvent(new CustomEvent("harvesthub:advanced-mode-change", {
        detail: {
          enabled: applied,
          preference: Boolean(enabled),
          accessGranted: hasEffectiveAccess()
        }
      }));
    }

    return applied;
  }

  function emitAccessChange(enabled = applyAuthorizedMode()) {
    window.dispatchEvent(new CustomEvent("harvesthub:advanced-mode-access-change", {
      detail: { ...getPublicStatus(), enabled }
    }));
  }

  function updateStatus(nextStatus) {
    const previousEffectiveAccess = hasEffectiveAccess();
    status = {
      loaded: true,
      hasAccess: Boolean(nextStatus?.has_access ?? nextStatus?.hasAccess),
      isAdmin: Boolean(nextStatus?.is_admin ?? nextStatus?.isAdmin)
    };

    const enabled = applyAuthorizedMode();
    emitAccessChange(enabled);

    if (previousEffectiveAccess && !hasEffectiveAccess()) {
      window.dispatchEvent(new CustomEvent("harvesthub:advanced-mode-change", {
        detail: {
          enabled: false,
          preference: getPreference(),
          accessGranted: false
        }
      }));
    }

    return getPublicStatus();
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
    getStatus: getPublicStatus,
    get ready() {
      return refreshPromise || Promise.resolve(getPublicStatus());
    }
  };

  if (getClient()) {
    getClient().auth.onAuthStateChange(() => {
      window.setTimeout(() => refresh().catch(() => {}), 0);
    });
  }

  window.addEventListener("harvesthub:profile-change", () => {
    refresh().catch(() => {});
  });

  window.addEventListener("harvesthub:advanced-access-draft-change", () => {
    emitAccessChange();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh().catch(() => {});
  });

  window.setInterval(() => {
    if (document.visibilityState === "visible") refresh().catch(() => {});
  }, 60000);

  refresh().catch(() => updateStatus(null));
})();
