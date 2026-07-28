import {
  fetchAllianceVsStatistics,
  saveAllianceVsResult,
  deleteAllianceVsResult
} from "./vs-api.js?v=20260726-role-batch-1";
import { loadAlliancePageContext, getActiveAllianceId } from "./page-context.js?v=20260728-membership-periods-1";

const PAGE_PATH = "alliance/vs.html";
const WEEK_MEMORY_KEY = "harvestHubVsSelectedWeekStart";
const DATE_MEMORY_KEY = "harvestHubVsInlineDate";
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const SORTABLE_COLUMNS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
const pad = value => String(value).padStart(2, "0");

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

function weekdayIndex(value) {
  return (parseDate(value).getDay() || 7) - 1;
}

function defaultDate(weekStart) {
  const today = utcDateValue();
  const saturday = addDays(weekStart, 5);
  return today > saturday ? saturday : today < weekStart ? weekStart : today;
}

function formatDate(value) {
  const date = parseDate(value);
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  if (!number) return "";
  const unit = [[1e12, "Т"], [1e9, "В"], [1e6, "М"], [1e3, "k"]].find(([size]) => Math.abs(number) >= size);
  if (!unit) return new Intl.NumberFormat("ru-RU").format(number);
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(number / unit[0])}${unit[1]}`;
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

function showMessage(text, type = "info") {
  const box = document.getElementById("allianceMessage");
  if (!box) return;
  box.hidden = !text;
  box.textContent = text;
  box.dataset.type = type;
}

function initEditor() {
  window.harvestHubVsInlineRowEditor?.destroy?.();

  const controller = new AbortController();
  const { signal } = controller;
  const state = {
    context: null,
    statistics: null,
    weekStart: getWeekStart(window[WEEK_MEMORY_KEY] || utcDateValue()),
    date: "",
    editingId: "",
    points: "",
    vacation: false,
    hasEntry: false,
    dirty: false,
    saving: false,
    sortColumn: 8,
    sortDirection: "desc",
    bulkMode: false,
    bulkSaving: false,
    normalHead: "",
    normalBody: "",
    normalSummary: "",
    normalSummaryHidden: true,
    tableObserver: null,
    messageObserver: null,
    syncTimer: null,
    requestToken: 0
  };

  const rememberedDate = window[DATE_MEMORY_KEY];
  const weekEnd = addDays(state.weekStart, 5);
  state.date = rememberedDate && rememberedDate >= state.weekStart && rememberedDate <= weekEnd && rememberedDate <= utcDateValue()
    ? rememberedDate
    : defaultDate(state.weekStart);
  window[WEEK_MEMORY_KEY] = state.weekStart;
  window[DATE_MEMORY_KEY] = state.date;

  function mounted() {
    return Boolean(document.getElementById("vsCurrentTableContainer"));
  }

  function participant(id) {
    return state.context?.participants?.find(item => item.id === id) || null;
  }

  function entry(id = state.editingId, date = state.date) {
    return state.statistics?.results?.find(item => item.participant_id === id && item.result_date === date) || null;
  }

  function confirmDiscard() {
    return !state.dirty || window.confirm("В строке есть несохранённые изменения. Отменить их?");
  }

  function availableDate(item) {
    if (state.date && isMemberOn(item, state.date)) return state.date;
    return DAYS
      .map((_, index) => addDays(state.weekStart, index))
      .filter(date => date <= utcDateValue() && isMemberOn(item, date))
      .at(-1) || "";
  }

  function hydrate(id, date) {
    const result = entry(id, date);
    state.editingId = id;
    state.date = date;
    state.points = result?.points ? formatScore(result.points) : "";
    state.vacation = Boolean(result?.is_vacation);
    state.hasEntry = Boolean(result);
    state.dirty = false;
    state.saving = false;
    window[DATE_MEMORY_KEY] = date;
  }

  function editorMarkup(item) {
    const day = DAYS[weekdayIndex(state.date)] || "";
    return `
      <form class="vs-inline-editor" data-vs-inline-form>
        <div class="vs-inline-editor-title">
          <strong>${escapeHtml(item?.nickname || "Игрок")}</strong>
          <span>Результат за выбранный день · ${escapeHtml(day)}</span>
        </div>
        <label class="vs-inline-editor-date">
          <span>Дата</span>
          <input type="date" min="${escapeHtml(state.weekStart)}" max="${escapeHtml(defaultDate(state.weekStart))}" value="${escapeHtml(state.date)}" data-vs-inline-date data-no-persist="true" required>
        </label>
        <label class="vs-inline-editor-points">
          <span class="tooltip" data-tooltip="Число без буквы считается миллионами: 13 = 13М, 0,1 = 100k. Можно использовать K, M, B или T.">Очки</span>
          <input type="text" inputmode="decimal" value="${state.vacation ? "" : escapeHtml(state.points)}" data-vs-inline-points data-no-persist="true" ${state.vacation ? "disabled" : ""}>
        </label>
        <label class="checkbox vs-inline-editor-vacation">
          <input type="checkbox" data-vs-inline-vacation data-no-persist="true" ${state.vacation ? "checked" : ""}>
          <span>Отпуск</span>
        </label>
        <div class="vs-inline-editor-actions">
          <button type="submit" ${state.saving ? "disabled" : ""}>${state.saving ? "Сохранение…" : "Сохранить"}</button>
          ${state.hasEntry ? `<button type="button" class="danger-button" data-vs-inline-delete ${state.saving ? "disabled" : ""}>Удалить результат</button>` : ""}
          <button type="button" class="secondary-button" data-vs-inline-cancel>Отменить</button>
        </div>
      </form>`;
  }

  function dataRows() {
    const body = document.getElementById("vsTableBody");
    return [...body?.rows || []].filter(row => !row.classList.contains("vs-inline-editor-row"));
  }

  function scoreFromText(value) {
    const text = String(value || "").trim();
    if (!text || text === "—" || text === "О") return 0;
    const normalized = text.replace(/\s/g, "").replace(",", ".").toUpperCase();
    const match = normalized.match(/(-?\d+(?:\.\d+)?)([KМMBВTТ]?)/);
    if (!match) return 0;
    const multiplier = { "": 1, K: 1e3, М: 1e6, M: 1e6, В: 1e9, B: 1e9, Т: 1e12, T: 1e12 }[match[2]] || 1;
    return Number(match[1]) * multiplier;
  }

  function sortValue(row, index) {
    const cell = row.cells[index];
    if (!cell) return 0;
    if (index === 1) return String(cell.querySelector("strong")?.textContent || cell.textContent || "").trim().toLocaleLowerCase("ru-RU");
    if (index === 9) return Number(String(cell.textContent || "").match(/\d+/)?.[0] || 0);
    return scoreFromText(cell.textContent);
  }

  function applySort() {
    const table = document.querySelector("#vsCurrentTableContainer .vs-table");
    if (!table || state.bulkMode || state.editingId) return;
    const body = document.getElementById("vsTableBody");
    const rows = dataRows();
    rows.sort((a, b) => {
      const left = sortValue(a, state.sortColumn);
      const right = sortValue(b, state.sortColumn);
      const result = typeof left === "string" ? left.localeCompare(right, "ru", { numeric: true }) : left - right;
      return state.sortDirection === "asc" ? result : -result;
    });
    rows.forEach((row, index) => {
      body.append(row);
      if (row.cells[0]) row.cells[0].textContent = String(index + 1);
    });
  }

  function decorateHeaders() {
    document.querySelectorAll("#vsTableHead th").forEach((header, index) => {
      const sortable = SORTABLE_COLUMNS.has(index) && !state.bulkMode;
      header.classList.toggle("is-vs-sortable", sortable);
      header.classList.toggle("is-vs-sort-active", sortable && index === state.sortColumn);
      header.dataset.vsSortDirection = sortable && index === state.sortColumn ? state.sortDirection : "";
      if (sortable) {
        header.tabIndex = 0;
        header.setAttribute("role", "button");
      } else {
        header.removeAttribute("tabindex");
        header.removeAttribute("role");
      }
    });
  }

  function decorateButtons() {
    if (state.bulkMode) return;
    document.querySelectorAll("#vsTableBody [data-vs-edit]").forEach(button => {
      const id = button.dataset.vsEdit || "";
      button.textContent = entry(id) ? "Изменить" : "Внести";
      button.setAttribute("aria-expanded", String(state.editingId === id));
    });
  }

  function injectEditor() {
    document.querySelectorAll(".vs-inline-editor-row").forEach(row => row.remove());
    if (!state.editingId || state.bulkMode) return;
    const button = document.querySelector(`#vsTableBody [data-vs-edit="${CSS.escape(state.editingId)}"]`);
    const baseRow = button?.closest("tr");
    if (!baseRow) return;
    const row = document.createElement("tr");
    row.className = "vs-inline-editor-row";
    row.dataset.vsInlineEditorFor = state.editingId;
    const cell = document.createElement("td");
    cell.colSpan = Math.max(1, document.querySelectorAll("#vsTableHead th").length);
    cell.innerHTML = editorMarkup(participant(state.editingId));
    row.append(cell);
    baseRow.after(row);
  }

  function syncWeekControl() {
    const input = document.getElementById("vsWeekDate");
    if (!input) return;
    input.max = utcDateValue();
    input.value = state.weekStart;
  }

  function updateBulkControls() {
    const table = document.querySelector("#vsCurrentTableContainer .vs-table");
    if (table) {
      table.dataset.vsBulkMode = String(state.bulkMode);
      table.dataset.powerBulkMode = String(state.bulkMode);
      table.dataset.powerRowEditing = String(Boolean(state.editingId));
      table.dataset.sortInitialized = "true";
    }
    const open = document.getElementById("vsBulkOpen");
    const controls = document.getElementById("vsBulkControls");
    const hint = document.getElementById("vsBulkHint");
    if (open) open.hidden = state.bulkMode;
    if (controls) controls.hidden = !state.bulkMode;
    if (hint) hint.hidden = !state.bulkMode;
  }

  function syncTable() {
    clearTimeout(state.syncTimer);
    state.syncTimer = window.setTimeout(() => {
      if (!mounted()) return;
      state.tableObserver?.disconnect();
      if (!state.bulkMode) {
        applySort();
        decorateHeaders();
        decorateButtons();
        injectEditor();
      }
      syncWeekControl();
      updateBulkControls();
      const body = document.getElementById("vsTableBody");
      if (body && state.tableObserver) state.tableObserver.observe(body, { childList: true });
      window.harvestHubTableScrollbars?.refresh?.();
    }, 0);
  }

  async function refreshData() {
    const token = ++state.requestToken;
    const client = window.harvestHubSupabase;
    const allianceId = getActiveAllianceId();
    const [context, statistics] = await Promise.all([
      loadAlliancePageContext(client, { force: true }),
      fetchAllianceVsStatistics(client, allianceId, state.weekStart, addDays(state.weekStart, 5))
    ]);
    if (token !== state.requestToken || !mounted()) return;
    if (statistics.error) throw statistics.error;
    state.context = context;
    state.statistics = statistics.data || { results: [] };
    syncTable();
  }

  function closeEditor(force = false) {
    if (!force && !confirmDiscard()) return false;
    state.editingId = "";
    state.points = "";
    state.vacation = false;
    state.hasEntry = false;
    state.dirty = false;
    state.saving = false;
    syncTable();
    return true;
  }

  async function openEditor(id) {
    if (!id || state.bulkMode) return;
    if (state.editingId && state.editingId !== id && !confirmDiscard()) return;
    if (!state.context || !state.statistics) await refreshData();
    const item = participant(id);
    if (!item) return;
    const date = availableDate(item);
    if (!date) return showMessage("На доступные дни выбранной недели игрок ещё не состоял в союзе.", "info");
    hydrate(id, date);
    syncTable();
    window.setTimeout(() => {
      const row = document.querySelector(`[data-vs-inline-editor-for="${CSS.escape(id)}"]`);
      row?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      row?.querySelector("[data-vs-inline-points]")?.focus();
    }, 40);
  }

  function syncInlineFields() {
    const form = document.querySelector("[data-vs-inline-form]");
    if (!form) return;
    const points = form.querySelector("[data-vs-inline-points]");
    const vacation = form.querySelector("[data-vs-inline-vacation]");
    const title = form.querySelector(".vs-inline-editor-title span");
    if (points) {
      points.value = state.vacation ? "" : state.points;
      points.disabled = state.vacation;
    }
    if (vacation) vacation.checked = state.vacation;
    if (title) title.textContent = `Результат за выбранный день · ${DAYS[weekdayIndex(state.date)] || ""}`;
  }

  function changeDate(value) {
    const item = participant(state.editingId);
    if (!value || !item) return;
    const input = document.querySelector("[data-vs-inline-date]");
    if (value < state.weekStart || value > defaultDate(state.weekStart) || weekdayIndex(value) > 5) {
      showMessage("Выбери доступный день выбранной недели с понедельника по субботу.", "error");
      if (input) input.value = state.date;
      return;
    }
    if (!isMemberOn(item, value)) {
      showMessage("На выбранную дату игрок не состоял в союзе.", "error");
      if (input) input.value = state.date;
      return;
    }
    if (!confirmDiscard()) {
      if (input) input.value = state.date;
      return;
    }
    hydrate(state.editingId, value);
    syncInlineFields();
  }

  async function save(form) {
    if (!state.editingId || state.saving) return;
    const item = participant(state.editingId);
    if (!item || !isMemberOn(item, state.date)) return showMessage("На выбранную дату игрок не состоял в союзе.", "error");
    const vacation = Boolean(form.querySelector("[data-vs-inline-vacation]")?.checked);
    const pointsInput = form.querySelector("[data-vs-inline-points]");
    const points = vacation ? null : parseScore(pointsInput?.value);
    if (!vacation && points === null) {
      pointsInput?.setCustomValidity("Проверь формат очков");
      pointsInput?.reportValidity();
      return;
    }
    pointsInput?.setCustomValidity("");
    state.saving = true;
    form.querySelectorAll("button").forEach(button => { button.disabled = true; });
    try {
      const { error } = await saveAllianceVsResult(window.harvestHubSupabase, getActiveAllianceId(), {
        participantId: state.editingId,
        resultDate: state.date,
        points,
        isVacation: vacation
      });
      if (error) throw error;
      state.dirty = false;
      state.editingId = "";
      await window.loadPage?.(PAGE_PATH, { trackVisit: false });
      showMessage("Результат сохранён.", "success");
    } catch (error) {
      state.saving = false;
      form.querySelectorAll("button").forEach(button => { button.disabled = false; });
      showMessage(error?.message || "Не удалось сохранить результат.", "error");
    }
  }

  async function remove() {
    if (!state.editingId || !state.hasEntry || state.saving) return;
    const item = participant(state.editingId);
    if (!window.confirm(`Удалить результат «${item?.nickname || "участника"}» за ${formatDate(state.date)}?`)) return;
    state.saving = true;
    try {
      const { error } = await deleteAllianceVsResult(window.harvestHubSupabase, getActiveAllianceId(), state.editingId, state.date);
      if (error) throw error;
      state.dirty = false;
      state.editingId = "";
      await window.loadPage?.(PAGE_PATH, { trackVisit: false });
      showMessage("Результат удалён.", "success");
    } catch (error) {
      state.saving = false;
      showMessage(error?.message || "Не удалось удалить результат.", "error");
      syncTable();
    }
  }

  function enterBulkMode() {
    if (state.editingId && !closeEditor()) return;
    const source = document.getElementById("vsBulkBody");
    const body = document.getElementById("vsTableBody");
    const head = document.getElementById("vsTableHead");
    const summary = document.getElementById("vsSummary");
    if (!source || !body || !head || !summary) return;

    state.normalHead = head.innerHTML;
    state.normalBody = body.innerHTML;
    state.normalSummary = summary.innerHTML;
    state.normalSummaryHidden = summary.hidden;
    state.bulkMode = true;

    head.innerHTML = `<tr><th>Место</th><th>Участник</th>${DAYS.map(day => `<th>${day}</th>`).join("")}</tr>`;
    body.innerHTML = "";
    [...source.rows].forEach((row, index) => {
      const place = row.insertCell(0);
      place.dataset.vsBulkPlace = "true";
      place.textContent = String(index + 1);
      body.append(row);
    });
    summary.hidden = true;
    updateBulkControls();
    document.dispatchEvent(new CustomEvent("harvesthub:vs-bulk-opened", { detail: { weekStart: state.weekStart } }));
    window.setTimeout(() => body.querySelector("[data-vs-bulk-day]:not(:disabled)")?.focus(), 30);
  }

  function restoreNormalTable() {
    const source = document.getElementById("vsBulkBody");
    const body = document.getElementById("vsTableBody");
    const head = document.getElementById("vsTableHead");
    const summary = document.getElementById("vsSummary");
    if (!source || !body || !head || !summary) return;
    [...body.querySelectorAll("[data-vs-bulk-participant]")].forEach(row => {
      row.querySelector("[data-vs-bulk-place]")?.remove();
      source.append(row);
    });
    head.innerHTML = state.normalHead;
    body.innerHTML = state.normalBody;
    summary.innerHTML = state.normalSummary;
    summary.hidden = state.normalSummaryHidden;
    state.bulkMode = false;
    updateBulkControls();
    syncTable();
  }

  function closeBulkMode() {
    window.harvestHubVsDraft?.saveBulkNow?.();
    restoreNormalTable();
  }

  async function switchWeek(value) {
    if (!value) return;
    if (state.editingId && !confirmDiscard()) {
      syncWeekControl();
      return;
    }
    if (state.bulkMode) closeBulkMode();
    const weekStart = getWeekStart(value);
    if (weekStart > getWeekStart(utcDateValue())) {
      showMessage("Будущую неделю пока нельзя выбрать.", "error");
      syncWeekControl();
      return;
    }
    state.weekStart = weekStart;
    state.date = defaultDate(weekStart);
    window[WEEK_MEMORY_KEY] = weekStart;
    window[DATE_MEMORY_KEY] = state.date;
    const hiddenDate = document.getElementById("vsResultDate");
    if (hiddenDate) {
      hiddenDate.value = state.date;
      hiddenDate.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await refreshData();
  }

  function runHeaderSort(header) {
    const index = [...header.parentElement.children].indexOf(header);
    if (!SORTABLE_COLUMNS.has(index) || state.bulkMode || state.editingId) return;
    state.sortDirection = state.sortColumn === index && state.sortDirection === "desc" ? "asc" : "desc";
    state.sortColumn = index;
    applySort();
    decorateHeaders();
  }

  function handleClick(event) {
    if (!mounted()) return;
    const bulkOpen = event.target.closest("#vsBulkOpen");
    if (bulkOpen) {
      event.preventDefault();
      event.stopImmediatePropagation();
      enterBulkMode();
      return;
    }
    const bulkClose = event.target.closest("#vsBulkClose");
    if (bulkClose) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeBulkMode();
      return;
    }
    if (event.target.closest("#vsBulkSave")) {
      state.bulkSaving = true;
      return;
    }
    const header = event.target.closest("#vsTableHead th.is-vs-sortable");
    if (header) {
      event.preventDefault();
      runHeaderSort(header);
      return;
    }
    const editButton = event.target.closest("[data-vs-edit]");
    if (editButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openEditor(editButton.dataset.vsEdit).catch(error => showMessage(error?.message || "Не удалось открыть строку.", "error"));
      return;
    }
    if (event.target.closest("[data-vs-inline-cancel]")) {
      event.preventDefault();
      closeEditor();
      return;
    }
    if (event.target.closest("[data-vs-inline-delete]")) {
      event.preventDefault();
      remove();
    }
  }

  function handleKeydown(event) {
    const header = event.target.closest?.("#vsTableHead th.is-vs-sortable");
    if (header && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      runHeaderSort(header);
      return;
    }
    const form = event.target.closest?.("[data-vs-inline-form]");
    const saveByEnter = event.target.matches?.("[data-vs-inline-points], [data-vs-inline-vacation]");
    if (form && saveByEnter && event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      save(form);
    }
  }

  function handleInput(event) {
    if (event.target.matches("[data-vs-inline-points]")) {
      state.points = event.target.value;
      state.dirty = true;
    }
  }

  function handleChange(event) {
    if (event.target.id === "vsWeekDate") {
      switchWeek(event.target.value).catch(error => showMessage(error?.message || "Не удалось загрузить неделю.", "error"));
      return;
    }
    if (event.target.matches("[data-vs-inline-date]")) {
      changeDate(event.target.value);
      return;
    }
    if (event.target.matches("[data-vs-inline-vacation]")) {
      state.vacation = event.target.checked;
      state.dirty = true;
      syncInlineFields();
    }
  }

  function handleSubmit(event) {
    const form = event.target.closest("[data-vs-inline-form]");
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    save(form);
  }

  state.tableObserver = new MutationObserver(() => {
    if (state.bulkMode && !document.querySelector("#vsTableBody [data-vs-bulk-participant]")) {
      state.bulkMode = false;
      updateBulkControls();
    }
    syncTable();
  });
  const tableBody = document.getElementById("vsTableBody");
  if (tableBody) state.tableObserver.observe(tableBody, { childList: true });

  state.messageObserver = new MutationObserver(() => {
    const message = document.getElementById("allianceMessage")?.textContent || "";
    if (!state.bulkSaving || !message.startsWith("Сохранено изменений:")) return;
    state.bulkSaving = false;
    state.bulkMode = false;
    document.dispatchEvent(new CustomEvent("harvesthub:vs-bulk-saved", { detail: { weekStart: state.weekStart } }));
    updateBulkControls();
  });
  const messageBox = document.getElementById("allianceMessage");
  if (messageBox) state.messageObserver.observe(messageBox, { childList: true, characterData: true, subtree: true });

  document.addEventListener("click", handleClick, { capture: true, signal });
  document.addEventListener("keydown", handleKeydown, { signal });
  document.addEventListener("input", handleInput, { signal });
  document.addEventListener("change", handleChange, { signal });
  document.addEventListener("submit", handleSubmit, { signal });

  syncWeekControl();
  refreshData().catch(error => showMessage(error?.message || "Не удалось подготовить страницу VS.", "error"));

  const api = {
    destroy() {
      controller.abort();
      state.tableObserver?.disconnect();
      state.messageObserver?.disconnect();
      clearTimeout(state.syncTimer);
      document.querySelectorAll(".vs-inline-editor-row").forEach(row => row.remove());
    }
  };
  window.harvestHubVsInlineRowEditor = api;
  return api;
}

document.addEventListener("harvesthub:page-loaded", event => {
  const pageName = event.detail?.pageName || localStorage.getItem("currentPage") || "";
  if (pageName !== PAGE_PATH) {
    window.harvestHubVsInlineRowEditor?.destroy?.();
    window.harvestHubVsInlineRowEditor = null;
    delete window[WEEK_MEMORY_KEY];
    delete window[DATE_MEMORY_KEY];
    return;
  }
  initEditor();
});
