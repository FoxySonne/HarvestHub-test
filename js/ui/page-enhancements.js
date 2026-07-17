import "./text-polish.js";
import "./time-converter.js";
import "./turbo-mobile-tabs.js";

const PROFILE_BLOCK_STATE_PREFIX = "harvesthub_profile_block_state:";

function getProfileBlockScope() {
  const profileId = window.getActiveDataProfileId?.() || "";
  return profileId ? `profile:${profileId}` : "local";
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
