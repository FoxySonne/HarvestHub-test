import { fetchAllianceSquadPower, saveAllianceSquadPower, saveAllianceSquadPowerBatch, setAlliancePowerSeasonStart } from "./power-api.js?v=20260726-power-batch-1";
import { ACTIVE_ALLIANCE_STORAGE_KEY } from "./config.js";
import { escapeHtml } from "./view.js?v=20260726-power-batch-1";
import { setAllianceTableFullscreen } from "./fullscreen-table.js?v=20260721-1";

const state = {
  client: null,
  data: null,
  expanded: false,
  loadToken: 0,
  bulkEditing: false,
  bulkDraft: new Map(),
  bulkOriginal: new Map(),
  bulkMissing: new Set(),
  bulkTouched: new Set()
};
const byId = id => document.getElementById(id);

function isMounted() {
  return Boolean(byId("alliancePowerSection"));
}

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

function formatPower(value) {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(Number(value));
}

function inputPower(value) {
  return value === null || value === undefined || value === "" ? "" : String(value).replace(".", ",");
}

function formatDelta(value) {
  const number = Number(value) || 0;
  return `${number > 0 ? "+" : ""}${formatPower(number)}`;
}

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function activeAllianceId() {
  return localStorage.getItem(ACTIVE_ALLIANCE_STORAGE_KEY) || "";
}

function showMessage(text, type = "info") {
  const box = byId("allianceMessage");
  if (!box) return;
  box.hidden = !text;
  box.textContent = text;
  box.dataset.type = type;
}

function growthPercent(latest, previous) {
  const current = Number(latest) || 0;
  const old = Number(previous) || 0;
  if (!old) return current ? 100 : 0;
  return ((current - old) / old) * 100;
}

function selectedColumns() {
  return new Set([...document.querySelectorAll("[data-power-column]:checked")].map(input => input.dataset.powerColumn));
}

function applyColumnVisibility() {
  if (state.bulkEditing) return;
  const visible = selectedColumns();
  document.querySelectorAll("[data-power-col]").forEach(cell => { cell.hidden = !visible.has(cell.dataset.powerCol); });
}

function renderSummary(rows) {
  const summary = byId("participantPowerSummary");
  if (!summary) return;
  const measured = rows.filter(item => item.latest_date && !item.latest_missing);
  if (!measured.length) {
    summary.hidden = true;
    summary.innerHTML = "";
    return;
  }
  const totalPower = measured.reduce((sum, item) => sum + (Number(item.latest_power) || 0), 0);
  const totalPrevious = measured.reduce((sum, item) => sum + (Number(item.previous_power) || 0), 0);
  const totalWeek = measured.reduce((sum, item) => sum + (Number(item.week_power) || 0), 0);
  const totalMonth = measured.reduce((sum, item) => sum + (Number(item.month_power) || 0), 0);
  const totalSeason = measured.reduce((sum, item) => sum + (Number(item.season_power) || 0), 0);
  summary.hidden = false;
  summary.innerHTML = `
    <div><span>Участников с замерами</span><strong>${measured.length}</strong></div>
    <div><span>Общий БМ 1-х отрядов</span><strong>${formatPower(totalPower)} млн</strong></div>
    <div data-power-col="previous"><span>Общий прирост с прошлого замера</span><strong>${formatDelta(totalPower - totalPrevious)} млн</strong></div>
    <div data-power-col="week"><span>Общий прирост за неделю</span><strong>${formatDelta(totalPower - totalWeek)} млн</strong></div>
    <div data-power-col="month"><span>Общий прирост за месяц</span><strong>${formatDelta(totalPower - totalMonth)} млн</strong></div>
    <div data-power-col="season"><span>Общий прирост за сезон</span><strong>${formatDelta(totalPower - totalSeason)} млн</strong></div>`;
}

function originalSquads(item) {
  return [1, 2, 3, 4, 5].map(index => {
    const value = item[`squad_${index}`];
    return value === null || value === undefined || value === "" ? null : Number(value);
  });
}

function ensureBulkDraft(rows) {
  rows.forEach(item => {
    if (state.bulkDraft.has(item.participant_id)) return;
    const original = originalSquads(item);
    state.bulkOriginal.set(item.participant_id, original);
    state.bulkDraft.set(item.participant_id, original.map(inputPower));
  });
}

function clearBulkDraft() {
  state.bulkDraft.clear();
  state.bulkOriginal.clear();
  state.bulkMissing.clear();
  state.bulkTouched.clear();
}

function renderNormalTable(rows) {
  const table = byId("powerTable");
  const head = byId("powerTableHead");
  const body = byId("powerTableBody");
  if (!table || !head || !body) return;

  table.classList.remove("is-bulk-editing");
  table.dataset.powerBulkMode = "false";
  head.innerHTML = `<tr><th>Место</th><th>Участник</th><th>Дата</th><th>БМ 1-го отряда, млн</th><th data-power-col="previous">С прошлого замера</th><th data-power-col="week">За неделю</th><th data-power-col="month">За месяц</th><th data-power-col="season">За сезон</th><th data-power-col="percent">Прирост, %</th><th></th></tr>`;
  body.innerHTML = rows.map((item, index) => {
    const missing = Boolean(item.latest_missing);
    const previous = missing ? null : Number(item.latest_power) - Number(item.previous_power);
    const week = missing ? null : Number(item.latest_power) - Number(item.week_power);
    const month = missing ? null : Number(item.latest_power) - Number(item.month_power);
    const season = missing ? null : Number(item.latest_power) - Number(item.season_power);
    const value = missing ? "—" : formatPower(item.squad_1);
    const delta = amount => missing ? "—" : formatDelta(amount);
    const percent = missing ? "—" : `${growthPercent(item.latest_power, item.previous_power).toFixed(1).replace(".", ",")}%`;
    return `<tr class="${missing ? "is-power-missing" : ""}">
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(item.nickname)}</strong><small>${escapeHtml(item.rank_name || "—")}</small></td>
      <td>${formatDate(item.latest_date)}</td>
      <td class="${missing ? "power-missing-value" : ""}">${value}</td>
      <td data-power-col="previous" class="${missing ? "power-missing-value" : previous > 0 ? "power-positive" : previous < 0 ? "power-negative" : ""}">${delta(previous)}</td>
      <td data-power-col="week" class="${missing ? "power-missing-value" : ""}">${delta(week)}</td>
      <td data-power-col="month" class="${missing ? "power-missing-value" : ""}">${delta(month)}</td>
      <td data-power-col="season" class="${missing ? "power-missing-value" : ""}">${delta(season)}</td>
      <td data-power-col="percent" class="${missing ? "power-missing-value" : ""}">${percent}</td>
      <td><button type="button" class="secondary-button power-row-edit" data-power-edit="${escapeHtml(item.participant_id)}">Изменить</button></td>
    </tr>`;
  }).join("");
}

function renderBulkTable(rows) {
  const table = byId("powerTable");
  const head = byId("powerTableHead");
  const body = byId("powerTableBody");
  if (!table || !head || !body) return;

  ensureBulkDraft(Array.isArray(state.data?.participants) ? state.data.participants : []);
  table.classList.add("is-bulk-editing");
  table.dataset.powerBulkMode = "true";
  head.innerHTML = `<tr><th>Место</th><th>Участник</th><th>1-й отряд, млн</th><th>2-й отряд, млн</th><th>3-й отряд, млн</th><th>4-й отряд, млн</th><th>5-й отряд, млн</th><th>Не сдал</th></tr>`;
  body.innerHTML = rows.map((item, index) => {
    const values = state.bulkDraft.get(item.participant_id) || ["", "", "", "", ""];
    const missing = state.bulkMissing.has(item.participant_id);
    return `<tr class="${missing ? "is-power-missing" : ""}" data-bulk-participant="${escapeHtml(item.participant_id)}">
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(item.nickname)}</strong><small>${escapeHtml(item.rank_name || "—")}</small></td>
      ${values.map((value, squadIndex) => `<td><input type="text" inputmode="decimal" data-bulk-squad="${squadIndex + 1}" value="${missing ? "" : escapeHtml(value)}" data-no-persist="true" aria-label="${escapeHtml(item.nickname)}, ${squadIndex + 1}-й отряд" ${missing ? "disabled" : ""}></td>`).join("")}
      <td><button type="button" class="secondary-button power-missing-toggle ${missing ? "is-active" : ""}" data-power-missing="${escapeHtml(item.participant_id)}" aria-pressed="${missing}" title="${missing ? "Снять отметку «не сдал»" : "Игрок не сдал силу на выбранную дату"}">—</button></td>
    </tr>`;
  }).join("");
}

function render() {
  if (!isMounted()) return;
  const rows = Array.isArray(state.data?.participants) ? [...state.data.participants] : [];
  const search = (byId("powerSearch")?.value || "").trim().toLowerCase();
  const sort = byId("powerSort")?.value || "power";
  const filtered = rows.filter(item => !search || String(item.nickname || "").toLowerCase().includes(search));
  filtered.sort((a, b) => {
    if (sort === "nickname") return String(a.nickname).localeCompare(String(b.nickname), "ru");
    if (sort === "growth") return (Number(b.latest_power) - Number(b.previous_power)) - (Number(a.latest_power) - Number(a.previous_power));
    return Number(b.latest_power) - Number(a.latest_power) || String(a.nickname).localeCompare(String(b.nickname), "ru");
  });

  if (state.bulkEditing) renderBulkTable(filtered);
  else renderNormalTable(filtered);

  const emptyState = byId("powerEmptyState");
  const count = byId("powerCount");
  const viewOptions = byId("powerViewOptions");
  const bulkControls = byId("powerBulkControls");
  const bulkOpen = byId("powerBulkOpen");
  const summary = byId("participantPowerSummary");
  if (emptyState) emptyState.hidden = filtered.length > 0;
  if (count) count.textContent = `${rows.length} участников`;
  if (viewOptions) viewOptions.hidden = state.bulkEditing;
  if (bulkControls) bulkControls.hidden = !state.bulkEditing;
  if (bulkOpen) bulkOpen.hidden = state.bulkEditing;

  if (state.bulkEditing) {
    if (summary) summary.hidden = true;
  } else {
    renderSummary(filtered);
    applyColumnVisibility();
  }

  const select = byId("powerParticipant");
  if (select) {
    const selected = select.value;
    select.innerHTML = rows.map(item => `<option value="${escapeHtml(item.participant_id)}">${escapeHtml(item.nickname)}</option>`).join("");
    const lockedParticipantId = select.dataset.lockedParticipantId || "";
    if (lockedParticipantId && [...select.options].some(option => option.value === lockedParticipantId)) {
      select.value = lockedParticipantId;
      select.disabled = true;
    } else if ([...select.options].some(option => option.value === selected)) {
      select.value = selected;
    }
    const editorCard = byId("powerEditorCard");
    if (editorCard) editorCard.hidden = rows.length === 0;
  }

  const seasonInput = byId("powerSeasonStart");
  const seasonSettings = byId("powerSeasonSettings");
  if (seasonInput) seasonInput.value = state.data?.season_start || "";
  if (seasonSettings) seasonSettings.hidden = !state.data?.can_manage;

  window.harvestHubTableScrollbars?.refresh?.();
}

async function load() {
  const allianceId = activeAllianceId();
  if (!allianceId || !state.client || !isMounted()) return;
  const token = ++state.loadToken;
  const { data, error } = await fetchAllianceSquadPower(state.client, allianceId);
  if (token !== state.loadToken || !isMounted()) return;
  const errorBox = byId("powerSectionError");
  if (error) {
    if (errorBox) { errorBox.hidden = false; errorBox.textContent = error.message; }
    return;
  }
  if (errorBox) errorBox.hidden = true;
  state.data = data || { participants: [] };
  render();
}

function resetEditor() {
  const title = byId("powerEditorTitle");
  const cancel = byId("powerEditCancel");
  const date = byId("powerDate");
  if (title) title.textContent = "Добавить замер силы";
  if (cancel) cancel.hidden = true;
  [1, 2, 3, 4, 5].forEach(index => {
    const field = byId(`powerSquad${index}`);
    if (field) field.value = "";
  });
  if (date) date.value = localDateValue();
}

function editParticipant(participantId) {
  const item = state.data?.participants?.find(row => row.participant_id === participantId);
  if (!item || !isMounted()) return;
  const participant = byId("powerParticipant");
  const date = byId("powerDate");
  const title = byId("powerEditorTitle");
  const cancel = byId("powerEditCancel");
  const editor = byId("powerEditorCard");
  if (participant) participant.value = item.participant_id;
  if (date) date.value = item.latest_date || localDateValue();
  [1, 2, 3, 4, 5].forEach(index => {
    const field = byId(`powerSquad${index}`);
    if (field) field.value = inputPower(item[`squad_${index}`]);
  });
  if (title) title.textContent = `Изменить: ${item.nickname}`;
  if (cancel) cancel.hidden = false;
  editor?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function submitPower(event) {
  event.preventDefault();
  const participantId = byId("powerParticipant")?.value;
  const allianceId = activeAllianceId();
  if (!participantId || !allianceId) return;
  const fields = [1, 2, 3, 4, 5].map(index => byId(`powerSquad${index}`));
  const values = fields.map(field => parsePower(field?.value));
  const invalidIndex = values.findIndex(value => value === undefined);
  if (invalidIndex >= 0) {
    fields[invalidIndex]?.setCustomValidity("Укажи БМ в миллионах, например 87,72");
    fields[invalidIndex]?.reportValidity();
    return;
  }
  fields.forEach(field => field?.setCustomValidity(""));
  if (values.every(value => value === null)) {
    fields[0]?.setCustomValidity("Укажи силу хотя бы одного отряда");
    fields[0]?.reportValidity();
    return;
  }

  const button = event.submitter;
  if (button) button.disabled = true;
  try {
    const { error } = await saveAllianceSquadPower(state.client, allianceId, {
      participantId,
      measuredOn: byId("powerDate")?.value,
      squad1: values[0], squad2: values[1], squad3: values[2], squad4: values[3], squad5: values[4]
    });
    if (error) throw error;
    resetEditor();
    await load();
    showMessage("Замер силы сохранён.", "success");
  } catch (error) {
    showMessage(error?.message || "Не удалось сохранить замер силы.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

function startBulkEditing() {
  const rows = Array.isArray(state.data?.participants) ? state.data.participants : [];
  clearBulkDraft();
  ensureBulkDraft(rows);
  state.bulkEditing = true;
  const date = byId("powerBulkDate");
  if (date && !date.value) date.value = localDateValue();
  render();
  byId("powerBulkControls")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function stopBulkEditing() {
  state.bulkEditing = false;
  clearBulkDraft();
  render();
}

function updateBulkDraft(event) {
  const input = event.target.closest?.("[data-bulk-squad]");
  if (!input) return;
  const row = input.closest("[data-bulk-participant]");
  const participantId = row?.dataset.bulkParticipant;
  const squadIndex = Number(input.dataset.bulkSquad) - 1;
  if (!participantId || squadIndex < 0 || squadIndex > 4) return;
  const values = state.bulkDraft.get(participantId) || ["", "", "", "", ""];
  values[squadIndex] = input.value;
  state.bulkDraft.set(participantId, values);
  state.bulkTouched.add(participantId);
}

function powersEqual(left, right) {
  return left === right || (left === null && right === null);
}

function toggleBulkMissing(participantId) {
  if (!participantId) return;
  if (state.bulkMissing.has(participantId)) {
    state.bulkMissing.delete(participantId);
    const values = (state.bulkDraft.get(participantId) || []).map(parsePower);
    const original = state.bulkOriginal.get(participantId) || [null, null, null, null, null];
    if (values.every((value, index) => powersEqual(value, original[index]))) {
      state.bulkTouched.delete(participantId);
    }
  } else {
    state.bulkMissing.add(participantId);
    state.bulkTouched.add(participantId);
  }
  render();
}

async function saveBulk() {
  const date = byId("powerBulkDate")?.value || localDateValue();
  const payloads = [];
  const participants = new Map((state.data?.participants || []).map(item => [item.participant_id, item]));

  for (const [participantId, draft] of state.bulkDraft.entries()) {
    const missing = state.bulkMissing.has(participantId);
    const values = draft.map(parsePower);
    const item = participants.get(participantId);
    const invalidIndex = missing ? -1 : values.findIndex(value => value === undefined);
    if (invalidIndex >= 0) {
      const visibleInput = document.querySelector(`[data-bulk-participant="${CSS.escape(participantId)}"] [data-bulk-squad="${invalidIndex + 1}"]`);
      visibleInput?.focus();
      return showMessage(`Проверь значение у игрока ${item?.nickname || "—"}, ${invalidIndex + 1}-й отряд.`, "error");
    }

    const original = state.bulkOriginal.get(participantId) || [null, null, null, null, null];
    const valuesChanged = values.some((value, index) => !powersEqual(value, original[index]));
    if (!state.bulkTouched.has(participantId) && !valuesChanged) continue;

    if (!missing && values.every(value => value === null)) {
      return showMessage(`У игрока ${item?.nickname || "—"} должен быть заполнен хотя бы один отряд или поставлен прочерк.`, "error");
    }

    payloads.push({
      participant_id: participantId,
      measured_on: date,
      squad_1: missing ? null : values[0],
      squad_2: missing ? null : values[1],
      squad_3: missing ? null : values[2],
      squad_4: missing ? null : values[3],
      squad_5: missing ? null : values[4]
    });
  }

  if (!payloads.length) return showMessage("В общей таблице нет изменений.", "info");

  const button = byId("powerBulkSave");
  if (button) button.disabled = true;
  try {
    const { error } = await saveAllianceSquadPowerBatch(state.client, activeAllianceId(), payloads);
    if (error) throw error;
    state.bulkEditing = false;
    clearBulkDraft();
    await load();
    showMessage(`Сохранено строк: ${payloads.length}.`, "success");
  } catch (error) {
    showMessage(error?.message || "Не удалось сохранить общую таблицу силы.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function saveSeason(event) {
  event.preventDefault();
  const { error } = await setAlliancePowerSeasonStart(state.client, activeAllianceId(), byId("powerSeasonStart")?.value || null);
  if (error) return showMessage(error.message, "error");
  await load();
  showMessage("Дата начала сезона сохранена.", "success");
}

function toggleExpandedTable(forceOpen) {
  const card = byId("powerStatisticsCard");
  const button = byId("powerExpandTable");
  if (!card || !button) return;
  state.expanded = typeof forceOpen === "boolean" ? forceOpen : !state.expanded;
  setAllianceTableFullscreen(card, state.expanded, { elementClass: "is-expanded", bodyClass: "power-table-open" });
  button.textContent = state.expanded ? "Закрыть полный экран" : "Открыть таблицу целиком";
}

export function initPowerSection() {
  state.client = window.harvestHubSupabase;
  state.loadToken += 1;
  state.bulkEditing = false;
  clearBulkDraft();
  const date = byId("powerDate");
  const bulkDate = byId("powerBulkDate");
  const today = localDateValue();
  if (date) {
    if (!date.value) date.value = today;
    date.max = today;
  }
  if (bulkDate) {
    bulkDate.value = today;
    bulkDate.max = today;
  }
  byId("powerForm")?.addEventListener("submit", submitPower);
  byId("powerEditCancel")?.addEventListener("click", resetEditor);
  byId("powerSeasonForm")?.addEventListener("submit", saveSeason);
  byId("powerSearch")?.addEventListener("input", render);
  byId("powerSort")?.addEventListener("change", render);
  byId("powerTableBody")?.addEventListener("click", event => {
    const missingButton = event.target.closest("[data-power-missing]");
    if (missingButton) {
      toggleBulkMissing(missingButton.dataset.powerMissing);
      return;
    }
    const button = event.target.closest("[data-power-edit]");
    if (button) editParticipant(button.dataset.powerEdit);
  });
  byId("powerTableBody")?.addEventListener("input", updateBulkDraft);
  document.querySelectorAll("[data-power-column]").forEach(input => input.addEventListener("change", applyColumnVisibility));
  byId("powerBulkOpen")?.addEventListener("click", startBulkEditing);
  byId("powerBulkClose")?.addEventListener("click", stopBulkEditing);
  byId("powerBulkSave")?.addEventListener("click", saveBulk);
  byId("powerExpandTable")?.addEventListener("click", () => toggleExpandedTable());
  byId("powerCloseTable")?.addEventListener("click", () => toggleExpandedTable(false));
  load();
}
