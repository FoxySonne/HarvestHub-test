import {
  fetchAllianceVsStatistics,
  saveAllianceVsResult,
  deleteAllianceVsResult,
  saveAllianceVsResultsBatch,
  setAllianceVsDailyTarget,
  setAllianceVsSaturdayTotal
} from "../alliance/vs-api.js?v=20260726-role-batch-1";
import {
  loadAlliancePageContext,
  fillAllianceCompactHeader,
  canEditAlliance,
  getActiveAllianceId
} from "../alliance/page-context.js?v=20260728-membership-periods-1";
import { setAllianceTableFullscreen } from "../alliance/fullscreen-table.js?v=20260721-1";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const RANK_WEIGHT = { "Р5": 5, "Р4": 4, "Р3": 3, "Р2": 2, "Р1": 1 };
const byId = id => document.getElementById(id);
const pad = value => String(value).padStart(2, "0");
const state = { client: null, context: null, data: null, weekStart: "", editing: null };

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function dateValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function utcDateValue(date = new Date()) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
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

function participantMetrics(participant, map) {
  const currentUtcDate = utcDateValue();
  const target = Number(state.data?.daily_target) || 5000000;
  const includeSaturday = state.data?.include_saturday_in_total !== false;
  let total = 0;
  let completed = 0;
  let counted = 0;
  let vacation = 0;

  const days = DAYS.map((label, index) => {
    const date = addDays(state.weekStart, index);
    const future = date > currentUtcDate;
    const ended = date < currentUtcDate;
    const included = includeSaturday || index < 5;
    const member = isMemberOn(participant, date);
    const entry = map.get(`${participant.id}:${date}`);
    const points = Number(entry?.points) || 0;
    const countable = ended && included && member;

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
      ended,
      included,
      member,
      countable,
      entry,
      points,
      failed: countable && !entry?.is_vacation && points < target,
      met: countable && !entry?.is_vacation && points >= target
    };
  });

  const required = counted - vacation;
  const allDone = required > 0 ? completed === required : counted > 0 && vacation === counted;
  const requiredCalendarDays = days.filter(day => day.ended && day.included);
  const summaryEligible = requiredCalendarDays.length > 0 && requiredCalendarDays.every(day => day.member);
  return { total, completed, counted, vacation, required, days, allDone, summaryEligible };
}

function sortRows(rows) {
  const sort = byId("vsSort")?.value || "nickname";
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
  if (!summary) return;
  if (!rows.length) {
    summary.hidden = true;
    summary.innerHTML = "";
    return;
  }

  const total = rows.reduce((sum, row) => sum + row.metrics.total, 0);
  const eligible = rows.filter(row => row.metrics.summaryEligible);
  const complete = eligible.filter(row => row.metrics.allDone).length;
  const incomplete = eligible.length - complete;
  const percentage = eligible.length ? Math.round(complete / eligible.length * 100) : 0;
  const byTotal = [...eligible].sort((a, b) => b.metrics.total - a.metrics.total || a.nickname.localeCompare(b.nickname, "ru"));
  const best = byTotal[0]?.nickname || "—";
  const worst = byTotal[byTotal.length - 1]?.nickname || "—";

  summary.hidden = false;
  summary.innerHTML = `
    <div><span>Общая сумма союза</span><strong>${formatScore(total)}</strong></div>
    <div title="Считаются только игроки, состоявшие в союзе со старта доступной части недели"><span>Выполнили все дни</span><strong>${complete}</strong></div>
    <div title="Игроки с неполной первой неделей сюда не входят"><span>Выполнили не все дни</span><strong>${incomplete}</strong></div>
    <div title="Доля выполнивших среди игроков с полной учитываемой неделей"><span>Выполнили полностью</span><strong>${percentage}%</strong></div>
    <div title="Неполная первая неделя не участвует в сравнении"><span>Лучший участник</span><strong>${escapeHtml(best)}</strong></div>
    <div title="Неполная первая неделя не участвует в сравнении"><span>Худший участник</span><strong>${escapeHtml(worst)}</strong></div>`;
}

function buildRows() {
  const map = new Map((state.data?.results || []).map(item => [`${item.participant_id}:${item.result_date}`, item]));
  const active = state.context.participants.filter(item => item.member_status !== "left");
  return sortRows(active.map(item => ({ ...item, metrics: participantMetrics(item, map) })));
}

function renderBulk(rows) {
  const body = byId("vsBulkBody");
  if (!body) return;
  body.innerHTML = rows.map(row => `
    <tr data-vs-bulk-participant="${escapeHtml(row.id)}">
      <td><strong>${escapeHtml(row.nickname)}</strong><small>${escapeHtml(row.rank_name || "—")}</small></td>
      ${row.metrics.days.map((day, index) => {
        const original = inputScore(day.entry);
        const disabled = day.future || !day.member;
        const title = !day.member ? "На эту дату игрок не состоял в союзе" : "";
        return `<td class="${!day.member ? "vs-cell-not-member" : ""}"><input type="text" inputmode="decimal" data-vs-bulk-day="${index}" data-original="${escapeHtml(original)}" value="${!day.member ? "" : escapeHtml(original)}" ${disabled ? "disabled" : ""} title="${title}" data-no-persist="true"></td>`;
      }).join("")}
    </tr>`).join("");
  byId("vsBulkWeekLabel").textContent = `Неделя ${weekLabel(state.weekStart)}`;
}

function activeParticipantsForDate(date) {
  return state.context.participants
    .filter(item => item.member_status !== "left")
    .filter(item => isMemberOn(item, date));
}

function syncParticipantOptionsForDate(date) {
  const participantSelect = byId("vsParticipant");
  if (!participantSelect) return;
  const selectedParticipant = participantSelect.value;
  const participants = activeParticipantsForDate(date);
  participantSelect.innerHTML = participants.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nickname)}</option>`).join("");
  if ([...participantSelect.options].some(option => option.value === selectedParticipant)) participantSelect.value = selectedParticipant;
}

function render() {
  fillAllianceCompactHeader(state.context);
  byId("vsEditorCard").hidden = false;
  byId("vsTargetCard").hidden = false;
  byId("vsCurrentWeekLabel").textContent = `Неделя ${weekLabel(state.weekStart)}`;
  byId("vsTableWeekTitle").textContent = `Неделя ${weekLabel(state.weekStart)}`;
  byId("vsDailyTarget").value = formatScore(state.data?.daily_target || 5000000);
  byId("vsIncludeSaturdayTotal").checked = state.data?.include_saturday_in_total !== false;

  syncParticipantOptionsForDate(byId("vsResultDate")?.value || state.weekStart);

  const rows = buildRows();
  byId("vsTableHead").innerHTML = `<tr><th>Место</th><th>Участник</th>${DAYS.map(day => `<th>${day}</th>`).join("")}<th>Общая сумма</th><th>Выполнено дней</th><th></th></tr>`;
  byId("vsTableBody").innerHTML = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(row.nickname)}</strong><small>${escapeHtml(row.rank_name || "—")}</small></td>
      ${row.metrics.days.map(day => {
        const className = !day.member ? "vs-cell-not-member" : day.failed ? "vs-cell-failed" : day.met ? "vs-cell-met" : "";
        const value = !day.member ? "—" : day.future ? "" : day.entry?.is_vacation ? "О" : formatScore(day.points);
        const title = !day.member ? "В эту дату игрок ещё не состоял в союзе" : "";
        return `<td class="${className}" title="${title}">${value}</td>`;
      }).join("")}
      <td><strong>${formatScore(row.metrics.total)}</strong></td>
      <td title="Учитываются только дни нахождения в союзе">${row.metrics.completed} из ${row.metrics.required}</td>
      <td><button type="button" class="secondary-button vs-row-edit" data-vs-edit="${escapeHtml(row.id)}">Изменить</button></td>
    </tr>`).join("");
  byId("vsCount").textContent = `${rows.length} участников`;
  byId("vsEmptyState").hidden = rows.length > 0;
  renderSummary(rows);
  renderBulk(rows);
}

function syncDateFromDay() {
  const date = addDays(state.weekStart, Number(byId("vsDay").value));
  byId("vsResultDate").value = date;
  syncParticipantOptionsForDate(date);
  state.editing = null;
  byId("vsDeleteResult").hidden = true;
}

function syncDayFromDate() {
  const value = byId("vsResultDate").value;
  if (!value) return;
  const day = (parseDate(value).getDay() || 7) - 1;
  if (day > 5) return showMessage("Для VS можно выбрать дату с понедельника по субботу.", "error");
  byId("vsDay").value = String(day);
  syncParticipantOptionsForDate(value);
  state.editing = null;
  byId("vsDeleteResult").hidden = true;
  const nextWeekStart = getWeekStart(value);
  if (nextWeekStart !== state.weekStart) {
    state.weekStart = nextWeekStart;
    reload().catch(error => showMessage(error.message, "error"));
  }
}

async function reload() {
  state.context = await loadAlliancePageContext(state.client, { force: true });
  if (!canEditAlliance(state.context)) {
    window.loadPage?.("alliance/members.html");
    return;
  }
  const result = await fetchAllianceVsStatistics(state.client, getActiveAllianceId(), state.weekStart, addDays(state.weekStart, 5));
  if (result.error) throw result.error;
  state.data = result.data || { results: [], daily_target: 5000000, include_saturday_in_total: true };
  render();
}

function editParticipant(participantId) {
  const participantItem = state.context?.participants?.find(item => item.id === participantId);
  if (!participantItem) return;
  let resultDate = byId("vsResultDate").value || addDays(state.weekStart, Number(byId("vsDay").value));
  if (!isMemberOn(participantItem, resultDate)) {
    const available = DAYS.map((_, index) => addDays(state.weekStart, index))
      .find(date => date <= utcDateValue() && isMemberOn(participantItem, date));
    if (!available) return showMessage("На этой неделе игрок ещё не состоял в союзе.", "info");
    resultDate = available;
    byId("vsResultDate").value = resultDate;
    byId("vsDay").value = String((parseDate(resultDate).getDay() || 7) - 1);
    syncParticipantOptionsForDate(resultDate);
  }
  byId("vsParticipant").value = participantId;
  const entry = state.data?.results?.find(item => item.participant_id === participantId && item.result_date === resultDate) || null;
  state.editing = entry ? { participantId, resultDate } : null;
  byId("vsPoints").value = entry?.points ? formatScore(entry.points) : "";
  byId("vsVacation").checked = Boolean(entry?.is_vacation);
  byId("vsPoints").disabled = byId("vsVacation").checked;
  byId("vsEditorTitle").textContent = `Изменить: ${byId("vsParticipant").selectedOptions[0]?.textContent || "участник"}`;
  byId("vsEditCancel").hidden = false;
  byId("vsDeleteResult").hidden = !entry;
  byId("vsEditorCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetEditor() {
  state.editing = null;
  byId("vsEditorTitle").textContent = "Внести результат VS";
  byId("vsEditCancel").hidden = true;
  byId("vsDeleteResult").hidden = true;
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
  if (resultDate > utcDateValue()) return showMessage("Будущую дату пока нельзя сохранить.", "error");
  const participantId = byId("vsParticipant").value;
  const participantItem = state.context?.participants?.find(item => item.id === participantId);
  if (!participantItem || !isMemberOn(participantItem, resultDate)) return showMessage("На выбранную дату игрок не состоял в союзе.", "error");
  const vacation = byId("vsVacation").checked;
  const points = vacation ? null : parseScore(byId("vsPoints").value);
  if (!vacation && points === null) return showMessage("Проверь формат очков.", "error");
  const button = event.submitter;
  if (button) button.disabled = true;
  try {
    const { error } = await saveAllianceVsResult(state.client, getActiveAllianceId(), {
      participantId,
      resultDate,
      points,
      isVacation: vacation
    });
    if (error) throw error;
    state.weekStart = getWeekStart(resultDate);
    resetEditor();
    await reload();
    showMessage("Результат сохранён.", "success");
  } catch (error) {
    showMessage(error?.message || "Не удалось сохранить результат.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function deleteCurrentResult(event) {
  if (!state.editing) return;
  const participant = state.context?.participants?.find(item => item.id === state.editing.participantId);
  if (!confirm(`Удалить результат «${participant?.nickname || "участника"}» за ${formatDate(state.editing.resultDate)}?`)) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const { error } = await deleteAllianceVsResult(state.client, getActiveAllianceId(), state.editing.participantId, state.editing.resultDate);
    if (error) throw error;
    resetEditor();
    await reload();
    showMessage("Результат удалён.", "success");
  } catch (error) {
    showMessage(error?.message || "Не удалось удалить результат.", "error");
  } finally {
    button.disabled = false;
  }
}

async function saveBulk() {
  const button = byId("vsBulkSave");
  const rows = [...document.querySelectorAll("[data-vs-bulk-participant]")];
  const changes = [];

  for (const row of rows) {
    for (const input of row.querySelectorAll("[data-vs-bulk-day]")) {
      if (input.disabled) continue;
      const raw = input.value.trim();
      const original = input.dataset.original || "";
      if (raw === original) continue;
      const resultDate = addDays(state.weekStart, Number(input.dataset.vsBulkDay));
      if (!raw) {
        if (original) changes.push({ participant_id: row.dataset.vsBulkParticipant, result_date: resultDate, points: null, is_vacation: false, delete_result: true });
        continue;
      }
      const vacation = raw.toUpperCase() === "О";
      const points = vacation ? null : parseScore(raw);
      if (!vacation && points === null) {
        input.focus();
        return showMessage("Проверь значение в общей таблице. Число без буквы считается миллионами; также можно использовать K/M/B/T или букву «О».", "error");
      }
      changes.push({ participant_id: row.dataset.vsBulkParticipant, result_date: resultDate, points, is_vacation: vacation, delete_result: false });
    }
  }

  if (!changes.length) return showMessage("В общей таблице нет изменений.", "info");
  button.disabled = true;
  try {
    const { error } = await saveAllianceVsResultsBatch(state.client, getActiveAllianceId(), changes);
    if (error) throw error;
    byId("vsBulkCard").hidden = true;
    await reload();
    showMessage(`Сохранено изменений: ${changes.length}.`, "success");
  } catch (error) {
    showMessage(error?.message || "Не удалось сохранить общую таблицу VS.", "error");
  } finally {
    button.disabled = false;
  }
}

async function saveTarget(event) {
  event.preventDefault();
  const target = parseScore(byId("vsDailyTarget").value);
  if (!target) return showMessage("Укажи норматив больше нуля.", "error");
  const button = event.submitter;
  if (button) button.disabled = true;
  try {
    const { error } = await setAllianceVsDailyTarget(state.client, getActiveAllianceId(), target);
    if (error) throw error;
    await reload();
    showMessage("Норматив сохранён.", "success");
  } catch (error) {
    showMessage(error?.message || "Не удалось сохранить норматив.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function saveSaturdayTotal(event) {
  const checkbox = event.currentTarget;
  const nextValue = checkbox.checked;
  checkbox.disabled = true;
  try {
    const { error } = await setAllianceVsSaturdayTotal(state.client, getActiveAllianceId(), nextValue);
    if (error) throw error;
    await reload();
    showMessage(nextValue ? "Субботний этап учитывается в общей сумме." : "Общая сумма считается только по понедельнику–пятницу.", "success");
  } catch (error) {
    checkbox.checked = !nextValue;
    showMessage(error?.message || "Не удалось изменить учёт субботы.", "error");
  } finally {
    checkbox.disabled = false;
  }
}

function toggleFullscreen(open) {
  setAllianceTableFullscreen(byId("vsCurrentTableContainer"), open);
}

export async function init() {
  state.client = window.harvestHubSupabase;
  const utcToday = parseDate(utcDateValue());
  const todayDay = (utcToday.getDay() || 7) - 1;
  state.weekStart = getWeekStart(utcToday);
  byId("vsDay").value = String(Math.min(5, Math.max(0, todayDay)));
  byId("vsResultDate").value = dateValue(todayDay > 5 ? parseDate(addDays(state.weekStart, 5)) : utcToday);
  byId("vsResultDate").max = utcDateValue();
  try { await reload(); } catch (error) { showMessage(error.message, "error"); return; }
  byId("vsDay")?.addEventListener("change", syncDateFromDay);
  byId("vsResultDate")?.addEventListener("change", syncDayFromDate);
  byId("vsVacation")?.addEventListener("change", () => { byId("vsPoints").disabled = byId("vsVacation").checked; });
  byId("vsResultForm")?.addEventListener("submit", saveResult);
  byId("vsTargetForm")?.addEventListener("submit", saveTarget);
  byId("vsEditCancel")?.addEventListener("click", resetEditor);
  byId("vsDeleteResult")?.addEventListener("click", deleteCurrentResult);
  byId("vsSort")?.addEventListener("change", render);
  byId("vsIncludeSaturdayTotal")?.addEventListener("change", saveSaturdayTotal);
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
