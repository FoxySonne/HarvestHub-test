import { fetchAllianceVsStatistics, saveAllianceVsResult, setAllianceVsDailyTarget } from "./vs-api.js?v=20260718-1";
import { ACTIVE_ALLIANCE_STORAGE_KEY } from "./config.js";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const state = { client: null, data: null, mode: "week", expanded: false, collapsedPast: true };
const byId = id => document.getElementById(id);
const pad = value => String(value).padStart(2, "0");

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

function weekStart(value = new Date()) {
  const date = typeof value === "string" ? parseDate(value) : new Date(value);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return dateValue(date);
}

function formatDate(value, year = true) {
  const date = parseDate(value);
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}${year ? `.${date.getFullYear()}` : ""}`;
}

function weekLabel(start) {
  return `${formatDate(start, false)}–${formatDate(addDays(start, 5))}`;
}

function activeAllianceId() {
  return localStorage.getItem(ACTIVE_ALLIANCE_STORAGE_KEY) || "";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function parseScore(value) {
  const normalized = String(value || "").trim().replace(/\s/g, "").replace(",", ".").toUpperCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)([KMBTКМВТ]?)$/);
  if (!match) return null;
  const multiplier = { "": 1, K: 1e3, "К": 1e3, M: 1e6, "М": 1e6, B: 1e9, "В": 1e9, T: 1e12, "Т": 1e12 }[match[2]];
  const points = Number(match[1]) * multiplier;
  return Number.isFinite(points) && points >= 0 ? Math.round(points) : null;
}

function formatScore(value) {
  const number = Number(value) || 0;
  if (!number) return "—";
  const units = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  const unit = units.find(([size]) => number >= size);
  if (!unit) return new Intl.NumberFormat("ru-RU").format(number);
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(number / unit[0])}${unit[1]}`;
}

function makeWeekOptions() {
  const current = weekStart();
  const values = [];
  for (let offset = 0; offset >= -52; offset -= 1) values.push(addDays(current, offset * 7));
  return values.map(value => `<option value="${value}">${weekLabel(value)}</option>`).join("");
}

function selectedRange() {
  const mode = byId("vsMode")?.value || "week";
  if (mode === "compare") {
    const a = byId("vsWeekA")?.value || weekStart();
    const b = byId("vsWeekB")?.value || addDays(weekStart(), -7);
    return { from: [a, b].sort()[0], to: addDays([a, b].sort()[1], 5) };
  }
  if (mode === "period") {
    const a = byId("vsPeriodFrom")?.value || addDays(weekStart(), -21);
    const b = byId("vsPeriodTo")?.value || weekStart();
    return { from: [a, b].sort()[0], to: addDays([a, b].sort()[1], 5) };
  }
  const start = byId("vsWeek")?.value || weekStart();
  return { from: start, to: addDays(start, 5) };
}

function selectedWeeks() {
  const mode = byId("vsMode")?.value || "week";
  if (mode === "compare") return [byId("vsWeekA").value, byId("vsWeekB").value];
  if (mode === "period") {
    const weeks = [];
    let cursor = [byId("vsPeriodFrom").value, byId("vsPeriodTo").value].sort()[0];
    const end = [byId("vsPeriodFrom").value, byId("vsPeriodTo").value].sort()[1];
    while (cursor <= end && weeks.length < 53) { weeks.push(cursor); cursor = addDays(cursor, 7); }
    return weeks;
  }
  return [byId("vsWeek").value];
}

function resultMap() {
  return new Map((state.data?.results || []).map(item => [`${item.participant_id}:${item.result_date}`, item]));
}

function weekMetrics(participantId, start, map) {
  const today = dateValue(new Date());
  const current = weekStart();
  const target = Number(state.data?.daily_target) || 5000000;
  const pastWeek = start < current;
  let total = 0, completed = 0, vacation = 0, counted = 0, failed = 0;
  const days = DAYS.map((label, index) => {
    const date = addDays(start, index);
    const future = start === current && date > today;
    const entry = map.get(`${participantId}:${date}`);
    if (!future) {
      counted += 1;
      if (entry?.is_vacation) vacation += 1;
      else if (Number(entry?.points) >= target) completed += 1;
      else failed += 1;
    }
    const points = Number(entry?.points) || 0;
    total += points;
    return { label, date, future, entry, points, met: !future && !entry?.is_vacation && points >= target, failed: !future && !entry?.is_vacation && points < target };
  });
  const required = counted - vacation;
  const allDone = required > 0 ? completed === required : counted > 0 && vacation === counted;
  let status = "fail";
  if (pastWeek && vacation >= 3) status = "vacation";
  else if (allDone) status = "complete";
  else if (pastWeek && completed === 5 && vacation === 0) status = "warning";
  return { total, completed, vacation, counted, failed, allDone, status, days };
}

function filteredRows(rows) {
  const search = (byId("vsSearch")?.value || "").trim().toLowerCase();
  const rank = byId("vsRankFilter")?.value || "";
  const completion = byId("vsCompletionFilter")?.value || "";
  return rows.filter(row => !search || row.nickname.toLowerCase().includes(search))
    .filter(row => !rank || row.rank_name === rank)
    .filter(row => !completion || (completion === "complete" ? row.complete : !row.complete));
}

function sortRows(rows) {
  const sort = byId("vsSort")?.value || "total";
  return rows.sort((a, b) => {
    if (sort === "nickname") return a.nickname.localeCompare(b.nickname, "ru");
    if (sort === "completed") return b.completed - a.completed || b.total - a.total;
    return b.total - a.total || a.nickname.localeCompare(b.nickname, "ru");
  });
}

function buildRows(weeks) {
  const map = resultMap();
  return (state.data?.participants || []).map(participant => {
    const metrics = weeks.map(start => weekMetrics(participant.participant_id, start, map));
    return {
      ...participant,
      metrics,
      total: metrics.reduce((sum, item) => sum + item.total, 0),
      completed: metrics.reduce((sum, item) => sum + item.completed, 0),
      complete: metrics.every(item => item.allDone),
      fullWeeks: metrics.filter(item => item.allDone).length,
      incompleteWeeks: metrics.filter(item => !item.allDone).length
    };
  });
}

function statusMark(status) {
  if (status === "vacation") return '<span class="vs-status vs-status-vacation" title="Отпуск 3 дня и более">О</span>';
  if (status === "complete") return '<span class="vs-status vs-status-complete" title="Все доступные дни выполнены">✓</span>';
  if (status === "warning") return '<span class="vs-status vs-status-warning" title="Выполнено 5 дней из 6">!</span>';
  return '<span class="vs-status vs-status-fail" title="Выполнено меньше 5 дней">×</span>';
}

function renderWeek(rows, week) {
  const current = week === weekStart();
  const collapsed = !current && state.collapsedPast;
  byId("vsTogglePast").hidden = current;
  byId("vsTogglePast").textContent = collapsed ? "Развернуть неделю" : "Свернуть неделю";
  const head = byId("vsTableHead");
  const body = byId("vsTableBody");
  if (collapsed) {
    head.innerHTML = "<tr><th>Участник</th><th>Итог недели</th></tr>";
    body.innerHTML = rows.map(row => `<tr><td><strong>${escapeHtml(row.nickname)}</strong><small>${escapeHtml(row.rank_name || "—")}</small></td><td>${statusMark(row.metrics[0].status)}</td></tr>`).join("");
    return;
  }
  head.innerHTML = `<tr><th>Место</th><th>Участник</th>${DAYS.map((day, index) => `<th data-vs-col="day${index}">${day}</th>`).join("")}<th data-vs-col="total">Общая сумма</th><th data-vs-col="completed">Выполнено дней</th></tr>`;
  body.innerHTML = rows.map((row, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(row.nickname)}</strong><small>${escapeHtml(row.rank_name || "—")}</small></td>${row.metrics[0].days.map((day, dayIndex) => `<td data-vs-col="day${dayIndex}" class="${day.failed ? "vs-cell-failed" : day.met ? "vs-cell-met" : day.future ? "vs-cell-future" : ""}">${day.future ? "" : day.entry?.is_vacation ? "О" : formatScore(day.points)}</td>`).join("")}<td data-vs-col="total"><strong>${formatScore(row.total)}</strong></td><td data-vs-col="completed">${row.metrics[0].completed} из ${row.metrics[0].counted - row.metrics[0].vacation}</td></tr>`).join("");
}

function renderCompare(rows, weeks) {
  byId("vsTogglePast").hidden = true;
  byId("vsTableHead").innerHTML = `<tr><th>Место</th><th>Участник</th><th>${weekLabel(weeks[0])}</th><th>${weekLabel(weeks[1])}</th><th>Разница</th><th>Выполнено дней</th></tr>`;
  byId("vsTableBody").innerHTML = rows.map((row, index) => {
    const difference = row.metrics[1].total - row.metrics[0].total;
    return `<tr><td>${index + 1}</td><td><strong>${escapeHtml(row.nickname)}</strong><small>${escapeHtml(row.rank_name || "—")}</small></td><td>${formatScore(row.metrics[0].total)}</td><td>${formatScore(row.metrics[1].total)}</td><td class="${difference < 0 ? "vs-text-negative" : difference > 0 ? "vs-text-positive" : ""}">${difference > 0 ? "+" : ""}${formatScore(difference)}</td><td>${row.metrics[0].completed} / ${row.metrics[1].completed}</td></tr>`;
  }).join("");
}

function renderPeriod(rows, weeks) {
  byId("vsTogglePast").hidden = true;
  byId("vsTableHead").innerHTML = `<tr><th>Место</th><th>Участник</th>${weeks.map(week => `<th>${weekLabel(week)}</th>`).join("")}<th>Сумма за период</th><th>Все недели</th><th>Не все недели</th></tr>`;
  byId("vsTableBody").innerHTML = rows.map((row, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(row.nickname)}</strong><small>${escapeHtml(row.rank_name || "—")}</small></td>${row.metrics.map(item => `<td>${formatScore(item.total)}</td>`).join("")}<td><strong>${formatScore(row.total)}</strong></td><td>${row.fullWeeks}</td><td>${row.incompleteWeeks}</td></tr>`).join("");
}

function renderSummary(rows, weeks) {
  const box = byId("vsSummary");
  if (!box || !rows.length) { if (box) box.hidden = true; return; }
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const complete = rows.filter(row => row.complete).length;
  const best = [...rows].sort((a, b) => b.total - a.total)[0];
  const worst = [...rows].sort((a, b) => a.total - b.total)[0];
  let extra = "";
  if (weeks.length === 1) {
    const dayTotals = DAYS.map((_, index) => rows.reduce((sum, row) => sum + row.metrics[0].days[index].points, 0));
    const bestDay = dayTotals.indexOf(Math.max(...dayTotals));
    const worstDay = dayTotals.indexOf(Math.min(...dayTotals));
    extra = `<div><span>Лучший день союза</span><strong>${DAYS[bestDay]}</strong></div><div><span>Самый слабый день</span><strong>${DAYS[worstDay]}</strong></div>`;
  } else {
    const weekTotals = weeks.map((_, index) => rows.reduce((sum, row) => sum + row.metrics[index].total, 0));
    extra = `<div><span>Лучшая неделя</span><strong>${weekLabel(weeks[weekTotals.indexOf(Math.max(...weekTotals))])}</strong></div><div><span>Самая слабая неделя</span><strong>${weekLabel(weeks[weekTotals.indexOf(Math.min(...weekTotals))])}</strong></div>`;
  }
  box.hidden = false;
  box.innerHTML = `<div><span>Общая сумма союза</span><strong>${formatScore(total)}</strong></div><div><span>Выполнили все дни</span><strong>${complete}</strong></div><div><span>Выполнили не все дни</span><strong>${rows.length - complete}</strong></div><div><span>Выполнили полностью</span><strong>${rows.length ? Math.round(complete / rows.length * 100) : 0}%</strong></div><div><span>Лучший участник</span><strong>${escapeHtml(best.nickname)}</strong></div><div><span>Худший участник</span><strong>${escapeHtml(worst.nickname)}</strong></div>${extra}`;
}

function applyColumns() {
  const selected = new Set([...document.querySelectorAll("[data-vs-column]:checked")].map(input => input.dataset.vsColumn));
  document.querySelectorAll("[data-vs-col]").forEach(cell => { cell.hidden = !selected.has(cell.dataset.vsCol); });
}

function render() {
  const weeks = selectedWeeks();
  let rows = sortRows(filteredRows(buildRows(weeks)));
  const mode = byId("vsMode")?.value || "week";
  if (mode === "compare") renderCompare(rows, weeks);
  else if (mode === "period") renderPeriod(rows, weeks);
  else renderWeek(rows, weeks[0]);
  renderSummary(rows, weeks);
  applyColumns();
  byId("vsEmptyState").hidden = rows.length > 0;
  byId("vsCount").textContent = `${rows.length} участников`;
  const participant = byId("vsParticipant");
  if (participant) {
    const selected = participant.value;
    participant.innerHTML = (state.data?.participants || []).map(item => `<option value="${item.participant_id}">${escapeHtml(item.nickname)}</option>`).join("");
    if ([...participant.options].some(option => option.value === selected)) participant.value = selected;
  }
  byId("vsEditorCard").hidden = !state.data?.can_manage;
  byId("vsTargetCard").hidden = !state.data?.can_manage;
  byId("vsDailyTarget").value = formatScore(state.data?.daily_target || 5000000);
}

async function load() {
  const allianceId = activeAllianceId();
  if (!allianceId || !state.client) return;
  const range = selectedRange();
  const { data, error } = await fetchAllianceVsStatistics(state.client, allianceId, range.from, range.to);
  const box = byId("vsSectionError");
  if (error) { box.hidden = false; box.textContent = error.message; return; }
  box.hidden = true;
  state.data = data || { participants: [], results: [] };
  render();
}

function updateModeFields() {
  const mode = byId("vsMode").value;
  document.querySelectorAll("[data-vs-mode-field]").forEach(field => { field.hidden = field.dataset.vsModeField !== mode; });
  load();
}

function updateInputDate() {
  const start = byId("vsInputWeek").value;
  const day = Number(byId("vsDay").value) || 0;
  byId("vsCalculatedDate").textContent = formatDate(addDays(start, day));
}

async function saveResult(event) {
  event.preventDefault();
  const vacation = byId("vsVacation").checked;
  const points = vacation ? null : parseScore(byId("vsPoints").value);
  if (!vacation && points === null) {
    byId("vsPoints").setCustomValidity("Укажи очки, например 5,72M, 897K, 1,4B или 2T");
    byId("vsPoints").reportValidity();
    return;
  }
  byId("vsPoints").setCustomValidity("");
  const button = event.submitter;
  button.disabled = true;
  const { error } = await saveAllianceVsResult(state.client, activeAllianceId(), {
    participantId: byId("vsParticipant").value,
    resultDate: addDays(byId("vsInputWeek").value, Number(byId("vsDay").value)),
    points,
    isVacation: vacation
  });
  button.disabled = false;
  if (error) return showMessage(error.message, "error");
  byId("vsPoints").value = "";
  byId("vsVacation").checked = false;
  await load();
  showMessage("Результат VS сохранён.", "success");
}

async function saveTarget(event) {
  event.preventDefault();
  const target = parseScore(byId("vsDailyTarget").value);
  if (!target) return showMessage("Укажи норматив больше нуля.", "error");
  const { error } = await setAllianceVsDailyTarget(state.client, activeAllianceId(), target);
  if (error) return showMessage(error.message, "error");
  await load();
  showMessage("Ежедневный норматив сохранён.", "success");
}

function showMessage(text, type) {
  const box = byId("allianceMessage");
  if (!box) return;
  box.hidden = false;
  box.textContent = text;
  box.dataset.type = type;
}

function toggleExpanded() {
  state.expanded = !state.expanded;
  byId("vsStatisticsCard").classList.toggle("is-expanded", state.expanded);
  document.body.classList.toggle("vs-table-open", state.expanded);
  byId("vsExpandTable").textContent = state.expanded ? "Закрыть полный экран" : "Открыть таблицу целиком";
}

function switchTab(target) {
  if (target !== "vs") return;
  state.collapsedPast = true;
  load();
}

export function initVsSection() {
  state.client = window.harvestHubSupabase;
  const options = makeWeekOptions();
  ["vsWeek", "vsWeekA", "vsWeekB", "vsPeriodFrom", "vsPeriodTo", "vsInputWeek"].forEach(id => { if (byId(id)) byId(id).innerHTML = options; });
  const current = weekStart();
  byId("vsWeek").value = current;
  byId("vsWeekA").value = addDays(current, -7);
  byId("vsWeekB").value = current;
  byId("vsPeriodFrom").value = addDays(current, -21);
  byId("vsPeriodTo").value = current;
  byId("vsInputWeek").value = current;
  const todayDay = (new Date().getDay() || 7) - 1;
  byId("vsDay").value = String(Math.min(5, Math.max(0, todayDay)));
  updateInputDate();

  document.querySelectorAll("[data-alliance-tab]").forEach(button => button.addEventListener("click", () => switchTab(button.dataset.allianceTab)));
  byId("vsMode")?.addEventListener("change", updateModeFields);
  ["vsWeek", "vsWeekA", "vsWeekB", "vsPeriodFrom", "vsPeriodTo"].forEach(id => byId(id)?.addEventListener("change", load));
  ["vsSearch", "vsRankFilter", "vsCompletionFilter", "vsSort"].forEach(id => byId(id)?.addEventListener(id === "vsSearch" ? "input" : "change", render));
  ["vsInputWeek", "vsDay"].forEach(id => byId(id)?.addEventListener("change", updateInputDate));
  byId("vsVacation")?.addEventListener("change", () => { byId("vsPoints").disabled = byId("vsVacation").checked; });
  byId("vsResultForm")?.addEventListener("submit", saveResult);
  byId("vsTargetForm")?.addEventListener("submit", saveTarget);
  byId("vsTogglePast")?.addEventListener("click", () => { state.collapsedPast = !state.collapsedPast; render(); });
  byId("vsExpandTable")?.addEventListener("click", toggleExpanded);
  document.querySelectorAll("[data-vs-column]").forEach(input => input.addEventListener("change", applyColumns));
  updateModeFields();
}
