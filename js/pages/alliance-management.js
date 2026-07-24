import {
  linkParticipantAccount,
  unlinkParticipantAccount,
  setAllianceMemberRole,
  transferAllianceR5,
  transferAllianceOwner
} from "../alliance/api.js?v=20260718-40";
import {
  loadAlliancePageContext,
  fillAllianceCompactHeader,
  canManageAllianceRoles,
  getActiveAllianceId
} from "../alliance/page-context.js?v=20260718-1";

const byId = id => document.getElementById(id);
const state = { client: null, context: null };

function showMessage(text, type = "info") {
  const box = byId("allianceMessage");
  if (!box) return;
  box.hidden = !text;
  box.textContent = text;
  box.dataset.type = type;
}

function setValue(id, value) {
  const element = byId(id);
  if (element) element.value = value ?? "";
}

function setText(id, value) {
  const element = byId(id);
  if (element) element.textContent = value ?? "";
}

function setHidden(id, hidden) {
  const element = byId(id);
  if (element) element.hidden = hidden;
}

function setDisabled(id, disabled) {
  const element = byId(id);
  if (element) element.disabled = disabled;
}

function selectedParticipant() {
  const participantSelect = byId("allianceRoleParticipant");
  if (!participantSelect) return null;
  return state.context?.participants?.find(item => item.id === participantSelect.value) || null;
}

function roleLabel(role) {
  if (role === "owner") return "владелец";
  if (role === "editor") return "редактор";
  if (role === "viewer") return "наблюдатель";
  return "роль не назначена";
}

function updateParticipantStatus() {
  const participant = selectedParticipant();
  const linked = Boolean(participant?.linked_user_id);
  const isOwner = participant?.account_role === "owner";
  const isR5 = participant?.rank_name === "Р5";
  const linkedRole = byId("allianceLinkedRole");

  if (linkedRole && ["editor", "viewer"].includes(participant?.account_role)) {
    linkedRole.value = participant.account_role;
  }

  setText(
    "allianceRoleParticipantStatus",
    participant
      ? `${participant.nickname}: ${linked ? `аккаунт связан · ${isR5 ? "полные права Р5" : roleLabel(participant.account_role)}` : "аккаунт не связан"}${isOwner ? " · владелец штаба" : ""}`
      : "Выбери участника."
  );

  setDisabled("allianceUnlinkAccountButton", !linked || isR5 || isOwner);
  setDisabled("allianceSaveLinkedRoleButton", !linked || isR5 || isOwner);
  setDisabled("allianceTransferR5Button", !linked || isR5);
  setDisabled("allianceTransferOwnerButton", !linked || isOwner);
  if (linkedRole) linkedRole.disabled = !linked || isR5 || isOwner;
}

function render() {
  if (!state.context) return;
  fillAllianceCompactHeader(state.context);
  const alliance = state.context.alliance || {};
  setValue("allianceManagementName", alliance.name || "");
  setValue("allianceManagementState", alliance.state_number || "");
  setText("allianceManagementInvite", alliance.invite_code || "—");

  const canManage = canManageAllianceRoles(state.context);
  setHidden("allianceDetailsCard", !canManage);
  setHidden("allianceRoleManagementCard", !canManage);
  if (!canManage) {
    showMessage("Управление союзом доступно владельцу и связанному Р5.", "info");
    return;
  }

  const select = byId("allianceRoleParticipant");
  if (!select) {
    showMessage("Не удалось загрузить блок управления аккаунтами. Обнови страницу.", "error");
    return;
  }

  const selected = select.value;
  select.innerHTML = (state.context.participants || [])
    .filter(item => item.member_status !== "left")
    .map(item => `<option value="${item.id}">${item.nickname}${item.rank_name ? ` · ${item.rank_name}` : ""}</option>`)
    .join("");

  if ([...select.options].some(option => option.value === selected)) {
    select.value = selected;
  }
  updateParticipantStatus();
}

async function reload() {
  state.context = await loadAlliancePageContext(state.client);
  render();
}

async function saveDetails(event) {
  event.preventDefault();
  const button = event.submitter;
  const name = byId("allianceManagementName")?.value.trim() || "";
  const stateNumber = byId("allianceManagementState")?.value.trim() || "";
  if (!button) return;
  button.disabled = true;
  const { error } = await state.client.from("alliances").update({
    name,
    state_number: stateNumber
  }).eq("id", getActiveAllianceId());
  button.disabled = false;
  if (error) return showMessage(error.message, "error");
  await reload();
  showMessage("Данные союза сохранены.", "success");
}

async function linkAccount(event) {
  const participant = selectedParticipant();
  const email = byId("allianceRoleEmail")?.value.trim() || "";
  if (!participant || !email) {
    return showMessage("Выбери участника и укажи email.", "error");
  }
  event.currentTarget.disabled = true;
  const { error } = await linkParticipantAccount(
    state.client,
    getActiveAllianceId(),
    participant.id,
    email
  );
  event.currentTarget.disabled = false;
  if (error) return showMessage(error.message, "error");
  setValue("allianceRoleEmail", "");
  await reload();
  showMessage("Аккаунт связан.", "success");
}

async function unlinkAccount(event) {
  const participant = selectedParticipant();
  if (!participant?.linked_user_id) return;
  if (!confirm(`Отвязать аккаунт от «${participant.nickname}»?`)) return;
  event.currentTarget.disabled = true;
  const { error } = await unlinkParticipantAccount(
    state.client,
    getActiveAllianceId(),
    participant.id
  );
  event.currentTarget.disabled = false;
  if (error) return showMessage(error.message, "error");
  await reload();
  showMessage("Аккаунт отвязан.", "success");
}

async function saveRole(event) {
  const participant = selectedParticipant();
  const linkedRole = byId("allianceLinkedRole")?.value;
  if (!participant?.linked_user_id) {
    return showMessage("Сначала свяжи участника с аккаунтом.", "error");
  }
  if (!linkedRole) return showMessage("Не удалось определить выбранные права.", "error");
  if (participant.rank_name === "Р5" || participant.account_role === "owner") {
    return showMessage("Права Р5 и владельца меняются только через передачу роли.", "error");
  }
  event.currentTarget.disabled = true;
  const { error } = await setAllianceMemberRole(
    state.client,
    getActiveAllianceId(),
    participant.linked_user_id,
    linkedRole
  );
  event.currentTarget.disabled = false;
  if (error) return showMessage(error.message, "error");
  await reload();
  showMessage("Права сохранены.", "success");
}

async function transferR5(event) {
  const participant = selectedParticipant();
  const previousRole = byId("alliancePreviousR5Role")?.value;
  if (!participant?.linked_user_id) {
    return showMessage("Сначала свяжи нового Р5 с аккаунтом.", "error");
  }
  if (!previousRole) return showMessage("Не удалось определить права прежнего Р5.", "error");
  if (!confirm(`Назначить «${participant.nickname}» новым Р5?`)) return;
  event.currentTarget.disabled = true;
  const { error } = await transferAllianceR5(
    state.client,
    getActiveAllianceId(),
    participant.id,
    previousRole
  );
  event.currentTarget.disabled = false;
  if (error) return showMessage(error.message, "error");
  await reload();
  showMessage("Новый Р5 назначен.", "success");
}

async function transferOwner(event) {
  const participant = selectedParticipant();
  const previousRole = byId("alliancePreviousOwnerRole")?.value;
  if (!participant?.linked_user_id) {
    return showMessage("Сначала свяжи нового владельца с аккаунтом.", "error");
  }
  if (!previousRole) return showMessage("Не удалось определить права прежнего владельца.", "error");
  if (!confirm(`Передать «${participant.nickname}» права владельца штаба?`)) return;
  event.currentTarget.disabled = true;
  const { error } = await transferAllianceOwner(
    state.client,
    getActiveAllianceId(),
    participant.linked_user_id,
    previousRole
  );
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
    try {
      await navigator.clipboard.writeText(
        byId("allianceManagementInvite")?.textContent.trim() || ""
      );
      showMessage("Код приглашения скопирован.", "success");
    } catch {
      showMessage("Не удалось скопировать код. Выдели его вручную.", "error");
    }
  });
  byId("allianceRoleParticipant")?.addEventListener("change", updateParticipantStatus);
  byId("allianceLinkAccountButton")?.addEventListener("click", linkAccount);
  byId("allianceUnlinkAccountButton")?.addEventListener("click", unlinkAccount);
  byId("allianceSaveLinkedRoleButton")?.addEventListener("click", saveRole);
  byId("allianceTransferR5Button")?.addEventListener("click", transferR5);
  byId("allianceTransferOwnerButton")?.addEventListener("click", transferOwner);
}