import {
  fetchAllianceVsStatistics,
  saveAllianceVsResult,
  deleteAllianceVsResult
} from "./vs-api.js?v=20260726-role-batch-1";
import {
  loadAlliancePageContext,
  getActiveAllianceId
} from "./page-context.js?v=20260728-membership-periods-1";

const PAGE_PATH = "alliance/vs.html";
const DATE_MEMORY_KEY = "harvestHubVsInlineDate";
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
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
  const normalized = String(value || "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".")
    .toUpperCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)([KMBTКМВТ]?)$/);
  if (!match) return null;
  const multiplier = {
    "": 1e6,
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
  if (!number) return "";
  const unit = [[1e12, "Т"], [1e9, "В"], [1e6, "М"], [1e3, "k"]]
    .find(([size]) => Math.abs(number) >= size);
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

function defaultDate(weekStart) {
  const today = utcDateValue();
  const saturday = addDays(weekStart, 5);
  return today > saturday ? saturday : today;
}

function initEditor() {
  window.harvestHubVsInlineRowEditor?.destroy?.();

  const controller = new AbortController();
  const { signal } = controller;
  const state = {
    context: null,
    statistics: null,
    weekStart: getWeekStart(utcDateValue()),
    date: "",
    editingId: "",
    points: "",
    vacation: false,
    hasEntry: false,
    dirty: false,
    saving: false,
    observer: null,
    syncTimer: null,
    requestToken: 0
  };

  const remembered = window[DATE_MEMORY_KEY];
  const start = state.weekStart;
  const end = addDays(start, 5);
  state.date = remembered && remembered >= start && remembered <= end && remembered <= utcDateValue()
    ? remembered
    : defaultDate(start);
  window[DATE_MEMORY_KEY] = state.date;

  function isMounted() {
    return Boolean(document.getElementById("vsCurrentTableContainer"));
  }

  function participant(participantId) {
    return state.context?.participants?.find(item => item.id === participantId) || null;
  }

  function entry(participantId, date = state.date) {
    return state.statistics?.results?.find(item => (
      item.participant_id === participantId && item.result_date === date
    )) || null;
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

  function hydrate(participantId, date) {
    const result = entry(participantId, date);
    state.editingId = participantId;
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
          <input type="date"
                 min="${escapeHtml(state.weekStart)}"
                 max="${escapeHtml(defaultDate(state.weekStart))}"
                 value="${escapeHtml(state.date)}"
                 data-vs-inline-date
                 data-no-persist="true"
                 required>
        </label>
        <label class="vs-inline-editor-points">
          <span class="tooltip" data-tooltip="Число без буквы считается миллионами: 13 = 13М, 0,1 = 100k. Можно использовать K, M, B или T.">Очки</span>
          <input type="text"
                 inputmode="decimal"
                 value="${state.vacation ? "" : escapeHtml(state.points)}"
                 data-vs-inline-points
                 data-no-persist="true"
                 ${state.vacation ? "disabled" : ""}>
        </label>
        <label class="checkbox vs-inline-editor-vacation">
          <input type="checkbox"
                 data-vs-inline-vacation
                 data-no-persist="true"
                 ${state.vacation ? "checked" : ""}>
          <span>Отпуск</span>
        </label>
        <div class="vs-inline-editor-actions">
          <button type="submit" ${state.saving ? "disabled" : ""}>${state.saving ? "Сохранение…" : "Сохранить"}</button>
          ${state.hasEntry ? `<button type="button" class="danger-button" data-vs-inline-delete ${state.saving ? "disabled" : ""}>Удалить результат</button>` : ""}
          <button type="button" class="secondary-button" data-vs-inline-cancel>Отменить</button>
        </div>
      </form>`;
  }

  function decorateButtons() {
    document.querySelectorAll("#vsTableBody [data-vs-edit]").forEach(button => {
      const participantId = button.dataset.vsEdit || "";
      button.textContent = entry(participantId) ? "Изменить" : "Внести";
      button.setAttribute("aria-expanded", String(state.editingId === participantId));
    });
  }

  function injectEditor() {
    document.querySelectorAll(".vs-inline-editor-row").forEach(row => row.remove());
    if (!state.editingId) return;

    const button = document.querySelector(
      `#vsTableBody [data-vs-edit="${CSS.escape(state.editingId)}"]`
    );
    const baseRow = button?.closest("tr");
    if (!baseRow) return;

    const editorRow = document.createElement("tr");
    editorRow.className = "vs-inline-editor-row";
    editorRow.dataset.vsInlineEditorFor = state.editingId;

    const cell = document.createElement("td");
    const table = document.querySelector("#vsCurrentTableContainer .vs-table");
    cell.colSpan = Math.max(
      1,
      table?.tHead?.rows?.[0]?.cells?.length || baseRow.cells.length
    );
    cell.innerHTML = editorMarkup(participant(state.editingId));
    editorRow.append(cell);
    baseRow.after(editorRow);
  }

  function observeTable() {
    const body = document.getElementById("vsTableBody");
    if (body && state.observer) {
      state.observer.observe(body, { childList: true, subtree: true });
    }
  }

  function syncTable() {
    clearTimeout(state.syncTimer);
    state.syncTimer = window.setTimeout(() => {
      if (!isMounted()) return;
      state.observer?.disconnect();
      decorateButtons();
      injectEditor();
      observeTable();
      window.harvestHubTableScrollbars?.refresh?.();
    }, 0);
  }

  async function refreshData() {
    const token = ++state.requestToken;
    const client = window.harvestHubSupabase;
    const allianceId = getActiveAllianceId();
    if (!client || !allianceId || !isMounted()) return;

    const [context, statistics] = await Promise.all([
      loadAlliancePageContext(client, { force: true }),
      fetchAllianceVsStatistics(
        client,
        allianceId,
        state.weekStart,
        addDays(state.weekStart, 5)
      )
    ]);
    if (token !== state.requestToken || !isMounted()) return;
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

  async function openEditor(participantId) {
    if (!participantId) return;
    if (state.editingId && state.editingId !== participantId && !confirmDiscard()) return;
    if (!state.context || !state.statistics) {
      try {
        await refreshData();
      } catch (error) {
        showMessage(error?.message || "Не удалось загрузить результаты VS.", "error");
        return;
      }
    }

    const item = participant(participantId);
    if (!item) return;
    const date = availableDate(item);
    if (!date) {
      showMessage("На доступные дни этой недели игрок ещё не состоял в союзе.", "info");
      return;
    }

    hydrate(participantId, date);
    syncTable();
    window.setTimeout(() => {
      document.querySelector(
        `[data-vs-inline-editor-for="${CSS.escape(participantId)}"]`
      )?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 40);
  }

  function changeDate(value) {
    const item = participant(state.editingId);
    if (!value || !item) return;

    const min = state.weekStart;
    const max = defaultDate(state.weekStart);
    if (value < min || value > max || weekdayIndex(value) > 5) {
      showMessage("Выбери завершившийся или текущий день этой недели с понедельника по субботу.", "error");
      syncTable();
      return;
    }
    if (!isMemberOn(item, value)) {
      showMessage("На выбранную дату игрок не состоял в союзе.", "error");
      syncTable();
      return;
    }
    if (!confirmDiscard()) {
      syncTable();
      return;
    }

    hydrate(state.editingId, value);
    syncTable();
  }

  async function save(form) {
    if (!state.editingId || state.saving) return;

    const item = participant(state.editingId);
    if (!item || !isMemberOn(item, state.date)) {
      showMessage("На выбранную дату игрок не состоял в союзе.", "error");
      return;
    }

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
    syncTable();
    try {
      const { error } = await saveAllianceVsResult(
        window.harvestHubSupabase,
        getActiveAllianceId(),
        {
          participantId: state.editingId,
          resultDate: state.date,
          points,
          isVacation: vacation
        }
      );
      if (error) throw error;

      const rememberedDate = state.date;
      state.dirty = false;
      state.editingId = "";
      await window.loadPage?.(PAGE_PATH, { trackVisit: false });
      window[DATE_MEMORY_KEY] = rememberedDate;
      showMessage("Результат сохранён.", "success");
    } catch (error) {
      state.saving = false;
      syncTable();
      showMessage(error?.message || "Не удалось сохранить результат.", "error");
    }
  }

  async function remove() {
    if (!state.editingId || !state.hasEntry || state.saving) return;
    const item = participant(state.editingId);
    if (!window.confirm(
      `Удалить результат «${item?.nickname || "участника"}» за ${formatDate(state.date)}?`
    )) return;

    state.saving = true;
    syncTable();
    try {
      const { error } = await deleteAllianceVsResult(
        window.harvestHubSupabase,
        getActiveAllianceId(),
        state.editingId,
        state.date
      );
      if (error) throw error;

      const rememberedDate = state.date;
      state.dirty = false;
      state.editingId = "";
      await window.loadPage?.(PAGE_PATH, { trackVisit: false });
      window[DATE_MEMORY_KEY] = rememberedDate;
      showMessage("Результат удалён.", "success");
    } catch (error) {
      state.saving = false;
      syncTable();
      showMessage(error?.message || "Не удалось удалить результат.", "error");
    }
  }

  function handleClick(event) {
    if (!isMounted()) return;

    const editButton = event.target.closest("[data-vs-edit]");
    if (editButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openEditor(editButton.dataset.vsEdit);
      return;
    }

    if (event.target.closest("[data-vs-inline-cancel]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeEditor();
      return;
    }

    if (event.target.closest("[data-vs-inline-delete]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      remove();
      return;
    }

    const bulkOpen = event.target.closest("#vsBulkOpen");
    if (bulkOpen && state.editingId) {
      if (!closeEditor()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }
  }

  function handleInput(event) {
    if (!state.editingId) return;
    if (event.target.matches("[data-vs-inline-points]")) {
      state.points = event.target.value;
      state.dirty = true;
    }
  }

  function handleChange(event) {
    if (!state.editingId) return;

    if (event.target.matches("[data-vs-inline-date]")) {
      changeDate(event.target.value);
      return;
    }

    if (event.target.matches("[data-vs-inline-vacation]")) {
      state.vacation = event.target.checked;
      state.dirty = true;
      syncTable();
    }
  }

  function handleSubmit(event) {
    const form = event.target.closest("[data-vs-inline-form]");
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    save(form);
  }

  state.observer = new MutationObserver(syncTable);
  document.addEventListener("click", handleClick, { capture: true, signal });
  document.addEventListener("input", handleInput, { signal });
  document.addEventListener("change", handleChange, { signal });
  document.addEventListener("submit", handleSubmit, { signal });

  refreshData().catch(error => {
    showMessage(error?.message || "Не удалось подготовить построчный ввод VS.", "error");
  });

  const api = {
    destroy() {
      controller.abort();
      state.observer?.disconnect();
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
    delete window[DATE_MEMORY_KEY];
    return;
  }
  initEditor();
});
