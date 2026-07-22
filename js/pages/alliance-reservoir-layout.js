import { loadAlliancePageContext, fillAllianceCompactHeader, getActiveAllianceId, canEditAlliance } from "../alliance/page-context.js?v=20260718-1";
import { fetchReservoirWeeks, fetchReservoirEntries } from "../alliance/reservoir-api.js?v=20260721-1";
import { fetchReservoirLayout, saveReservoirLayout, resetReservoirLayout } from "../alliance/reservoir-layout-api.js?v=20260722-1";
import { fetchAllianceSquadPower } from "../alliance/power-api.js?v=20260718-50";

const byId = id => document.getElementById(id);
const state = {
  client: null,
  context: null,
  week: null,
  canEdit: false,
  roster: [],
  powers: new Map(),
  assignments: new Map(),
  notes: new Map(),
  generalComment: "",
  publishedAt: null,
  rosterTab: "main",
  pickerTab: "main",
  pickerLocation: null
};

const LOCATIONS = [
  { key: "treatment_1", name: "Водоочистительный центр 1", x: 37, y: 70, repeatGroup: "primary", points: "6000", rate: "1200/мин" },
  { key: "treatment_2", name: "Водоочистительный центр 2", x: 72, y: 20, repeatGroup: "primary", points: "6000", rate: "1200/мин" },
  { key: "processing_1", name: "Водообрабатывающий завод 1", x: 25, y: 70, repeatGroup: "primary", points: "3000", rate: "600/мин" },
  { key: "processing_2", name: "Водообрабатывающий завод 2", x: 84, y: 18, repeatGroup: "primary", points: "3000", rate: "600/мин" },
  { key: "processing_3", name: "Водообрабатывающий завод 3", x: 35, y: 15, repeatGroup: "primary", points: "3000", rate: "600/мин" },
  { key: "processing_4", name: "Водообрабатывающий завод 4", x: 72, y: 76, repeatGroup: "primary", points: "3000", rate: "600/мин" },
  { key: "solar", name: "Солнечная электростанция", x: 18, y: 25, repeatGroup: "primary", points: "1200", rate: "240/мин", effect: "Время захвата −50%" },
  { key: "helipad", name: "Заброшенная вертолётная площадка", x: 88, y: 63, repeatGroup: "primary", points: "1200", rate: "240/мин", effect: "Откат релокатора −50%" },
  { key: "central", name: "Центральный резервуар", x: 51, y: 48, points: "9000", rate: "1800/мин" },
  { key: "development", name: "Комплекс разработки", x: 43, y: 30, points: "1200", rate: "240/мин" },
  { key: "military", name: "Военный завод", x: 66, y: 57, points: "1200", rate: "240/мин", effect: "+15% к атаке и защите" }
];

const COLLECTORS = [
  { key: "collectors_nw", x: 35, y: 43 },
  { key: "collectors_ne", x: 74, y: 39 },
  { key: "collectors_sw", x: 46, y: 67 },
  { key: "collectors_se", x: 63, y: 68 }
];

function showMessage(text, type = "info") {
  const box = byId("allianceMessage");
  if (!box) return;
  box.hidden = !text;
  box.textContent = text;
  box.dataset.type = type;
}

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function formatPower(value) {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(Number(value));
}

function playerById(id) {
  return state.roster.find(item => item.participant_id === id);
}

function locationAssignments(key) {
  return state.assignments.get(key) || [];
}

function totalLocationPower(key) {
  return locationAssignments(key).reduce((sum, id) => sum + (Number(state.powers.get(id)) || 0), 0);
}

function isAssignedAnywhere(participantId) {
  return [...state.assignments.values()].some(ids => ids.includes(participantId));
}

function repeatedPrimaryAssignment(participantId, locationKey) {
  const target = LOCATIONS.find(item => item.key === locationKey);
  if (target?.repeatGroup !== "primary") return false;
  return LOCATIONS.some(location => location.key !== locationKey && location.repeatGroup === "primary" && locationAssignments(location.key).includes(participantId));
}

function renderMap() {
  const map = byId("reservoirMap");
  map.innerHTML = `
    <span class="reservoir-map-side reservoir-map-side-blue">Команда синих</span>
    <span class="reservoir-map-side reservoir-map-side-red">Команда красных</span>
    ${COLLECTORS.map(group => `<button type="button" class="reservoir-map-collectors" data-collector="${group.key}" style="left:${group.x}%;top:${group.y}%" aria-label="Водосборники"><span></span><span></span><span></span></button>`).join("")}
    ${LOCATIONS.map(location => {
      const count = locationAssignments(location.key).length;
      return `<button type="button" class="reservoir-map-location" data-location-key="${location.key}" style="left:${location.x}%;top:${location.y}%">
        <span class="reservoir-map-building"></span>
        <span class="reservoir-map-location-name">${location.name}</span>
        ${state.canEdit ? `<strong class="reservoir-map-count">${count}</strong>` : ""}
      </button>`;
    }).join("")}`;

  if (state.canEdit) {
    map.querySelectorAll("[data-location-key]").forEach(button => {
      button.addEventListener("dragover", event => event.preventDefault());
      button.addEventListener("drop", event => {
        event.preventDefault();
        const participantId = event.dataTransfer.getData("text/plain");
        if (participantId) addPlayer(button.dataset.locationKey, participantId);
      });
    });
  }
}

function showLocationCard(locationKey, anchor) {
  const location = LOCATIONS.find(item => item.key === locationKey);
  if (!location) return;
  const playerNames = locationAssignments(locationKey).map(id => playerById(id)?.nickname).filter(Boolean);
  const note = state.notes.get(locationKey) || "";
  const popover = byId("reservoirLocationPopover");
  popover.innerHTML = `<strong>${location.name}</strong><span>${location.points} очков · ${location.rate}</span>${location.effect ? `<span>${location.effect}</span>` : ""}${state.publishedAt && playerNames.length ? `<span>Игроки: ${playerNames.join(", ")}</span>` : ""}${note ? `<span>${note}</span>` : ""}`;
  popover.hidden = false;
  const mapRect = byId("reservoirMap").getBoundingClientRect();
  const rect = anchor.getBoundingClientRect();
  popover.style.left = `${Math.max(8, Math.min(mapRect.width - 280, rect.left - mapRect.left))}px`;
  popover.style.top = `${Math.max(8, rect.bottom - mapRect.top + 8)}px`;
}

function renderPlayerPool() {
  const search = byId("reservoirPlayerSearch")?.value.trim().toLowerCase() || "";
  const players = state.roster.filter(item => item.assignment === state.rosterTab).filter(item => !search || item.nickname.toLowerCase().includes(search));
  byId("reservoirPlayerPool").innerHTML = players.map(item => `<button type="button" class="reservoir-player-chip${isAssignedAnywhere(item.participant_id) ? " is-assigned" : ""}" draggable="true" data-player-id="${item.participant_id}"><span>${item.nickname}</span><strong>${formatPower(state.powers.get(item.participant_id))}</strong>${item.assignment === "reserve" ? `<small>Р</small>` : ""}</button>`).join("");
  byId("reservoirPlayerPool").querySelectorAll("[draggable=true]").forEach(chip => chip.addEventListener("dragstart", event => event.dataTransfer.setData("text/plain", chip.dataset.playerId)));
}

function renderPlacementGrid() {
  byId("reservoirPlacementGrid").innerHTML = LOCATIONS.map(location => {
    const ids = locationAssignments(location.key);
    return `<section class="reservoir-location-column" data-location-column="${location.key}">
      <header><div><strong>${location.name}</strong><span>${ids.length} игроков · ${formatPower(totalLocationPower(location.key))} БМ</span></div><button type="button" class="secondary-button" data-add-player="${location.key}">Добавить</button></header>
      <div class="reservoir-location-players">${ids.map(id => {
        const player = playerById(id);
        if (!player) return "";
        return `<div class="reservoir-assigned-player"><span>${player.nickname}</span><strong>${formatPower(state.powers.get(id))}</strong>${player.assignment === "reserve" ? `<small>Р</small>` : ""}<button type="button" data-remove-player="${id}" data-location-key="${location.key}" aria-label="Убрать">×</button></div>`;
      }).join("")}</div>
      <textarea data-location-note="${location.key}" rows="2" placeholder="Комментарий к локации">${state.notes.get(location.key) || ""}</textarea>
    </section>`;
  }).join("");
  renderWarnings();
}

function renderPublished() {
  const view = byId("reservoirPublishedView");
  if (state.canEdit || !state.publishedAt) {
    view.hidden = true;
    return;
  }
  view.hidden = false;
  byId("reservoirPublishedGrid").innerHTML = LOCATIONS.map(location => {
    const names = locationAssignments(location.key).map(id => playerById(id)?.nickname).filter(Boolean);
    const note = state.notes.get(location.key) || "";
    return `<section><strong>${location.name}</strong><p>${names.length ? names.join(", ") : "—"}</p>${note ? `<small>${note}</small>` : ""}</section>`;
  }).join("");
  const comment = byId("reservoirPublishedComment");
  comment.hidden = !state.generalComment;
  comment.textContent = state.generalComment;
}

function renderWarnings() {
  const warnings = [];
  const assigned = new Set([...state.assignments.values()].flat());
  const unassigned = state.roster.filter(item => !assigned.has(item.participant_id));
  if (unassigned.length) warnings.push(`Не распределены: ${unassigned.length}`);
  const missingPower = state.roster.filter(item => !state.powers.get(item.participant_id));
  if (missingPower.length) warnings.push(`Нет БМ: ${missingPower.length}`);
  const duplicateNames = state.roster.filter(player => LOCATIONS.filter(location => location.repeatGroup === "primary" && locationAssignments(location.key).includes(player.participant_id)).length > 1).map(item => item.nickname);
  if (duplicateNames.length) warnings.push(`Повторные назначения: ${duplicateNames.join(", ")}`);
  const box = byId("reservoirWarnings");
  box.hidden = warnings.length === 0;
  box.innerHTML = warnings.map(text => `<span>${text}</span>`).join("");
}

function renderAll() {
  renderMap();
  renderPlayerPool();
  renderPlacementGrid();
  renderPublished();
}

function addPlayer(locationKey, participantId) {
  const ids = [...locationAssignments(locationKey)];
  if (ids.includes(participantId)) return;
  if (repeatedPrimaryAssignment(participantId, locationKey)) showMessage("Игрок уже назначен на другую локацию.", "warning");
  ids.push(participantId);
  state.assignments.set(locationKey, ids);
  renderAll();
}

function removePlayer(locationKey, participantId) {
  state.assignments.set(locationKey, locationAssignments(locationKey).filter(id => id !== participantId));
  renderAll();
}

function openPicker(locationKey) {
  state.pickerLocation = locationKey;
  byId("reservoirPickerTitle").textContent = LOCATIONS.find(item => item.key === locationKey)?.name || "Добавить игрока";
  byId("reservoirPlayerPicker").hidden = false;
  renderPicker();
}

function renderPicker() {
  const search = byId("reservoirPickerSearch")?.value.trim().toLowerCase() || "";
  const players = state.roster.filter(item => item.assignment === state.pickerTab).filter(item => !search || item.nickname.toLowerCase().includes(search));
  byId("reservoirPickerList").innerHTML = players.map(item => `<button type="button" data-picker-player="${item.participant_id}"><span>${item.nickname}${item.assignment === "reserve" ? " · резерв" : ""}</span><strong>${formatPower(state.powers.get(item.participant_id))}</strong>${isAssignedAnywhere(item.participant_id) ? `<small>Уже назначен</small>` : ""}</button>`).join("");
}

function collectNotes() {
  document.querySelectorAll("[data-location-note]").forEach(field => state.notes.set(field.dataset.locationNote, field.value));
  state.generalComment = byId("reservoirGeneralComment")?.value || "";
}

async function save(publish = false) {
  collectNotes();
  const assignments = [];
  LOCATIONS.forEach(location => locationAssignments(location.key).forEach((participantId, index) => assignments.push({ locationKey: location.key, participantId, sortOrder: index })));
  const result = await saveReservoirLayout(state.client, state.week.id, {
    assignments,
    notes: [...state.notes.entries()].map(([locationKey, comment]) => ({ locationKey, comment })),
    generalComment: state.generalComment,
    publishedAt: publish ? new Date().toISOString() : state.publishedAt
  });
  if (result.error) return showMessage(result.error.message, "error");
  if (publish) state.publishedAt = new Date().toISOString();
  showMessage(publish ? "Расстановка опубликована для союза." : "Черновик сохранён.", "success");
  renderAll();
}

async function reset() {
  const result = await resetReservoirLayout(state.client, state.week.id);
  if (result.error) return showMessage(result.error.message, "error");
  state.assignments.clear();
  state.notes.clear();
  state.generalComment = "";
  state.publishedAt = null;
  byId("reservoirGeneralComment").value = "";
  renderAll();
  showMessage("Расстановка сброшена.", "success");
}

async function copyLayout() {
  collectNotes();
  const lines = [`Резервуар — ${formatDate(state.week.event_date)}, ${String(state.week.event_hour_msk).padStart(2, "0")} МСК`, ""];
  LOCATIONS.forEach(location => {
    const names = locationAssignments(location.key).map(id => playerById(id)?.nickname).filter(Boolean);
    if (!names.length) return;
    lines.push(`${location.name}:`, names.join(", "), "");
  });
  if (state.generalComment) lines.push("Комментарий:", state.generalComment);
  await navigator.clipboard.writeText(lines.join("\n").trim());
  showMessage("Расстановка скопирована.", "success");
}

function bind() {
  byId("reservoirMap")?.addEventListener("click", event => {
    const location = event.target.closest("[data-location-key]");
    if (location) showLocationCard(location.dataset.locationKey, location);
    const collectors = event.target.closest("[data-collector]");
    if (collectors) {
      const popover = byId("reservoirLocationPopover");
      popover.innerHTML = `<strong>Водосборники</strong><span>${state.notes.get(collectors.dataset.collector) || "Комментарий не добавлен"}</span>`;
      popover.hidden = false;
    }
  });
  document.addEventListener("click", event => {
    if (!event.target.closest("#reservoirMap") && !event.target.closest("#reservoirLocationPopover")) byId("reservoirLocationPopover").hidden = true;
  });
  document.querySelectorAll("[data-roster-tab]").forEach(button => button.addEventListener("click", () => {
    state.rosterTab = button.dataset.rosterTab;
    document.querySelectorAll("[data-roster-tab]").forEach(item => item.classList.toggle("is-active", item === button));
    renderPlayerPool();
  }));
  document.querySelectorAll("[data-picker-tab]").forEach(button => button.addEventListener("click", () => {
    state.pickerTab = button.dataset.pickerTab;
    document.querySelectorAll("[data-picker-tab]").forEach(item => item.classList.toggle("is-active", item === button));
    renderPicker();
  }));
  byId("reservoirPlayerSearch")?.addEventListener("input", renderPlayerPool);
  byId("reservoirPickerSearch")?.addEventListener("input", renderPicker);
  byId("reservoirPlacementGrid")?.addEventListener("click", event => {
    const add = event.target.closest("[data-add-player]");
    if (add) openPicker(add.dataset.addPlayer);
    const remove = event.target.closest("[data-remove-player]");
    if (remove) removePlayer(remove.dataset.locationKey, remove.dataset.removePlayer);
  });
  byId("reservoirPickerList")?.addEventListener("click", event => {
    const player = event.target.closest("[data-picker-player]");
    if (!player) return;
    addPlayer(state.pickerLocation, player.dataset.pickerPlayer);
    byId("reservoirPlayerPicker").hidden = true;
  });
  byId("reservoirPickerClose")?.addEventListener("click", () => { byId("reservoirPlayerPicker").hidden = true; });
  byId("reservoirSaveDraft")?.addEventListener("click", () => save(false));
  byId("reservoirPublish")?.addEventListener("click", () => save(true));
  byId("reservoirCopy")?.addEventListener("click", copyLayout);
  byId("reservoirReset")?.addEventListener("click", reset);
}

async function load() {
  state.context = await loadAlliancePageContext(state.client);
  fillAllianceCompactHeader(state.context);
  state.canEdit = canEditAlliance(state.context);
  const allianceId = getActiveAllianceId();
  const weeksResult = await fetchReservoirWeeks(state.client, allianceId);
  if (weeksResult.error) throw weeksResult.error;
  state.week = (weeksResult.data || [])[0];
  if (!state.week) throw new Error("Сначала сохрани состав текущей недели на странице активности.");
  byId("reservoirLayoutWeek").textContent = `${formatDate(state.week.event_date)} · ${String(state.week.event_hour_msk).padStart(2, "0")} МСК`;

  const [entriesResult, layoutResult, powerResult] = await Promise.all([
    fetchReservoirEntries(state.client, state.week.id),
    fetchReservoirLayout(state.client, state.week.id),
    fetchAllianceSquadPower(state.client, allianceId)
  ]);
  if (entriesResult.error) throw entriesResult.error;
  if (layoutResult.error) throw layoutResult.error;

  const selected = (entriesResult.data || []).filter(item => item.assignment === "main" || item.assignment === "reserve");
  state.roster = selected.map(entry => {
    const participant = state.context.participants.find(item => item.id === entry.participant_id);
    return { participant_id: entry.participant_id, nickname: participant?.nickname || "Участник вышел из союза", assignment: entry.assignment };
  });
  const powerRows = powerResult.data?.participants || [];
  powerRows.forEach(item => state.powers.set(item.participant_id, item.squad_1));
  state.roster.sort((a, b) => (Number(state.powers.get(b.participant_id)) || 0) - (Number(state.powers.get(a.participant_id)) || 0) || a.nickname.localeCompare(b.nickname, "ru"));

  const layoutData = layoutResult.data;
  state.publishedAt = layoutData.layout?.published_at || null;
  state.generalComment = layoutData.layout?.general_comment || "";
  byId("reservoirGeneralComment").value = state.generalComment;
  layoutData.assignments.forEach(item => {
    const ids = state.assignments.get(item.location_key) || [];
    ids.push(item.participant_id);
    state.assignments.set(item.location_key, ids);
  });
  layoutData.notes.forEach(item => state.notes.set(item.location_key, item.comment));

  byId("reservoirLayoutEditor").hidden = !state.canEdit;
  renderAll();
}

export async function init() {
  state.client = window.harvestHubSupabase;
  bind();
  try { await load(); } catch (error) { showMessage(error.message, "error"); }
}
