import { fetchAllianceVsStatistics } from "../alliance/vs-api.js?v=20260718-1";
import {
  loadAlliancePageContext,
  fillAllianceCompactHeader,
  getActiveAllianceId
} from "../alliance/page-context.js?v=20260718-1";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const byId = id => document.getElementById(id);
const pad = value => String(value).padStart(2, "0");
const state = {
  client: null,
  context: null,
  data: null,
  pastWeekExpanded: false
};

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

function weekStart(value = new Date()) {
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

function formatScore(value) {
  const number = Number(value) || 0;
  if (!number) return "—";
  const unit = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]]
    .find(([size]) => Math.abs(number) >= size);
  if (!unit) return new Intl.NumberFormat("ru-RU").format(number);
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(number / unit[0])}${unit[1]}`;
}

function formatPercent(value) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)}%`;
}

function showMessage(text, type = "info") {
  const box = byId("allianceMessage");
  if (!box) return;
  box.hidden = !text;
  box.textContent = text;
  box.dataset.type = type;
}

function buildWeekOptions() {
  const current = weekStart();
  const values = [];
  for (let offset = 0; offset >= -52; offset -= 1) {
    values.push(addDays(current, offset * 7));
  }
  return values
    .map(value => `<option value="${value}">${weekLabel(value)}</option>`)
    .join("");
}

function selectedWeeks() {
  const mode = byId("vsStatsMode").value;
  if (mode === "compare") {
    return [byId("vsStatsWeekA").value, byId("vsStatsWeekB").value];
  }
  if (mode === "period") {
    const [from, to] = [
      byId("vsStatsPeriodFrom").value,
      byId("vsStatsPeriodTo").value
    ].sort();
    const weeks = [];
    for (let cursor = from; cursor <= to && weeks.length < 53; cursor = addDays(cursor, 7)) {
      weeks.push(cursor);
    }
    return weeks;
  }
  return [byId("vsStatsWeek").value];
}

function selectedRange() {
  const weeks = selectedWeeks().slice().sort();
  return {
    from: weeks[0],
    to: addDays(weeks[weeks.length - 1], 5)
  };
}

function resultMap() {
  return new Map((state.data?.results || []).map(item => [
    `${item.participant_id}:${item.result_date}`,
    item
  ]));
}

function weekMetrics(participantId, start, map) {
  const target = Number(state.data?.daily_target) || 5000000;
  const today = dateValue(new Date());
  const currentWeek = weekStart();
  const pastWeek = start < currentWeek;
  let total = 0;
  let completed = 0;
  let vacation = 0;
  let counted = 0;

  const days = DAYS.map((label, index) => {
    const date = addDays(start, index);
    const future = start === currentWeek && date > today;
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
      met: !future && !entry?.is_vacation && points >= target,
      failed: !future && !entry?.is_vacation && points < target
    };
  });

  const required = counted - vacation;
  const missed = Math.max(0, required - completed);
  const allDone = required > 0
    ? completed === required
    : counted > 0 && vacation === counted;

  let status = "fail";
  if (pastWeek && vacation >= 3) status = "vacation";
  else if (allDone) status = "complete";
  else if (pastWeek && missed === 1) status = "warning";

  return {
    total,
    completed,
    vacation,
    counted,
    required,
    missed,
    allDone,
    status,
    days
  };
}

function buildRows(weeks) {
  const map = resultMap();
  return state.context.participants
    .filter(item => item.member_status !== "left")
    .map(participant => {
      const metrics = weeks.map(week => weekMetrics(participant.id, week, map));
      return {
        ...participant,
        metrics,
        total: metrics.reduce((sum, item) => sum + item.total, 0),
        completed: metrics.reduce((sum, item) => sum + item.completed, 0),
        complete: metrics.every(item => item.status === "complete"),
        fullWeeks: metrics.filter(item => item.status === "complete").length,
        partialWeeks: metrics.filter(item => item.status === "warning").length,
        failedWeeks: metrics.filter(item => item.status === "fail").length,
        vacationWeeks: metrics.filter(item => item.status === "vacation").length
      };
    });
}

function filteredRows(rows) {
  const search = byId("vsStatsSearch").value.trim().toLowerCase();
  const rank = byId("vsStatsRank").value;
  const completion = byId("vsStatsCompletion").value;
  const sort = byId("vsStatsSort").value;

  const filtered = rows
    .filter(row => !search || row.nickname.toLowerCase().includes(search))
    .filter(row => !rank || row.rank_name === rank)
    .filter(row => !completion || (completion === "complete" ? row.complete : !row.complete));

  filtered.sort((a, b) => {
    if (sort === "nickname") return a.nickname.localeCompare(b.nickname, "ru");
    if (sort === "completed") return b.completed - a.completed || b.total - a.total;
    return b.total - a.total || a.nickname.localeCompare(b.nickname, "ru");
  });
  return filtered;
}

function statusMark(status) {
  if (status === "vacation") {
    return '<span class="vs-status vs-status-vacation" title="Отпуск три дня и более">О</span>';
  }
  if (status === "complete") {
    return '<span class="vs-status vs-status-complete" title="Все доступные дни выполнены">✓</span>';
  }
  if (status === "warning") {
    return '<span class="vs-status vs-status-warning" title="Не выполнен один доступный день">!</span>';
  }
  return '<span class="vs-status vs-status-fail" title="Не выполнено два или больше доступных дней">×</span>';
}

function participantCell(row) {
  return `<strong>${escapeHtml(row.nickname)}</strong><small>${escapeHtml(row.rank_name || "—")}</small>`;
}

function renderWeek(rows, week) {
  const current = week === weekStart();
  const collapsed = !current && !state.pastWeekExpanded;
  const toggle = byId("vsStatsTogglePast");
  toggle.hidden = current;
  toggle.textContent = collapsed ? "Развернуть неделю" : "Свернуть неделю";

  if (collapsed) {
    byId("vsStatsTableHead").innerHTML = "<tr><th>Участник</th><th>Итог недели</th></tr>";
    byId("vsStatsTableBody").innerHTML = rows.map(row => `
      <tr>
        <td>${participantCell(row)}</td>
        <td>${statusMark(row.metrics[0].status)}</td>
      </tr>
    `).join("");
    return;
  }

  byId("vsStatsTableHead").innerHTML = `
    <tr>
      <th>Место</th><th>Участник</th>
      ${DAYS.map(day => `<th>${day}</th>`).join("")}
      <th>Общая сумма</th><th>Выполнено дней</th>
    </tr>`;

  byId("vsStatsTableBody").innerHTML = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${participantCell(row)}</td>
      ${row.metrics[0].days.map(day => `
        <td class="${day.failed ? "vs-cell-failed" : day.met ? "vs-cell-met" : ""}">
          ${day.future ? "" : day.entry?.is_vacation ? "О" : formatScore(day.points)}
        </td>`).join("")}
      <td><strong>${formatScore(row.total)}</strong></td>
      <td>${row.metrics[0].completed} из ${row.metrics[0].required}</td>
    </tr>
  `).join("");
}

function renderCompare(rows, weeks) {
  byId("vsStatsTogglePast").hidden = true;
  byId("vsStatsTableHead").innerHTML = `
    <tr>
      <th>Место</th><th>Участник</th>
      <th>${weekLabel(weeks[0])}</th><th>${weekLabel(weeks[1])}</th>
      <th>Разница</th><th>Изменение</th>
      <th>Дни: первая</th><th>Дни: вторая</th><th>Разница дней</th>
    </tr>`;

  byId("vsStatsTableBody").innerHTML = rows.map((row, index) => {
    const first = row.metrics[0];
    const second = row.metrics[1];
    const difference = second.total - first.total;
    const percentage = first.total > 0
      ? difference / first.total * 100
      : second.total > 0 ? 100 : 0;
    const completedDifference = second.completed - first.completed;
    const differenceText = difference === 0
      ? "0"
      : `${difference > 0 ? "+" : ""}${formatScore(difference)}`;

    return `
      <tr>
        <td>${index + 1}</td>
        <td>${participantCell(row)}</td>
        <td>${formatScore(first.total)}</td>
        <td>${formatScore(second.total)}</td>
        <td class="${difference > 0 ? "vs-text-positive" : difference < 0 ? "vs-text-negative" : ""}">${differenceText}</td>
        <td class="${percentage > 0 ? "vs-text-positive" : percentage < 0 ? "vs-text-negative" : ""}">${percentage > 0 ? "+" : ""}${formatPercent(percentage)}</td>
        <td>${first.completed} из ${first.required}</td>
        <td>${second.completed} из ${second.required}</td>
        <td>${completedDifference > 0 ? "+" : ""}${completedDifference}</td>
      </tr>`;
  }).join("");
}

function renderPeriod(rows, weeks) {
  byId("vsStatsTogglePast").hidden = true;
  byId("vsStatsTableHead").innerHTML = `
    <tr>
      <th>Место</th><th>Участник</th>
      ${weeks.map(week => `<th>${weekLabel(week)}</th>`).join("")}
      <th>Сумма за период</th><th>Недель</th><th>Полностью</th><th>Частично</th><th>Не выполнено</th><th>Отпуск</th>
    </tr>`;

  byId("vsStatsTableBody").innerHTML = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${participantCell(row)}</td>
      ${row.metrics.map(item => `<td>${formatScore(item.total)}</td>`).join("")}
      <td><strong>${formatScore(row.total)}</strong></td>
      <td>${weeks.length}</td>
      <td>${row.fullWeeks}</td>
      <td>${row.partialWeeks}</td>
      <td>${row.failedWeeks}</td>
      <td>${row.vacationWeeks}</td>
    </tr>
  `).join("");
}

function renderSummary(rows, weeks) {
  const box = byId("vsStatsSummary");
  if (!rows.length) {
    box.hidden = true;
    return;
  }

  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const complete = rows.filter(row => row.complete).length;
  const best = [...rows].sort((a, b) => b.total - a.total)[0];
  const worst = [...rows].sort((a, b) => a.total - b.total)[0];
  let extra = "";

  if (weeks.length === 1) {
    const availableDays = DAYS.map((_, index) => index)
      .filter(index => !rows[0].metrics[0].days[index].future);
    const dayTotals = availableDays.map(index => ({
      index,
      total: rows.reduce((sum, row) => sum + row.metrics[0].days[index].points, 0)
    }));
    if (dayTotals.length) {
      const bestDay = [...dayTotals].sort((a, b) => b.total - a.total)[0].index;
      const worstDay = [...dayTotals].sort((a, b) => a.total - b.total)[0].index;
      extra = `
        <div><span>Лучший день союза</span><strong>${DAYS[bestDay]}</strong></div>
        <div><span>Самый слабый день</span><strong>${DAYS[worstDay]}</strong></div>`;
    }
  } else {
    const weekTotals = weeks.map((_, index) => rows.reduce(
      (sum, row) => sum + row.metrics[index].total,
      0
    ));
    extra = `
      <div><span>Лучшая неделя</span><strong>${weekLabel(weeks[weekTotals.indexOf(Math.max(...weekTotals))])}</strong></div>
      <div><span>Самая слабая неделя</span><strong>${weekLabel(weeks[weekTotals.indexOf(Math.min(...weekTotals))])}</strong></div>`;
  }

  box.hidden = false;
  box.innerHTML = `
    <div><span>Общая сумма союза</span><strong>${formatScore(total)}</strong></div>
    <div><span>Выполнили всё</span><strong>${complete}</strong></div>
    <div><span>Выполнили не всё</span><strong>${rows.length - complete}</strong></div>
    <div><span>Выполнили полностью</span><strong>${Math.round(complete / rows.length * 100)}%</strong></div>
    <div><span>Лучший участник</span><strong>${escapeHtml(best.nickname)}</strong></div>
    <div><span>Худший участник</span><strong>${escapeHtml(worst.nickname)}</strong></div>
    ${extra}`;
}

function render() {
  fillAllianceCompactHeader(state.context);
  const weeks = selectedWeeks();
  const rows = filteredRows(buildRows(weeks));
  const mode = byId("vsStatsMode").value;

  if (mode === "compare") renderCompare(rows, weeks);
  else if (mode === "period") renderPeriod(rows, weeks);
  else renderWeek(rows, weeks[0]);

  renderSummary(rows, weeks);
  byId("vsStatsCount").textContent = `${rows.length} участников`;
  byId("vsStatsEmpty").hidden = rows.length > 0;
}

async function load() {
  const range = selectedRange();
  const result = await fetchAllianceVsStatistics(
    state.client,
    getActiveAllianceId(),
    range.from,
    range.to
  );
  if (result.error) throw result.error;
  state.data = result.data || { results: [], daily_target: 5000000 };
  render();
}

function updateMode() {
  const mode = byId("vsStatsMode").value;
  state.pastWeekExpanded = false;
  document.querySelectorAll("[data-vs-stats-mode]").forEach(field => {
    field.hidden = field.dataset.vsStatsMode !== mode;
  });
  load().catch(error => showMessage(error.message, "error"));
}

function toggleFullscreen(open) {
  byId("vsStatsTableContainer").classList.toggle("is-alliance-table-fullscreen", open);
  document.body.classList.toggle("alliance-table-fullscreen-open", open);
}

export async function init() {
  state.client = window.harvestHubSupabase;
  try {
    state.context = await loadAlliancePageContext(state.client);
  } catch (error) {
    showMessage(error.message, "error");
    return;
  }

  const options = buildWeekOptions();
  ["vsStatsWeek", "vsStatsWeekA", "vsStatsWeekB", "vsStatsPeriodFrom", "vsStatsPeriodTo"]
    .forEach(id => { byId(id).innerHTML = options; });

  const current = weekStart();
  byId("vsStatsWeek").value = addDays(current, -7);
  byId("vsStatsWeekA").value = addDays(current, -14);
  byId("vsStatsWeekB").value = addDays(current, -7);
  byId("vsStatsPeriodFrom").value = addDays(current, -28);
  byId("vsStatsPeriodTo").value = addDays(current, -7);

  byId("vsStatsMode").addEventListener("change", updateMode);
  ["vsStatsWeek", "vsStatsWeekA", "vsStatsWeekB", "vsStatsPeriodFrom", "vsStatsPeriodTo"]
    .forEach(id => byId(id).addEventListener("change", () => {
      state.pastWeekExpanded = false;
      load().catch(error => showMessage(error.message, "error"));
    }));
  ["vsStatsSearch", "vsStatsRank", "vsStatsCompletion", "vsStatsSort"]
    .forEach(id => byId(id).addEventListener(id === "vsStatsSearch" ? "input" : "change", render));

  byId("vsStatsTogglePast").addEventListener("click", () => {
    state.pastWeekExpanded = !state.pastWeekExpanded;
    render();
  });
  byId("vsStatsExpandTable").addEventListener("click", () => toggleFullscreen(true));
  byId("vsStatsCloseTable").addEventListener("click", () => toggleFullscreen(false));

  updateMode();
}
