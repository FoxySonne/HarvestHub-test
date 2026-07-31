import { fetchAllianceVsStatistics } from "../alliance/vs-api.js?v=20260718-1";
import {
  loadAlliancePageContext,
  fillAllianceCompactHeader,
  getActiveAllianceId
} from "../alliance/page-context.js?v=20260728-membership-periods-1";
import { setAllianceTableFullscreen } from "../alliance/fullscreen-table.js?v=20260721-1";

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
  if (type === "error" && text) {
    box.hidden = true;
    window.harvestHubNotifications?.error(text, "Не удалось загрузить статистику VS.");
    return;
  }
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

function membershipPeriods(participant) {
  return Array.isArray(participant?.membership_periods) ? participant.membership_periods : [];
}

function isMemberOn(participant, date) {
  return membershipPeriods(participant).some(period => {
    const joined = String(period?.joined_on || "");
    const left = String(period?.left_on || "");
    return joined && date >= joined && (!left || date < left);
  });
}

function weekMetrics(participant, start, map) {
  const target = Number(state.data?.daily_target) || 5000000;
  const includeSaturday = state.data?.include_saturday_in_total !== false;
  const today = dateValue(new Date());
  const currentWeek = weekStart();
  const pastWeek = start < currentWeek;
  let total = 0;
  let completed = 0;
  let vacation = 0;
  let counted = 0;

  const days = DAYS.map((label, index) => {
    const date = addDays(start, index);
    const future = date > today;
    const included = includeSaturday || index < 5;
    const member = isMemberOn(participant, date);
    const entry = map.get(`${participant.participant_id}:${date}`);
    const points = Number(entry?.points) || 0;
    const countable = !future && included && member;

    if (countable) {
      counted += 1;
      total += points;
      if (entry?.is_vacation) vacation += 1;
      else if (points >= target) completed += 1;
    }

    return {
      label,
      date,
      future,
      included,
      member,
      countable,
      entry,
      points,
      met: countable && !entry?.is_vacation && points >= target,
      failed: countable && !entry?.is_vacation && points < target
    };
  });

  const required = counted - vacation;
  const missed = Math.max(0, required - completed);
  const allDone = required > 0
    ? completed === required
    : counted > 0 && vacation === counted;
  const calendarDays = days.filter(day => !day.future && day.included);
  const summaryEligible = calendarDays.length > 0 && calendarDays.every(day => day.member);

  let status = "partial";
  if (summaryEligible) {
    status = "fail";
    if (pastWeek && vacation >= 3) status = "vacation";
    else if (allDone) status = "complete";
    else if (pastWeek && missed === 1) status = "warning";
  }

  return {
    total,
    completed,
    vacation,
    counted,
    required,
    missed,
    allDone,
    summaryEligible,
    status,
    days
  };
}

function buildRows(weeks) {
  const map = resultMap();
  const participants = Array.isArray(state.data?.participants) ? state.data.participants : [];

  return participants
    .map(participant => {
      const metrics = weeks.map(week => weekMetrics(participant, week, map));
      const eligibleMetrics = metrics.filter(item => item.summaryEligible);
      const hasMembership = metrics.some(item => item.days.some(day => day.member));
      return {
        id: participant.participant_id,
        participant_id: participant.participant_id,
        nickname: participant.nickname,
        rank_name: participant.rank_name,
        historical_only: participant.historical_only,
        membership_periods: participant.membership_periods,
        metrics,
        hasMembership,
        hasEligibleWeeks: eligibleMetrics.length > 0,
        summaryEligible: metrics.length > 0 && metrics.every(item => item.summaryEligible),
        total: metrics.reduce((sum, item) => sum + item.total, 0),
        completed: metrics.reduce((sum, item) => sum + item.completed, 0),
        complete: eligibleMetrics.length > 0 && eligibleMetrics.every(item => item.status === "complete"),
        eligibleWeeks: eligibleMetrics.length,
        fullWeeks: eligibleMetrics.filter(item => item.status === "complete").length,
        partialWeeks: eligibleMetrics.filter(item => item.status === "warning").length,
        failedWeeks: eligibleMetrics.filter(item => item.status === "fail").length,
        vacationWeeks: eligibleMetrics.filter(item => item.status === "vacation").length
      };
    })
    .filter(row => row.hasMembership);
}

function filteredRows(rows) {
  const search = byId("vsStatsSearch").value.trim().toLowerCase();
  const rank = byId("vsStatsRank").value;
  const completion = byId("vsStatsCompletion").value;
  const sort = byId("vsStatsSort").value;

  const filtered = rows
    .filter(row => !search || row.nickname.toLowerCase().includes(search))
    .filter(row => !rank || row.rank_name === rank)
    .filter(row => {
      if (!completion) return true;
      if (!row.hasEligibleWeeks) return false;
      return completion === "complete" ? row.complete : !row.complete;
    });

  filtered.sort((a, b) => {
    if (sort === "nickname") return a.nickname.localeCompare(b.nickname, "ru");
    if (sort === "completed") return b.completed - a.completed || b.total - a.total;
    return b.total - a.total || a.nickname.localeCompare(b.nickname, "ru");
  });
  return filtered;
}

function statusMark(status) {
  if (status === "partial") {
    return '<span class="vs-status vs-status-partial" title="Неполная неделя: игрок состоял в союзе не все учитываемые дни">—</span>';
  }
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
      ${row.metrics[0].days.map(day => {
        const className = !day.member ? "vs-cell-not-member" : day.failed ? "vs-cell-failed" : day.met ? "vs-cell-met" : "";
        const value = !day.member ? "—" : day.future ? "" : day.entry?.is_vacation ? "О" : formatScore(day.points);
        return `<td class="${className}" title="${!day.member ? "В эту дату игрок не состоял в союзе" : ""}">${value}</td>`;
      }).join("")}
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
    const comparable = first.summaryEligible && second.summaryEligible;
    const difference = second.total - first.total;
    const percentage = first.total > 0
      ? difference / first.total * 100
      : second.total > 0 ? 100 : 0;
    const completedDifference = second.completed - first.completed;
    const differenceText = difference === 0 ? "0" : `${difference > 0 ? "+" : ""}${formatScore(difference)}`;

    return `
      <tr>
        <td>${index + 1}</td>
        <td>${participantCell(row)}</td>
        <td>${formatScore(first.total)}</td>
        <td>${formatScore(second.total)}</td>
        <td class="${comparable && difference > 0 ? "vs-text-positive" : comparable && difference < 0 ? "vs-text-negative" : ""}">${comparable ? differenceText : "—"}</td>
        <td class="${comparable && percentage > 0 ? "vs-text-positive" : comparable && percentage < 0 ? "vs-text-negative" : ""}">${comparable ? `${percentage > 0 ? "+" : ""}${formatPercent(percentage)}` : "—"}</td>
        <td>${first.completed} из ${first.required}</td>
        <td>${second.completed} из ${second.required}</td>
        <td>${comparable ? `${completedDifference > 0 ? "+" : ""}${completedDifference}` : "—"}</td>
      </tr>`;
  }).join("");
}

function renderPeriod(rows, weeks) {
  byId("vsStatsTogglePast").hidden = true;
  byId("vsStatsTableHead").innerHTML = `
    <tr>
      <th>Место</th><th>Участник</th>
      ${weeks.map(week => `<th>${weekLabel(week)}</th>`).join("")}
      <th>Сумма за период</th><th>Учтено недель</th><th>Полностью</th><th>Частично</th><th>Не выполнено</th><th>Отпуск</th>
    </tr>`;

  byId("vsStatsTableBody").innerHTML = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${participantCell(row)}</td>
      ${row.metrics.map(item => `<td title="${item.summaryEligible ? "" : "Неполная неделя не участвует в итоговой оценке"}">${formatScore(item.total)}</td>`).join("")}
      <td><strong>${formatScore(row.total)}</strong></td>
      <td>${row.eligibleWeeks}</td>
      <td>${row.fullWeeks}</td>
      <td>${row.partialWeeks}</td>
      <td>${row.failedWeeks}</td>
      <td>${row.vacationWeeks}</td>
    </tr>
  `).join("");
}

function playerCountLabel(count) {
  const lastTwo = count % 100;
  const last = count % 10;
  const word = lastTwo >= 11 && lastTwo <= 14
    ? "игроков"
    : last === 1
      ? "игрок"
      : last >= 2 && last <= 4
        ? "игрока"
        : "игроков";
  return `${count} ${word}`;
}

function extremumSummary(rows, type) {
  const isBest = type === "best";
  const singularLabel = isBest ? "Лучший участник" : "Худший участник";
  const pluralLabel = isBest ? "Лучшие участники" : "Худшие участники";
  const baseTitle = "Игроки с неполным выбранным периодом не участвуют в сравнении";
  if (!rows.length) return { label: singularLabel, value: "—", title: baseTitle };

  const totals = rows.map(row => Number(row.total) || 0);
  const target = isBest ? Math.max(...totals) : Math.min(...totals);
  const tied = rows
    .filter(row => (Number(row.total) || 0) === target)
    .sort((a, b) => a.nickname.localeCompare(b.nickname, "ru"));

  if (tied.length === 1) {
    return { label: singularLabel, value: tied[0].nickname, title: baseTitle };
  }

  const score = target === 0 ? "0" : formatScore(target);
  const names = tied.map(row => row.nickname).join(", ");
  return {
    label: pluralLabel,
    value: `${playerCountLabel(tied.length)} · ${score}`,
    title: `${baseTitle}. Равный результат: ${names}`
  };
}

function renderSummary(rows, weeks) {
  const box = byId("vsStatsSummary");
  if (!rows.length) {
    box.hidden = true;
    return;
  }

  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const eligible = rows.filter(row => row.summaryEligible);
  const complete = eligible.filter(row => row.complete).length;
  const incomplete = eligible.length - complete;
  const percentage = eligible.length ? Math.round(complete / eligible.length * 100) : 0;
  const best = extremumSummary(eligible, "best");
  const worst = extremumSummary(eligible, "worst");
  let extra = "";

  if (weeks.length === 1) {
    const availableDays = DAYS.map((_, index) => index)
      .filter(index => rows.some(row => row.metrics[0].days[index].countable));
    const dayTotals = availableDays.map(index => ({
      index,
      total: rows.reduce((sum, row) => sum + (row.metrics[0].days[index].countable ? row.metrics[0].days[index].points : 0), 0)
    }));
    if (dayTotals.length) {
      const bestDay = [...dayTotals].sort((a, b) => b.total - a.total)[0].index;
      const worstDay = [...dayTotals].sort((a, b) => a.total - b.total)[0].index;
      extra = `
        <div><span>Лучший день союза</span><strong>${DAYS[bestDay]}</strong></div>
        <div><span>Самый слабый день</span><strong>${DAYS[worstDay]}</strong></div>`;
    }
  } else {
    const weekTotals = weeks.map((_, index) => rows.reduce((sum, row) => sum + row.metrics[index].total, 0));
    if (weekTotals.length) {
      extra = `
        <div><span>Лучшая неделя</span><strong>${weekLabel(weeks[weekTotals.indexOf(Math.max(...weekTotals))])}</strong></div>
        <div><span>Самая слабая неделя</span><strong>${weekLabel(weeks[weekTotals.indexOf(Math.min(...weekTotals))])}</strong></div>`;
    }
  }

  box.hidden = false;
  box.innerHTML = `
    <div><span>Общая сумма союза</span><strong>${formatScore(total)}</strong></div>
    <div title="Игроки с неполным периодом не входят"><span>Выполнили всё</span><strong>${complete}</strong></div>
    <div title="Игроки с неполным периодом не входят"><span>Выполнили не всё</span><strong>${incomplete}</strong></div>
    <div title="Процент считается только среди игроков, состоявших в союзе весь выбранный период"><span>Выполнили полностью</span><strong>${percentage}%</strong></div>
    <div title="${escapeHtml(best.title)}"><span>${best.label}</span><strong>${escapeHtml(best.value)}</strong></div>
    <div title="${escapeHtml(worst.title)}"><span>${worst.label}</span><strong>${escapeHtml(worst.value)}</strong></div>
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
  state.data = result.data || { results: [], participants: [], daily_target: 5000000 };
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
  setAllianceTableFullscreen(byId("vsStatsTableContainer"), open);
}

export async function init() {
  state.client = window.harvestHubSupabase;
  try {
    state.context = await loadAlliancePageContext(state.client, { force: true });
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
