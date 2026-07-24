import { loadAlliancePageContext } from "./page-context.js?v=20260718-1";

const ALLIANCE_PAGE_PREFIX = "alliance/";
const TWIN_NOTE_CLASS = "alliance-twin-context";

let observer = null;
let scheduled = false;
let twinByNickname = new Map();

function normalize(value) {
  return String(value || "").trim();
}

function primaryNickname(participant, participants) {
  if (participant.primary_nickname) return participant.primary_nickname;
  if (!participant.primary_participant_id) return "";
  return participants.find(item => item.id === participant.primary_participant_id)?.nickname || "";
}

function buildTwinMap(participants) {
  return new Map(
    participants
      .filter(item => item.is_twin)
      .map(item => [normalize(item.nickname), {
        nickname: normalize(item.nickname),
        primary: normalize(primaryNickname(item, participants))
      }])
      .filter(([nickname]) => nickname)
  );
}

function noteText(twin) {
  return twin.primary ? `Твин · основа: ${twin.primary}` : "Твин";
}

function hasTwinNote(container) {
  if (!container) return false;
  if (container.querySelector?.(`.${TWIN_NOTE_CLASS}`)) return true;
  return [...(container.querySelectorAll?.("small") || [])].some(item => /твин/i.test(item.textContent || "") && /основа/i.test(item.textContent || ""));
}

function appendNote(anchor, twin) {
  const container = anchor.parentElement;
  if (!container || hasTwinNote(container)) return;
  const note = document.createElement("small");
  note.className = TWIN_NOTE_CLASS;
  note.textContent = noteText(twin);
  anchor.insertAdjacentElement("afterend", note);
}

function decorateStrongNames(root) {
  root.querySelectorAll("table td strong").forEach(anchor => {
    const twin = twinByNickname.get(normalize(anchor.textContent));
    if (twin) appendNote(anchor, twin);
  });
}

function decoratePlainTableCells(root) {
  root.querySelectorAll("table td").forEach(cell => {
    if (cell.querySelector("strong") || hasTwinNote(cell)) return;
    const twin = twinByNickname.get(normalize(cell.textContent));
    if (!twin) return;
    const note = document.createElement("small");
    note.className = TWIN_NOTE_CLASS;
    note.textContent = noteText(twin);
    cell.append(note);
  });
}

function decorateOptions(root) {
  root.querySelectorAll("select option").forEach(option => {
    if (option.dataset.twinLabelApplied === "true") return;
    const current = normalize(option.textContent);
    const twin = twinByNickname.get(current);
    if (!twin) return;
    option.textContent = `${current} — ${noteText(twin).toLowerCase()}`;
    option.dataset.twinLabelApplied = "true";
  });
}

function decorateReservoirLists(root) {
  const selectors = [
    ".reservoir-player-chip > span",
    ".reservoir-assigned-player > span",
    "[data-picker-player] > span"
  ];
  root.querySelectorAll(selectors.join(",")).forEach(anchor => {
    const current = normalize(anchor.textContent).replace(/\s·\sрезерв$/i, "");
    const twin = twinByNickname.get(current);
    if (twin) appendNote(anchor, twin);
  });
}

function applyTwinLabels() {
  scheduled = false;
  const root = document.getElementById("page-content");
  if (!root || twinByNickname.size === 0) return;
  decorateStrongNames(root);
  decoratePlainTableCells(root);
  decorateOptions(root);
  decorateReservoirLists(root);
}

function scheduleApply() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(applyTwinLabels);
}

async function initForAlliancePage(pageName) {
  observer?.disconnect();
  observer = null;
  twinByNickname = new Map();
  if (!String(pageName || "").startsWith(ALLIANCE_PAGE_PREFIX)) return;

  const client = window.harvestHubSupabase;
  if (!client) return;
  const context = await loadAlliancePageContext(client, { requireAlliance: false });
  twinByNickname = buildTwinMap(context.participants || []);
  scheduleApply();

  const root = document.getElementById("page-content");
  if (!root || twinByNickname.size === 0) return;
  observer = new MutationObserver(scheduleApply);
  observer.observe(root, { childList: true, subtree: true });
}

function currentPage() {
  return window.harvestHubNavigation?.getCurrentPage?.() || localStorage.getItem("currentPage") || "";
}

document.addEventListener("harvesthub:page-loaded", event => {
  initForAlliancePage(event.detail?.pageName).catch(error => console.warn("Не удалось добавить подписи твинов:", error));
});

window.setTimeout(() => {
  initForAlliancePage(currentPage()).catch(error => console.warn("Не удалось добавить подписи твинов:", error));
}, 0);
