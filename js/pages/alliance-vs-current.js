import { fetchAllianceVsStatistics, saveAllianceVsResult, setAllianceVsDailyTarget } from "../alliance/vs-api.js?v=20260718-1";
import { loadAlliancePageContext, fillAllianceCompactHeader, canEditAlliance, getActiveAllianceId } from "../alliance/page-context.js?v=20260718-1";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const byId = id => document.getElementById(id);
const pad = value => String(value).padStart(2, "0");
const state = { client: null, context: null, data: null };

function dateValue(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function parseDate(value) { const [y, m, d] = value.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(value, days) { const date = typeof value === "string" ? parseDate(value) : new Date(value); date.setDate(date.getDate() + days); return dateValue(date); }
function weekStart() { const date = new Date(); const day = date.getDay() || 7; date.setDate(date.getDate() - day + 1); return dateValue(date); }
function formatDate(value) { const date = parseDate(value); return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`; }
function weekLabel(start) { return `${formatDate(start)}–${formatDate(addDays(start, 5))}`; }

function showMessage(text, type = "info") { const box = byId("allianceMessage"); box.hidden = !text; box.textContent = text; box.dataset.type = type; }
function parseScore(value) {
  const normalized = String(value || "").trim().replace(/\s/g, "").replace(",", ".").toUpperCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)([KMBTКМВТ]?)$/);
  if (!match) return null;
  const multiplier = { "": 1, K: 1e3, "К": 1e3, M: 1e6, "М": 1e6, B: 1e9, "В": 1e9, T: 1e12, "Т": 1e12 }[match[2]];
  return Math.round(Number(match[1]) * multiplier);
}
function formatScore(value) {
  const number = Number(value) || 0;
  if (!number) return "—";
  const units = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  const unit = units.find(([size]) => Math.abs(number) >= size);
  if (!unit) return new Intl.NumberFormat("ru-RU").format(number);
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(number / unit[0])}${unit[1]}`;
}

function metrics(participantId, map) {
  const start = weekStart();
  const today = dateValue(new Date());
  const target = Number(state.data.daily_target) || 5000000;
  let total = 0, completed = 0, counted = 0, vacation = 0;
  const days = DAYS.map((label, index) => {
    const date = addDays(start, index);
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
  return { total, completed, counted, vacation, days, allDone: completed === counted - vacation };
}

function render() {
  fillAllianceCompactHeader(state.context);
  const canEdit = canEditAlliance(state.context);
  byId("vsEditorCard").hidden = !canEdit;
  byId("vsTargetCard").hidden = !canEdit;
  byId("vsCurrentWeekLabel").textContent = `Неделя ${weekLabel(weekStart())}`;
  byId("vsDailyTarget").value = formatScore(state.data.daily_target || 5000000);

  const participantSelect = byId("vsParticipant");
  participantSelect.innerHTML = state.context.participants.filter(item => item.member_status !== "left").map(item => `<option value="${item.id}">${item.nickname}</option>`).join("");
  const map = new Map((state.data.results || []).map(item => [`${item.participant_id}:${item.result_date}`, item]));
  const rows = state.context.participants.filter(item => item.member_status !== "left").map(item => ({ ...item, metrics: metrics(item.id, map) })).sort((a, b) => b.metrics.total - a.metrics.total);

  byId("vsTableHead").innerHTML = `<tr><th>Место</th><th>Участник</th>${DAYS.map(day => `<th>${day}</th>`).join("")}<th>Общая сумма</th><th>Выполнено дней</th></tr>`;
  byId("vsTableBody").innerHTML = rows.map((row, index) => `<tr><td>${index + 1}</td><td><strong>${row.nickname}</strong><small>${row.rank_name || "—"}</small></td>${row.metrics.days.map(day => `<td class="${day.failed ? "vs-cell-failed" : day.met ? "vs-cell-met" : ""}">${day.future ? "" : day.entry?.is_vacation ? "О" : formatScore(day.points)}</td>`).join("")}<td><strong>${formatScore(row.metrics.total)}</strong></td><td>${row.metrics.completed} из ${row.metrics.counted - row.metrics.vacation}</td></tr>`).join("");
  byId("vsCount").textContent = `${rows.length} участников`;
  byId("vsEmptyState").hidden = rows.length > 0;

  const total = rows.reduce((sum, row) => sum + row.metrics.total, 0);
  const complete = rows.filter(row => row.metrics.allDone).length;
  const best = rows[0];
  const worst = [...rows].sort((a, b) => a.metrics.total - b.metrics.total)[0];
  const summary = byId("vsSummary");
  summary.hidden = !rows.length;
  summary.innerHTML = rows.length ? `<div><span>Общая сумма союза</span><strong>${formatScore(total)}</strong></div><div><span>Выполнили все дни</span><strong>${complete}</strong></div><div><span>Выполнили не все дни</span><strong>${rows.length - complete}</strong></div><div><span>Лучший участник</span><strong>${best.nickname}</strong></div><div><span>Худший участник</span><strong>${worst.nickname}</strong></div>` : "";
}

function updateDate() {
  byId("vsCalculatedDate").textContent = formatDate(addDays(weekStart(), Number(byId("vsDay").value)));
}

async function reload() {
  state.context = await loadAlliancePageContext(state.client);
  const start = weekStart();
  const result = await fetchAllianceVsStatistics(state.client, getActiveAllianceId(), start, addDays(start, 5));
  if (result.error) throw result.error;
  state.data = result.data || { participants: [], results: [], daily_target: 5000000 };
  render();
}

async function saveResult(event) {
  event.preventDefault();
  const resultDate = addDays(weekStart(), Number(byId("vsDay").value));
  if (resultDate > dateValue(new Date())) return showMessage("Будущий день текущей недели пока не учитывается.", "error");
  const vacation = byId("vsVacation").checked;
  const points = vacation ? null : parseScore(byId("vsPoints").value);
  if (!vacation && points === null) return showMessage("Проверь формат очков. Нажми ? рядом с названием поля.", "error");
  const button = event.submitter; button.disabled = true;
  const { error } = await saveAllianceVsResult(state.client, getActiveAllianceId(), { participantId: byId("vsParticipant").value, resultDate, points, isVacation: vacation });
  button.disabled = false;
  if (error) return showMessage(error.message, "error");
  byId("vsPoints").value = ""; byId("vsVacation").checked = false; byId("vsPoints").disabled = false;
  await reload(); showMessage("Результат сохранён.", "success");
}

async function saveTarget(event) {
  event.preventDefault();
  const target = parseScore(byId("vsDailyTarget").value);
  if (!target) return showMessage("Укажи норматив больше нуля.", "error");
  const button = event.submitter; button.disabled = true;
  const { error } = await setAllianceVsDailyTarget(state.client, getActiveAllianceId(), target);
  button.disabled = false;
  if (error) return showMessage(error.message, "error");
  await reload(); showMessage("Норматив сохранён.", "success");
}

function toggleFullscreen(open) {
  byId("vsCurrentTableContainer").classList.toggle("is-alliance-table-fullscreen", open);
  document.body.classList.toggle("alliance-table-fullscreen-open", open);
}

export async function init() {
  state.client = window.harvestHubSupabase;
  try { await reload(); } catch (error) { showMessage(error.message, "error"); return; }
  const todayDay = (new Date().getDay() || 7) - 1;
  byId("vsDay").value = String(Math.min(5, Math.max(0, todayDay)));
  updateDate();
  byId("vsDay")?.addEventListener("change", updateDate);
  byId("vsVacation")?.addEventListener("change", () => { byId("vsPoints").disabled = byId("vsVacation").checked; });
  byId("vsResultForm")?.addEventListener("submit", saveResult);
  byId("vsTargetForm")?.addEventListener("submit", saveTarget);
  byId("vsScoreHelpButton")?.addEventListener("click", () => { byId("vsScoreHelp").hidden = !byId("vsScoreHelp").hidden; });
  byId("vsExpandTable")?.addEventListener("click", () => toggleFullscreen(true));
  byId("vsCloseTable")?.addEventListener("click", () => toggleFullscreen(false));
}
