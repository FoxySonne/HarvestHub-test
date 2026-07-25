(() => {
  const TURBO_LOCAL_PREFIX = "harvesthub_turbo_vs_week_state:";
  const FORM_LOCAL_PREFIX = "harvesthub_page_form_state:";
  const PROFILE_BLOCK_LOCAL_PREFIX = "harvesthub_profile_block_state:";
  const TRANSFER_LOCAL_KEY = "harvesthub_troop_training_transfer";
  const ADVANCED_MODE_LOCAL_KEY = "harvesthub_advanced_mode";
  const CALCULATOR_PAGES = new Map([
    ["calculator/ipk.html", "ipk"],
    ["calculator/season-resources.html", "season_resources"],
    ["calculator/troop-training.html", "troop_training"]
  ]);

  function readJson(key, fallback = {}) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  }

  function writeJsonOrRemove(key, value) {
    if (value && typeof value === "object") localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
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

  function getFormStorageKey(profileId, pageName) {
    return `${FORM_LOCAL_PREFIX}profile:${profileId}:${pageName}`;
  }

  function getProfileBlockStorageKey(profileId, pageName) {
    return `${PROFILE_BLOCK_LOCAL_PREFIX}profile:${profileId}:${pageName}`;
  }

  function getScopedTransferKey(profileId) {
    return `${TRANSFER_LOCAL_KEY}:profile:${profileId}`;
  }

  function currentPageName() {
    return window.harvestHubNavigation?.getCurrentPage?.()
      || localStorage.getItem("currentPage")
      || "";
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
      writeJsonOrRemove(context.localKey, data && Object.keys(data).length ? data : null);
      localStorage.removeItem(getFormStorageKey(context.profileId, "calculator/turbo-vs.html"));
    },

    async afterRemoteApplied() {
      if (currentPageName() === "calculator/turbo-vs.html" && typeof window.loadPage === "function") {
        await window.loadPage("calculator/turbo-vs.html", { skipCurrentSave: true, trackVisit: false, behavior: "auto" });
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

  function normalizePageCloudState(data, pageName) {
    if (data?.pages || data?.profileBlocks) {
      return {
        page: Object.prototype.hasOwnProperty.call(data.pages || {}, pageName)
          ? data.pages[pageName]
          : null,
        profileBlock: Object.prototype.hasOwnProperty.call(data.profileBlocks || {}, pageName)
          ? data.profileBlocks[pageName]
          : null
      };
    }
    return {
      page: data?.page && typeof data.page === "object" ? data.page : null,
      profileBlock: data?.profileBlock && typeof data.profileBlock === "object" ? data.profileBlock : null
    };
  }

  function createPageEngine(pageName, slug) {
    return window.harvestHubCreateSyncEngine({
      label: `Calculator ${slug}`,
      stateKey: `calculator:${slug}`,
      metaPrefix: `harvesthub_cloud_meta:calculator:${slug}:`,

      resolveContext(user) {
        return resolveGameProfileContext(user);
      },

      getStateKey: context => context ? `game_profile:${context.profileId}:calculator:${slug}` : `calculator:${slug}`,
      getLegacyStateKey: context => context?.isPrimary ? "calculator_forms" : "",

      readLocalState(context) {
        const pageKey = getFormStorageKey(context.profileId, pageName);
        const profileBlockKey = getProfileBlockStorageKey(context.profileId, pageName);
        return {
          schemaVersion: 4,
          profileId: context.profileId,
          page: localStorage.getItem(pageKey) == null ? null : readJson(pageKey, {}),
          profileBlock: localStorage.getItem(profileBlockKey) == null ? null : readJson(profileBlockKey, {})
        };
      },

      applyRemoteState(data, context) {
        const normalized = normalizePageCloudState(data, pageName);
        writeJsonOrRemove(getFormStorageKey(context.profileId, pageName), normalized.page);
        writeJsonOrRemove(getProfileBlockStorageKey(context.profileId, pageName), normalized.profileBlock);
      },

      async afterRemoteApplied() {
        if (currentPageName() !== pageName || typeof window.loadPage !== "function") return;
        await window.loadPage(pageName, { skipCurrentSave: true, trackVisit: false, behavior: "auto" });
      }
    });
  }

  const pageEngines = new Map(
    Array.from(CALCULATOR_PAGES, ([pageName, slug]) => [pageName, createPageEngine(pageName, slug)])
  );

  const transferEngine = window.harvestHubCreateSyncEngine({
    label: "Calculator transfer",
    stateKey: "calculator_transfer",
    metaPrefix: "harvesthub_cloud_meta:calculator_transfer:",

    resolveContext(user) {
      return resolveGameProfileContext(user);
    },

    getStateKey: context => context ? `game_profile:${context.profileId}:calculator_transfer` : "calculator_transfer",
    getLegacyStateKey: context => context?.isPrimary ? "calculator_forms" : "",

    readLocalState(context) {
      const key = getScopedTransferKey(context.profileId);
      return {
        schemaVersion: 4,
        profileId: context.profileId,
        transfer: localStorage.getItem(key) == null ? null : readJson(key, null)
      };
    },

    applyRemoteState(data, context) {
      const transfer = data?.pages || data?.profileBlocks
        ? (Object.prototype.hasOwnProperty.call(data, "transfer") ? data.transfer : null)
        : (data?.transfer && typeof data.transfer === "object" ? data.transfer : null);
      writeJsonOrRemove(getScopedTransferKey(context.profileId), transfer);
    }
  });

  function engineForPage(pageName = currentPageName()) {
    return pageEngines.get(pageName) || null;
  }

  function isTurboControl(target) {
    if (!(target instanceof Element)) return false;
    if (currentPageName() !== "calculator/turbo-vs.html") return false;
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
    engineForPage(event.detail?.pageName)?.scheduleUpload();
  });
  window.addEventListener("harvesthub:calculator-transfer-change", () => transferEngine.scheduleUpload());
  window.addEventListener("harvesthub:advanced-mode-change", () => preferencesEngine.scheduleUpload());
  window.addEventListener("harvesthub:theme-change", () => preferencesEngine.scheduleUpload());

  turboEngine.start();
  preferencesEngine.start();
  transferEngine.start();
  pageEngines.forEach(engine => engine.start());

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
    scheduleUpload(pageName) {
      engineForPage(pageName)?.scheduleUpload();
    },
    uploadNow(pageName) {
      const engine = engineForPage(pageName);
      return engine ? engine.uploadNow() : Promise.resolve(true);
    },
    pullRemote(pageName) {
      const engine = engineForPage(pageName);
      return engine ? engine.pullRemote() : Promise.resolve(true);
    },
    forceUpload(pageName) {
      const engine = engineForPage(pageName);
      return engine ? engine.forceUpload() : Promise.resolve(true);
    },
    forceTransferUpload: transferEngine.forceUpload,
    getState(pageName) {
      const engine = engineForPage(pageName);
      return {
        ...(engine?.getState?.() || {}),
        currentPage: currentPageName()
      };
    }
  };

  window.harvestHubAccountPreferencesCloudSync = {
    scheduleUpload: preferencesEngine.scheduleUpload,
    uploadNow: preferencesEngine.uploadNow,
    pullRemote: preferencesEngine.pullRemote,
    forceUpload: preferencesEngine.forceUpload,
    getState: preferencesEngine.getState
  };
})();
