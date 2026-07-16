(() => {
  const TURBO_LOCAL_PREFIX = "harvesthub_turbo_vs_week_state:";
  const FORM_LOCAL_PREFIX = "harvesthub_page_form_state:";
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

  const turboEngine = window.harvestHubCreateSyncEngine({
    label: "Turbo/VS",
    stateKey: "turbo_vs_week",
    metaPrefix: "harvesthub_cloud_meta:turbo_vs:",

    resolveContext(user) {
      const profile = getProfile();
      const profileId = profile?.id || `account:${user.id}`;
      return { localKey: `${TURBO_LOCAL_PREFIX}profile:${profileId}` };
    },

    readLocalState(context) {
      return readJson(context.localKey, {});
    },

    applyRemoteState(data, context) {
      localStorage.setItem(context.localKey, JSON.stringify(data || {}));
    },

    async afterRemoteApplied() {
      if (localStorage.getItem("currentPage") === "calculator/turbo-vs.html" && typeof window.loadPage === "function") {
        await window.loadPage("calculator/turbo-vs.html");
      }
    }
  });

  function resolveFormsProfileId(user) {
    const storedId = localStorage.getItem("harvesthub_active_profile") || "";
    if (storedId) return storedId;
    return getProfile()?.id || `account:${user.id}`;
  }

  function getFormStorageKey(profileId, pageName) {
    return `${FORM_LOCAL_PREFIX}profile:${profileId}:${pageName}`;
  }

  const formsEngine = window.harvestHubCreateSyncEngine({
    label: "Calculator forms",
    stateKey: "calculator_forms",
    metaPrefix: "harvesthub_cloud_meta:calculator_forms:",

    resolveContext(user) {
      const profileId = resolveFormsProfileId(user);
      return profileId ? { profileId } : null;
    },

    readLocalState(context) {
      const pages = {};
      CALCULATOR_PAGES.forEach(pageName => {
        const key = getFormStorageKey(context.profileId, pageName);
        const raw = localStorage.getItem(key);
        if (raw != null) pages[pageName] = readJson(key, {});
      });
      return {
        schemaVersion: 2,
        profileId: context.profileId,
        advancedMode: localStorage.getItem(ADVANCED_MODE_LOCAL_KEY) === "1",
        transfer: readJson(TRANSFER_LOCAL_KEY, null),
        pages
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

      if (typeof data?.advancedMode === "boolean" && typeof window.setAdvancedMode === "function") {
        window.setAdvancedMode(data.advancedMode);
      }

      if (Object.prototype.hasOwnProperty.call(data || {}, "transfer")) {
        if (data.transfer && typeof data.transfer === "object") {
          localStorage.setItem(TRANSFER_LOCAL_KEY, JSON.stringify(data.transfer));
        } else {
          localStorage.removeItem(TRANSFER_LOCAL_KEY);
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
  window.addEventListener("harvesthub:advanced-mode-change", () => formsEngine.scheduleUpload());

  turboEngine.start();
  formsEngine.start();

  window.harvestHubTurboVsCloudSync = {
    scheduleUpload: turboEngine.scheduleUpload,
    uploadNow: turboEngine.uploadNow,
    pullRemote: turboEngine.pullRemote,
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
})();
