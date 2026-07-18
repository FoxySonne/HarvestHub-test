import {
  fetchMemberships,
  fetchParticipants,
  linkParticipantAccount,
  unlinkParticipantAccount,
  setAllianceMemberRole,
  transferAllianceR5,
  transferAllianceOwner
} from "./api.js?v=20260718-40";
import { ACTIVE_ALLIANCE_STORAGE_KEY } from "./config.js";

const state = { client: null, participants: [], membership: null };
const byId = id => document.getElementById(id);

function activeAllianceId() {
  return localStorage.getItem(ACTIVE_ALLIANCE_STORAGE_KEY) || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(text, type = "info") {
  const box = byId("allianceMessage");
  if (!box) return;
  box.hidden = !text;
  box.textContent = text;
  box.dataset.type = type;
}

function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
}

function createCard() {
  if (byId("allianceRoleManagementCard")) return;
  const roster = byId("allianceRosterSection");
  const editor = byId("participantEditorCard");
  if (!roster || !editor) return;

  const card = document.createElement("section");
  card.id = "allianceRoleManagementCard";
  card.className = "card alliance-editor-card alliance-role-management-card";
  card.dataset.noCollapse = "true";
  card.hidden = true;
  card.innerHTML = `
    <div class="card-header">
      <div>
        <h3>Аккаунты и права</h3>
        <p>Управление связью участника с аккаунтом, ролью, Р5 и владельцем штаба.</p>
      </div>
    </div>
    <div class="alliance-role-management-grid">
      <label><span>Участник</span><select id="allianceRoleParticipant" data-no-persist="true"></select></label>
      <label><span>Email аккаунта</span><input id="allianceRoleEmail" type="email" autocomplete="email" data-no-persist="true" placeholder="name@example.com"></label>
      <div class="alliance-role-management-actions">
        <button id="allianceLinkAccountButton" type="button">Связать аккаунт</button>
        <button id="allianceUnlinkAccountButton" type="button" class="secondary-button">Отвязать аккаунт</button>
      </div>
      <label><span>Права связанного аккаунта</span><select id="allianceLinkedRole" data-no-persist="true"><option value="editor">Редактор</option><option value="viewer">Смотритель</option></select></label>
      <button id="allianceSaveLinkedRoleButton" type="button">Сохранить права</button>
      <label><span>Кем останется прежний Р5</span><select id="alliancePreviousR5Role" data-no-persist="true"><option value="editor">Редактором</option><option value="viewer">Смотрителем</option></select></label>
      <button id="allianceTransferR5Button" type="button" class="secondary-button">Назначить выбранного участника Р5</button>
      <label><span>Кем останется прежний владелец</span><select id="alliancePreviousOwnerRole" data-no-persist="true"><option value="editor">Редактором</option><option value="viewer">Смотрителем</option></select></label>
      <button id="allianceTransferOwnerButton" type="button" class="danger-button">Передать права владельца</button>
    </div>
    <p id="allianceRoleParticipantStatus" class="alliance-role-participant-status"></p>
  `;
  roster.insertBefore(card, editor);
}

function selectedParticipant() {
  return state.participants.find(item => item.id === byId("allianceRoleParticipant")?.value) || null;
}

function updateSelectedParticipant() {
  const participant = selectedParticipant();
  const linked = Boolean(participant?.linked_user_id);
  const status = byId("allianceRoleParticipantStatus");
  if (status) {
    status.textContent = participant
      ? `${participant.nickname}: ${linked ? "аккаунт связан" : "аккаунт не связан"}${participant.rank_name === "Р5" ? " · действующий Р5" : ""}`
      : "Выбери участника.";
  }
  byId("allianceUnlinkAccountButton").disabled = !linked || participant?.rank_name === "Р5";
  byId("allianceSaveLinkedRoleButton").disabled = !linked;
  byId("allianceTransferR5Button").disabled = !linked || participant?.rank_name === "Р5";
  byId("allianceTransferOwnerButton").disabled = !linked;
}

function render() {
  const card = byId("allianceRoleManagementCard");
  if (!card) return;
  const canManageRoles = state.membership?.role === "owner" && window.getAdvancedMode?.() === true;
  card.hidden = !canManageRoles;
  if (!canManageRoles) return;

  const select = byId("allianceRoleParticipant");
  const selected = select.value;
  select.innerHTML = state.participants
    .filter(item => item.member_status !== "left")
    .map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nickname)}${item.rank_name ? ` · ${escapeHtml(item.rank_name)}` : ""}</option>`)
    .join("");
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
  updateSelectedParticipant();
}

async function load() {
  if (!state.client || !activeAllianceId()) return;
  const [membershipsResult, participantsResult] = await Promise.all([
    fetchMemberships(state.client),
    fetchParticipants(state.client, activeAllianceId())
  ]);
  if (membershipsResult.error) return showMessage(membershipsResult.error.message, "error");
  if (participantsResult.error) return showMessage(participantsResult.error.message, "error");
  state.membership = (membershipsResult.data || []).find(item => item.alliance_id === activeAllianceId()) || null;
  state.participants = Array.isArray(participantsResult.data) ? participantsResult.data : [];
  render();
}

async function linkAccount(event) {
  const participant = selectedParticipant();
  const email = byId("allianceRoleEmail")?.value.trim();
  if (!participant || !email) return showMessage("Выбери участника и укажи email аккаунта.", "error");
  setBusy(event.currentTarget, true);
  const { error } = await linkParticipantAccount(state.client, activeAllianceId(), participant.id, email);
  setBusy(event.currentTarget, false);
  if (error) return showMessage(error.message, "error");
  byId("allianceRoleEmail").value = "";
  await load();
  showMessage("Аккаунт связан с участником.", "success");
}

async function unlinkAccount(event) {
  const participant = selectedParticipant();
  if (!participant?.linked_user_id) return;
  if (!window.confirm(`Отвязать аккаунт от участника «${participant.nickname}»?`)) return;
  setBusy(event.currentTarget, true);
  const { error } = await unlinkParticipantAccount(state.client, activeAllianceId(), participant.id);
  setBusy(event.currentTarget, false);
  if (error) return showMessage(error.message, "error");
  await load();
  showMessage("Аккаунт отвязан.", "success");
}

async function saveRole(event) {
  const participant = selectedParticipant();
  if (!participant?.linked_user_id) return showMessage("Сначала свяжи участника с аккаунтом.", "error");
  setBusy(event.currentTarget, true);
  const { error } = await setAllianceMemberRole(
    state.client,
    activeAllianceId(),
    participant.linked_user_id,
    byId("allianceLinkedRole").value
  );
  setBusy(event.currentTarget, false);
  if (error) return showMessage(error.message, "error");
  await load();
  showMessage("Права аккаунта сохранены.", "success");
}

async function transferR5(event) {
  const participant = selectedParticipant();
  if (!participant?.linked_user_id) return showMessage("Сначала свяжи нового Р5 с аккаунтом.", "error");
  if (!window.confirm(`Назначить участника «${participant.nickname}» новым Р5?`)) return;
  setBusy(event.currentTarget, true);
  const { error } = await transferAllianceR5(
    state.client,
    activeAllianceId(),
    participant.id,
    byId("alliancePreviousR5Role").value
  );
  setBusy(event.currentTarget, false);
  if (error) return showMessage(error.message, "error");
  await load();
  showMessage("Новый Р5 назначен.", "success");
}

async function transferOwner(event) {
  const participant = selectedParticipant();
  if (!participant?.linked_user_id) return showMessage("Сначала свяжи нового владельца с аккаунтом.", "error");
  if (!window.confirm(`Передать участнику «${participant.nickname}» права владельца штаба?`)) return;
  setBusy(event.currentTarget, true);
  const { error } = await transferAllianceOwner(
    state.client,
    activeAllianceId(),
    participant.linked_user_id,
    byId("alliancePreviousOwnerRole").value
  );
  setBusy(event.currentTarget, false);
  if (error) return showMessage(error.message, "error");
  await load();
  showMessage("Права владельца переданы.", "success");
}

export function initRoleSection() {
  state.client = window.harvestHubSupabase;
  createCard();
  byId("allianceRoleParticipant")?.addEventListener("change", updateSelectedParticipant);
  byId("allianceLinkAccountButton")?.addEventListener("click", linkAccount);
  byId("allianceUnlinkAccountButton")?.addEventListener("click", unlinkAccount);
  byId("allianceSaveLinkedRoleButton")?.addEventListener("click", saveRole);
  byId("allianceTransferR5Button")?.addEventListener("click", transferR5);
  byId("allianceTransferOwnerButton")?.addEventListener("click", transferOwner);
  document.querySelectorAll("[data-alliance-tab]").forEach(button => {
    button.addEventListener("click", () => { if (button.dataset.allianceTab === "roster") load(); });
  });
  byId("allianceSelector")?.addEventListener("change", () => setTimeout(load, 0));
  byId("participantForm")?.addEventListener("submit", () => setTimeout(load, 600));
  window.addEventListener("harvesthub:advanced-mode-change", render);
  load();
}
