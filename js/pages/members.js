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
  guestMode: true,
  realtimeChannel: null,
  authSubscription: null
};

const byId = id => document.getElementById(id);

function showMessage(message, type = "info") {
  const box = byId("allianceMessage");
  if (!box) return;
  box.hidden = !message;
  box.textContent = message || "";
  box.dataset.type = type;
}

function setBusy(button, busy, text = "Подождите…") {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = text;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function canManage() {
  return Boolean(state.session?.user)
    && !state.guestMode
    && ["owner", "editor"].includes(state.activeRole)
    && window.getAdvancedMode?.() === true;
}

function canSeePrivate() {
  return !state.guestMode && ["owner", "editor"].includes(state.activeRole);
}

function updatePageAccess() {
  const signedIn = Boolean(state.session?.user);
  const advanced = window.getAdvancedMode?.() === true;
  const hasAlliance = Boolean(state.activeAllianceId);

  const hint = byId("allianceAccountHint");
  const management = byId("allianceManagementCard");
  const guest = document.querySelector(".alliance-guest-card");
  const editor = byId("participantEditorCard");

  if (hint) hint.hidden = signedIn && advanced;
  if (management) management.hidden = !signedIn || !advanced || hasAlliance;
  if (guest) guest.hidden = hasAlliance;
  if (editor) editor.hidden = !canManage();

  const accountButton = byId("allianceAccountButton");
  const advancedButton = byId("allianceAdvancedModeButton");
  if (accountButton) accountButton.hidden = signedIn;
  if (advancedButton) advancedButton.hidden = !signedIn || advanced;

  const hintText = byId("allianceAccessHintText");
  if (hintText) {
    hintText.textContent = signedIn
      ? "Для создания и редактирования союзного штаба включи продвинутый режим."
      : "Для создания и редактирования нужен полноценный аккаунт и продвинутый режим.";
  }
}

function applyAllianceHeader() {
  const alliance = state.activeAlliance || {};
  byId("allianceOpenedName").textContent = alliance.name || "—";
  byId("allianceOpenedState").textContent = alliance.state_number ? `Штат ${alliance.state_number}` : "";

  const roleBox = byId("allianceRoleBox");
  const inviteBox = byId("allianceInviteBox");
  if (roleBox) roleBox.hidden = state.guestMode || !state.session;
  if (inviteBox) inviteBox.hidden = state.guestMode || !state.session;
  if (byId("allianceSessionRole")) byId("allianceSessionRole").textContent = ROLE_LABELS[state.activeRole] || "Только просмотр";
  if (byId("allianceInviteCode")) byId("allianceInviteCode").textContent = alliance.invite_code || "—";

  document.querySelectorAll(".participant-private-column").forEach(element => {
    element.hidden = !canSeePrivate();
  });
}

function filteredParticipants() {
  const search = (byId("participantSearch")?.value || "").trim().toLowerCase();
  const rank = byId("participantRankFilter")?.value || "";
  const status = byId("participantStatusFilter")?.value || "";
  const sort = byId("participantSort")?.value || "rank";
  const rankWeight = { "Р5": 5, "Р4": 4, "Р3": 3, "Р2": 2, "Р1": 1 };

  return state.participants
    .filter(item => !search || item.nickname.toLowerCase().includes(search))
    .filter(item => !rank || item.rank_name === rank)
    .filter(item => !status || item.member_status === status)
    .sort((a, b) => {
      if (sort === "nickname") return a.nickname.localeCompare(b.nickname, "ru");
      return (rankWeight[b.rank_name] || 0) - (rankWeight[a.rank_name] || 0)
        || a.nickname.localeCompare(b.nickname, "ru");
    });
}

function renderParticipants() {
  const body = byId("participantTableBody");
  const empty = byId("participantEmptyState");
  const count = byId("participantCount");
  if (!body || !empty || !count) return;

  const rows = filteredParticipants();
  count.textContent = `${state.participants.length} участников`;
  empty.hidden = rows.length > 0;
  body.innerHTML = renderParticipantRows(rows, canManage(), canSeePrivate());
  applyAllianceHeader();
}

function showAllianceData() {
  const area = byId("allianceDataArea");
  if (area) area.hidden = false;
  updatePageAccess();
  applyAllianceHeader();
  renderParticipants();
}

function resetParticipantForm() {
  byId("participantForm")?.reset();
  if (byId("participantId")) byId("participantId").value = "";
  if (byId("participantStatus")) byId("participantStatus").value = "main";
  if (byId("participantEditorTitle")) byId("participantEditorTitle").textContent = "Добавить участника";
  if (byId("participantCancelButton")) byId("participantCancelButton").hidden = true;
}

function fillParticipantForm(participant) {
  if (!participant) return;
  byId("participantId").value = participant.id;
  byId("participantNickname").value = participant.nickname || "";
  byId("participantRank").value = participant.rank_name || "";
  byId("participantStatus").value = participant.member_status || "main";
  byId("participantTimezone").value = participant.timezone_offset ?? "";
  byId("participantBirthday").value = participant.birthday || "";
  byId("participantComment").value = participant.comment || "";
  byId("participantEditorTitle").textContent = "Редактировать участника";
  byId("participantCancelButton").hidden = false;
  byId("participantEditorCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadParticipants() {
  if (!state.activeAllianceId) return;
  const { data, error } = await fetchParticipants(state.client, state.activeAllianceId);
  if (error) throw error;
  state.participants = Array.isArray(data) ? data : [];
  renderParticipants();
}

function removeRealtime() {
  if (!state.realtimeChannel || !state.client) return;
  state.client.removeChannel(state.realtimeChannel);
  state.realtimeChannel = null;
}

function subscribeRealtime() {
  removeRealtime();
  if (!state.activeAllianceId || state.guestMode) return;
  state.realtimeChannel = state.client
    .channel(`participants:${state.activeAllianceId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "participants",
      filter: `alliance_id=eq.${state.activeAllianceId}`
    }, () => loadParticipants().catch(console.error))
    .subscribe();
}

function renderMemberships() {
  const selector = byId("allianceSelector");
  const field = byId("allianceSelectorField");
  if (!selector || !field) return;
  field.hidden = state.memberships.length < 2;
  selector.innerHTML = renderMembershipOptions(state.memberships);
  if (state.activeAllianceId) selector.value = state.activeAllianceId;
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
  await loadParticipants();
  showAllianceData();
  subscribeRealtime();
}

async function loadMemberships() {
  if (!state.session?.user) {
    state.memberships = [];
    renderMemberships();
    updatePageAccess();
    return;
  }

  const { data, error } = await fetchMemberships(state.client);
  if (error) throw error;
  state.memberships = Array.isArray(data) ? data : [];
  renderMemberships();

  if (state.memberships.length) {
    const saved = localStorage.getItem(ACTIVE_ALLIANCE_STORAGE_KEY) || "";
    const membership = state.memberships.find(item => item.alliance_id === saved) || state.memberships[0];
    await openMembership(membership.alliance_id);
  } else {
    state.activeAllianceId = "";
    updatePageAccess();
  }
}

async function openGuestAlliance(event) {
  event.preventDefault();
  const code = byId("allianceGuestCode").value.trim().toUpperCase();
  const button = byId("allianceGuestOpenButton");
  if (!code) return showMessage("Укажи пригласительный код.", "error");

  setBusy(button, true, "Открываем…");
  const { data, error } = await fetchAllianceForGuest(state.client, code);
  setBusy(button, false);
  if (error) return showMessage(error.message, "error");
  if (!data?.alliance) return showMessage("Союз с таким кодом не найден.", "error");

  removeRealtime();
  state.guestMode = true;
  state.activeAlliance = data.alliance;
  state.activeAllianceId = data.alliance.id;
  state.activeRole = "viewer";
  state.participants = Array.isArray(data.participants) ? data.participants : [];
  showAllianceData();
  showMessage("Штаб открыт в режиме просмотра.", "success");
}

async function handleCreateAlliance(event) {
  event.preventDefault();
  const button = event.submitter;
  const name = byId("allianceCreateName").value.trim();
  const stateNumber = byId("allianceCreateState").value.trim();
  if (!name) return showMessage("Укажи название союза.", "error");

  setBusy(button, true, "Создаём…");
  const { data, error } = await createAlliance(state.client, { name, stateNumber });
  setBusy(button, false);
  if (error) return showMessage(error.message, "error");

  localStorage.setItem(ACTIVE_ALLIANCE_STORAGE_KEY, data);
  event.currentTarget.reset();
  await loadMemberships();
  showMessage("Союзный штаб создан.", "success");
}

async function handleJoinAlliance(event) {
  event.preventDefault();
  const button = event.submitter;
  const code = byId("allianceJoinCode").value.trim().toUpperCase();
  if (!code) return showMessage("Укажи пригласительный код.", "error");

  setBusy(button, true, "Подключаем…");
  const { data, error } = await joinAlliance(state.client, code);
  setBusy(button, false);
  if (error) return showMessage(error.message, "error");

  localStorage.setItem(ACTIVE_ALLIANCE_STORAGE_KEY, data);
  event.currentTarget.reset();
  await loadMemberships();
  showMessage("Штаб подключён к аккаунту.", "success");
}

async function handleParticipantSubmit(event) {
  event.preventDefault();
  if (!canManage()) return showMessage("Редактирование доступно только управляющим союза в продвинутом режиме.", "error");

  const nickname = byId("participantNickname").value.trim();
  if (!nickname) return showMessage("Укажи никнейм участника.", "error");
  const duplicate = state.participants.find(item => item.nickname.trim().toLowerCase() === nickname.toLowerCase() && item.id !== byId("participantId").value);
  if (duplicate) return showMessage("Участник с таким никнеймом уже существует.", "error");

  const button = event.submitter;
  setBusy(button, true, "Сохраняем…");
  const { error } = await saveParticipant(state.client, {
    id: byId("participantId").value || null,
    allianceId: state.activeAllianceId,
    payload: {
      nickname,
      rank_name: byId("participantRank").value,
      member_status: byId("participantStatus").value,
      timezone_offset: byId("participantTimezone").value === "" ? null : Number(byId("participantTimezone").value),
      birthday: byId("participantBirthday").value || null,
      comment: byId("participantComment").value.trim()
    }
  });
  setBusy(button, false);
  if (error) return showMessage(error.message, "error");

  resetParticipantForm();
  await loadParticipants();
  showMessage("Данные участника сохранены.", "success");
}

async function handleTableClick(event) {
  const edit = event.target.closest("[data-participant-edit]");
  if (edit) {
    fillParticipantForm(state.participants.find(item => item.id === edit.dataset.participantEdit));
    return;
  }

  const remove = event.target.closest("[data-participant-delete]");
  if (!remove || !canManage()) return;
  const participant = state.participants.find(item => item.id === remove.dataset.participantDelete);
  if (!participant || !window.confirm(`Отметить участника «${participant.nickname}» как вышедшего? История сохранится.`)) return;

  const { error } = await deleteParticipant(state.client, { id: participant.id, allianceId: state.activeAllianceId });
  if (error) return showMessage(error.message, "error");
  await loadParticipants();
  showMessage("Участник отмечен как вышедший.", "success");
}

async function copyInviteCode() {
  const code = byId("allianceInviteCode")?.textContent?.trim();
  if (!code || code === "—") return;
  await navigator.clipboard.writeText(code);
  showMessage("Код приглашения скопирован.", "success");
}

function bindEvents() {
  byId("allianceGuestOpenForm")?.addEventListener("submit", openGuestAlliance);
  byId("allianceCreateForm")?.addEventListener("submit", handleCreateAlliance);
  byId("allianceJoinForm")?.addEventListener("submit", handleJoinAlliance);
  byId("participantForm")?.addEventListener("submit", handleParticipantSubmit);
  byId("participantCancelButton")?.addEventListener("click", resetParticipantForm);
  byId("participantTableBody")?.addEventListener("click", handleTableClick);
  byId("allianceCopyCodeButton")?.addEventListener("click", copyInviteCode);
  byId("allianceSelector")?.addEventListener("change", event => openMembership(event.target.value).catch(error => showMessage(error.message, "error")));
  ["participantSearch", "participantRankFilter", "participantStatusFilter", "participantSort"].forEach(id => {
    byId(id)?.addEventListener(id === "participantSearch" ? "input" : "change", renderParticipants);
  });
}

async function applySession(session) {
  state.session = session;
  updatePageAccess();
  try {
    await loadMemberships();
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Не удалось загрузить союзный штаб.", "error");
  }
}

export async function init() {
  state.client = window.harvestHubSupabase;
  if (!state.client) return showMessage("Не удалось подключить Supabase.", "error");

  bindEvents();
  const { data, error } = await state.client.auth.getSession();
  if (error) return showMessage(error.message, "error");
  await applySession(data.session);

  const listener = state.client.auth.onAuthStateChange((_event, session) => applySession(session));
  state.authSubscription = listener.data.subscription;
  window.addEventListener("harvesthub:advanced-mode-change", updatePageAccess);
}
