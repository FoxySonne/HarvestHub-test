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

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function showMessage(text, type = "info") {
  const box = byId("allianceMessage");
  if (!box) return;
  box.hidden = !text;
  box.textContent = text;
  box.dataset.type = type;
}

function setValue(id, value) { const element = byId(id); if (element) element.value = value ?? ""; }
function setText(id, value) { const element = byId(id); if (element) element.textContent = value ?? ""; }
function setHidden(id, hidden) { const element = byId(id); if (element) element.hidden = hidden; }
function setDisabled(id, disabled) { const element = byId(id); if (element) element.disabled = disabled; }

function activeParticipants() {
  return (state.context?.participants || []).filter(item => item.member_status !== "left");
}

function participantLabel(participant) {
  return `${participant.nickname}${participant.rank_name ? ` · ${participant.rank_name}` : ""}`;
}

function selectedParticipant() {
  const participantSelect = byId("allianceRoleParticipant");
  return state.context?.participants?.find(item => item.id === participantSelect?.value) || null;
}

function roleLabel(role) {
  if (role === "owner") return "Владелец";
  if (role === "editor") return "Редактор";
  if (role === "viewer") return "Наблюдатель";
  return "Роль не назначена";
}

function selectParticipant(participant, syncSearch = true) {
  const select = byId("allianceRoleParticipant");
  if (!select) return;
  select.value = participant?.id || "";
  if (syncSearch) setValue("allianceRoleParticipantSearch", participant ? participantLabel(participant) : "");
  updateParticipantStatus();
}

function handleParticipantSearch() {
  const input = byId("allianceRoleParticipantSearch");
  if (!input) return;
  const query = input.value.trim().toLocaleLowerCase("ru-RU");
  if (!query) return selectParticipant(null, false);
  const participants = activeParticipants();
  const exact = participants.find(item => participantLabel(item).toLocaleLowerCase("ru-RU") === query || item.nickname.toLocaleLowerCase("ru-RU") === query);
  const prefix = participants.find(item => item.nickname.toLocaleLowerCase("ru-RU").startsWith(query));
  const partial = participants.find(item => item.nickname.toLocaleLowerCase("ru-RU").includes(query));
  selectParticipant(exact || prefix || partial || null, false);
}

function updateParticipantStatus() {
  const participant = selectedParticipant();
  const linked = Boolean(participant?.linked_user_id);
  const isOwner = participant?.account_role === "owner";
  const isR5 = participant?.rank_name === "Р5";
  const linkedRole = byId("allianceLinkedRole");

  if (linkedRole && ["editor", "viewer"].includes(participant?.account_role)) linkedRole.value = participant.account_role;

  setText("allianceRoleParticipantStatus", participant
    ? `${participant.nickname}: ${linked ? `аккаунт связан · ${isR5 ? "полные права Р5" : roleLabel(participant.account_role).toLocaleLowerCase("ru-RU")}` : "аккаунт не связан"}${isOwner ? " · владелец штаба" : ""}`
    : "Начни вводить никнейм и выбери участника.");

  setDisabled("allianceUnlinkAccountButton", !linked || isR5 || isOwner);
  setDisabled("allianceSaveLinkedRoleButton", !linked || isR5 || isOwner);
  setDisabled("allianceTransferR5Button", !linked || isR5);
  setDisabled("allianceTransferOwnerButton", !linked || isOwner);
  if (linkedRole) linkedRole.disabled = !linked || isR5 || isOwner;
}

function renderPrivilegedAccounts() {
  const body = byId("alliancePrivilegedAccountsBody");
  const empty = byId("alliancePrivilegedAccountsEmpty");
  if (!body || !empty) return;
  const privileged = activeParticipants()
    .filter(item => item.linked_user_id && (item.account_role === "owner" || item.account_role === "editor" || item.rank_name === "Р5"))
    .sort((a, b) => {
      const weight = item => item.account_role === "owner" ? 3 : item.rank_name === "Р5" ? 2 : 1;
      return weight(b) - weight(a) || a.nickname.localeCompare(b.nickname, "ru");
    });

  body.innerHTML = privileged.map(item => {
    const fixed = item.account_role === "owner" || item.rank_name === "Р5";
    const currentRole = item.account_role === "owner" ? "owner" : item.rank_name === "Р5" ? "r5" : "editor";
    return `<tr data-privileged-participant="${escapeHtml(item.id)}">
      <td><strong>${escapeHtml(item.nickname)}</strong></td>
      <td>${escapeHtml(item.rank_name || "—")}</td>
      <td>${escapeHtml(currentRole === "owner" ? "Владелец" : currentRole === "r5" ? "Р5 · полные права" : "Редактор")}</td>
      <td>${fixed
        ? `<button type="button" class="secondary-button" disabled>${currentRole === "owner" ? "Передаётся отдельно" : "Меняется назначением Р5"}</button>`
        : `<div class="alliance-inline-role-change"><select data-privileged-role data-no-persist="true"><option value="editor" selected>Редактор</option><option value="viewer">Наблюдатель</option></select><button type="button" data-save-privileged-role>Сохранить</button></div>`}
      </td>
    </tr>`;
  }).join("");
  empty.hidden = privileged.length > 0;
}

function render() {
  if (!state.context) return;
  fillAllianceCompactHeader(state.context);
  const alliance = state.context.alliance || {};
  setValue("allianceManagementName", alliance.name || "");
  setValue("allianceManagementState", alliance.state_number || "");
  setText("allianceManagementInvite", alliance.invite_code || "—");

  const canManage = canManageAllianceRoles(state.context);
  ["allianceDetailsCard", "allianceRoleManagementCard", "alliancePrivilegedAccountsCard"].forEach(id => setHidden(id, !canManage));
  if (!canManage) return showMessage("Управление союзом доступно владельцу и связанному Р5.", "info");

  const select = byId("allianceRoleParticipant");
  const datalist = byId("allianceRoleParticipantOptions");
  if (!select || !datalist) return showMessage("Не удалось загрузить блок управления аккаунтами. Обнови страницу.", "error");
  const selectedId = select.value;
  const participants = activeParticipants().sort((a, b) => a.nickname.localeCompare(b.nickname, "ru"));
  select.innerHTML = `<option value=""></option>${participants.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(participantLabel(item))}</option>`).join("")}`;
  datalist.innerHTML = participants.map(item => `<option value="${escapeHtml(participantLabel(item))}"></option>`).join("");
  const selected = participants.find(item => item.id === selectedId) || participants[0] || null;
  selectParticipant(selected);
  renderPrivilegedAccounts();
}

async function reload() { state.context = await loadAlliancePageContext(state.client); render(); }

async function saveDetails(event) {
  event.preventDefault();
  const button = event.submitter;
  if (!button) return;
  button.disabled = true;
  const { error } = await state.client.from("alliances").update({
    name: byId("allianceManagementName")?.value.trim() || "",
    state_number: byId("allianceManagementState")?.value.trim() || ""
  }).eq("id", getActiveAllianceId());
  button.disabled = false;
  if (error) return showMessage(error.message, "error");
  await reload();
  showMessage("Данные союза сохранены.", "success");
}

async function linkAccount(event) {
  const participant = selectedParticipant();
  const email = byId("allianceRoleEmail")?.value.trim() || "";
  if (!participant || !email) return showMessage("Выбери участника и укажи email.", "error");
  event.currentTarget.disabled = true;
  const { error } = await linkParticipantAccount(state.client, getActiveAllianceId(), participant.id, email);
  event.currentTarget.disabled = false;
  if (error) return showMessage(error.message, "error");
  setValue("allianceRoleEmail", "");
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

async function saveParticipantRole(participant, role, button) {
  if (!participant?.linked_user_id) return showMessage("Сначала свяжи участника с аккаунтом.", "error");
  if (participant.rank_name === "Р5" || participant.account_role === "owner") return showMessage("Права Р5 и владельца меняются только через передачу роли.", "error");
  button.disabled = true;
  const { error } = await setAllianceMemberRole(state.client, getActiveAllianceId(), participant.linked_user_id, role);
  button.disabled = false;
  if (error) return showMessage(error.message, "error");
  await reload();
  showMessage("Права сохранены.", "success");
}

async function saveRole(event) {
  await saveParticipantRole(selectedParticipant(), byId("allianceLinkedRole")?.value, event.currentTarget);
}

async function transferR5(event) {
  const participant = selectedParticipant();
  const previousRole = byId("alliancePreviousR5Role")?.value;
  if (!participant?.linked_user_id) return showMessage("Сначала свяжи нового Р5 с аккаунтом.", "error");
  if (!confirm(`Назначить «${participant.nickname}» новым Р5?`)) return;
  event.currentTarget.disabled = true;
  const { error } = await transferAllianceR5(state.client, getActiveAllianceId(), participant.id, previousRole);
  event.currentTarget.disabled = false;
  if (error) return showMessage(error.message, "error");
  await reload();
  showMessage("Новый Р5 назначен.", "success");
}

async function transferOwner(event) {
  const participant = selectedParticipant();
  const previousRole = byId("alliancePreviousOwnerRole")?.value;
  if (!participant?.linked_user_id) return showMessage("Сначала свяжи нового владельца с аккаунтом.", "error");
  if (!confirm(`Передать «${participant.nickname}» права владельца штаба?`)) return;
  event.currentTarget.disabled = true;
  const { error } = await transferAllianceOwner(state.client, getActiveAllianceId(), participant.linked_user_id, previousRole);
  event.currentTarget.disabled = false;
  if (error) return showMessage(error.message, "error");
  await reload();
  showMessage("Права владельца переданы.", "success");
}

async function privilegedTableClick(event) {
  const button = event.target.closest("[data-save-privileged-role]");
  if (!button) return;
  const row = button.closest("[data-privileged-participant]");
  const participant = state.context?.participants?.find(item => item.id === row?.dataset.privilegedParticipant);
  const role = row?.querySelector("[data-privileged-role]")?.value;
  if (participant && role) await saveParticipantRole(participant, role, button);
}

export async function init() {
  state.client = window.harvestHubSupabase;
  try { await reload(); } catch (error) { showMessage(error.message, "error"); return; }

  byId("allianceManagementDetailsForm")?.addEventListener("submit", saveDetails);
  byId("allianceManagementCopyInvite")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(byId("allianceManagementInvite")?.textContent.trim() || "");
      showMessage("Код приглашения скопирован.", "success");
    } catch { showMessage("Не удалось скопировать код. Выдели его вручную.", "error"); }
  });
  byId("allianceRoleParticipantSearch")?.addEventListener("input", handleParticipantSearch);
  byId("allianceRoleParticipantSearch")?.addEventListener("change", handleParticipantSearch);
  byId("allianceLinkAccountButton")?.addEventListener("click", linkAccount);
  byId("allianceUnlinkAccountButton")?.addEventListener("click", unlinkAccount);
  byId("allianceSaveLinkedRoleButton")?.addEventListener("click", saveRole);
  byId("allianceTransferR5Button")?.addEventListener("click", transferR5);
  byId("allianceTransferOwnerButton")?.addEventListener("click", transferOwner);
  byId("alliancePrivilegedAccountsBody")?.addEventListener("click", privilegedTableClick);
}