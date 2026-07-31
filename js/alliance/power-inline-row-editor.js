import {
  fetchAllianceSquadPower,
  fetchAllianceSquadPowerMeasurement,
  saveAllianceSquadPower
} from "./power-api.js?v=20260728-power-row-editor-1";
import { ACTIVE_ALLIANCE_STORAGE_KEY } from "./config.js";
import { escapeHtml } from "./view.js?v=20260726-power-batch-1";

const PAGE_PATH = "alliance/power.html";
const DATE_MEMORY_KEY = "harvestHubPowerRowEditDate";
const byId = id => document.getElementById(id);

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parsePower(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 1000) / 1000 : undefined;
}

function inputPower(value) {
  return value === null || value === undefined || value === "" ? "" : String(value).replace(".", ",");
}

function activeAllianceId() {
  return localStorage.getItem(ACTIVE_ALLIANCE_STORAGE_KEY) || "";
}

function showMessage(text, type = "info") {
  const box = byId("allianceMessage");
  if (!box) return;
  if (type === "error" && text) {
    box.hidden = true;
    window.harvestHubNotifications?.error(text, "Не удалось изменить замер силы.");
    return;
  }
  box.hidden = !text;
  box.textContent = text;
  box.dataset.type = type;
}

function storedDate() {
  return window[DATE_MEMORY_KEY] || localDateValue();
}

function rememberDate(value) {
  const today = localDateValue();
  window[DATE_MEMORY_KEY] = value && value <= today ? value : today;
  return window[DATE_MEMORY_KEY];
}

export function initPowerInlineRowEditor({ canManage = false, currentParticipantId = "" } = {}) {
  window.harvestHubPowerInlineRowEditor?.destroy?.();

  const controller = new AbortController();
  const { signal } = controller;
  const state = {
    canManage: Boolean(canManage),
    currentParticipantId: currentParticipantId || "",
    participants: new Map(),
    participantsLoaded: false,
    editingId: "",
    date: rememberDate(storedDate()),
    values: ["", "", "", "", ""],
    missing: false,
    dirty: false,
    loading: false,
    saving: false,
    requestToken: 0,
    syncTimer: null
  };

  let observer = null;

  function canEditParticipant(participantId) {
    return state.canManage
      || participantId === state.currentParticipantId
      || state.participants.get(participantId)?.is_own === true;
  }

  function participant(participantId) {
    return state.participants.get(participantId) || null;
  }

  function confirmDiscard() {
    return !state.dirty || window.confirm("В строке есть несохранённые изменения. Отменить их?");
  }

  function closeEditor(force = false) {
    if (!force && !confirmDiscard()) return false;
    state.editingId = "";
    state.values = ["", "", "", "", ""];
    state.missing = false;
    state.dirty = false;
    state.loading = false;
    state.requestToken += 1;
    syncTable();
    return true;
  }

  function editorMarkup(item) {
    if (state.loading) {
      return `<div class="power-inline-editor-loading">Загрузка замера за ${escapeHtml(state.date)}…</div>`;
    }

    const fields = state.values.map((value, index) => `
      <label>
        <span>${index + 1}-й отряд, млн</span>
        <input type="text" inputmode="decimal" data-power-row-squad="${index + 1}" value="${state.missing ? "" : escapeHtml(value)}" data-no-persist="true" ${state.missing ? "disabled" : ""}>
      </label>`).join("");

    return `
      <form class="power-inline-editor" data-power-row-form>
        <div class="power-inline-editor-title">
          <strong>${escapeHtml(item?.nickname || "Игрок")}</strong>
          <span>Замер сохраняется только на выбранную дату</span>
        </div>
        <label class="power-inline-editor-date">
          <span>Дата замера</span>
          <input type="date" data-power-row-date value="${escapeHtml(state.date)}" max="${localDateValue()}" data-no-persist="true" required>
        </label>
        <div class="power-inline-editor-fields">${fields}</div>
        <div class="power-inline-editor-actions">
          <button type="button" class="secondary-button power-inline-missing ${state.missing ? "is-active" : ""}" data-power-row-missing aria-pressed="${state.missing}">— Не сдал</button>
          <button type="submit" ${state.saving ? "disabled" : ""}>${state.saving ? "Сохранение…" : "Сохранить"}</button>
          <button type="button" class="secondary-button" data-power-row-cancel>Отменить</button>
        </div>
      </form>`;
  }

  function decorateButtons() {
    document.querySelectorAll("#powerTableBody [data-power-edit]").forEach(button => {
      const participantId = button.dataset.powerEdit || "";
      const item = participant(participantId);
      const accessKnown = state.canManage
        || participantId === state.currentParticipantId
        || state.participantsLoaded;
      const allowed = accessKnown && canEditParticipant(participantId);
      button.hidden = state.participantsLoaded && !allowed;
      button.disabled = !allowed;
      button.textContent = item?.latest_date ? "Изменить" : "Внести";
      button.setAttribute("aria-expanded", String(state.editingId === participantId));
    });

    const bulkOpen = byId("powerBulkOpen");
    if (bulkOpen && !state.canManage) bulkOpen.hidden = true;
    const bulkControls = byId("powerBulkControls");
    if (bulkControls && !state.canManage) bulkControls.hidden = true;
  }

  function injectEditor() {
    document.querySelectorAll(".power-inline-editor-row").forEach(row => row.remove());
    const table = byId("powerTable");
    if (table) table.dataset.powerRowEditing = state.editingId ? "true" : "false";
    if (!state.editingId) return;

    const button = document.querySelector(`#powerTableBody [data-power-edit="${CSS.escape(state.editingId)}"]`);
    const baseRow = button?.closest("tr");
    if (!baseRow) return;

    const editorRow = document.createElement("tr");
    editorRow.className = "power-inline-editor-row";
    editorRow.dataset.powerEditorFor = state.editingId;
    const cell = document.createElement("td");
    cell.colSpan = Math.max(1, table?.tHead?.rows?.[0]?.cells?.length || baseRow.cells.length);
    cell.innerHTML = editorMarkup(participant(state.editingId));
    editorRow.append(cell);
    baseRow.after(editorRow);
  }

  function observeTable() {
    const target = byId("powerTableBody");
    if (observer && target) observer.observe(target, { childList: true, subtree: true });
  }

  function syncTable() {
    clearTimeout(state.syncTimer);
    state.syncTimer = window.setTimeout(() => {
      if (!byId("alliancePowerSection")) return;
      observer?.disconnect();
      decorateButtons();
      injectEditor();
      observeTable();
      window.harvestHubTableScrollbars?.refresh?.();
    }, 0);
  }

  async function refreshParticipants() {
    const allianceId = activeAllianceId();
    if (!allianceId) return;
    const { data, error } = await fetchAllianceSquadPower(window.harvestHubSupabase, allianceId);
    if (error) {
      showMessage(error.message || "Не удалось загрузить данные силы.", "error");
      return;
    }
    state.participants = new Map((data?.participants || []).map(item => [item.participant_id, item]));
    state.participantsLoaded = true;
    syncTable();
  }

  async function loadMeasurement(participantId, date) {
    const token = ++state.requestToken;
    state.loading = true;
    state.dirty = false;
    state.values = ["", "", "", "", ""];
    state.missing = false;
    syncTable();

    const { data, error } = await fetchAllianceSquadPowerMeasurement(
      window.harvestHubSupabase,
      activeAllianceId(),
      participantId,
      date
    );
    if (token !== state.requestToken || state.editingId !== participantId) return;

    state.loading = false;
    if (error) {
      showMessage(error.message || "Не удалось загрузить замер.", "error");
      syncTable();
      return;
    }
    state.missing = Boolean(data?.missing);
    state.values = [1, 2, 3, 4, 5].map(index => inputPower(data?.[`squad_${index}`]));
    state.dirty = false;
    syncTable();
  }

  async function openEditor(participantId) {
    if (!participantId || !canEditParticipant(participantId)) return;
    if (state.editingId && state.editingId !== participantId && !confirmDiscard()) return;
    state.editingId = participantId;
    await loadMeasurement(participantId, state.date);
    window.setTimeout(() => {
      document.querySelector(`[data-power-editor-for="${CSS.escape(participantId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 40);
  }

  async function changeDate(value) {
    if (!value || value > localDateValue()) return;
    if (state.dirty && !confirmDiscard()) {
      syncTable();
      return;
    }
    state.date = rememberDate(value);
    const bulkDate = byId("powerBulkDate");
    if (bulkDate) bulkDate.value = state.date;
    await loadMeasurement(state.editingId, state.date);
  }

  function updateValue(input) {
    const index = Number(input.dataset.powerRowSquad) - 1;
    if (index < 0 || index > 4) return;
    state.values[index] = input.value;
    state.dirty = true;
  }

  function toggleMissing() {
    state.missing = !state.missing;
    state.dirty = true;
    syncTable();
  }

  async function saveRow(form) {
    if (!state.editingId || state.loading || state.saving) return;
    const fields = [...form.querySelectorAll("[data-power-row-squad]")];
    const values = state.missing ? [null, null, null, null, null] : fields.map(field => parsePower(field.value));
    const invalidIndex = values.findIndex(value => value === undefined);
    if (invalidIndex >= 0) {
      fields[invalidIndex]?.setCustomValidity("Укажи БМ в миллионах, например 87,72");
      fields[invalidIndex]?.reportValidity();
      return;
    }
    fields.forEach(field => field.setCustomValidity(""));
    if (!state.missing && values[0] === null) {
      fields[0]?.setCustomValidity("Укажи силу 1-го отряда или поставь отметку «Не сдал»");
      fields[0]?.reportValidity();
      return;
    }

    state.saving = true;
    syncTable();
    const scrollTop = window.scrollY;
    const successText = state.missing ? "Отметка «не сдал» сохранена." : "Замер силы сохранён.";
    const { error } = await saveAllianceSquadPower(window.harvestHubSupabase, activeAllianceId(), {
      participantId: state.editingId,
      measuredOn: state.date,
      squad1: values[0], squad2: values[1], squad3: values[2], squad4: values[3], squad5: values[4]
    });
    state.saving = false;
    if (error) {
      showMessage(error.message || "Не удалось сохранить замер силы.", "error");
      syncTable();
      return;
    }

    state.dirty = false;
    state.editingId = "";
    await window.loadPage?.(PAGE_PATH, { trackVisit: false });
    showMessage(successText, "success");
    window.requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: "auto" }));
  }

  function handleClick(event) {
    const editButton = event.target.closest("[data-power-edit]");
    if (editButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openEditor(editButton.dataset.powerEdit);
      return;
    }

    if (event.target.closest("[data-power-row-cancel]")) {
      event.preventDefault();
      closeEditor(true);
      return;
    }

    if (event.target.closest("[data-power-row-missing]")) {
      event.preventDefault();
      toggleMissing();
      return;
    }

    const bulkOpen = event.target.closest("#powerBulkOpen");
    if (bulkOpen && state.editingId && !closeEditor()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function handleInput(event) {
    const squad = event.target.closest("[data-power-row-squad]");
    if (squad) updateValue(squad);
  }

  function handleChange(event) {
    const date = event.target.closest("[data-power-row-date]");
    if (date) changeDate(date.value);
    if (event.target.id === "powerBulkDate" && event.target.value) {
      state.date = rememberDate(event.target.value);
    }
  }

  function handleSubmit(event) {
    const form = event.target.closest("[data-power-row-form]");
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    saveRow(form);
  }

  function destroy({ clearDate = false } = {}) {
    clearTimeout(state.syncTimer);
    observer?.disconnect();
    controller.abort();
    document.querySelectorAll(".power-inline-editor-row").forEach(row => row.remove());
    if (clearDate) delete window[DATE_MEMORY_KEY];
    if (window.harvestHubPowerInlineRowEditor === api) delete window.harvestHubPowerInlineRowEditor;
  }

  const api = { destroy, refresh: refreshParticipants };
  window.harvestHubPowerInlineRowEditor = api;

  document.addEventListener("click", handleClick, { capture: true, signal });
  document.addEventListener("input", handleInput, { capture: true, signal });
  document.addEventListener("change", handleChange, { capture: true, signal });
  document.addEventListener("submit", handleSubmit, { capture: true, signal });
  document.addEventListener("harvesthub:page-loaded", event => {
    const { pageName, previousPage } = event.detail || {};
    if (previousPage === PAGE_PATH && pageName !== PAGE_PATH) destroy({ clearDate: true });
  }, { signal });

  observer = new MutationObserver(syncTable);
  observeTable();

  const bulkDate = byId("powerBulkDate");
  if (bulkDate) {
    bulkDate.value = state.date;
    bulkDate.max = localDateValue();
  }

  refreshParticipants();
  return api;
}
