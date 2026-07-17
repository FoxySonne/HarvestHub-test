import {
  createAlliance,
  deleteParticipant,
  fetchAllianceForGuest,
  fetchMemberships,
  fetchParticipants,
  joinAlliance,
  saveParticipant
} from "../alliance/api.js";
import { ACTIVE_ALLIANCE_STORAGE_KEY, ROLE_LABELS } from "../alliance/config.js";
import { renderMembershipOptions, renderParticipantRows } from "../alliance/view.js";

const state = {
  client: null,
  session: null,
  memberships: [],
  activeAllianceId: "",
  activeAlliance: null,
  activeRole: "viewer",
  participants: [],
  realtimeChannel: null,
  authSubscription: null,
  guestMode: true
};

function getElement(id) {
  return document.getElementById(id);
}

function showMessage(message, type = "info") {
  const element = getElement("allianceMessage");
  if (!element) return;
  element.hidden = !message;
  element.textContent = message || "";
  element.dataset.type = type;
}

function setBusy(button, busy, busyText = "Подождите…") {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function canEditParticipants() {
  return Boolean(state.session?.user) && !state.guestMode && ["owner", "editor"].includes(state.activeRole);
}

function updateAccountVisibility() {
  const signedIn = Boolean(state.session?.user);
  const hint = getElement("allianceAccountHint");
  const management = getElement("allianceManagementCard");
  if (hint) hint.hidden = signedIn;
  if (management) management.hidden = !signedIn;
}

function applyAllianceHeader() {
  const alliance = state.activeAlliance || {};
  getElement("allianceOpenedName").textContent = alliance.name || "—";
  getElement("allianceOpenedState").textContent = alliance.state_number ? `Штат ${alliance.state_number}` : "";

  const roleBox = getElement("allianceRoleBox");
  const inviteBox = getElement("allianceInviteBox");
  if (roleBox) roleBox.hidden = state.guestMode || !state.session;
  if (inviteBox) inviteBox.hidden = state.guestMode || !state.session;

  const role = getElement("allianceSessionRole");
  if (role) role.textContent = ROLE_LABELS[state.activeRole] || "Только просмотр";

  const code = getElement("allianceInviteCode");
  if (code) code.textContent = alliance.invite_code || "—";

  const editor = getElement("participantEditorCard");
  if (editor) editor.hidden = !canEditParticipants();
}

function renderParticipants() {
  const body = getElement("participantTableBody");
  const empty = getElement("participantEmptyState");
  const count = getElement("participantCount");
  if (!body || !empty || !count) return;

  count.textContent = `${state.participants.length} участников`;
  empty.hidden = state.participants.length > 0;
  body.innerHTML = renderParticipantRows(state.participants, canEditParticipants());
}

function showAllianceData() {
  const area = getElement("allianceDataArea");
  if (area) area.hidden = false;
  applyAllianceHeader();
  renderParticipants();
}

function removeRealtimeChannel() {
  if (!state.realtimeChannel || !state.client) return;
  state.client.removeChannel(state.realtimeChannel);
  state.realtimeChannel = null;
}

async function loadMemberParticipants() {
  if (!state.activeAllianceId) return;
  const { data, error } = await fetchParticipants(state.client, state.activeAllianceId);
  if (error) throw error;
  state.participants = Array.isArray(data) ? data : [];
  renderParticipants();
}

function subscribeToParticipants() {
  removeRealtimeChannel();
  if (!state.activeAllianceId || state.guestMode) return;

  state.realtimeChannel = state.client
    .channel(`participants:${state.activeAllianceId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "participants",
      filter: `alliance_id=eq.${state.activeAllianceId}`
    }, async () => {
      try {
        await loadMemberParticipants();
      } catch (error) {
        console.error("Не удалось обновить список участников", error);
      }
    })
    .subscribe();
}

function resetParticipantForm() {
  getElement("participantForm")?.reset();
  if (getElement("participantId")) getElement("participantId").value = "";
  if (getElement("participantPower")) getElement("participantPower").value = "0";
  if (getElement("participantStatus")) getElement("participantStatus").value = "active";
  if (getElement("participantEditorTitle")) getElement("participantEditorTitle").textContent = "Добавить участника";
  if (getElement("participantCancelButton")) getElement("participantCancelButton").hidden = true;
}

function fillParticipantForm(participant) {
  if (!participant) return;
  getElement("participantId").value = participant.id;
  getElement("participantNickname").value = participant.nickname || "";
  getElement("participantRank").value = participant.rank_name || "";
  getElement("participantPower").value = String(participant.squad_power || 0);
  getElement("participantStatus").value = participant.status || "active";
  getElement("participantComment").value = participant.comment || "";
  getElement("participantEditorTitle").textContent = "Редактировать участника";
  getElement("participantCancelButton").hidden = false;
  getElement("participantEditorCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function openGuestAlliance(event) {
  event.preventDefault();
  const code = getElement("allianceGuestCode").value.trim().toUpperCase();
  const button = getElement("allianceGuestOpenButton");
  if (!code) return showMessage("Укажи пригласительный код.", "error");

  setBusy(button, true, "Открываем…");
  showMessage("");
  const { data, error } = await fetchAllianceForGuest(state.client, code);
  setBusy(button, false);

  if (error) {
    const message = String(error.message || "");
    showMessage(
      message.includes("open_alliance_by_code")
        ? "Гостевой просмотр ещё не подключён в Supabase. Нужно выполнить новый SQL-скрипт для союзного штаба."
        : message,
      "error"
    );
    return;
  }

  if (!data?.alliance) {
    showMessage("Союз с таким кодом не найден.", "error");
    return;
  }

  removeRealtimeChannel();
  state.guestMode = true;
  state.activeAlliance = data.alliance;
  state.activeAllianceId = data.alliance.id || "";
  state.activeRole = "viewer";
  state.participants = Array.isArray(data.participants) ? data.participants : [];
  resetParticipantForm();
  showAllianceData();
  showMessage("Штаб открыт в режиме просмотра.", "success");
}

function renderMemberships() {
  const selector = getElement("allianceSelector");
  const field = getElement("allianceSelectorField");
  if (!selector || !field) return;

  field.hidden = state.memberships.length === 0;
  selector.innerHTML = renderMembershipOptions(state.memberships);
  if (!state.memberships.length) return;

  const saved = localStorage.getItem(ACTIVE_ALLIANCE_STORAGE_KEY) || "";
  const membership = state.memberships.find(item => item.alliance_id === saved) || state.memberships[0];
  selector.value = membership.alliance_id;
}

async function openMembership(allianceId) {
  const membership = state.memberships.find(item => item.alliance_id === allianceId);
  if (!membership) return;

  state.guestMode = false;
  state.activeAllianceId = membership.alliance_id;
  state.activeAlliance = membership.alliances || null;
  state.activeRole = membership.role || "viewer";
  localStorage.setItem(ACTIVE_ALLIANCE_STORAGE_KEY, state.activeAllianceId);
  resetParticipantForm();
  await loadMemberParticipants();
  showAllianceData();
  subscribeToParticipants();
}

async function loadMemberships() {
  if (!state.session?.user) {
    state.memberships = [];
    renderMemberships();
    return;
  }

  const { data, error } = await fetchMemberships(state.client);
  if (error) throw error;
  state.memberships = Array.isArray(data) ? data : [];
  renderMemberships();

  if (state.memberships.length && getElement("allianceDataArea")?.hidden) {
    const saved = localStorage.getItem(ACTIVE_ALLIANCE_STORAGE_KEY) || "";
    const membership = state.memberships.find(item => item.alliance_id === saved) || state.memberships[0];
    await openMembership(membership.alliance_id);
  }
}

async function handleCreateAlliance(event) {
  event.preventDefault();
  if (!state.session?.user) return showMessage("Для создания штаба войди в аккаунт HarvestHub.", "error");

  const name = getElement("allianceCreateName").value.trim();
  const stateNumber = getElement("allianceCreateState").value.trim();
  const button = event.submitter;
  if (!name) return showMessage("Укажи название союза.", "error");

  setBusy(button, true, "Создаём…");
  const { data, error } = await createAlliance(state.client, { name, stateNumber, userId: state.session.user.id });
  setBusy(button, false);
  if (error) return showMessage(error.message, "error");

  localStorage.setItem(ACTIVE_ALLIANCE_STORAGE_KEY, data.id);
  event.currentTarget.reset();
  await loadMemberships();
  await openMembership(data.id);
  showMessage("Союзный штаб создан.", "success");
}

async function handleJoinAlliance(event) {
  event.preventDefault();
  if (!state.session?.user) return showMessage("Для подключения штаба войди в аккаунт HarvestHub.", "error");

  const code = getElement("allianceJoinCode").value.trim().toUpperCase();
  const button = event.submitter;
  if (!code) return showMessage("Укажи пригласительный код.", "error");

  setBusy(button, true, "Подключаем…");
  const { data, error } = await joinAlliance(state.client, code);
  setBusy(button, false);
  if (error) return showMessage(error.message, "error");

  localStorage.setItem(ACTIVE_ALLIANCE_STORAGE_KEY, data);
  event.currentTarget.reset();
  await loadMemberships();
  await openMembership(data);
  showMessage("Штаб подключён к аккаунту.", "success");
}

async function handleParticipantSubmit(event) {
  event.preventDefault();
  if (!canEditParticipants()) return showMessage("У тебя нет прав на изменение участников.", "error");

  const id = getElement("participantId").value;
  const nickname = getElement("participantNickname").value.trim();
  if (!nickname) return showMessage("Укажи никнейм участника.", "error");

  const button = event.submitter;
  const payload = {
    alliance_id: state.activeAllianceId,
    nickname,
    rank_name: getElement("participantRank").value.trim(),
    squad_power: Math.max(0, Math.floor(Number(getElement("participantPower").value) || 0)),
    status: getElement("participantStatus").value,
    comment: getElement("participantComment").value.trim(),
    updated_by: state.session.user.id
  };

  setBusy(button, true, "Сохраняем…");
  const result = await saveParticipant(state.client, {
    id,
    allianceId: state.activeAllianceId,
    payload,
    userId: state.session.user.id
  });
  setBusy(button, false);
  if (result.error) return showMessage(result.error.message, "error");

  resetParticipantForm();
  await loadMemberParticipants();
  showMessage(id ? "Данные участника обновлены." : "Участник добавлен.", "success");
}

async function handleTableClick(event) {
  const editButton = event.target.closest("[data-participant-edit]");
  const deleteButton = event.target.closest("[data-participant-delete]");

  if (editButton) {
    fillParticipantForm(state.participants.find(item => item.id === editButton.dataset.participantEdit));
    return;
  }
  if (!deleteButton || !canEditParticipants()) return;

  const participant = state.participants.find(item => item.id === deleteButton.dataset.participantDelete);
  if (!participant || !window.confirm(`Удалить участника «${participant.nickname}»?`)) return;

  deleteButton.disabled = true;
  const { error } = await deleteParticipant(state.client, { id: participant.id, allianceId: state.activeAllianceId });
  if (error) {
    deleteButton.disabled = false;
    return showMessage(error.message, "error");
  }
  await loadMemberParticipants();
  showMessage("Участник удалён.", "success");
}

async function handleCopyCode() {
  const code = getElement("allianceInviteCode")?.textContent?.trim();
  if (!code || code === "—") return;
  try {
    await navigator.clipboard.writeText(code);
    showMessage("Код приглашения скопирован.", "success");
  } catch {
    showMessage(`Код приглашения: ${code}`, "info");
  }
}

function bindEvents() {
  getElement("allianceGuestOpenForm")?.addEventListener("submit", openGuestAlliance);
  getElement("allianceCreateForm")?.addEventListener("submit", handleCreateAlliance);
  getElement("allianceJoinForm")?.addEventListener("submit", handleJoinAlliance);
  getElement("allianceSelector")?.addEventListener("change", event => openMembership(event.target.value).catch(error => showMessage(error.message, "error")));
  getElement("allianceCopyCodeButton")?.addEventListener("click", handleCopyCode);
  getElement("participantForm")?.addEventListener("submit", handleParticipantSubmit);
  getElement("participantCancelButton")?.addEventListener("click", resetParticipantForm);
  getElement("participantTableBody")?.addEventListener("click", handleTableClick);
}

async function applySession(session) {
  state.session = session;
  updateAccountVisibility();
  try {
    await loadMemberships();
  } catch (error) {
    console.error("Ошибка загрузки союзного штаба", error);
    showMessage(error.message, "error");
  }
}

function cleanup() {
  removeRealtimeChannel();
  state.authSubscription?.unsubscribe?.();
  state.authSubscription = null;
}

export async function init() {
  cleanup();
  state.client = window.harvestHubSupabase;
  if (!state.client) return showMessage("Не удалось подключить Supabase.", "error");

  bindEvents();
  const { data, error } = await state.client.auth.getSession();
  if (error) return showMessage(error.message, "error");
  await applySession(data.session);

  const authListener = state.client.auth.onAuthStateChange(async (_event, session) => applySession(session));
  state.authSubscription = authListener.data.subscription;
  window.harvestHubAllianceCleanup = cleanup;
}
