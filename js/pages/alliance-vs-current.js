import { fetchAllianceVsStatistics, saveAllianceVsResult, setAllianceVsDailyTarget } from "../alliance/vs-api.js?v=20260718-1";
import {
  loadAlliancePageContext,
  fillAllianceCompactHeader,
  canEditAlliance,
  getActiveAllianceId
} from "../alliance/page-context.js?v=20260718-1";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const byId = id => document.getElementById(id);
const pad = value => String(value).padStart(2, "0");
const state = { client: null, context: null, data: null };

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function weekStart() {
  const date = new Date();
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
  const normalized = String(value || "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".")
    .toUpperCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)([KMBTКМВТ]?)$/);
  if (!match) return null;
  const multiplier = {
    "": 1,
    K: 1e3,
    "К": 1e3,
    M: 1e6,
    "М": 1e6,
    B: 1e9,
    "В": 1e9,
    T: 1e12,
    "Т": 1e12
  }[match[2]];
  const points = Number(match[1]) * multiplier;
  return Number.isFinite(points) && points >= 0 ? Math.round(points) : null;
}

function formatScore(value) {
  const number = Number(value) || 0;
  if (!number) return "—";
  const unit = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]]
    .find(([size]) => Math.abs(number) >= size);
  if (!unit) return new Intl.NumberFormat("ru-RU").format(number);
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(number / unit[0])}${unit[1]}`;
}

function participantMetrics(participantId, map) {
  const start = weekStart();
  const today = dateValue(new Date());
  const target = Number(state.data?.daily_target) || 5000000;
  let total = 0;
  let completed = 0;
  let counted = 0;
  let vacation = 0;

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

    return {
      label,
      date,
      future,
      entry,
      points,
      failed: !future && !entry?.is_vacation && points < target,
      met: !future && !entry?.is_vacation && points >= target
    };
  });

  const required = counted - vacation;
  const allDone = required > 0
    ? completed === required
    : counted > 0 && vacation === counted;

  return { total, completed, counted, vacation, days, allDone };
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
  const best = [...rows].sort((a, b) => b.metrics.total - a.metrics.total)[0];
  const worst = [...rows].sort((a, b) => a.metrics.total - b.metrics.total)[0];
  const availableDays = DAYS.map((_, index) => index)
    .filter(index => !rows[0].metrics.days[index].future);
  const dayTotals = availableDays.map(index => ({
    index,
    total: rows.reduce((sum, row) => sum + row.metrics.days[index].points, 0)
  }));
  const bestDay = dayTotals.length
    ? [...dayTotals].sort((a, b) => b.total - a.total)[0].index
    : null;
  const worstDay = dayTotals.length
    ? [...dayTotals].sort((a, b) => a.total - b.total)[0].index
    : null;

  summary.hidden = false;
  summary.innerHTML = `
    <div><span>Общая сумма союза</span><strong>${formatScore(total)}</strong></div>
    <div><span>Выполнили все дни</span><strong>${complete}</strong></div>
    <div><span>Выполнили не все дни</span><strong>${rows.length - complete}</strong></div>
    <div><span>Выполнили полностью</span><strong>${Math.round(complete / rows.length * 100)}%</strong></div>
    <div><span>Лучший участник</span><strong>${escapeHtml(best.nickname)}</strong></div>
    <div><span>Худший участник</span><strong>${escapeHtml(worst.nickname)}</strong></div>
    ${bestDay === null ? "" : `<div><span>Лучший день союза</span><strong>${DAYS[bestDay]}</strong></div>`}
    ${worstDay === null ? "" : `<div><span>Самый слабый день</span><strong>${DAYS[worstDay]}</strong></div>`}`;
}

function render() {
  fillAllianceCompactHeader(state.context);
  const canEdit = canEditAlliance(state.context);
  byId("vsEditorCard").hidden = !canEdit;
  byId("vsTargetCard").hidden = !canEdit;
  byId("vsCurrentWeekLabel").textContent = `Неделя ${weekLabel(weekStart())}`;
  byId("vsDailyTarget").value = formatScore(state.data?.daily_target || 5000000);

  const activeParticipants = state.context.participants
    .filter(item => item.member_status !== "left");
  const participantSelect = byId("vsParticipant");
  const selectedParticipant = participantSelect.value;
  participantSelect.innerHTML = activeParticipants
    .map(item => `<option value="${item.id}">${escapeHtml(item.nickname)}</option>`)
    .join("");
  if ([...participantSelect.options].some(option => option.value === selectedParticipant)) {
    participantSelect.value = selectedParticipant;
  }

  const map = new Map((state.data?.results || []).map(item => [
    `${item.participant_id}:${item.result_date}`,
    item
  ]));
  const rows = activeParticipants
    .map(item => ({ ...item, metrics: participantMetrics(item.id, map) }))
    .sort((a, b) => b.metrics.total - a.metrics.total || a.nickname.localeCompare(b.nickname, "ru"));

  byId("vsTableHead").innerHTML = `
    <tr><th>Место</th><th>Участник</th>${DAYS.map(day => `<th>${day}</th>`).join("")}<th>Общая сумма</th><th>Выполнено дней</th></tr>`;
  byId("vsTableBody").innerHTML = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(row.nickname)}</strong><small>${escapeHtml(row.rank_name || "—")}</small></td>
      ${row.metrics.days.map(day => `
        <td class="${day.failed ? "vs-cell-failed" : day.met ? "vs-cell-met" : ""}">
          ${day.future ? "" : day.entry?.is_vacation ? "О" : formatScore(day.points)}
        </td>`).join("")}
      <td><strong>${formatScore(row.metrics.total)}</strong></td>
      <td>${row.metrics.completed} из ${row.metrics.counted - row.metrics.vacation}</td>
    </tr>`).join("");

  byId("vsCount").textContent = `${rows.length} участников`;
  byId("vsEmptyState").hidden = rows.length > 0;
  renderSummary(rows);
}

function updateDate() {
  byId("vsCalculatedDate").textContent = formatDate(
    addDays(weekStart(), Number(byId("vsDay").value))
  );
}

async function reload() {
  state.context = await loadAlliancePageContext(state.client);
  const start = weekStart();
  const result = await fetchAllianceVsStatistics(
    state.client,
    getActiveAllianceId(),
    start,
    addDays(start, 5)
  );
  if (result.error) throw result.error;
  state.data = result.data || { results: [], daily_target: 5000000 };
  render();
}

async function saveResult(event) {
  event.preventDefault();
  const resultDate = addDays(weekStart(), Number(byId("vsDay").value));
  if (resultDate > dateValue(new Date())) {
    return showMessage("Будущий день текущей недели пока не учитывается.", "error");
  }

  const vacation = byId("vsVacation").checked;
  const points = vacation ? null : parseScore(byId("vsPoints").value);
  if (!vacation && points === null) {
    return showMessage("Проверь формат очков. Нажми ? рядом с названием поля.", "error");
  }

  const button = event.submitter;
  button.disabled = true;
  const { error } = await saveAllianceVsResult(state.client, getActiveAllianceId(), {
    participantId: byId("vsParticipant").value,
    resultDate,
    points,
    isVacation: vacation
  });
  button.disabled = false;
  if (error) return showMessage(error.message, "error");

  byId("vsPoints").value = "";
  byId("vsVacation").checked = false;
  byId("vsPoints").disabled = false;
  await reload();
  showMessage("Результат сохранён.", "success");
}

async function saveTarget(event) {
  event.preventDefault();
  const target = parseScore(byId("vsDailyTarget").value);
  if (!target) return showMessage("Укажи норматив больше нуля.", "error");

  const button = event.submitter;
  button.disabled = true;
  const { error } = await setAllianceVsDailyTarget(
    state.client,
    getActiveAllianceId(),
    target
  );
  button.disabled = false;
  if (error) return showMessage(error.message, "error");

  await reload();
  showMessage("Норматив сохранён.", "success");
}

function toggleFullscreen(open) {
  byId("vsCurrentTableContainer").classList.toggle("is-alliance-table-fullscreen", open);
  document.body.classList.toggle("alliance-table-fullscreen-open", open);
}

export async function init() {
  state.client = window.harvestHubSupabase;
  try {
    await reload();
  } catch (error) {
    showMessage(error.message, "error");
    return;
  }

  const todayDay = (new Date().getDay() || 7) - 1;
  byId("vsDay").value = String(Math.min(5, Math.max(0, todayDay)));
  updateDate();

  byId("vsDay")?.addEventListener("change", updateDate);
  byId("vsVacation")?.addEventListener("change", () => {
    byId("vsPoints").disabled = byId("vsVacation").checked;
  });
  byId("vsResultForm")?.addEventListener("submit", saveResult);
  byId("vsTargetForm")?.addEventListener("submit", saveTarget);
  byId("vsScoreHelpButton")?.addEventListener("click", () => {
    byId("vsScoreHelp").hidden = !byId("vsScoreHelp").hidden;
  });
  byId("vsExpandTable")?.addEventListener("click", () => toggleFullscreen(true));
  byId("vsCloseTable")?.addEventListener("click", () => toggleFullscreen(false));
}
