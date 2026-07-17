(() => {
  const PAGE_FORM_STATE_PREFIX = "harvesthub_page_form_state:";
  const ADVANCED_MODE_STORAGE_KEY = "harvesthub_advanced_mode";
  const ADVANCED_MODE_MIGRATION_KEY = "harvesthub_advanced_mode_profile_migrated";
  const PROFILES_STORAGE_KEY = "harvesthub_profiles";
  const ACTIVE_PROFILE_STORAGE_KEY = "harvesthub_active_profile";

  let isRestoringPageFormState = false;

  function readJsonStorage(key, fallback = {}) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (error) {
      console.warn(`Не удалось прочитать данные из localStorage: ${key}`, error);
      return fallback;
    }
  }

  function writeJsonStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`Не удалось сохранить данные в localStorage: ${key}`, error);
      return false;
    }
  }

  function normalizeProfileNickname(nickname) {
    return String(nickname || "").trim();
  }

  function normalizeProfileState(state) {
    return String(state || "").trim();
  }

  function normalizeProfilePin(pin) {
    return String(pin || "").trim();
  }

  function getProfileId(nickname, state) {
    return `${normalizeProfileNickname(nickname).toLowerCase()}::${normalizeProfileState(state)}`;
  }

  function readProfiles() {
    return readJsonStorage(PROFILES_STORAGE_KEY, {});
  }

  function saveProfiles(profiles) {
    return writeJsonStorage(PROFILES_STORAGE_KEY, profiles);
  }

  function getActiveProfileId() {
    return localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) || "";
  }

  function getActiveProfile() {
    const activeProfileId = getActiveProfileId();
    const profiles = readProfiles();
    return activeProfileId ? profiles[activeProfileId] || null : null;
  }

  function getActiveDataProfileId() {
    const profile = getActiveProfile();
    if (!profile) return "";
    if (profile.type === "account") return profile.gameProfileId || profile.id;
    return profile.id || "";
  }

  function validateProfileData(nickname, state, pin) {
    const cleanNickname = normalizeProfileNickname(nickname);
    const cleanState = normalizeProfileState(state);
    const cleanPin = normalizeProfilePin(pin);

    if (!cleanNickname || !cleanState || !cleanPin) {
      return { ok: false, message: "Заполни никнейм, номер штата и код" };
    }

    if (!/^\d{4}$/.test(cleanPin)) {
      return { ok: false, message: "Код должен состоять из 4 цифр" };
    }

    return { ok: true, nickname: cleanNickname, state: cleanState, pin: cleanPin };
  }

  function createUserProfile(nickname, state, pin) {
    const validation = validateProfileData(nickname, state, pin);
    if (!validation.ok) return validation;

    const profiles = readProfiles();
    const profileId = getProfileId(validation.nickname, validation.state);

    if (profiles[profileId]) {
      return { ok: false, message: "Такой профиль уже есть на этом устройстве" };
    }

    profiles[profileId] = {
      id: profileId,
      nickname: validation.nickname,
      state: validation.state,
      pin: validation.pin,
      createdAt: new Date().toISOString()
    };

    saveProfiles(profiles);
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profileId);
    applyActiveProfileSetting();
    return { ok: true, profile: profiles[profileId], message: "Профиль создан" };
  }

  function loginUserProfile(nickname, state, pin) {
    const validation = validateProfileData(nickname, state, pin);
    if (!validation.ok) return validation;

    const profiles = readProfiles();
    const profileId = getProfileId(validation.nickname, validation.state);
    const profile = profiles[profileId];

    if (!profile || profile.pin !== validation.pin) {
      return { ok: false, message: "Профиль не найден или код неверный" };
    }

    savePageFormState(localStorage.getItem("currentPage") || "");
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profileId);
    applyActiveProfileSetting();
    return { ok: true, profile, message: "Профиль выбран" };
  }

  function logoutUserProfile() {
    savePageFormState(localStorage.getItem("currentPage") || "");
    localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
    applyActiveProfileSetting();
    return { ok: true, message: "Профиль отключён" };
  }

  function applyActiveProfileSetting() {
    const profile = getActiveProfile();
    const hasProfile = Boolean(profile);

    document.documentElement.classList.toggle("has-profile", hasProfile);
    document.documentElement.dataset.profile = hasProfile ? "on" : "off";

    if (document.body) {
      document.body.classList.toggle("has-profile", hasProfile);
      document.body.dataset.profile = hasProfile ? "on" : "off";
    }

    window.dispatchEvent(new CustomEvent("harvesthub:profile-change", {
      detail: { profile, dataProfileId: getActiveDataProfileId() }
    }));

    return profile;
  }

  function isAdvancedModeEnabled() {
    const dataProfileId = getActiveDataProfileId();
    if (!dataProfileId) return localStorage.getItem(ADVANCED_MODE_STORAGE_KEY) === "1";

    const profileKey = `${ADVANCED_MODE_STORAGE_KEY}:profile:${dataProfileId}`;
    const stored = localStorage.getItem(profileKey);
    if (stored != null) return stored === "1";

    if (!localStorage.getItem(ADVANCED_MODE_MIGRATION_KEY)) {
      const legacy = localStorage.getItem(ADVANCED_MODE_STORAGE_KEY);
      if (legacy != null) localStorage.setItem(profileKey, legacy);
      localStorage.setItem(ADVANCED_MODE_MIGRATION_KEY, dataProfileId);
      return legacy === "1";
    }

    return false;
  }

  function applyAdvancedModeSetting() {
    const enabled = isAdvancedModeEnabled();

    document.documentElement.classList.toggle("advanced-mode", enabled);
    document.documentElement.dataset.advancedMode = enabled ? "on" : "off";

    if (document.body) {
      document.body.classList.toggle("advanced-mode", enabled);
      document.body.dataset.advancedMode = enabled ? "on" : "off";
    }

    return enabled;
  }

  function setAdvancedMode(enabled) {
    const dataProfileId = getActiveDataProfileId();
    const storageKey = dataProfileId
      ? `${ADVANCED_MODE_STORAGE_KEY}:profile:${dataProfileId}`
      : ADVANCED_MODE_STORAGE_KEY;
    localStorage.setItem(storageKey, enabled ? "1" : "0");
    const applied = applyAdvancedModeSetting();

    window.dispatchEvent(new CustomEvent("harvesthub:advanced-mode-change", {
      detail: { enabled: applied }
    }));

    return applied;
  }

  function getPageFormStateKey(pageName) {
    const dataProfileId = getActiveDataProfileId();
    const scope = dataProfileId ? `profile:${dataProfileId}` : "local";
    return `${PAGE_FORM_STATE_PREFIX}${scope}:${pageName}`;
  }

  function getPersistableFields(container) {
    if (!container) return [];

    return Array.from(container.querySelectorAll("input, select, textarea")).filter(field => {
      const type = (field.type || "").toLowerCase();
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
    const type = (field.type || "").toLowerCase();
    return type === "checkbox" || type === "radio" ? field.checked : field.value;
  }

  function setFieldValue(field, value) {
    const type = (field.type || "").toLowerCase();
    if (type === "checkbox" || type === "radio") field.checked = Boolean(value);
    else field.value = String(value ?? "");
  }

  function savePageFormState(pageName = localStorage.getItem("currentPage") || "") {
    if (!pageName || isRestoringPageFormState) return;

    const fields = getPersistableFields(document.getElementById("page-content"));
    if (fields.length === 0) return;

    const state = {};
    fields.forEach((field, index) => {
      state[getFieldKey(field, index)] = getFieldValue(field);
    });

    const storageKey = getPageFormStateKey(pageName);
    const serializedState = JSON.stringify(state);
    if (localStorage.getItem(storageKey) === serializedState) return;
    if (!writeJsonStorage(storageKey, state)) return;

    window.dispatchEvent(new CustomEvent("harvesthub:page-form-state-change", {
      detail: { pageName, storageKey }
    }));
  }

  function restorePageFormState(pageName) {
    const fields = getPersistableFields(document.getElementById("page-content"));
    const state = readJsonStorage(getPageFormStateKey(pageName), null);
    if (!state || typeof state !== "object") return;

    isRestoringPageFormState = true;
    try {
      fields.forEach((field, index) => {
        const key = getFieldKey(field, index);
        if (!Object.prototype.hasOwnProperty.call(state, key)) return;
        setFieldValue(field, state[key]);
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      });
    } finally {
      isRestoringPageFormState = false;
    }
  }

  function bindPageFormPersistence(pageName) {
    getPersistableFields(document.getElementById("page-content")).forEach(field => {
      if (field.dataset.formPersistenceBound === pageName) return;
      field.dataset.formPersistenceBound = pageName;
      field.addEventListener("input", () => savePageFormState(pageName));
      field.addEventListener("change", () => savePageFormState(pageName));
    });
  }

  function isPersistablePageField(target) {
    if (!(target instanceof HTMLElement)) return false;
    if (!target.closest("#page-content")) return false;
    if (!target.matches("input, select, textarea")) return false;
    if (target.dataset.noPersist === "true") return false;
    return !["button", "submit", "reset", "hidden", "file"].includes(String(target.type || "").toLowerCase());
  }

  function saveDynamicField(event) {
    if (!isPersistablePageField(event.target) || isRestoringPageFormState) return;
    savePageFormState();
  }

  document.addEventListener("input", saveDynamicField, true);
  document.addEventListener("change", saveDynamicField, true);
  window.addEventListener("harvesthub:advanced-mode-change", () => window.setTimeout(savePageFormState, 0));

  window.harvestHubStorage = {
    readJsonStorage,
    writeJsonStorage,
    restorePageFormState,
    bindPageFormPersistence
  };
  window.savePageFormState = savePageFormState;
  window.getAdvancedMode = isAdvancedModeEnabled;
  window.setAdvancedMode = setAdvancedMode;
  window.applyAdvancedModeSetting = applyAdvancedModeSetting;
  window.getActiveProfile = getActiveProfile;
  window.getActiveDataProfileId = getActiveDataProfileId;
  window.getProfiles = readProfiles;
  window.createUserProfile = createUserProfile;
  window.loginUserProfile = loginUserProfile;
  window.logoutUserProfile = logoutUserProfile;
  window.applyActiveProfileSetting = applyActiveProfileSetting;
})();
