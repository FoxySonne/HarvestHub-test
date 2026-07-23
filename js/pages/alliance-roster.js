import { findDepartedParticipant, markParticipantLeft, restoreParticipant, saveParticipant } from "../alliance/api.js?v=20260723-1";
import { fetchAllianceSquadPower, saveAllianceSquadPower } from "../alliance/power-api.js?v=20260723-roster-power-1";
import { renderParticipantRows } from "../alliance/view.js?v=20260722-1";
import { loadAlliancePageContext, fillAllianceCompactHeader, canEditAlliance, getActiveAllianceId } from "../alliance/page-context.js?v=20260723-1";
import { setAllianceTableFullscreen } from "../alliance/fullscreen-table.js?v=20260721-1";

const byId = id => document.getElementById(id);
const state = { client: null, context: null, powerByParticipant: new Map() };

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function showMessage(text, type = "info") {
  const box = byId("allianceMessage");
  box.hidden = !text;
  box.textContent = text;
  box.dataset.type = type;
}

function formatStoredBirthday(value) {
  const match = String(value || "").match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}.${match[1]}` : String(value || "");
}

function toStoredBirthday(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{1,2})\.(\d{1,2})$/);
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const date = new Date(Date.UTC(2000, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `2000-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parsePower(value) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 1000) / 1000 : undefined;
}

function inputPower(value) {
  return value === null || value === undefined || value === "" ? "" : String(value).replace(".", ",");
}

function localDateValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function rankWeight(rank) {
  return ({ "Р5": 5, "Р4": 4, "Р3": 3, "Р2": 2, "Р1": 1 })[rank] || 0;
}

function filteredParticipants() {
  const search = byId("participantSearch").value.trim().toLowerCase();
  const rank = byId("participantRankFilter").value;
  const sort = byId("participantSort").value;
  return [...state.context.participants]
    .filter(item => item.member_status !== "left")
    .filter(item => !search || item.nickname.toLowerCase().includes(search))
    .filter(item => !rank || item.rank_name === rank)
    .sort((a, b) => sort === "nickname" ? a.nickname.localeCompare(b.nickname, "ru") : rankWeight(b.rank_name) - rankWeight(a.rank_name) || a.nickname.localeCompare(b.nickname, "ru"));
}

function render() {
  fillAllianceCompactHeader(state.context);
  const canEdit = canEditAlliance(state.context);
  byId("participantEditorCard").hidden = !canEdit;
  document.querySelectorAll(".participant-private-column").forEach(cell => { cell.hidden = !canEdit; });
  const participants = filteredParticipants();
  byId("participantTableBody").innerHTML = renderParticipantRows(participants, canEdit, canEdit);
  byId("participantCount").textContent = `${participants.length} участников`;
  byId("participantEmptyState").hidden = participants.length > 0;
}

function fillPrimaryAccountOptions(selectedId = "") {
  const participantId = byId("participantId").value;
  const options = state.context.participants
    .filter(item => item.id !== participantId)
    .filter(item => item.member_status !== "left" || item.id === selectedId)
    .sort((a, b) => a.nickname.localeCompare(b.nickname, "ru"));
  byId("participantPrimaryAccount").innerHTML = `<option value="">Неизвестно или указать вручную</option>${options.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nickname)}</option>`).join("")}`;
  byId("participantPrimaryAccount").value = options.some(item => item.id === selectedId) ? selectedId : "";
}

function syncTwinFields() {
  const isTwin = byId("participantIsTwin").checked;
  const hasLinkedPrimary = Boolean(byId("participantPrimaryAccount").value);
  byId("participantTwinFields").hidden = !isTwin;
  byId("participantPrimaryNicknameField").hidden = !isTwin || hasLinkedPrimary;
  byId("participantPrimaryNickname").required = false;
}

function resetForm() {
  byId("participantForm").reset();
  byId("participantId").value = "";
  byId("participantStatus").value = "main";
  byId("participantTimezone").value = "0";
  byId("participantSquad1").value = "";
  fillPrimaryAccountOptions();
  syncTwinFields();
  byId("participantEditorTitle").textContent = "Добавить участника";
  byId("participantCancelButton").hidden = true;
}

function fillForm(participant) {
  if (!participant) return;
  byId("participantId").value = participant.id;
  byId("participantNickname").value = participant.nickname || "";
  byId("participantRank").value = participant.rank_name || "";
  byId("participantTimezone").value = participant.timezone_offset ?? 0;
  byId("participantBirthday").value = formatStoredBirthday(participant.birthday);
  byId("participantSquad1").value = inputPower(state.powerByParticipant.get(participant.id));
  byId("participantComment").value = participant.comment || "";
  byId("participantStatus").value = participant.member_status || "main";
  byId("participantIsTwin").checked = Boolean(participant.is_twin);
  fillPrimaryAccountOptions(participant.primary_participant_id || "");
  byId("participantPrimaryNickname").value = participant.primary_participant_id ? "" : participant.primary_nickname || "";
  syncTwinFields();
  byId("participantEditorTitle").textContent = `Изменить: ${participant.nickname}`;
  byId("participantCancelButton").hidden = false;
  byId("participantEditorCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function reload() {
  state.context = await loadAlliancePageContext(state.client);
  const powerResult = await fetchAllianceSquadPower(state.client, getActiveAllianceId());
  state.powerByParticipant.clear();
  if (!powerResult.error) {
    (powerResult.data?.participants || []).forEach(item => state.powerByParticipant.set(item.participant_id, item.squad_1));
  }
  render();
  fillPrimaryAccountOptions(byId("participantPrimaryAccount")?.value || "");
}

async function saveOptionalPower(participantId, value) {
  if (value === null) return null;
  return saveAllianceSquadPower(state.client, getActiveAllianceId(), {
    participantId,
    measuredOn: localDateValue(),
    squad1: value,
    squad2: null,
    squad3: null,
    squad4: null,
    squad5: null
  });
}

async function submitParticipant(event) {
  event.preventDefault();
  const birthday = toStoredBirthday(byId("participantBirthday").value);
  if (birthday === undefined) return showMessage("Укажи день рождения в формате ДД.ММ.", "error");
  const squad1 = parsePower(byId("participantSquad1").value);
  if (squad1 === undefined) return showMessage("Укажи силу 1-го отряда в миллионах, например 87,72.", "error");
  const isTwin = byId("participantIsTwin").checked;
  const primaryParticipantId = isTwin ? byId("participantPrimaryAccount").value : "";
  const primaryNickname = isTwin && !primaryParticipantId ? byId("participantPrimaryNickname").value.trim() : "";
  const button = event.submitter || byId("participantForm").querySelector('[type="submit"]');
  button.disabled = true;
  const participantId = byId("participantId").value || null;
  const allianceId = getActiveAllianceId();
  const nickname = byId("participantNickname").value.trim();

  if (!participantId) {
    const archivedResult = await findDepartedParticipant(state.client, { allianceId, nickname });
    if (archivedResult.error) { button.disabled = false; return showMessage(archivedResult.error.message, "error"); }
    const departed = archivedResult.data;
    if (departed?.id) {
      const shouldRestore = confirm(`Игрок «${departed.nickname}» недавно состоял в союзе. Восстановить его вместе с сохранёнными данными?`);
      if (!shouldRestore) { button.disabled = false; return showMessage("Восстановление отменено. Новый участник не добавлен."); }
      const restoreResult = await restoreParticipant(state.client, { id: departed.id, allianceId });
      if (restoreResult.error) { button.disabled = false; return showMessage(restoreResult.error.message, "error"); }
      if (squad1 !== null) {
        const powerResult = await saveOptionalPower(departed.id, squad1);
        if (powerResult?.error) { button.disabled = false; return showMessage(powerResult.error.message, "error"); }
      }
      button.disabled = false;
      resetForm();
      await reload();
      return showMessage(`Участник «${departed.nickname}» восстановлен со старыми данными.`, "success");
    }
  }

  const saveResult = await saveParticipant(state.client, {
    id: participantId,
    allianceId,
    payload: {
      nickname,
      rank_name: byId("participantRank").value,
      member_status: byId("participantStatus").value,
      timezone_offset: byId("participantTimezone").value === "" ? 0 : Number(byId("participantTimezone").value),
      birthday,
      comment: byId("participantComment").value.trim(),
      is_twin: isTwin,
      primary_participant_id: primaryParticipantId || null,
      primary_nickname: primaryNickname || null
    }
  });
  if (saveResult.error) { button.disabled = false; return showMessage(saveResult.error.message, "error"); }

  await reload();
  const savedParticipant = participantId
    ? state.context.participants.find(item => item.id === participantId)
    : state.context.participants.find(item => item.member_status !== "left" && item.nickname.toLowerCase() === nickname.toLowerCase());
  if (squad1 !== null && savedParticipant?.id) {
    const powerResult = await saveOptionalPower(savedParticipant.id, squad1);
    if (powerResult?.error) { button.disabled = false; return showMessage(`Участник сохранён, но сила отряда не записалась: ${powerResult.error.message}`, "error"); }
  }

  button.disabled = false;
  resetForm();
  await reload();
  showMessage("Данные участника сохранены.", "success");
}

async function tableClick(event) {
  const edit = event.target.closest("[data-participant-edit]");
  if (edit) return fillForm(state.context.participants.find(item => item.id === edit.dataset.participantEdit));
  const remove = event.target.closest("[data-participant-delete]");
  if (!remove) return;
  const participant = state.context.participants.find(item => item.id === remove.dataset.participantDelete);
  if (!participant || !confirm(`Отметить «${participant.nickname}» как вышедшего?`)) return;
  const { error } = await markParticipantLeft(state.client, { id: participant.id, allianceId: getActiveAllianceId() });
  if (error) return showMessage(error.message, "error");
  await reload();
  showMessage("Участник отмечен как вышедший.", "success");
}

function toggleFullscreen(open) {
  setAllianceTableFullscreen(byId("rosterTableContainer"), open);
}

export async function init() {
  state.client = window.harvestHubSupabase;
  try { await reload(); } catch (error) { showMessage(error.message, "error"); return; }
  byId("participantForm")?.addEventListener("submit", submitParticipant);
  byId("participantCancelButton")?.addEventListener("click", resetForm);
  byId("participantIsTwin")?.addEventListener("change", syncTwinFields);
  byId("participantPrimaryAccount")?.addEventListener("change", syncTwinFields);
  byId("participantTableBody")?.addEventListener("click", tableClick);
  ["participantSearch", "participantRankFilter", "participantSort"].forEach(id => byId(id)?.addEventListener(id === "participantSearch" ? "input" : "change", render));
  byId("rosterExpandTable")?.addEventListener("click", () => toggleFullscreen(true));
  byId("rosterCloseTable")?.addEventListener("click", () => toggleFullscreen(false));
}