import {
  loadAlliancePageContext,
  fillAllianceCompactHeader,
  getActiveAllianceId,
  canEditAlliance,
  getEffectiveAllianceRole
} from "../alliance/page-context.js?v=20260726-role-batch-1";
import {
  fetchReservoirActivity,
  ensureReservoirWeek,
  saveReservoirWeekRoster,
  closeReservoirWeek
} from "../alliance/reservoir-api.js?v=20260726-role-batch-1";
import { escapeHtml } from "../alliance/view.js?v=20260726-role-batch-1";
import { setAllianceTableFullscreen } from "../alliance/fullscreen-table.js?v=20260721-1";

const byId = id => document.getElementById(id);
const pad = value => String(value).padStart(2, "0");
const state = { client: null, context: null, week: null, weeks: [], map: new Map(), historyMode: "all" };

const labels = {
  time: { "": "Не указано", match: "Подходит", mismatch: "Не подходит" },
  intent: { "": "Пусто", willing: "Желающий", refusing: "Отказник" },
  assignment: { none: "Не включён", main: "Основа", reserve: "Резерв" },
  attendance: { "": "Не указано", present: "Был", ready: "Был готов зайти", absent_excused: "Не был по уважительной причине", absent: "Не был" }
};

function showMessage(text, type = "info") {
  const box = byId("allianceMessage");
  if (!box) return;
  box.hidden = !text;
  box.textContent = text;
  box.dataset.type = type;
}

function dateValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(parseDate(value));
}

function nearestSunday() {
  const now = new Date();
  const day = now.getDay();
  const distance = day === 0 ? 0 : 7 - day;
  now.setDate(now.getDate() + distance);
  return dateValue(now);
}

function localHour(offset) {
  if (offset === null || offset === undefined || offset === "") return "—";
  const raw = Number(state.week.event_hour_msk) + Number(offset);
  const shift = Math.floor(raw / 24);
  const hour = ((raw % 24) + 24) % 24;
  return `${pad(hour)}${shift > 0 ? " пн" : shift < 0 ? " сб" : ""}`;
}

function entriesForWeek(week) {
  return Array.isArray(week?.alliance_reservoir_participants)
    ? week.alliance_reservoir_participants
    : [];
}

function rowFor(participant) {
  return state.map.get(participant.id) || {
    week_id: state.week.id,
    participant_id: participant.id,
    time_match: null,
    intent: null,
    assignment: "none",
    attendance: null,
    comment: "",
    preferred_assignment: null
  };
}

function score(entry) {
  if (entry.attendance === "present" || entry.attendance === "ready") return 1;
  if (entry.attendance === "absent_excused") return 0;
  if (entry.attendance === "absent") return entry.assignment === "reserve" ? -2 : entry.assignment === "main" ? -1 : 0;
  return 0;
}

function selectOptions(options, selected) {
  return options.map(([value, text]) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(text)}</option>`).join("");
}

function canOverrideClosedWeek() {
  return ["owner", "r5"].includes(getEffectiveAllianceRole(state.context));
}

function controlsLocked() {
  return Boolean(state.week?.closed_at) && !canOverrideClosedWeek();
}

function filteredParticipants() {
  const search = byId("reservoirSearch")?.value.trim().toLowerCase() || "";
  const time = byId("reservoirTimeFilter")?.value || "";
  const intent = byId("reservoirIntentFilter")?.value || "";
  const assignment = byId("reservoirAssignmentFilter")?.value || "";
  const attendance = byId("reservoirAttendanceFilter")?.value || "";
  return state.context.participants.filter(p => p.member_status !== "left").filter(p => {
    const entry = rowFor(p);
    const timeValue = entry.time_match === true ? "match" : entry.time_match === false ? "mismatch" : "empty";
    return (!search || p.nickname.toLowerCase().includes(search))
      && (!time || time === timeValue)
      && (!intent || intent === (entry.intent || "empty"))
      && (!assignment || assignment === entry.assignment)
      && (!attendance || attendance === (entry.attendance || "empty"));
  });
}

function renderTable() {
  const participants = filteredParticipants();
  const locked = controlsLocked();
  byId("reservoirTableBody").innerHTML = participants.map(p => {
    const entry = rowFor(p);
    const timeValue = entry.time_match === true ? "match" : entry.time_match === false ? "mismatch" : "";
    const disabled = locked ? " disabled" : "";
    return `<tr data-participant-id="${escapeHtml(p.id)}">
      <td><strong>${escapeHtml(p.nickname)}</strong></td><td>${escapeHtml(p.rank_name || "—")}</td><td>${escapeHtml(localHour(p.timezone_offset))}</td>
      <td><select data-field="time_match"${disabled}>${selectOptions([["", labels.time[""]],["match",labels.time.match],["mismatch",labels.time.mismatch]], timeValue)}</select></td>
      <td><select data-field="intent"${disabled}>${selectOptions([["",labels.intent[""]],["willing",labels.intent.willing],["refusing",labels.intent.refusing]], entry.intent || "")}</select></td>
      <td><select data-field="assignment"${disabled}>${selectOptions([["none",labels.assignment.none],["main",labels.assignment.main],["reserve",labels.assignment.reserve]], entry.assignment)}</select></td>
      <td><select data-field="attendance"${entry.assignment === "none" || locked ? " disabled" : ""}>${selectOptions([["",labels.attendance[""]],["present",labels.attendance.present],["ready",labels.attendance.ready],["absent_excused",labels.attendance.absent_excused],["absent",labels.attendance.absent]], entry.attendance || "")}</select></td>
      <td><input data-field="comment" type="text" maxlength="1000" value="${escapeHtml(entry.comment || "")}" placeholder="Комментарий"${disabled}></td>
    </tr>`;
  }).join("");
  byId("reservoirEmptyState").hidden = participants.length > 0;
  byId("reservoirEventHour").disabled = locked;
  byId("reservoirSaveButton").disabled = locked;
  updateCounts();
}

function updateCounts() {
  const entries = [...state.map.values()];
  const main = entries.filter(x => x.assignment === "main").length;
  const reserve = entries.filter(x => x.assignment === "reserve").length;
  byId("reservoirMainCount").textContent = `${main}/30`;
  byId("reservoirReserveCount").textContent = `${reserve}/10`;
  byId("reservoirTotalCount").textContent = `${main + reserve}/40`;
}

function collectVisibleRows() {
  document.querySelectorAll("#reservoirTableBody tr[data-participant-id]").forEach(tr => {
    const participantId = tr.dataset.participantId;
    const entry = { ...rowFor({ id: participantId }) };
    tr.querySelectorAll("[data-field]").forEach(control => {
      const field = control.dataset.field;
      if (field === "time_match") entry.time_match = control.value === "" ? null : control.value === "match";
      else if (field === "intent") entry.intent = control.value || null;
      else if (field === "attendance") entry.attendance = control.value || null;
      else entry[field] = control.value;
    });
    if (entry.assignment === "none") entry.attendance = null;
    state.map.set(participantId, entry);
  });
}

function setCurrentWeek(week) {
  state.week = week;
  state.map = new Map(entriesForWeek(week).map(item => [item.participant_id, item]));
  byId("reservoirEventDate").textContent = `${formatDate(week.event_date)}, воскресенье`;
  byId("reservoirEventHour").value = String(week.event_hour_msk);
  renderTable();
  renderHistory();
  if (week.closed_at && !canOverrideClosedWeek()) {
    showMessage("Неделя закрыта. Изменения доступны только владельцу и Р5.", "info");
  }
}

async function reloadActivity(preferredWeekId = state.week?.id) {
  const result = await fetchReservoirActivity(state.client, getActiveAllianceId());
  if (result.error) throw result.error;
  state.weeks = Array.isArray(result.data) ? result.data : [];
  const next = state.weeks.find(item => item.id === preferredWeekId)
    || state.weeks.find(item => item.event_date === nearestSunday())
    || state.weeks[0]
    || null;
  if (next) setCurrentWeek(next);
  return next;
}

function serializeEntries() {
  return [...state.map.values()].map(entry => ({
    participant_id: entry.participant_id,
    time_match: entry.time_match,
    intent: entry.intent,
    assignment: entry.assignment || "none",
    attendance: entry.assignment === "none" ? null : entry.attendance,
    comment: String(entry.comment || "").slice(0, 1000),
    preferred_assignment: entry.preferred_assignment || null
  }));
}

async function saveCurrent(event) {
  if (!state.week || controlsLocked()) return false;
  collectVisibleRows();
  const entries = [...state.map.values()];
  const main = entries.filter(x => x.assignment === "main").length;
  const reserve = entries.filter(x => x.assignment === "reserve").length;
  if (main > 30 || reserve > 10) {
    showMessage("В основе может быть не более 30 участников, в резерве — не более 10.", "error");
    return false;
  }

  const button = event?.currentTarget || byId("reservoirSaveButton");
  if (button) button.disabled = true;
  try {
    const result = await saveReservoirWeekRoster(
      state.client,
      state.week.id,
      Number(byId("reservoirEventHour").value),
      serializeEntries()
    );
    if (result.error) throw result.error;
    await reloadActivity(state.week.id);
    showMessage("Данные недели сохранены одной операцией.", "success");
    return true;
  } catch (error) {
    showMessage(error?.message || "Не удалось сохранить данные недели.", "error");
    return false;
  } finally {
    if (button) button.disabled = controlsLocked();
  }
}

async function closeWeek(event) {
  if (!state.week) return;
  const button = event?.currentTarget || byId("reservoirCloseButton");
  if (button) button.disabled = true;
  try {
    const result = await closeReservoirWeek(state.client, state.week.id);
    if (result.error) throw result.error;
    await reloadActivity(state.week.id);
    showMessage("Неделя закрыта.", "success");
  } catch (error) {
    showMessage(error?.message || "Не удалось закрыть неделю.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function load() {
  state.context = await loadAlliancePageContext(state.client, { force: true });
  fillAllianceCompactHeader(state.context);
  if (!canEditAlliance(state.context)) {
    window.loadPage?.("alliance/members.html");
    throw new Error("Раздел доступен только руководству союза.");
  }

  await reloadActivity();
  const eventDate = nearestSunday();
  let week = state.weeks.find(item => item.event_date === eventDate);
  if (!week) {
    const createResult = await ensureReservoirWeek(state.client, getActiveAllianceId(), eventDate);
    if (createResult.error) throw createResult.error;
    week = createResult.data;
    await reloadActivity(week.id);
  } else if (state.week?.id !== week.id) {
    setCurrentWeek(week);
  }
}

async function openHistoryWeek(weekId) {
  collectVisibleRows();
  const week = state.weeks.find(item => item.id === weekId);
  if (!week) return;
  setCurrentWeek(week);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHistory() {
  const from = byId("reservoirHistoryFrom")?.value || "";
  const to = byId("reservoirHistoryTo")?.value || "";
  const weeks = state.weeks
    .filter(w => w.id !== state.week?.id)
    .filter(w => state.historyMode === "all" || ((!from || w.event_date >= from) && (!to || w.event_date <= to)));
  byId("reservoirHistoryBody").innerHTML = weeks.map(w => {
    const rows = entriesForWeek(w);
    const main = rows.filter(x => x.assignment === "main").length;
    const reserve = rows.filter(x => x.assignment === "reserve").length;
    const total = rows.reduce((sum, row) => sum + score(row), 0);
    return `<tr><td>${escapeHtml(formatDate(w.event_date))}</td><td>${escapeHtml(pad(w.event_hour_msk))}</td><td>${main || "—"}</td><td>${reserve || "—"}</td><td>${rows.length ? total : "—"}</td><td><button type="button" class="secondary-button" data-open-week="${escapeHtml(w.id)}">Открыть</button></td></tr>`;
  }).join("");
  byId("reservoirHistoryEmpty").hidden = weeks.length > 0;
}

function bind() {
  ["reservoirSearch", "reservoirTimeFilter", "reservoirIntentFilter", "reservoirAssignmentFilter", "reservoirAttendanceFilter"].forEach(id => byId(id)?.addEventListener("input", () => {
    collectVisibleRows();
    renderTable();
  }));
  byId("reservoirEventHour")?.addEventListener("change", renderTable);
  byId("reservoirTableBody")?.addEventListener("change", event => {
    if (event.target.dataset.field === "assignment") {
      const tr = event.target.closest("tr");
      tr.querySelector('[data-field="attendance"]').disabled = event.target.value === "none" || controlsLocked();
    }
    collectVisibleRows();
    updateCounts();
  });
  byId("reservoirSaveButton")?.addEventListener("click", saveCurrent);
  byId("reservoirCloseButton")?.addEventListener("click", closeWeek);
  byId("reservoirLayoutButton")?.addEventListener("click", async () => {
    if (await saveCurrent()) window.loadPage?.("alliance/reservoir-layout.html");
  });
  byId("reservoirExpandTable")?.addEventListener("click", () => setAllianceTableFullscreen(byId("reservoirTableContainer"), true));
  byId("reservoirCloseTable")?.addEventListener("click", () => setAllianceTableFullscreen(byId("reservoirTableContainer"), false));
  byId("reservoirHistoryBody")?.addEventListener("click", event => {
    const button = event.target.closest("[data-open-week]");
    if (button) openHistoryWeek(button.dataset.openWeek);
  });
  byId("reservoirShowAllHistory")?.addEventListener("click", () => { state.historyMode = "all"; renderHistory(); });
  byId("reservoirApplyHistory")?.addEventListener("click", () => { state.historyMode = "period"; renderHistory(); });
}

export async function init() {
  state.client = window.harvestHubSupabase;
  bind();
  try { await load(); } catch (error) { showMessage(error.message, "error"); }
}
