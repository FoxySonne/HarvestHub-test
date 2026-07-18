import {
  linkParticipantAccount,
  unlinkParticipantAccount,
  setAllianceMemberRole,
  transferAllianceR5,
  transferAllianceOwner
} from "../alliance/api.js?v=20260718-40";
import { loadAlliancePageContext, fillAllianceCompactHeader, canManageAllianceRoles, getActiveAllianceId } from "../alliance/page-context.js?v=20260718-1";

const byId = id => document.getElementById(id);
const state = { client: null, context: null };

function showMessage(text, type = "info") {
  const box = byId("allianceMessage");
  if (!box) return;
  box.hidden = !text;
  box.textContent = text;
  box.dataset.type = type;
}

function selectedParticipant() {
  return state.context?.participants.find(item => item.id === byId("allianceRoleParticipant")?.value) || null;
}

function updateParticipantStatus() {
  const participant = selectedParticipant();
  const linked = Boolean(participant?.linked_user_id);
  byId("allianceRoleParticipantStatus").textContent = participant
    ? `${participant.nickname}: ${linked ? "аккаунт связан" : "аккаунт не связан"}${participant.rank_name === "Р5" ? " · действующий Р5" : ""}`
    : "Выбери участника.";
  byId("allianceUnlinkAccountButton").disabled = !linked || participant?.rank_name === "Р5";
  byId("allianceSaveLinkedRoleButton").disabled = !linked;
  byId("allianceTransferR5Button").disabled = !linked || participant?.rank_name === "Р5";
  byId("allianceTransferOwnerButton").disabled = !linked;
}

function render() {
  fillAllianceCompactHeader(state.context);
  const alliance = state.context.alliance || {};
  byId("allianceManagementName").value = alliance.name || "";
  byId("allianceManagementState").value = alliance.state_number || "";
  byId("allianceManagementInvite").textContent = alliance.invite_code || "—";

  const canManage = canManageAllianceRoles(state.context);
  byId("allianceDetailsCard").hidden = !canManage;
  byId("allianceRoleManagementCard").hidden = !canManage;
  if (!canManage) return;

  const select = byId("allianceRoleParticipant");
  const selected = select.value;
  select.innerHTML = state.context.participants
    .filter(item => item.member_status !== "left")
    .map(item => `<option value="${item.id}">${item.nickname}${item.rank_name ? ` · ${item.rank_name}` : ""}</option>`)
    .join("");
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
  updateParticipantStatus();
}

async function reload() {
  state.context = await loadAlliancePageContext(state.client);
  render();
}

async function saveDetails(event) {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  const { error } = await state.client.from("alliances").update({
    name: byId("allianceManagementName").value.trim(),
    state_number: byId("allianceManagementState").value.trim()
  }).eq("id", getActiveAllianceId());
  button.disabled = false;
  if (error) return showMessage(error.message, "error");
  await reload();
  showMessage("Данные союза сохранены.", "success");
}

async function linkAccount(event) {
  const participant = selectedParticipant();
  const email = byId("allianceRoleEmail").value.trim();
  if (!participant || !email) return showMessage("Выбери участника и укажи email.", "error");
  event.currentTarget.disabled = true;
  const { error } = await linkParticipantAccount(state.client, getActiveAllianceId(), participant.id, email);
  event.currentTarget.disabled = false;
  if (error) return showMessage(error.message, "error");
  byId("allianceRoleEmail").value = "";
  await reload();
  showMessage("Аккаунт связан.", "success");
}

async function unlinkAccount(event) {
  const participant = selectedParticipant();
  if (!participant?.linked_user_id || !confirm(`Отвязать аккаунт от «${participant.nickname}»?`)) return;
  event.currentTarget.disabled = true;
  const { error } = await unlinkParticipantAccount(state.client, getActiveAllianceId(), participant.id);
  event.currentTarget.disabled = false;
  if (error) return showMessage(error.message, "error");
  await reload();
  showMessage("Аккаунт отвязан.", "success");
}

async function saveRole(event) {
  const participant = selectedParticipant();
  if (!participant?.linked_user_id) return showMessage("Сначала свяжи участника с аккаунтом.", "error");
  event.currentTarget.disabled = true;
  const { error } = await setAllianceMemberRole(state.client, getActiveAllianceId(), participant.linked_user_id, byId("allianceLinkedRole").value);
  event.currentTarget.disabled = false;
  if (error) return showMessage(error.message, "error");
  await reload();
  showMessage("Права сохранены.", "success");
}

async function transferR5(event) {
  const participant = selectedParticipant();
  if (!participant?.linked_user_id) return showMessage("Сначала свяжи нового Р5 с аккаунтом.", "error");
  if (!confirm(`Назначить «${participant.nickname}» новым Р5?`)) return;
  event.currentTarget.disabled = true;
  const { error } = await transferAllianceR5(state.client, getActiveAllianceId(), participant.id, byId("alliancePreviousR5Role").value);
  event.currentTarget.disabled = false;
  if (error) return showMessage(error.message, "error");
  await reload();
  showMessage("Новый Р5 назначен.", "success");
}

async function transferOwner(event) {
  const participant = selectedParticipant();
  if (!participant?.linked_user_id) return showMessage("Сначала свяжи нового владельца с аккаунтом.", "error");
  if (!confirm(`Передать «${participant.nickname}» права владельца штаба?`)) return;
  event.currentTarget.disabled = true;
  const { error } = await transferAllianceOwner(state.client, getActiveAllianceId(), participant.linked_user_id, byId("alliancePreviousOwnerRole").value);
  event.currentTarget.disabled = false;
  if (error) return showMessage(error.message, "error");
  await reload();
  showMessage("Права владельца переданы.", "success");
}

export async function init() {
  state.client = window.harvestHubSupabase;
  try {
    await reload();
  } catch (error) {
    showMessage(error.message, "error");
    return;
  }
  byId("allianceManagementDetailsForm")?.addEventListener("submit", saveDetails);
  byId("allianceManagementCopyInvite")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(byId("allianceManagementInvite").textContent.trim());
    showMessage("Код приглашения скопирован.", "success");
  });
  byId("allianceRoleParticipant")?.addEventListener("change", updateParticipantStatus);
  byId("allianceLinkAccountButton")?.addEventListener("click", linkAccount);
  byId("allianceUnlinkAccountButton")?.addEventListener("click", unlinkAccount);
  byId("allianceSaveLinkedRoleButton")?.addEventListener("click", saveRole);
  byId("allianceTransferR5Button")?.addEventListener("click", transferR5);
  byId("allianceTransferOwnerButton")?.addEventListener("click", transferOwner);
}
