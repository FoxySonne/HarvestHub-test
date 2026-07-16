const moduleVersion = new URL(import.meta.url).searchParams.get("v") || "dev";
const { database } = await import(`../../data/database.js?v=${encodeURIComponent(moduleVersion)}`);

const TROOP_TRANSFER_STORAGE_KEY = "harvesthub_troop_training_transfer";
const TROOP_TRANSFER_APPLIED_KEY = "harvesthub_troop_training_transfer_applied_ipk";
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const CLOUD_SAVE_DELAY = 400;

let selectedCategoryIds = new Set();
const ipkValues = new Map();
const ipkResultOverrides = new Map();
let activeCloudProfileId = "";
let activeCloudProfileData = {};
let cloudSaveTimer = null;
let cloudSaveInProgress = false;
let cloudSaveQueued = false;

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ru-RU");
}

function parseNumber(value) {
  const number = Number(String(value || "").replace(/\s+/g, ""));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function readTroopTransferPreset() {
  try {
    return JSON.parse(localStorage.getItem(TROOP_TRANSFER_STORAGE_KEY) || "null");
  } catch (error) {
    console.warn("Не удалось прочитать заготовку обучения войск для ИПК", error);
    return null;
  }
}

function getLocalAccountProfile() {
  return window.harvestHubAccount?.getProfile?.() || window.getActiveProfile?.() || null;
}

function serializeIpkData() {
  return {
    selectedCategories: Array.from(selectedCategoryIds),
    values: Object.fromEntries(ipkValues),
    resultOverrides: Object.fromEntries(ipkResultOverrides)
  };
}

function applyStoredIpkData(ipkData) {
  if (!ipkData || typeof ipkData !== "object") return false;

  const validCategoryIds = new Set(database.categoryIpk.map(category => category.id));
  const storedCategories = Array.isArray(ipkData.selectedCategories)
    ? ipkData.selectedCategories.filter(id => validCategoryIds.has(id))
    : [];

  selectedCategoryIds = new Set(storedCategories);
  ipkValues.clear();
  ipkResultOverrides.clear();

  if (ipkData.values && typeof ipkData.values === "object") {
    Object.entries(ipkData.values).forEach(([key, value]) => {
      if (value !== "" && value != null) ipkValues.set(key, String(value));
    });
  }

  if (ipkData.resultOverrides && typeof ipkData.resultOverrides === "object") {
    Object.entries(ipkData.resultOverrides).forEach(([key, value]) => {
      if (value !== "" && value != null) ipkResultOverrides.set(key, String(value));
    });
  }

  return true;
}

async function loadCloudIpkData() {
  const accountProfile = getLocalAccountProfile();
  if (accountProfile?.type !== "account" || !window.harvestHubSupabase) return false;

  const { data: sessionData, error: sessionError } = await window.harvestHubSupabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (sessionError || !user) return false;

  const { data, error } = await window.harvestHubSupabase
    .from("game_profiles")
    .select("id,data")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.warn("Не удалось загрузить данные ИПК из профиля:", error);
    return false;
  }

  if (!data?.id) return false;

  activeCloudProfileId = data.id;
  activeCloudProfileData = data.data && typeof data.data === "object" ? data.data : {};
  applyStoredIpkData(activeCloudProfileData.ipk);
  return true;
}

async function saveCloudIpkDataNow() {
  if (!activeCloudProfileId || !window.harvestHubSupabase) return;

  if (cloudSaveInProgress) {
    cloudSaveQueued = true;
    return;
  }

  cloudSaveInProgress = true;
  cloudSaveQueued = false;

  try {
    const nextData = {
      ...activeCloudProfileData,
      ipk: serializeIpkData()
    };

    const { error } = await window.harvestHubSupabase
      .from("game_profiles")
      .update({ data: nextData })
      .eq("id", activeCloudProfileId);

    if (error) throw error;
    activeCloudProfileData = nextData;
  } catch (error) {
    console.warn("Не удалось сохранить данные ИПК в профиле:", error);
  } finally {
    cloudSaveInProgress = false;
    if (cloudSaveQueued) saveCloudIpkDataNow();
  }
}

function scheduleCloudIpkSave() {
  if (!activeCloudProfileId) return;
  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(saveCloudIpkDataNow, CLOUD_SAVE_DELAY);
}

function getActionById(actionId) {
  return database.action.find(action => action.id === actionId);
}

function getActionPoints(action, item) {
  const ipkPoints = action?.points?.ipk ?? 0;
  if (item.option !== undefined && typeof ipkPoints === "object") return ipkPoints[item.option] ?? 0;
  return typeof ipkPoints === "number" ? ipkPoints : 0;
}

function getRowKey(categoryId, item) {
  return `${categoryId}:${item.id}:${item.option ?? ""}`;
}

function createRows(category) {
  return category.actions.map(item => {
    const action = getActionById(item.id);
    const points = getActionPoints(action, item);
    const key = getRowKey(category.id, item);
    return {
      id: item.id,
      option: item.option,
      key,
      label: item.label || action?.name || item.id,
      points,
      value: ipkValues.get(key) || ""
    };
  });
}

function saveCardValues(card) {
  card.querySelectorAll(".ipk-row").forEach(row => {
    const key = row.dataset.key;
    const input = row.querySelector("input");
    if (!key || !input) return;
    if (input.value === "") ipkValues.delete(key);
    else ipkValues.set(key, input.value);
  });
}

function saveCardResultOverride(card) {
  const categoryId = card.dataset.categoryId;
  const resultInput = card.querySelector("[data-ipk-result]");
  if (!categoryId || !resultInput) return;
  if (card.dataset.resultManual === "true" && resultInput.value !== "") ipkResultOverrides.set(categoryId, resultInput.value);
  else ipkResultOverrides.delete(categoryId);
}

function saveAllValues() {
  document.querySelectorAll(".ipk-card").forEach(card => {
    saveCardValues(card);
    saveCardResultOverride(card);
  });
}

function createCard(category) {
  const rows = createRows(category);
  const card = document.createElement("article");
  const manualResult = ipkResultOverrides.get(category.id);

  card.className = "ipk-card card";
  card.dataset.categoryId = category.id;
  card.dataset.target = category.target;
  card.dataset.resultManual = manualResult != null ? "true" : "false";

  card.innerHTML = `
    <header class="card-header"><h3>${category.name}</h3></header>
    <div class="ipk-card-body">
      <div class="ipk-stats">
        <div><span>Очков нужно:</span><strong data-ipk-target>${formatNumber(category.target)}</strong></div>
        <div><span>Не хватает:</span><strong data-ipk-missing>${formatNumber(category.target)}</strong></div>
        <div><span>Получу:</span><input class="ipk-result-input" type="number" min="0" value="${manualResult ?? 0}" inputmode="numeric" data-ipk-result data-no-persist="true"></div>
      </div>
      <div class="ipk-rows">
        ${rows.map(row => `
          <div class="ipk-row" data-key="${row.key}" data-action-id="${row.id}" data-option="${row.option ?? ""}" data-points="${row.points}">
            <label>${row.label}</label>
            <input type="number" min="0" value="${row.value}" inputmode="numeric">
            <div class="ipk-need">${row.points > 0 ? formatNumber(Math.ceil(category.target / row.points)) : "0"}</div>
          </div>`).join("")}
      </div>
    </div>`;

  card.addEventListener("input", event => {
    if (event.target.matches("[data-ipk-result]")) {
      card.dataset.resultManual = "true";
      saveCardResultOverride(card);
    } else {
      card.dataset.resultManual = "false";
      ipkResultOverrides.delete(category.id);
      saveCardValues(card);
    }
    updateIpkResults();
    scheduleCloudIpkSave();
  });

  return card;
}

function createCategoryCheckbox(category) {
  const label = document.createElement("label");
  label.className = "ipk-category-item";
  label.dataset.categoryId = category.id;
  label.innerHTML = `
    <span>${category.name}</span>
    <span class="ipk-switch">
      <input type="checkbox" ${selectedCategoryIds.has(category.id) ? "checked" : ""}>
      <span class="ipk-switch-track"><span class="ipk-switch-thumb">✓</span></span>
    </span>`;
  label.querySelector("input").addEventListener("change", event => setCategoryEnabled(category.id, event.currentTarget.checked));
  return label;
}

function renderCategoryList(container) {
  if (!container) return;
  container.innerHTML = "";
  database.categoryIpk.forEach(category => container.appendChild(createCategoryCheckbox(category)));
}

function renderSelectedCards({ preserveDomValues = true } = {}) {
  const cardsContainer = document.getElementById("ipkCards");
  if (!cardsContainer) return;
  if (preserveDomValues) saveAllValues();
  cardsContainer.innerHTML = "";
  database.categoryIpk
    .filter(category => selectedCategoryIds.has(category.id))
    .forEach(category => cardsContainer.appendChild(createCard(category)));
  updateIpkResults();
  if (typeof window.bindCollapsibleCards === "function") window.bindCollapsibleCards();
}

function setCategoryEnabled(categoryId, isEnabled) {
  if (isEnabled) selectedCategoryIds.add(categoryId);
  else selectedCategoryIds.delete(categoryId);

  document.querySelectorAll(`.ipk-category-item[data-category-id="${categoryId}"] input`).forEach(input => {
    input.checked = isEnabled;
  });

  renderSelectedCards();
  scheduleCloudIpkSave();
}

function calculateCard(card) {
  const target = Number(card.dataset.target || 0);
  let autoResult = 0;
  const rows = Array.from(card.querySelectorAll(".ipk-row"));

  rows.forEach(row => {
    const quantity = parseNumber(row.querySelector("input")?.value);
    autoResult += quantity * Number(row.dataset.points || 0);
  });

  const resultInput = card.querySelector("[data-ipk-result]");
  const isManual = card.dataset.resultManual === "true";
  const result = isManual ? parseNumber(resultInput?.value) : autoResult;
  const missing = Math.max(target - result, 0);

  if (resultInput && !isManual) resultInput.value = String(autoResult);

  rows.forEach(row => {
    const need = row.querySelector(".ipk-need");
    const points = Number(row.dataset.points || 0);
    if (need) need.textContent = points > 0 ? formatNumber(Math.ceil(missing / points)) : "0";
  });

  card.querySelector("[data-ipk-missing]").textContent = formatNumber(missing);
  return result;
}

function updateIpkResults() {
  const total = document.getElementById("ipkTotal");
  let totalResult = 0;
  document.querySelectorAll(".ipk-card").forEach(card => { totalResult += calculateCard(card); });
  if (total) total.textContent = formatNumber(totalResult);
}

function applyTroopTransferPreset() {
  const preset = readTroopTransferPreset();
  const presetId = preset?.id || preset?.createdAt || "";
  if (!preset || !presetId || localStorage.getItem(TROOP_TRANSFER_APPLIED_KEY) === presetId) return;

  const shouldApplyIpk = preset.targets?.ipk || preset.target === "ipk" || preset.target === "turtle-ipk" || preset.target === "vs-ipk";
  if (!shouldApplyIpk) return;

  const stages = Array.isArray(preset.stages) ? preset.stages : [];
  let applied = false;
  LEVELS.forEach(level => ipkValues.delete(`troops:troop_upgrade:${level}`));

  stages.forEach(stage => {
    const level = Number(stage.level) || 0;
    const troops = Number(stage.troops) || 0;
    if (level <= 0 || troops <= 0) return;
    ipkValues.set(`troops:troop_upgrade:${level}`, String(troops));
    applied = true;
  });

  if (!applied) return;
  selectedCategoryIds.add("troops");
  localStorage.setItem(TROOP_TRANSFER_APPLIED_KEY, presetId);
  renderCategoryList(document.getElementById("ipkDesktopCategoriesList"));
  renderCategoryList(document.getElementById("ipkMobileCategoriesList"));
  renderSelectedCards({ preserveDomValues: false });
  if (typeof window.savePageFormState === "function") window.savePageFormState();
  scheduleCloudIpkSave();
}

function renderIpk() {
  const desktopCategories = document.getElementById("ipkDesktopCategoriesList");
  const mobileCategories = document.getElementById("ipkMobileCategoriesList");
  if (!desktopCategories || !mobileCategories) return;

  document.getElementById("profileBlock")?.remove();
  if (selectedCategoryIds.size === 0 && !activeCloudProfileData.ipk) {
    selectedCategoryIds = new Set(database.categoryIpk.map(category => category.id));
  }

  renderCategoryList(desktopCategories);
  renderCategoryList(mobileCategories);
  renderSelectedCards({ preserveDomValues: false });
  if (typeof window.bindCollapsibleCards === "function") window.bindCollapsibleCards();
}

export async function init() {
  selectedCategoryIds = new Set(database.categoryIpk.map(category => category.id));
  ipkValues.clear();
  ipkResultOverrides.clear();
  activeCloudProfileId = "";
  activeCloudProfileData = {};

  await loadCloudIpkData();
  renderIpk();
  window.setTimeout(applyTroopTransferPreset, 250);
}
