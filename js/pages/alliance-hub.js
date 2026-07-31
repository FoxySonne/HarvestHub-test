import { createAlliance, fetchAllianceForGuest, fetchMemberships, fetchParticipants, joinAllianceByCode } from "../alliance/api.js?v=20260726-permanent-code-1";
import { clearGuestAllianceContext, getGuestAllianceContext, setActiveAllianceId, setGuestAllianceContext } from "../alliance/page-context.js?v=20260725-guest-access-1";

const byId = id => document.getElementById(id);
const state = { client: null, session: null, memberships: [], choosingAlliance: false, currentParticipant: null, guestData: null };

function showMessage(text, type = "info") {
  const box = byId("allianceMessage");
  if (!box) return;
  if (type === "error" && text) {
    box.hidden = true;
    window.harvestHubNotifications?.error(text, "Не удалось выполнить действие в союзном штабе.");
    return;
  }
  box.hidden = !text;
  box.textContent = text;
  box.dataset.type = type;
}

function getReadableError(error) {
  const message = String(error?.message || error || "");
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Не удалось связаться с сервером. Проверьте интернет и повторите попытку.";
  }
  return message || "Не удалось загрузить союзный штаб.";
}

function roleLabel(role, currentParticipant) {
  if (role === "owner") return "Владелец";
  if (currentParticipant?.rank_name === "Р5") return "Р5 · полные права";
  if (role === "editor") return "Редактор";
  return "Наблюдатель";
}

function showEntry() {
  state.choosingAlliance = true;
  byId("allianceEntryCard").hidden = false;
  byId("allianceCreateCard").hidden = !state.session;
  byId("allianceDashboard").hidden = true;
}

function showDashboard() {
  state.choosingAlliance = false;
  byId("allianceEntryCard").hidden = true;
  byId("allianceCreateCard").hidden = true;
  byId("allianceDashboard").hidden = false;
}

function setDashboardActions({ canEdit = false, canManageRoles = false, hasProfile = false } = {}) {
  document.querySelectorAll("[data-alliance-edit-only]").forEach(card => { card.hidden = !canEdit; });
  const manageButton = byId("allianceManageButton");
  if (manageButton) manageButton.hidden = !canManageRoles;
  const profileButton = byId("alliancePlayerProfileButton");
  if (profileButton) profileButton.hidden = !hasProfile;
  const ownPowerButton = byId("allianceOwnPowerButton");
  if (ownPowerButton) ownPowerButton.hidden = canEdit || !hasProfile;
}

function openGuestDashboard(guestData = state.guestData) {
  const alliance = guestData?.alliance;
  if (!alliance?.id) return showEntry();
  state.guestData = guestData;
  state.currentParticipant = null;
  setActiveAllianceId(alliance.id);
  byId("allianceDashboardName").textContent = alliance.name || "Союз";
  byId("allianceDashboardState").textContent = alliance.state_number ? `Штат ${alliance.state_number}` : "";
  byId("allianceDashboardNickname").textContent = "Гостевой просмотр";
  byId("allianceDashboardRank").textContent = "—";
  byId("allianceDashboardRole").textContent = "Гость";
  setDashboardActions();
  showDashboard();
}

async function openDashboard(allianceId) {
  const membership = state.memberships.find(item => item.alliance_id === allianceId);
  if (!membership) return;
  clearGuestAllianceContext();
  state.guestData = null;
  setActiveAllianceId(allianceId);

  try {
    const result = await fetchParticipants(state.client, allianceId);
    if (result.error) return showMessage(getReadableError(result.error), "error");

    const participants = Array.isArray(result.data) ? result.data : [];
    const current = participants.find(item => item.linked_user_id === state.session?.user?.id && item.member_status !== "left") || null;
    state.currentParticipant = current;
    const alliance = membership.alliances || {};
    const isR5 = current?.rank_name === "Р5";
    const canEdit = membership.role === "owner" || membership.role === "editor" || isR5;
    const canManageRoles = membership.role === "owner" || isR5;

    byId("allianceDashboardName").textContent = alliance.name || "Союз";
    byId("allianceDashboardState").textContent = alliance.state_number ? `Штат ${alliance.state_number}` : "";
    byId("allianceDashboardNickname").textContent = current?.nickname || "Аккаунт не связан";
    byId("allianceDashboardRank").textContent = current?.rank_name || "—";
    byId("allianceDashboardRole").textContent = roleLabel(membership.role, current);
    setDashboardActions({ canEdit, canManageRoles, hasProfile: Boolean(current) });

    showDashboard();
    showMessage("");
  } catch (error) {
    showMessage(getReadableError(error), "error");
  }
}

function fillMembershipOptions(select) {
  select.replaceChildren(...state.memberships.map(item => {
    const alliance = item.alliances || {};
    const label = `${alliance.name || "Без названия"}${alliance.state_number ? ` · штат ${alliance.state_number}` : ""}`;
    return new Option(label, item.alliance_id);
  }));
}

function renderMemberships() {
  const field = byId("allianceHubSelectorField");
  const select = byId("allianceHubSelector");
  field.hidden = state.memberships.length === 0;

  if (!state.memberships.length) {
    if (!state.choosingAlliance && state.guestData?.alliance?.id) openGuestDashboard();
    else showEntry();
    return;
  }

  fillMembershipOptions(select);
  const stored = localStorage.getItem("harvesthub_active_alliance_id");
  const activeMembership = state.memberships.find(item => item.alliance_id === stored);
  if (!state.choosingAlliance && !activeMembership && state.guestData?.alliance?.id === stored) {
    openGuestDashboard();
    return;
  }

  const active = activeMembership?.alliance_id || state.memberships[0].alliance_id;
  select.value = active;
  if (state.choosingAlliance) showEntry();
  else openDashboard(active);
}

async function loadMemberships() {
  if (!state.session) {
    state.memberships = [];
    renderMemberships();
    return;
  }
  try {
    const result = await fetchMemberships(state.client);
    if (result.error) return showMessage(getReadableError(result.error), "error");
    state.memberships = result.data || [];
    renderMemberships();
  } catch (error) {
    showMessage(getReadableError(error), "error");
  }
}

async function handleJoin(event) {
  event.preventDefault();
  const button = event.submitter;
  const code = byId("allianceHubJoinCode").value;
  button.disabled = true;
  try {
    if (state.session) {
      const result = await joinAllianceByCode(state.client, code);
      if (result.error) return showMessage(getReadableError(result.error), "error");
      if (!result.data) return showMessage("Союз с таким кодом не найден.", "error");

      clearGuestAllianceContext();
      state.guestData = null;
      state.choosingAlliance = false;
      setActiveAllianceId(result.data);
      byId("allianceHubJoinCode").value = "";
      await loadMemberships();
      showMessage("Союз подключён к аккаунту. В следующий раз код вводить не потребуется.", "success");
      return;
    }

    const result = await fetchAllianceForGuest(state.client, code);
    if (result.error) return showMessage(getReadableError(result.error), "error");
    if (!result.data?.alliance?.id) return showMessage("Союз с таким кодом не найден.", "error");

    state.guestData = result.data;
    setGuestAllianceContext(result.data);
    setActiveAllianceId(result.data.alliance.id);
    byId("allianceHubJoinCode").value = "";
    openGuestDashboard(result.data);
    showMessage("Штаб открыт в гостевом режиме. После входа в аккаунт код подключит союз постоянно.", "success");
  } catch (error) {
    showMessage(getReadableError(error), "error");
  } finally {
    button.disabled = false;
  }
}

async function handleCreate(event) {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    const result = await createAlliance(state.client, { name: byId("allianceHubCreateName").value, stateNumber: byId("allianceHubCreateState").value });
    if (result.error) return showMessage(getReadableError(result.error), "error");
    byId("allianceHubCreateName").value = "";
    byId("allianceHubCreateState").value = "";
    clearGuestAllianceContext();
    state.guestData = null;
    setActiveAllianceId(result.data);
    state.choosingAlliance = false;
    await loadMemberships();
    showMessage("Союзный штаб создан.", "success");
  } catch (error) {
    showMessage(getReadableError(error), "error");
  } finally {
    button.disabled = false;
  }
}

async function applySession(session) {
  state.session = session;
  byId("allianceHubAccountHint").hidden = Boolean(session);
  if (!session) {
    state.memberships = [];
    state.currentParticipant = null;
  }
  await loadMemberships();
}

export async function init() {
  state.client = window.harvestHubSupabase;
  state.guestData = getGuestAllianceContext();
  state.choosingAlliance = false;
  if (!state.client) return showMessage("Не удалось подключить Supabase.", "error");
  byId("allianceHubJoinForm")?.addEventListener("submit", handleJoin);
  byId("allianceHubCreateForm")?.addEventListener("submit", handleCreate);
  byId("allianceHubSelector")?.addEventListener("change", event => {
    state.choosingAlliance = false;
    clearGuestAllianceContext();
    state.guestData = null;
    openDashboard(event.target.value);
  });
  byId("allianceDashboardChangeButton")?.addEventListener("click", showEntry);
  byId("allianceManageButton")?.addEventListener("click", () => window.loadPage?.("alliance/management.html"));
  byId("alliancePlayerProfileButton")?.addEventListener("click", () => {
    if (!state.currentParticipant?.id) return;
    localStorage.setItem("harvesthub_active_participant_profile_id", state.currentParticipant.id);
    window.loadPage?.("alliance/player-profile.html");
  });
  byId("allianceOwnPowerButton")?.addEventListener("click", () => window.loadPage?.("alliance/power.html"));

  try {
    const sessionResult = await state.client.auth.getSession();
    if (sessionResult.error) return showMessage(getReadableError(sessionResult.error), "error");
    await applySession(sessionResult.data.session);
  } catch (error) {
    showMessage(getReadableError(error), "error");
  }

  state.client.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => applySession(session).catch(error => showMessage(getReadableError(error), "error")), 0);
  });
}