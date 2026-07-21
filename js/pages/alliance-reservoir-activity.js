import { loadAlliancePageContext, fillAllianceCompactHeader, getActiveAllianceId, canEditAlliance } from "../alliance/page-context.js?v=20260718-1";
import { fetchReservoirWeeks, ensureReservoirWeek, updateReservoirWeek, fetchReservoirEntries, saveReservoirEntries } from "../alliance/reservoir-api.js?v=20260721-1";

const byId = id => document.getElementById(id);
const pad = value => String(value).padStart(2, "0");
const state = { client: null, context: null, week: null, weeks: [], rows: [], map: new Map(), historyMode: "all" };

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

function rowFor(participant) {
  return state.map.get(participant.id) || {
    week_id: state.week.id,
    participant_id: participant.id,
    time_match: null,
    intent: null,
    assignment: "none",
    attendance: null,
    comment: ""
  };
}

function score(entry) {
  if (entry.attendance === "present" || entry.attendance === "ready") return 1;
  if (entry.attendance === "absent_excused") return 0;
  if (entry.attendance === "absent") return entry.assignment === "reserve" ? -2 : entry.assignment === "main" ? -1 : 0;
  return 0;
}

function selectOptions(options, selected) {
  return options.map(([value, text]) => `<option value="${value}"${value === selected ? " selected" : ""}>${text}</option>`).join("");
}

function filteredParticipants() {
  const search = byId("reservoirSearch").value.trim().toLowerCase();
  const time = byId("reservoirTimeFilter").value;
  const intent = byId("reservoirIntentFilter").value;
  const assignment = byId("reservoirAssignmentFilter").value;
  const attendance = byId("reservoirAttendanceFilter").value;
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
  byId("reservoirTableBody").innerHTML = participants.map(p => {
    const entry = rowFor(p);
    const timeValue = entry.time_match === true ? "match" : entry.time_match === false ? "mismatch" : "";
    return `<tr data-participant-id="${p.id}">
      <td><strong>${p.nickname}</strong></td><td>${p.rank_name || "—"}</td><td>${localHour(p.timezone_offset)}</td>
      <td><select data-field="time_match">${selectOptions([["", labels.time[""]],["match",labels.time.match],["mismatch",labels.time.mismatch]], timeValue)}</select></td>
      <td><select data-field="intent">${selectOptions([["",labels.intent[""]],["willing",labels.intent.willing],["refusing",labels.intent.refusing]], entry.intent || "")}</select></td>
      <td><select data-field="assignment">${selectOptions([["none",labels.assignment.none],["main",labels.assignment.main],["reserve",labels.assignment.reserve]], entry.assignment)}</select></td>
      <td><select data-field="attendance"${entry.assignment === "none" ? " disabled" : ""}>${selectOptions([["",labels.attendance[""]],["present",labels.attendance.present],["ready",labels.attendance.ready],["absent_excused",labels.attendance.absent_excused],["absent",labels.attendance.absent]], entry.attendance || "")}</select></td>
      <td><input data-field="comment" type="text" value="${String(entry.comment || "").replaceAll('"','&quot;')}" placeholder="Комментарий"></td>
    </tr>`;
  }).join("");
  byId("reservoirEmptyState").hidden = participants.length > 0;
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

async function saveCurrent() {
  collectVisibleRows();
  const entries = [...state.map.values()];
  const main = entries.filter(x => x.assignment === "main").length;
  const reserve = entries.filter(x => x.assignment === "reserve").length;
  if (main > 30 || reserve > 10) return showMessage("В основе может быть не более 30 участников, в резерве — не более 10.", "error");
  const weekResult = await updateReservoirWeek(state.client, state.week.id, { event_hour_msk: Number(byId("reservoirEventHour").value), roster_saved_at: new Date().toISOString() });
  if (weekResult.error) return showMessage(weekResult.error.message, "error");
  if (entries.length) {
    const result = await saveReservoirEntries(state.client, entries);
    if (result.error) return showMessage(result.error.message, "error");
  }
  state.week = weekResult.data;
  await reloadEntries();
  showMessage("Данные недели сохранены.", "success");
}

async function closeWeek() {
  const result = await updateReservoirWeek(state.client, state.week.id, { closed_at: new Date().toISOString() });
  if (result.error) return showMessage(result.error.message, "error");
  state.week = result.data;
  showMessage("Неделя закрыта.", "success");
}

async function reloadEntries() {
  const result = await fetchReservoirEntries(state.client, state.week.id);
  if (result.error) throw result.error;
  state.map = new Map((result.data || []).map(item => [item.participant_id, item]));
  renderTable();
  renderHistory();
}

async function load() {
  state.context = await loadAlliancePageContext(state.client);
  fillAllianceCompactHeader(state.context);
  if (!canEditAlliance(state.context)) {
    window.loadPage?.("alliance/members.html");
    throw new Error("Раздел доступен только руководству союза.");
  }
  const allianceId = getActiveAllianceId();
  const weeksResult = await fetchReservoirWeeks(state.client, allianceId);
  if (weeksResult.error) throw weeksResult.error;
  state.weeks = weeksResult.data || [];
  const eventDate = nearestSunday();
  let week = state.weeks.find(item => item.event_date === eventDate);
  if (!week) {
    const createResult = await ensureReservoirWeek(state.client, allianceId, eventDate);
    if (createResult.error) throw createResult.error;
    week = createResult.data;
    state.weeks.unshift(week);
  }
  state.week = week;
  byId("reservoirEventDate").textContent = `${formatDate(week.event_date)}, воскресенье`;
  byId("reservoirEventHour").value = String(week.event_hour_msk);
  await reloadEntries();
}

async function openHistoryWeek(weekId) {
  collectVisibleRows();
  const week = state.weeks.find(item => item.id === weekId);
  if (!week) return;
  state.week = week;
  byId("reservoirEventDate").textContent = `${formatDate(week.event_date)}, воскресенье`;
  byId("reservoirEventHour").value = String(week.event_hour_msk);
  await reloadEntries();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHistory() {
  const from = byId("reservoirHistoryFrom").value;
  const to = byId("reservoirHistoryTo").value;
  const weeks = state.weeks.filter(w => w.id !== state.week.id).filter(w => state.historyMode === "all" || ((!from || w.event_date >= from) && (!to || w.event_date <= to)));
  byId("reservoirHistoryBody").innerHTML = weeks.map(w => {
    const rows = w.id === state.week.id ? [...state.map.values()] : [];
    const main = rows.filter(x => x.assignment === "main").length;
    const reserve = rows.filter(x => x.assignment === "reserve").length;
    const total = rows.reduce((sum, row) => sum + score(row), 0);
    return `<tr><td>${formatDate(w.event_date)}</td><td>${pad(w.event_hour_msk)}</td><td>${main || "—"}</td><td>${reserve || "—"}</td><td>${rows.length ? total : "—"}</td><td><button type="button" class="secondary-button" data-open-week="${w.id}">Открыть</button></td></tr>`;
  }).join("");
  byId("reservoirHistoryEmpty").hidden = weeks.length > 0;
}

function bind() {
  ["reservoirSearch","reservoirTimeFilter","reservoirIntentFilter","reservoirAssignmentFilter","reservoirAttendanceFilter"].forEach(id => byId(id)?.addEventListener("input", () => { collectVisibleRows(); renderTable(); }));
  byId("reservoirEventHour")?.addEventListener("change", renderTable);
  byId("reservoirTableBody")?.addEventListener("change", event => {
    if (event.target.dataset.field === "assignment") {
      const tr = event.target.closest("tr");
      tr.querySelector('[data-field="attendance"]').disabled = event.target.value === "none";
    }
    collectVisibleRows();
    updateCounts();
  });
  byId("reservoirSaveButton")?.addEventListener("click", saveCurrent);
  byId("reservoirCloseButton")?.addEventListener("click", closeWeek);
  byId("reservoirLayoutButton")?.addEventListener("click", async () => { await saveCurrent(); window.loadPage?.("alliance/reservoir-layout.html"); });
  byId("reservoirExpandTable")?.addEventListener("click", () => { byId("reservoirTableContainer").classList.add("is-alliance-table-fullscreen"); document.body.classList.add("alliance-table-fullscreen-open"); });
  byId("reservoirCloseTable")?.addEventListener("click", () => { byId("reservoirTableContainer").classList.remove("is-alliance-table-fullscreen"); document.body.classList.remove("alliance-table-fullscreen-open"); });
  byId("reservoirHistoryBody")?.addEventListener("click", event => { const button = event.target.closest("[data-open-week]"); if (button) openHistoryWeek(button.dataset.openWeek); });
  byId("reservoirShowAllHistory")?.addEventListener("click", () => { state.historyMode = "all"; renderHistory(); });
  byId("reservoirApplyHistory")?.addEventListener("click", () => { state.historyMode = "period"; renderHistory(); });
}

export async function init() {
  state.client = window.harvestHubSupabase;
  bind();
  try { await load(); } catch (error) { showMessage(error.message, "error"); }
}
