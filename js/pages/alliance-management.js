import {
  linkParticipantAccount,
  unlinkParticipantAccount,
  setAllianceMemberRole,
  transferAllianceR5,
  transferAllianceOwner,
  updateAllianceDetails
} from "../alliance/api.js?v=20260726-role-batch-1";
import {
  loadAlliancePageContext,
  invalidateAlliancePageContext,
  fillAllianceCompactHeader,
  canManageAllianceRoles,
  getEffectiveAllianceRole,
  getActiveAllianceId
} from "../alliance/page-context.js?v=20260726-role-batch-1";

const byId = id => document.getElementById(id);
const state = { client: null, context: null, detailsDirty: false, cleanup: [] };

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function showMessage(text, type = "info") {
  const box = byId("allianceMessage");
  if (!box) return;
  if (type === "error" && text) {
    box.hidden = true;
    window.harvestHubNotifications?.error(text, "Не удалось изменить данные союза.");
    return;
  }
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
  if (role === "r5") return "Р5";
  if (role === "editor") return "Редактор";
  if (role === "viewer") return "Наблюдатель";
  return "Роль не назначена";
}

function roleAfterTransfer(role) {
  return role === "viewer" ? "наблюдателем" : "редактором";
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
  const exact = participants.find(item =>
    participantLabel(item).toLocaleLowerCase("ru-RU") === query
    || item.nickname.toLocaleLowerCase("ru-RU") === query
  );
  selectParticipant(exact || null, false);
  if (!exact) setText("allianceRoleParticipantStatus", "Выбери точное совпадение из подсказок.");
}

function updateParticipantStatus() {
  const participant = selectedParticipant();
  const linked = Boolean(participant?.linked_user_id);
  const isOwner = participant?.account_role === "owner";
  const isR5 = participant?.account_role === "r5" || participant?.rank_name === "Р5";
  const linkedRole = byId("allianceLinkedRole");

  if (linkedRole && ["editor", "viewer"].includes(participant?.account_role)) linkedRole.value = participant.account_role;

  setText("allianceRoleParticipantStatus", participant
    ? `${participant.nickname}: ${linked ? `аккаунт связан · ${isR5 ? "полные рабочие права Р5" : roleLabel(participant.account_role).toLocaleLowerCase("ru-RU")}` : "аккаунт не связан"}${isOwner ? " · владелец штаба" : ""}`
    : "Начни вводить никнейм и выбери точное совпадение.");

  setDisabled("allianceUnlinkAccountButton", !linked || isR5 || isOwner);
  setDisabled("allianceSaveLinkedRoleButton", !linked || isR5 || isOwner);
  setDisabled("allianceTransferR5Button", !linked || isR5 || isOwner);
  setDisabled("allianceTransferOwnerButton", !linked || isOwner || getEffectiveAllianceRole(state.context) !== "owner");
  if (linkedRole) linkedRole.disabled = !linked || isR5 || isOwner;
}

function renderPrivilegedAccounts() {
  const body = byId("alliancePrivilegedAccountsBody");
  const empty = byId("alliancePrivilegedAccountsEmpty");
  if (!body || !empty) return;
  const privileged = activeParticipants()
    .filter(item => item.linked_user_id && (["owner", "r5", "editor"].includes(item.account_role) || item.rank_name === "Р5"))
    .sort((a, b) => {
      const weight = item => item.account_role === "owner" ? 3 : item.account_role === "r5" || item.rank_name === "Р5" ? 2 : 1;
      return weight(b) - weight(a) || a.nickname.localeCompare(b.nickname, "ru");
    });

  body.innerHTML = privileged.map(item => {
    const fixed = item.account_role === "owner" || item.account_role === "r5" || item.rank_name === "Р5";
    const currentRole = item.account_role === "owner" ? "owner" : item.account_role === "r5" || item.rank_name === "Р5" ? "r5" : "editor";
    return `<tr data-privileged-participant="${escapeHtml(item.id)}">
      <td><strong>${escapeHtml(item.nickname)}</strong></td>
      <td>${escapeHtml(item.rank_name || "—")}</td>
      <td>${escapeHtml(currentRole === "owner" ? "Владелец" : currentRole === "r5" ? "Р5 · полные рабочие права" : "Редактор")}</td>
      <td>${fixed
        ? `<button type="button" class="secondary-button" disabled>${currentRole === "owner" ? "Передаётся отдельно" : "Меняется назначением Р5"}</button>`
        : `<div class="alliance-inline-role-change"><select data-privileged-role data-no-persist="true"><option value="editor" selected>Редактор</option><option value="viewer">Наблюдатель</option></select><button type="button" data-save-privileged-role>Сохранить</button></div>`}
      </td>
    </tr>`;
  }).join("");
  empty.hidden = privileged.length > 0;
}

function detailsDraftKey() {
  return `harvesthub_alliance_management_draft:${getActiveAllianceId()}`;
}

function readDetailsDraft() {
  try { return JSON.parse(sessionStorage.getItem(detailsDraftKey()) || "null"); }
  catch { return null; }
}

function saveDetailsDraft() {
  const draft = {
    name: byId("allianceManagementName")?.value || "",
    stateNumber: byId("allianceManagementState")?.value || ""
  };
  try { sessionStorage.setItem(detailsDraftKey(), JSON.stringify(draft)); } catch {}
  state.detailsDirty = true;
}

function clearDetailsDraft() {
  try { sessionStorage.removeItem(detailsDraftKey()); } catch {}
  state.detailsDirty = false;
}

function render() {
  if (!state.context) return;
  fillAllianceCompactHeader(state.context);
  const alliance = state.context.alliance || {};
  const draft = readDetailsDraft();
  setValue("allianceManagementName", draft?.name ?? alliance.name ?? "");
  setValue("allianceManagementState", draft?.stateNumber ?? alliance.state_number ?? "");
  state.detailsDirty = Boolean(draft);
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
  const selected = participants.find(item => item.id === selectedId) || null;
  selectParticipant(selected);
  renderPrivilegedAccounts();
}

async function reload() {
  invalidateAlliancePageContext();
  state.context = await loadAlliancePageContext(state.client, { force: true });
  render();
}

async function saveDetails(event) {
  event.preventDefault();
  const button = event.submitter;
  if (!button) return;
  button.disabled = true;
  try {
    const { error } = await updateAllianceDetails(state.client, {
      allianceId: getActiveAllianceId(),
      name: byId("allianceManagementName")?.value || "",
      stateNumber: byId("allianceManagementState")?.value || ""
    });
    if (error) throw error;
    clearDetailsDraft();
    await reload();
    showMessage("Данные союза сохранены.", "success");
  } catch (error) {
    showMessage(error?.message || "Не удалось сохранить данные союза.", "error");
  } finally {
    button.disabled = false;
  }
}

async function linkAccount(event) {
  const participant = selectedParticipant();
  const email = byId("allianceRoleEmail")?.value.trim() || "";
  if (!participant || !email) return showMessage("Выбери участника и укажи email.", "error");
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const { error } = await linkParticipantAccount(state.client, getActiveAllianceId(), participant.id, email);
    if (error) throw error;
    setValue("allianceRoleEmail", "");
    await reload();
    showMessage("Аккаунт связан.", "success");
  } catch (error) {
    showMessage(error?.message || "Не удалось связать аккаунт.", "error");
  } finally {
    button.disabled = false;
  }
}

async function unlinkAccount(event) {
  const participant = selectedParticipant();
  if (!participant?.linked_user_id || !confirm(`Отвязать аккаунт от «${participant.nickname}»?`)) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const { error } = await unlinkParticipantAccount(state.client, getActiveAllianceId(), participant.id);
    if (error) throw error;
    await reload();
    showMessage("Аккаунт отвязан.", "success");
  } catch (error) {
    showMessage(error?.message || "Не удалось отвязать аккаунт.", "error");
  } finally {
    button.disabled = false;
  }
}

async function saveParticipantRole(participant, role, button) {
  if (!participant?.linked_user_id) return showMessage("Сначала свяжи участника с аккаунтом.", "error");
  if (participant.rank_name === "Р5" || ["owner", "r5"].includes(participant.account_role)) return showMessage("Права Р5 и владельца меняются только через передачу роли.", "error");
  button.disabled = true;
  try {
    const { error } = await setAllianceMemberRole(state.client, getActiveAllianceId(), participant.linked_user_id, role);
    if (error) throw error;
    await reload();
    showMessage("Права сохранены.", "success");
  } catch (error) {
    showMessage(error?.message || "Не удалось сохранить права.", "error");
  } finally {
    button.disabled = false;
  }
}

async function saveRole(event) {
  await saveParticipantRole(selectedParticipant(), byId("allianceLinkedRole")?.value, event.currentTarget);
}

function confirmTyped(message, nickname) {
  const typed = prompt(`${message}\n\nДля подтверждения введи никнейм точно: ${nickname}`);
  if (typed === null) return false;
  if (typed.trim() !== nickname.trim()) {
    showMessage("Никнейм не совпал. Передача отменена.", "error");
    return false;
  }
  return true;
}

async function transferR5(event) {
  const participant = selectedParticipant();
  const previousRank = byId("alliancePreviousR5Role")?.value;
  if (!participant?.linked_user_id) return showMessage("Сначала свяжи нового Р5 с аккаунтом.", "error");
  const oldR5 = activeParticipants().find(item => item.rank_name === "Р5");
  const message = `«${participant.nickname}» немедленно станет новым Р5. ${oldR5 && oldR5.id !== participant.id ? `Прежний Р5 «${oldR5.nickname}» получит ранг ${previousRank}.` : "Другой Р5 сейчас не назначен."}`;
  if (!confirmTyped(message, participant.nickname)) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const { error } = await transferAllianceR5(state.client, getActiveAllianceId(), participant.id, previousRank);
    if (error) throw error;
    await reload();
    showMessage("Новый Р5 назначен.", "success");
  } catch (error) {
    showMessage(error?.message || "Не удалось передать роль Р5.", "error");
  } finally {
    button.disabled = false;
  }
}

async function transferOwner(event) {
  const participant = selectedParticipant();
  const previousRole = byId("alliancePreviousOwnerRole")?.value;
  if (!participant?.linked_user_id) return showMessage("Сначала свяжи нового владельца с аккаунтом.", "error");
  if (getEffectiveAllianceRole(state.context) !== "owner") return showMessage("Передать владение может только текущий владелец.", "error");
  const message = `«${participant.nickname}» немедленно получит владение штабом. Текущий владелец потеряет право передачи собственности и останется ${roleAfterTransfer(previousRole)}. Вернуть владение сможет только новый владелец.`;
  if (!confirmTyped(message, participant.nickname)) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const { error } = await transferAllianceOwner(state.client, getActiveAllianceId(), participant.linked_user_id, previousRole);
    if (error) throw error;
    await reload();
    showMessage("Права владельца переданы.", "success");
  } catch (error) {
    showMessage(error?.message || "Не удалось передать владение.", "error");
  } finally {
    button.disabled = false;
  }
}

async function privilegedTableClick(event) {
  const button = event.target.closest("[data-save-privileged-role]");
  if (!button) return;
  const row = button.closest("[data-privileged-participant]");
  const participant = state.context?.participants?.find(item => item.id === row?.dataset.privilegedParticipant);
  const role = row?.querySelector("[data-privileged-role]")?.value;
  if (participant && role) await saveParticipantRole(participant, role, button);
}

function register(element, eventName, handler, options) {
  if (!element) return;
  element.addEventListener(eventName, handler, options);
  state.cleanup.push(() => element.removeEventListener(eventName, handler, options));
}

function cleanupPreviousInstance() {
  window.harvestHubAllianceManagementCleanup?.();
  state.cleanup = [];
  window.harvestHubAllianceManagementCleanup = () => {
    state.cleanup.splice(0).forEach(cleanup => cleanup());
  };
}

export async function init() {
  cleanupPreviousInstance();
  state.client = window.harvestHubSupabase;
  try { await reload(); } catch (error) { showMessage(error.message, "error"); return; }

  register(byId("allianceManagementDetailsForm"), "submit", saveDetails);
  register(byId("allianceManagementDetailsForm"), "input", saveDetailsDraft);
  register(byId("allianceManagementCopyInvite"), "click", async () => {
    const code = byId("allianceManagementInvite")?.textContent.trim() || "";
    if (!code || code === "—") return showMessage("Код приглашения ещё не создан.", "error");
    try {
      await navigator.clipboard.writeText(code);
      showMessage("Код приглашения скопирован.", "success");
    } catch { showMessage("Не удалось скопировать код. Выдели его вручную.", "error"); }
  });
  register(byId("allianceRoleParticipantSearch"), "input", handleParticipantSearch);
  register(byId("allianceRoleParticipantSearch"), "change", handleParticipantSearch);
  register(byId("allianceLinkAccountButton"), "click", linkAccount);
  register(byId("allianceUnlinkAccountButton"), "click", unlinkAccount);
  register(byId("allianceSaveLinkedRoleButton"), "click", saveRole);
  register(byId("allianceTransferR5Button"), "click", transferR5);
  register(byId("allianceTransferOwnerButton"), "click", transferOwner);
  register(byId("alliancePrivilegedAccountsBody"), "click", privilegedTableClick);
  register(window, "beforeunload", event => {
    if (!state.detailsDirty || !byId("allianceManagementDetailsForm")) return;
    event.preventDefault();
    event.returnValue = "";
  });
}
