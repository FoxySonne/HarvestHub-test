const PROFILE_BLOCK_STATE_PREFIX = "harvesthub_profile_block_state:";

function getProfileBlockScope() {
  const profile = typeof window.getActiveProfile === "function" ? window.getActiveProfile() : null;
  return profile?.id ? `profile:${profile.id}` : "local";
}

function getProfileBlockPageName() {
  return localStorage.getItem("currentPage") || "unknown";
}

function getProfileBlockStateKey() {
  return `${PROFILE_BLOCK_STATE_PREFIX}${getProfileBlockScope()}:${getProfileBlockPageName()}`;
}

function readProfileBlockState() {
  try {
    return JSON.parse(localStorage.getItem(getProfileBlockStateKey()) || "{}");
  } catch (error) {
    console.warn("Не удалось прочитать данные проф.блока", error);
    return {};
  }
}

function saveProfileBlockState() {
  const block = document.getElementById("profileBlock");
  if (!block) return;
  const state = {};
  block.querySelectorAll("input, select, textarea").forEach(field => {
    if (!field.id) return;
    const type = (field.type || "").toLowerCase();
    state[field.id] = type === "checkbox" || type === "radio" ? field.checked : field.value;
  });
  localStorage.setItem(getProfileBlockStateKey(), JSON.stringify(state));
}

function restoreProfileBlockState() {
  const block = document.getElementById("profileBlock");
  if (!block) return;
  const state = readProfileBlockState();
  block.querySelectorAll("input, select, textarea").forEach(field => {
    if (!field.id || !Object.prototype.hasOwnProperty.call(state, field.id)) return;
    const type = (field.type || "").toLowerCase();
    if (type === "checkbox" || type === "radio") field.checked = Boolean(state[field.id]);
    else field.value = String(state[field.id] ?? "");
  });
}

function bindProfileBlockPersistence() {
  const block = document.getElementById("profileBlock");
  if (!block || block.dataset.profileBlockBound === "true") return;
  block.dataset.profileBlockBound = "true";
  block.addEventListener("input", saveProfileBlockState);
  block.addEventListener("change", saveProfileBlockState);
}

function getProfileBlockInsertTarget(pageContent) {
  return pageContent.querySelector(":scope > .page-section > h1") ||
    pageContent.querySelector(":scope > h1") ||
    pageContent.querySelector(":scope > .page-section > header") ||
    pageContent.querySelector(":scope > header");
}

function ensureProfileBlock() {
  const pageContent = document.getElementById("page-content");
  if (!pageContent) return null;
  let block = document.getElementById("profileBlock");
  if (block) return block;
  block = document.createElement("section");
  block.id = "profileBlock";
  block.className = "card profile-block advanced-only";
  block.dataset.profileBlockReady = "false";
  block.innerHTML = `
    <div class="card-header profile-block-header">
      <p id="profileBlockDescription"></p>
    </div>
    <div id="profileBlockContent" class="profile-block-content"></div>
  `;
  const insertTarget = getProfileBlockInsertTarget(pageContent);
  if (insertTarget) insertTarget.insertAdjacentElement("afterend", block);
  else pageContent.prepend(block);
  bindProfileBlockPersistence();
  return block;
}

function clearProfileBlock() {
  document.getElementById("profileBlock")?.remove();
}

function setProfileBlockContent({ description = "", content = "" } = {}) {
  const block = ensureProfileBlock();
  if (!block) return;
  const descriptionElement = document.getElementById("profileBlockDescription");
  const contentElement = document.getElementById("profileBlockContent");
  if (descriptionElement) descriptionElement.textContent = description;
  if (contentElement) {
    if (typeof content === "string") contentElement.innerHTML = content;
    else {
      contentElement.innerHTML = "";
      contentElement.appendChild(content);
    }
  }
  block.dataset.profileBlockReady = "true";
  restoreProfileBlockState();
  bindProfileBlockPersistence();
  window.dispatchEvent(new CustomEvent("harvesthub:profile-block-ready", { detail: { block } }));
}

window.addEventListener("harvesthub:profile-change", restoreProfileBlockState);

window.ensureProfileBlock = ensureProfileBlock;
window.setProfileBlockContent = setProfileBlockContent;
window.clearProfileBlock = clearProfileBlock;
window.saveProfileBlockState = saveProfileBlockState;
window.restoreProfileBlockState = restoreProfileBlockState;

(() => {
  const TEXT_REPLACEMENTS = [
    [/Расчет/g, "Расчёт"],
    [/расчет/g, "расчёт"],
    [/Еще/g, "Ещё"],
    [/еще/g, "ещё"],
    [/Турбочерепашка&VS/g, "Турбочерепашка & VS"]
  ];

  const ATTRIBUTE_REPLACEMENTS = [
    "title",
    "aria-label",
    "placeholder",
    "data-tooltip"
  ];

  function polishText(value) {
    if (!value) return value;

    return TEXT_REPLACEMENTS.reduce((text, [pattern, replacement]) => {
      return text.replace(pattern, replacement);
    }, value);
  }

  function polishTextNode(node) {
    const polished = polishText(node.nodeValue);
    if (polished !== node.nodeValue) node.nodeValue = polished;
  }

  function polishAttributes(element) {
    ATTRIBUTE_REPLACEMENTS.forEach(attribute => {
      if (!element.hasAttribute(attribute)) return;

      const value = element.getAttribute(attribute);
      const polished = polishText(value);

      if (polished !== value) element.setAttribute(attribute, polished);
    });
  }

  function polishElement(root = document.body) {
    if (!root) return;

    if (root.nodeType === Node.ELEMENT_NODE) {
      polishAttributes(root);
    }

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName;
            if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA") {
              return NodeFilter.FILTER_REJECT;
            }
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node = walker.currentNode;

    while (node) {
      if (node.nodeType === Node.TEXT_NODE) polishTextNode(node);
      if (node.nodeType === Node.ELEMENT_NODE) polishAttributes(node);
      node = walker.nextNode();
    }
  }

  function schedulePolish() {
    window.setTimeout(() => polishElement(document.body), 0);
  }

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) polishTextNode(node);
        if (node.nodeType === Node.ELEMENT_NODE) polishElement(node);
      });
    });
  });

  function start() {
    polishElement(document.body);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  window.addEventListener("harvesthub:advanced-mode-change", schedulePolish);
  window.harvestHubPolishText = schedulePolish;
})();

(() => {
  const FIELD_IDS = {
    days: "timeConverterDays",
    hours: "timeConverterHours",
    minutes: "timeConverterMinutes",
    seconds: "timeConverterSeconds"
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function readNumber(id) {
    const field = getElement(id);
    const value = Number(String(field?.value || "0").replace(",", "."));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  function formatNumber(value) {
    return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("ru-RU");
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function calculateTime() {
    const days = readNumber(FIELD_IDS.days);
    const hours = readNumber(FIELD_IDS.hours);
    const minutes = readNumber(FIELD_IDS.minutes);
    const seconds = readNumber(FIELD_IDS.seconds);

    const totalSeconds = days * 86400 + hours * 3600 + minutes * 60 + seconds;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const formattedDays = Math.floor(totalSeconds / 86400);
    const remainingSeconds = totalSeconds % 86400;
    const formattedHours = Math.floor(remainingSeconds / 3600);
    const formattedMinutes = Math.floor((remainingSeconds % 3600) / 60);
    const formattedSeconds = remainingSeconds % 60;

    return {
      totalMinutes,
      formatted: `${pad(formattedDays)}д ${pad(formattedHours)}:${pad(formattedMinutes)}:${pad(formattedSeconds)}`
    };
  }

  function renderTimeConverter() {
    const totalMinutesElement = getElement("timeConverterTotalMinutes");
    const formattedElement = getElement("timeConverterFormatted");

    if (!totalMinutesElement || !formattedElement) return;

    const result = calculateTime();
    totalMinutesElement.textContent = formatNumber(result.totalMinutes);
    formattedElement.textContent = result.formatted;
  }

  function bindTimeConverter() {
    const fields = Object.values(FIELD_IDS)
      .map(getElement)
      .filter(Boolean);

    if (!fields.length) return;

    fields.forEach(field => {
      if (field.dataset.timeConverterBound === "true") return;
      field.dataset.timeConverterBound = "true";
      field.addEventListener("input", renderTimeConverter);
      field.addEventListener("change", renderTimeConverter);
      field.addEventListener("keyup", renderTimeConverter);
    });

    renderTimeConverter();
  }

  function scheduleBind() {
    window.setTimeout(bindTimeConverter, 0);
  }

  document.addEventListener("input", event => {
    if (event.target.closest?.(".time-converter-box")) renderTimeConverter();
  });

  document.addEventListener("change", event => {
    if (event.target.closest?.(".time-converter-box")) renderTimeConverter();
  });

  const observer = new MutationObserver(scheduleBind);

  function start() {
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleBind();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  window.harvestHubInitTimeConverter = bindTimeConverter;
  window.harvestHubUpdateTimeConverter = renderTimeConverter;
})();

(() => {
  const STORAGE_KEY = "harvesthub_turbo_vs_mobile_tab";
  const VALID_TABS = new Set(["turtle", "vs"]);

  function readSavedTab() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return VALID_TABS.has(saved) ? saved : "turtle";
  }

  function saveTab(tab) {
    if (VALID_TABS.has(tab)) localStorage.setItem(STORAGE_KEY, tab);
  }

  function getPageRoot() {
    return document.querySelector(".turbo-content");
  }

  function applyTab(tab = readSavedTab()) {
    if (!VALID_TABS.has(tab)) tab = "turtle";

    const root = getPageRoot();
    if (!root) return;

    root.dataset.activeEvent = tab;

    root.querySelectorAll("[data-turbo-mobile-tab]").forEach(button => {
      const isActive = button.dataset.turboMobileTab === tab;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  function bindTabs() {
    const root = getPageRoot();
    if (!root) return;

    root.querySelectorAll("[data-turbo-mobile-tab]").forEach(button => {
      if (button.dataset.turboMobileTabBound === "true") return;
      button.dataset.turboMobileTabBound = "true";

      button.addEventListener("click", () => {
        const tab = button.dataset.turboMobileTab;
        saveTab(tab);
        applyTab(tab);
      });
    });

    applyTab();
  }

  function scheduleBind() {
    window.setTimeout(bindTabs, 0);
  }

  const observer = new MutationObserver(scheduleBind);

  function start() {
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleBind();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  window.harvestHubTurboVsApplyMobileTab = applyTab;
})();

(() => {
  function cleanupAlliancePage() {
    if (document.querySelector(".alliance-page")) return;
    if (typeof window.harvestHubAllianceCleanup !== "function") return;

    const cleanup = window.harvestHubAllianceCleanup;
    window.harvestHubAllianceCleanup = null;
    cleanup();
  }

  function startObserver() {
    const pageContent = document.getElementById("page-content");
    if (!pageContent) return;

    const observer = new MutationObserver(cleanupAlliancePage);
    observer.observe(pageContent, { childList: true, subtree: false });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else {
    startObserver();
  }
})();
