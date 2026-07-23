import { fetchAllianceVsStatistics, saveAllianceVsResult, setAllianceVsDailyTarget } from "../alliance/vs-api.js?v=20260718-1";
import { loadAlliancePageContext, fillAllianceCompactHeader, canEditAlliance, getActiveAllianceId } from "../alliance/page-context.js?v=20260718-1";
import { setAllianceTableFullscreen } from "../alliance/fullscreen-table.js?v=20260721-1";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const RANK_WEIGHT = { "Р5": 5, "Р4": 4, "Р3": 3, "Р2": 2, "Р1": 1 };
const byId = id => document.getElementById(id);
const pad = value => String(value).padStart(2, "0");
const state = { client: null, context: null, data: null, weekStart: "" };

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function dateValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(value, days) {
  const date = typeof value === "string" ? parseDate(value) : new Date(value);
  date.setDate(date.getDate() + days);
  return dateValue(date);
}

function getWeekStart(value = new Date()) {
  const date = typeof value === "string" ? parseDate(value) : new Date(value);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return dateValue(date);
}

function formatDate(value) {
  const date = parseDate(value);
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function weekLabel(start) {
  return `${formatDate(start)}–${formatDate(addDays(start, 5))}`;
}

function showMessage(text, type = "info") {
  const box = byId("allianceMessage");
  if (!box) return;
  box.hidden = !text;
  box.textContent = text;
  box.dataset.type = type;
}

function parseScore(value) {
  const normalized = String(value || "").trim().replace(/\s/g, "").replace(",", ".").toUpperCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)([KMBTКМВТ]?)$/);
  if (!match) return null;
  const multiplier = { "": 1e6, K: 1e3, "К": 1e3, M: 1e6, "М": 1e6, B: 1e9, "В": 1e9, T: 1e12, "Т": 1e12 }[match[2]];
  const points = Number(match[1]) * multiplier;
  return Number.isFinite(points) && points >= 0 ? Math.round(points) : null;
}

function formatScore(value) {
  const number = Number(value) || 0;
  if (!number) return "—";
  const unit = [[1e12, "Т"], [1e9, "В"], [1e6, "М"], [1e3, "k"]].find(([size]) => Math.abs(number) >= size);
  if (!unit) return new Intl.NumberFormat("ru-RU").format(number);
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(number / unit[0])}${unit[1]}`;
}

function inputScore(entry) {
  if (!entry) return "";
  if (entry.is_vacation) return "О";
  return entry.points ? formatScore(entry.points) : "0";
}

function participantMetrics(participantId, map) {
  const today = dateValue(new Date());
  const target = Number(state.data?.daily_target) || 5000000;
  let total = 0;
  let completed = 0;
  let counted = 0;
  let vacation = 0;
  const days = DAYS.map((label, index) => {
    const date = addDays(state.weekStart, index);
    const future = date > today;
    const entry = map.get(`${participantId}:${date}`);
    const points = Number(entry?.points) || 0;
    if (!future) {
      counted += 1;
      total += points;
      if (entry?.is_vacation) vacation += 1;
      else if (points >= target) completed += 1;
    }
    return { label, date, future, entry, points, failed: !future && !entry?.is_vacation && points < target, met: !future && !entry?.is_vacation && points >= target };
  });
  const required = counted - vacation;
  const allDone = required > 0 ? completed === required : counted > 0 && vacation === counted;
  return { total, completed, counted, vacation, days, allDone };
}

function sortRows(rows) {
  const sort = byId("vsSort")?.value || "total";
  return rows.sort((a, b) => {
    if (sort === "nickname") return a.nickname.localeCompare(b.nickname, "ru");
    if (sort === "rank") return (RANK_WEIGHT[b.rank_name] || 0) - (RANK_WEIGHT[a.rank_name] || 0) || a.nickname.localeCompare(b.nickname, "ru");
    if (sort.startsWith("day-")) {
      const index = Number(sort.slice(4));
      return (b.metrics.days[index]?.points || 0) - (a.metrics.days[index]?.points || 0) || a.nickname.localeCompare(b.nickname, "ru");
    }
    return b.metrics.total - a.metrics.total || a.nickname.localeCompare(b.nickname, "ru");
  });
}

function renderSummary(rows) {
  const summary = byId("vsSummary");
  if (!rows.length) {
    summary.hidden = true;
    summary.innerHTML = "";
    return;
  }
  const total = rows.reduce((sum, row) => sum + row.metrics.total, 0);
  const complete = rows.filter(row => row.metrics.allDone).length;
  const byTotal = [...rows].sort((a, b) => b.metrics.total - a.metrics.total);
  summary.hidden = false;
  summary.innerHTML = `
    <div><span>Общая сумма союза</span><strong>${formatScore(total)}</strong></div>
    <div><span>Выполнили все дни</span><strong>${complete}</strong></div>
    <div><span>Выполнили не все дни</span><strong>${rows.length - complete}</strong></div>
    <div><span>Выполнили полностью</span><strong>${Math.round(complete / rows.length * 100)}%</strong></div>
    <div><span>Лучший участник</span><strong>${escapeHtml(byTotal[0].nickname)}</strong></div>
    <div><span>Худший участник</span><strong>${escapeHtml(byTotal[byTotal.length - 1].nickname)}</strong></div>`;
}

function buildRows() {
  const map = new Map((state.data?.results || []).map(item => [`${item.participant_id}:${item.result_date}`, item]));
  const active = state.context.participants.filter(item => item.member_status !== "left");
  return sortRows(active.map(item => ({ ...item, metrics: participantMetrics(item.id, map) })));
}

function renderBulk(rows) {
  const body = byId("vsBulkBody");
  if (!body) return;
  body.innerHTML = rows.map(row => `
    <tr data-vs-bulk-participant="${row.id}">
      <td><strong>${escapeHtml(row.nickname)}</strong><small>${escapeHtml(row.rank_name || "—")}</small></td>
      ${row.metrics.days.map((day, index) => `<td><input type="text" inputmode="decimal" data-vs-bulk-day="${index}" value="${escapeHtml(inputScore(day.entry))}" ${day.future ? "disabled" : ""} data-no-persist="true"></td>`).join("")}
    </tr>`).join("");
  byId("vsBulkWeekLabel").textContent = `Неделя ${weekLabel(state.weekStart)}`;
}

function render() {
  fillAllianceCompactHeader(state.context);
  byId("vsEditorCard").hidden = false;
  byId("vsTargetCard").hidden = false;
  byId("vsCurrentWeekLabel").textContent = `Неделя ${weekLabel(state.weekStart)}`;
  byId("vsTableWeekTitle").textContent = `Неделя ${weekLabel(state.weekStart)}`;
  byId("vsDailyTarget").value = formatScore(state.data?.daily_target || 5000000);

  const activeParticipants = state.context.participants.filter(item => item.member_status !== "left");
  const participantSelect = byId("vsParticipant");
  const selectedParticipant = participantSelect.value;
  participantSelect.innerHTML = activeParticipants.map(item => `<option value="${item.id}">${escapeHtml(item.nickname)}</option>`).join("");
  if ([...participantSelect.options].some(option => option.value === selectedParticipant)) participantSelect.value = selectedParticipant;

  const rows = buildRows();
  byId("vsTableHead").innerHTML = `<tr><th>Место</th><th>Участник</th>${DAYS.map(day => `<th>${day}</th>`).join("")}<th>Общая сумма</th><th>Выполнено дней</th><th></th></tr>`;
  byId("vsTableBody").innerHTML = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(row.nickname)}</strong><small>${escapeHtml(row.rank_name || "—")}</small></td>
      ${row.metrics.days.map(day => `<td class="${day.failed ? "vs-cell-failed" : day.met ? "vs-cell-met" : ""}">${day.future ? "" : day.entry?.is_vacation ? "О" : formatScore(day.points)}</td>`).join("")}
      <td><strong>${formatScore(row.metrics.total)}</strong></td>
      <td>${row.metrics.completed} из ${row.metrics.counted - row.metrics.vacation}</td>
      <td><button type="button" class="secondary-button vs-row-edit" data-vs-edit="${row.id}">Изменить</button></td>
    </tr>`).join("");
  byId("vsCount").textContent = `${rows.length} участников`;
  byId("vsEmptyState").hidden = rows.length > 0;
  renderSummary(rows);
  renderBulk(rows);
}

function syncDateFromDay() {
  byId("vsResultDate").value = addDays(state.weekStart, Number(byId("vsDay").value));
}

function syncDayFromDate() {
  const value = byId("vsResultDate").value;
  if (!value) return;
  const day = (parseDate(value).getDay() || 7) - 1;
  if (day > 5) return showMessage("Для VS можно выбрать дату с понедельника по субботу.", "error");
  byId("vsDay").value = String(day);
  const nextWeekStart = getWeekStart(value);
  if (nextWeekStart !== state.weekStart) {
    state.weekStart = nextWeekStart;
    reload();
  }
}

async function reload() {
  state.context = await loadAlliancePageContext(state.client);
  if (!canEditAlliance(state.context)) {
    window.loadPage?.("alliance/members.html");
    return;
  }
  const result = await fetchAllianceVsStatistics(state.client, getActiveAllianceId(), state.weekStart, addDays(state.weekStart, 5));
  if (result.error) throw result.error;
  state.data = result.data || { results: [], daily_target: 5000000 };
  render();
}

function editParticipant(participantId) {
  byId("vsParticipant").value = participantId;
  const resultDate = byId("vsResultDate").value || addDays(state.weekStart, Number(byId("vsDay").value));
  const entry = state.data?.results?.find(item => item.participant_id === participantId && item.result_date === resultDate);
  byId("vsPoints").value = entry?.points ? formatScore(entry.points) : "";
  byId("vsVacation").checked = Boolean(entry?.is_vacation);
  byId("vsPoints").disabled = byId("vsVacation").checked;
  byId("vsEditorTitle").textContent = `Изменить: ${byId("vsParticipant").selectedOptions[0]?.textContent || "участник"}`;
  byId("vsEditCancel").hidden = false;
  byId("vsEditorCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetEditor() {
  byId("vsEditorTitle").textContent = "Внести результат VS";
  byId("vsEditCancel").hidden = true;
  byId("vsPoints").value = "";
  byId("vsVacation").checked = false;
  byId("vsPoints").disabled = false;
}

async function saveResult(event) {
  event.preventDefault();
  const resultDate = byId("vsResultDate").value;
  if (!resultDate) return showMessage("Выбери дату.", "error");
  const weekday = (parseDate(resultDate).getDay() || 7) - 1;
  if (weekday > 5) return showMessage("Для VS можно выбрать дату с понедельника по субботу.", "error");
  if (resultDate > dateValue(new Date())) return showMessage("Будущую дату пока нельзя сохранить.", "error");
  const vacation = byId("vsVacation").checked;
  const points = vacation ? null : parseScore(byId("vsPoints").value);
  if (!vacation && points === null) return showMessage("Проверь формат очков.", "error");
  const button = event.submitter;
  button.disabled = true;
  const { error } = await saveAllianceVsResult(state.client, getActiveAllianceId(), { participantId: byId("vsParticipant").value, resultDate, points, isVacation: vacation });
  button.disabled = false;
  if (error) return showMessage(error.message, "error");
  state.weekStart = getWeekStart(resultDate);
  resetEditor();
  await reload();
  showMessage("Результат сохранён.", "success");
}

async function saveBulk() {
  const button = byId("vsBulkSave");
  const rows = [...document.querySelectorAll("[data-vs-bulk-participant]")];
  const changes = [];

  for (const row of rows) {
    for (const input of row.querySelectorAll("[data-vs-bulk-day]")) {
      if (input.disabled) continue;
      const raw = input.value.trim();
      if (!raw) continue;
      const vacation = raw.toUpperCase() === "О";
      const points = vacation ? null : parseScore(raw);
      if (!vacation && points === null) {
        input.focus();
        return showMessage("Проверь значение в общей таблице. Число без буквы считается миллионами; также можно использовать K/M/B/T или букву «О».", "error");
      }
      changes.push({
        participantId: row.dataset.vsBulkParticipant,
        resultDate: addDays(state.weekStart, Number(input.dataset.vsBulkDay)),
        points,
        isVacation: vacation
      });
    }
  }

  if (!changes.length) return showMessage("В общей таблице нет заполненных значений.", "error");
  button.disabled = true;
  for (const change of changes) {
    const { error } = await saveAllianceVsResult(state.client, getActiveAllianceId(), change);
    if (error) {
      button.disabled = false;
      return showMessage(error.message, "error");
    }
  }
  button.disabled = false;
  byId("vsBulkCard").hidden = true;
  await reload();
  showMessage("Результаты недели сохранены.", "success");
}

async function saveTarget(event) {
  event.preventDefault();
  const target = parseScore(byId("vsDailyTarget").value);
  if (!target) return showMessage("Укажи норматив больше нуля.", "error");
  const button = event.submitter;
  button.disabled = true;
  const { error } = await setAllianceVsDailyTarget(state.client, getActiveAllianceId(), target);
  button.disabled = false;
  if (error) return showMessage(error.message, "error");
  await reload();
  showMessage("Норматив сохранён.", "success");
}

function toggleFullscreen(open) {
  setAllianceTableFullscreen(byId("vsCurrentTableContainer"), open);
}

export async function init() {
  state.client = window.harvestHubSupabase;
  const today = new Date();
  const todayDay = (today.getDay() || 7) - 1;
  state.weekStart = getWeekStart(today);
  byId("vsDay").value = String(Math.min(5, Math.max(0, todayDay)));
  byId("vsResultDate").value = dateValue(todayDay > 5 ? parseDate(addDays(state.weekStart, 5)) : today);
  try { await reload(); } catch (error) { showMessage(error.message, "error"); return; }
  byId("vsDay")?.addEventListener("change", syncDateFromDay);
  byId("vsResultDate")?.addEventListener("change", syncDayFromDate);
  byId("vsVacation")?.addEventListener("change", () => { byId("vsPoints").disabled = byId("vsVacation").checked; });
  byId("vsResultForm")?.addEventListener("submit", saveResult);
  byId("vsTargetForm")?.addEventListener("submit", saveTarget);
  byId("vsEditCancel")?.addEventListener("click", resetEditor);
  byId("vsSort")?.addEventListener("change", render);
  byId("vsTableBody")?.addEventListener("click", event => {
    const button = event.target.closest("[data-vs-edit]");
    if (button) editParticipant(button.dataset.vsEdit);
  });
  byId("vsBulkOpen")?.addEventListener("click", () => {
    renderBulk(buildRows());
    byId("vsBulkCard").hidden = false;
    byId("vsBulkCard").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  byId("vsBulkClose")?.addEventListener("click", () => { byId("vsBulkCard").hidden = true; });
  byId("vsBulkSave")?.addEventListener("click", saveBulk);
  byId("vsExpandTable")?.addEventListener("click", () => toggleFullscreen(true));
  byId("vsCloseTable")?.addEventListener("click", () => toggleFullscreen(false));
}