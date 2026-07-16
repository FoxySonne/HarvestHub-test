const ACTIVE_ALLIANCE_STORAGE_KEY = "harvesthub_active_alliance_id";

const state = {
  client: null,
  session: null,
  memberships: [],
  activeAllianceId: "",
  activeRole: "",
  participants: [],
  realtimeChannel: null,
  authSubscription: null
};

const STATUS_LABELS = {
  active: "Активен",
  reserve: "Резерв",
  inactive: "Неактивен"
};

const ROLE_LABELS = {
  owner: "Владелец",
  editor: "Редактор",
  viewer: "Только просмотр"
};

function getElement(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  return Math.max(0, Number(value) || 0).toLocaleString("ru-RU");
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

function getActiveMembership() {
  return state.memberships.find(item => item.alliance_id === state.activeAllianceId) || null;
}

function canEditParticipants() {
  return ["owner", "editor"].includes(state.activeRole);
}

function updateWorkspaceVisibility() {
  const authCard = getElement("allianceAuthCard");
  const workspace = getElement("allianceWorkspace");

  if (authCard) authCard.hidden = Boolean(state.session);
  if (workspace) workspace.hidden = !state.session;

  const emailElement = getElement("allianceSessionEmail");
  if (emailElement) emailElement.textContent = state.session?.user?.email || "—";
}

function renderMemberships() {
  const selector = getElement("allianceSelector");
  const dataArea = getElement("allianceDataArea");

  if (!selector || !dataArea) return;

  if (!state.memberships.length) {
    selector.innerHTML = "";
    dataArea.hidden = true;
    state.activeAllianceId = "";
    state.activeRole = "";
    getElement("allianceSessionRole").textContent = "Союз не подключён";
    return;
  }

  const savedAllianceId = localStorage.getItem(ACTIVE_ALLIANCE_STORAGE_KEY) || "";
  const hasSavedAlliance = state.memberships.some(item => item.alliance_id === savedAllianceId);

  state.activeAllianceId = hasSavedAlliance
    ? savedAllianceId
    : state.memberships[0].alliance_id;

  localStorage.setItem(ACTIVE_ALLIANCE_STORAGE_KEY, state.activeAllianceId);

  selector.innerHTML = state.memberships.map(item => {
    const alliance = item.alliances;
    const stateSuffix = alliance?.state_number ? ` · штат ${escapeHtml(alliance.state_number)}` : "";

    return `<option value="${escapeHtml(item.alliance_id)}">${escapeHtml(alliance?.name || "Без названия")}${stateSuffix}</option>`;
  }).join("");

  selector.value = state.activeAllianceId;
  dataArea.hidden = false;
  applyActiveAllianceDetails();
}

function applyActiveAllianceDetails() {
  const membership = getActiveMembership();
  const alliance = membership?.alliances;

  state.activeRole = membership?.role || "viewer";

  const roleElement = getElement("allianceSessionRole");
  if (roleElement) roleElement.textContent = ROLE_LABELS[state.activeRole] || state.activeRole;

  const codeElement = getElement("allianceInviteCode");
  if (codeElement) codeElement.textContent = alliance?.invite_code || "—";

  const editorCard = getElement("participantEditorCard");
  if (editorCard) editorCard.hidden = !canEditParticipants();
}

async function loadMemberships() {
  const { data, error } = await state.client
    .from("alliance_members")
    .select("alliance_id, role, alliances(id, name, state_number, invite_code)")
    .order("joined_at", { ascending: true });

  if (error) throw error;

  state.memberships = Array.isArray(data) ? data : [];
  renderMemberships();

  if (state.activeAllianceId) {
    await loadParticipants();
    subscribeToParticipants();
  } else {
    state.participants = [];
    renderParticipants();
    removeRealtimeChannel();
  }
}

function renderParticipants() {
  const body = getElement("participantTableBody");
  const emptyState = getElement("participantEmptyState");
  const count = getElement("participantCount");

  if (!body || !emptyState || !count) return;

  count.textContent = `${state.participants.length} участников`;
  emptyState.hidden = state.participants.length > 0;

  body.innerHTML = state.participants.map(participant => {
    const actions = canEditParticipants()
      ? `<div class="participant-row-actions">
          <button type="button" class="secondary-button" data-participant-edit="${participant.id}">Изменить</button>
          <button type="button" class="danger-button" data-participant-delete="${participant.id}">Удалить</button>
        </div>`
      : "";

    return `<tr>
      <td><strong>${escapeHtml(participant.nickname)}</strong></td>
      <td>${escapeHtml(participant.rank_name || "—")}</td>
      <td>${formatNumber(participant.squad_power)}</td>
      <td><span class="participant-status participant-status-${escapeHtml(participant.status)}">${escapeHtml(STATUS_LABELS[participant.status] || participant.status)}</span></td>
      <td>${escapeHtml(participant.comment || "—")}</td>
      <td>${actions}</td>
    </tr>`;
  }).join("");
}

async function loadParticipants() {
  if (!state.activeAllianceId) return;

  const { data, error } = await state.client
    .from("participants")
    .select("*")
    .eq("alliance_id", state.activeAllianceId)
    .order("nickname", { ascending: true });

  if (error) throw error;

  state.participants = Array.isArray(data) ? data : [];
  renderParticipants();
}

function removeRealtimeChannel() {
  if (!state.realtimeChannel || !state.client) return;

  state.client.removeChannel(state.realtimeChannel);
  state.realtimeChannel = null;
}

function subscribeToParticipants() {
  removeRealtimeChannel();

  if (!state.activeAllianceId) return;

  state.realtimeChannel = state.client
    .channel(`participants:${state.activeAllianceId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "participants",
        filter: `alliance_id=eq.${state.activeAllianceId}`
      },
      async () => {
        try {
          await loadParticipants();
        } catch (error) {
          console.error("Не удалось обновить список участников", error);
        }
      }
    )
    .subscribe();
}

function resetParticipantForm() {
  const form = getElement("participantForm");
  if (form) form.reset();

  getElement("participantId").value = "";
  getElement("participantPower").value = "0";
  getElement("participantStatus").value = "active";
  getElement("participantEditorTitle").textContent = "Добавить участника";
  getElement("participantCancelButton").hidden = true;
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

async function handleLogin() {
  const button = getElement("allianceLoginButton");
  const email = getElement("allianceAuthEmail").value.trim();
  const password = getElement("allianceAuthPassword").value;

  if (!email || !password) {
    showMessage("Укажи электронную почту и пароль.", "error");
    return;
  }

  setBusy(button, true, "Входим…");
  showMessage("");

  const { error } = await state.client.auth.signInWithPassword({ email, password });

  setBusy(button, false);

  if (error) {
    showMessage(error.message, "error");
    return;
  }

  getElement("allianceAuthPassword").value = "";
  showMessage("Вход выполнен.", "success");
}

async function handleRegister() {
  const button = getElement("allianceRegisterButton");
  const email = getElement("allianceAuthEmail").value.trim();
  const password = getElement("allianceAuthPassword").value;

  if (!email || password.length < 6) {
    showMessage("Укажи электронную почту и пароль не короче 6 символов.", "error");
    return;
  }

  setBusy(button, true, "Создаём…");
  showMessage("");

  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { data, error } = await state.client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo }
  });

  setBusy(button, false);

  if (error) {
    showMessage(error.message, "error");
    return;
  }

  getElement("allianceAuthPassword").value = "";

  if (data.session) {
    showMessage("Аккаунт создан, вход выполнен.", "success");
  } else {
    showMessage("Аккаунт создан. Подтверди электронную почту по ссылке из письма.", "success");
  }
}

async function handleLogout() {
  showMessage("");
  const { error } = await state.client.auth.signOut();

  if (error) showMessage(error.message, "error");
}

async function handleCreateAlliance(event) {
  event.preventDefault();

  const name = getElement("allianceCreateName").value.trim();
  const stateNumber = getElement("allianceCreateState").value.trim();
  const button = event.submitter;

  if (!name) {
    showMessage("Укажи название союза.", "error");
    return;
  }

  setBusy(button, true, "Создаём…");
  showMessage("");

  const { data, error } = await state.client
    .from("alliances")
    .insert({
      name,
      state_number: stateNumber,
      created_by: state.session.user.id
    })
    .select("id")
    .single();

  setBusy(button, false);

  if (error) {
    showMessage(error.message, "error");
    return;
  }

  localStorage.setItem(ACTIVE_ALLIANCE_STORAGE_KEY, data.id);
  event.currentTarget.reset();
  await loadMemberships();
  showMessage("Союз создан.", "success");
}

async function handleJoinAlliance(event) {
  event.preventDefault();

  const code = getElement("allianceJoinCode").value.trim();
  const button = event.submitter;

  if (!code) {
    showMessage("Укажи код приглашения.", "error");
    return;
  }

  setBusy(button, true, "Подключаем…");
  showMessage("");

  const { data, error } = await state.client.rpc("join_alliance_by_code", {
    join_code: code
  });

  setBusy(button, false);

  if (error) {
    showMessage(error.message, "error");
    return;
  }

  localStorage.setItem(ACTIVE_ALLIANCE_STORAGE_KEY, data);
  event.currentTarget.reset();
  await loadMemberships();
  showMessage("Союз подключён.", "success");
}

async function handleAllianceChange(event) {
  state.activeAllianceId = event.target.value;
  localStorage.setItem(ACTIVE_ALLIANCE_STORAGE_KEY, state.activeAllianceId);
  applyActiveAllianceDetails();
  resetParticipantForm();

  try {
    await loadParticipants();
    subscribeToParticipants();
  } catch (error) {
    showMessage(error.message, "error");
  }
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

async function handleParticipantSubmit(event) {
  event.preventDefault();

  if (!canEditParticipants()) {
    showMessage("У тебя нет прав на изменение участников.", "error");
    return;
  }

  const id = getElement("participantId").value;
  const nickname = getElement("participantNickname").value.trim();
  const rankName = getElement("participantRank").value.trim();
  const squadPower = Math.max(0, Math.floor(Number(getElement("participantPower").value) || 0));
  const status = getElement("participantStatus").value;
  const comment = getElement("participantComment").value.trim();
  const button = event.submitter;

  if (!nickname) {
    showMessage("Укажи никнейм участника.", "error");
    return;
  }

  setBusy(button, true, "Сохраняем…");
  showMessage("");

  const payload = {
    alliance_id: state.activeAllianceId,
    nickname,
    rank_name: rankName,
    squad_power: squadPower,
    status,
    comment,
    updated_by: state.session.user.id
  };

  let result;

  if (id) {
    result = await state.client
      .from("participants")
      .update(payload)
      .eq("id", id)
      .eq("alliance_id", state.activeAllianceId);
  } else {
    result = await state.client
      .from("participants")
      .insert({
        ...payload,
        created_by: state.session.user.id
      });
  }

  setBusy(button, false);

  if (result.error) {
    showMessage(result.error.message, "error");
    return;
  }

  resetParticipantForm();
  await loadParticipants();
  showMessage(id ? "Данные участника обновлены." : "Участник добавлен.", "success");
}

async function handleTableClick(event) {
  const editButton = event.target.closest("[data-participant-edit]");
  const deleteButton = event.target.closest("[data-participant-delete]");

  if (editButton) {
    const participant = state.participants.find(item => item.id === editButton.dataset.participantEdit);
    fillParticipantForm(participant);
    return;
  }

  if (!deleteButton) return;

  const participant = state.participants.find(item => item.id === deleteButton.dataset.participantDelete);
  if (!participant) return;

  const confirmed = window.confirm(`Удалить участника «${participant.nickname}»?`);
  if (!confirmed) return;

  deleteButton.disabled = true;

  const { error } = await state.client
    .from("participants")
    .delete()
    .eq("id", participant.id)
    .eq("alliance_id", state.activeAllianceId);

  if (error) {
    deleteButton.disabled = false;
    showMessage(error.message, "error");
    return;
  }

  await loadParticipants();
  showMessage("Участник удалён.", "success");
}

function bindEvents() {
  getElement("allianceLoginButton")?.addEventListener("click", handleLogin);
  getElement("allianceRegisterButton")?.addEventListener("click", handleRegister);
  getElement("allianceLogoutButton")?.addEventListener("click", handleLogout);
  getElement("allianceCreateForm")?.addEventListener("submit", handleCreateAlliance);
  getElement("allianceJoinForm")?.addEventListener("submit", handleJoinAlliance);
  getElement("allianceSelector")?.addEventListener("change", handleAllianceChange);
  getElement("allianceCopyCodeButton")?.addEventListener("click", handleCopyCode);
  getElement("participantForm")?.addEventListener("submit", handleParticipantSubmit);
  getElement("participantCancelButton")?.addEventListener("click", resetParticipantForm);
  getElement("participantTableBody")?.addEventListener("click", handleTableClick);
}

async function applySession(session) {
  state.session = session;
  updateWorkspaceVisibility();

  if (!session) {
    state.memberships = [];
    state.participants = [];
    state.activeAllianceId = "";
    state.activeRole = "";
    removeRealtimeChannel();
    renderParticipants();
    return;
  }

  try {
    await loadMemberships();
  } catch (error) {
    console.error("Ошибка загрузки союзного штаба", error);
    showMessage(
      error.message.includes("relation")
        ? "Сначала выполни SQL-скрипт 001_alliance_hub.sql в Supabase."
        : error.message,
      "error"
    );
  }
}

function cleanup() {
  removeRealtimeChannel();

  if (state.authSubscription) {
    state.authSubscription.unsubscribe();
    state.authSubscription = null;
  }
}

export async function init() {
  cleanup();

  state.client = window.harvestHubSupabase;

  if (!state.client) {
    showMessage("Не удалось подключить Supabase.", "error");
    return;
  }

  bindEvents();

  const { data, error } = await state.client.auth.getSession();

  if (error) {
    showMessage(error.message, "error");
    return;
  }

  await applySession(data.session);

  const authListener = state.client.auth.onAuthStateChange(async (_event, session) => {
    await applySession(session);
  });

  state.authSubscription = authListener.data.subscription;
  window.harvestHubAllianceCleanup = cleanup;
}
