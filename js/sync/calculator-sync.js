(() => {
  const TURBO_LOCAL_PREFIX = "harvesthub_turbo_vs_week_state:";
  const FORM_LOCAL_PREFIX = "harvesthub_page_form_state:";
  const PROFILE_BLOCK_LOCAL_PREFIX = "harvesthub_profile_block_state:";
  const TRANSFER_LOCAL_KEY = "harvesthub_troop_training_transfer";
  const ADVANCED_MODE_LOCAL_KEY = "harvesthub_advanced_mode";
  const CALCULATOR_PAGES = new Set([
    "calculator/ipk.html",
    "calculator/season-resources.html",
    "calculator/troop-training.html"
  ]);

  function readJson(key, fallback = {}) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  }

  function getProfile() {
    return window.harvestHubAccount?.getProfile?.()
      || (typeof window.getActiveProfile === "function" ? window.getActiveProfile() : null);
  }

  function resolveGameProfileContext(user) {
    const profile = getProfile();
    if (profile?.type !== "account" || profile.supabaseUserId !== user.id || !profile.gameProfileId) return null;
    return {
      profileId: profile.gameProfileId,
      isPrimary: Boolean(profile.isPrimaryGameProfile)
    };
  }

  function resolveAccountContext(user) {
    const profile = getProfile();
    if (profile?.type !== "account" || profile.supabaseUserId !== user.id) return null;
    return { accountId: profile.id };
  }

  function getScopedTransferKey(profileId) {
    return `${TRANSFER_LOCAL_KEY}:profile:${profileId}`;
  }

  const turboEngine = window.harvestHubCreateSyncEngine({
    label: "Turbo/VS",
    stateKey: "turbo_vs_week",
    metaPrefix: "harvesthub_cloud_meta:turbo_vs:",

    resolveContext(user) {
      const context = resolveGameProfileContext(user);
      return context ? {
        ...context,
        localKey: `${TURBO_LOCAL_PREFIX}profile:${context.profileId}`
      } : null;
    },

    getStateKey: context => context ? `game_profile:${context.profileId}:turbo_vs_week` : "turbo_vs_week",
    getLegacyStateKey: context => context?.isPrimary ? "turbo_vs_week" : "",

    readLocalState(context) {
      return readJson(context.localKey, {});
    },

    applyRemoteState(data, context) {
      localStorage.setItem(context.localKey, JSON.stringify(data || {}));
      localStorage.removeItem(getFormStorageKey(context.profileId, "calculator/turbo-vs.html"));
    },

    async afterRemoteApplied() {
      if (localStorage.getItem("currentPage") === "calculator/turbo-vs.html" && typeof window.loadPage === "function") {
        await window.loadPage("calculator/turbo-vs.html");
      }
    }
  });

  const preferencesEngine = window.harvestHubCreateSyncEngine({
    label: "Account preferences",
    stateKey: "account_preferences",
    metaPrefix: "harvesthub_cloud_meta:account_preferences:",

    resolveContext(user) {
      return resolveAccountContext(user);
    },

    readLocalState() {
      return {
        schemaVersion: 2,
        advancedMode: typeof window.getAdvancedModePreference === "function"
          ? window.getAdvancedModePreference()
          : localStorage.getItem(`${ADVANCED_MODE_LOCAL_KEY}:${getProfile()?.id || ""}`) === "1",
        theme: window.harvestHubTheme?.getTheme?.() || "dark"
      };
    },

    applyRemoteState(data) {
      if (typeof data?.advancedMode === "boolean") {
        if (typeof window.setAdvancedModePreference === "function") {
          window.setAdvancedModePreference(data.advancedMode);
        } else if (typeof window.setAdvancedMode === "function") {
          window.setAdvancedMode(data.advancedMode);
        }
      }
      if ((data?.theme === "dark" || data?.theme === "light") && window.harvestHubTheme) {
        window.harvestHubTheme.setTheme(data.theme, { notify: false });
      }
    }
  });

  function getFormStorageKey(profileId, pageName) {
    return `${FORM_LOCAL_PREFIX}profile:${profileId}:${pageName}`;
  }

  function getProfileBlockStorageKey(profileId, pageName) {
    return `${PROFILE_BLOCK_LOCAL_PREFIX}profile:${profileId}:${pageName}`;
  }

  const formsEngine = window.harvestHubCreateSyncEngine({
    label: "Calculator forms",
    stateKey: "calculator_forms",
    metaPrefix: "harvesthub_cloud_meta:calculator_forms:",

    resolveContext(user) {
      return resolveGameProfileContext(user);
    },

    getStateKey: context => context ? `game_profile:${context.profileId}:calculator_forms` : "calculator_forms",
    getLegacyStateKey: context => context?.isPrimary ? "calculator_forms" : "",

    readLocalState(context) {
      const pages = {};
      const profileBlocks = {};
      CALCULATOR_PAGES.forEach(pageName => {
        const key = getFormStorageKey(context.profileId, pageName);
        const raw = localStorage.getItem(key);
        if (raw != null) pages[pageName] = readJson(key, {});

        const profileBlockKey = getProfileBlockStorageKey(context.profileId, pageName);
        const profileBlockRaw = localStorage.getItem(profileBlockKey);
        if (profileBlockRaw != null) profileBlocks[pageName] = readJson(profileBlockKey, {});
      });
      return {
        schemaVersion: 3,
        profileId: context.profileId,
        transfer: readJson(getScopedTransferKey(context.profileId), null),
        pages,
        profileBlocks
      };
    },

    applyRemoteState(data, context) {
      const pages = data?.pages || {};
      CALCULATOR_PAGES.forEach(pageName => {
        if (!Object.prototype.hasOwnProperty.call(pages, pageName)) return;
        localStorage.setItem(
          getFormStorageKey(context.profileId, pageName),
          JSON.stringify(pages[pageName] || {})
        );
      });

      if (Object.prototype.hasOwnProperty.call(data || {}, "profileBlocks")) {
        const profileBlocks = data.profileBlocks || {};
        CALCULATOR_PAGES.forEach(pageName => {
          const key = getProfileBlockStorageKey(context.profileId, pageName);
          if (Object.prototype.hasOwnProperty.call(profileBlocks, pageName)) {
            localStorage.setItem(key, JSON.stringify(profileBlocks[pageName] || {}));
          } else {
            localStorage.removeItem(key);
          }
        });
      }

      if (Object.prototype.hasOwnProperty.call(data || {}, "transfer")) {
        if (data.transfer && typeof data.transfer === "object") {
          localStorage.setItem(getScopedTransferKey(context.profileId), JSON.stringify(data.transfer));
        } else {
          localStorage.removeItem(getScopedTransferKey(context.profileId));
        }
      }
    },

    async afterRemoteApplied() {
      const currentPage = localStorage.getItem("currentPage") || "";
      if (!CALCULATOR_PAGES.has(currentPage) || typeof window.loadPage !== "function") return;
      const container = document.getElementById("page-content");
      if (container) container.innerHTML = "";
      await window.loadPage(currentPage);
    }
  });

  function isTurboControl(target) {
    if (!(target instanceof Element)) return false;
    if (localStorage.getItem("currentPage") !== "calculator/turbo-vs.html") return false;
    return Boolean(target.closest("#turtleList, #vsList"));
  }

  document.addEventListener("input", event => {
    if (isTurboControl(event.target)) turboEngine.scheduleUpload();
  }, true);

  document.addEventListener("change", event => {
    if (isTurboControl(event.target)) turboEngine.scheduleUpload();
  }, true);

  window.addEventListener("harvesthub:turbo-vs-state-change", () => turboEngine.scheduleUpload());
  window.addEventListener("harvesthub:page-form-state-change", event => {
    if (CALCULATOR_PAGES.has(event.detail?.pageName)) formsEngine.scheduleUpload();
  });
  window.addEventListener("harvesthub:calculator-transfer-change", () => formsEngine.scheduleUpload());
  window.addEventListener("harvesthub:advanced-mode-change", () => preferencesEngine.scheduleUpload());
  window.addEventListener("harvesthub:theme-change", () => preferencesEngine.scheduleUpload());

  turboEngine.start();
  preferencesEngine.start();
  formsEngine.start();

  window.harvestHubTurboVsCloudSync = {
    scheduleUpload: turboEngine.scheduleUpload,
    uploadNow: turboEngine.uploadNow,
    pullRemote: turboEngine.pullRemote,
    forceUpload: turboEngine.forceUpload,
    get isApplyingRemote() {
      return turboEngine.isApplyingRemote;
    }
  };

  window.harvestHubCalculatorFormsCloudSync = {
    scheduleUpload: formsEngine.scheduleUpload,
    uploadNow: formsEngine.uploadNow,
    pullRemote: formsEngine.pullRemote,
    forceUpload: formsEngine.forceUpload,
    getState: () => ({
      ...formsEngine.getState(),
      currentPage: localStorage.getItem("currentPage") || ""
    })
  };

  window.harvestHubAccountPreferencesCloudSync = {
    scheduleUpload: preferencesEngine.scheduleUpload,
    uploadNow: preferencesEngine.uploadNow,
    pullRemote: preferencesEngine.pullRemote,
    forceUpload: preferencesEngine.forceUpload,
    getState: preferencesEngine.getState
  };
})();
