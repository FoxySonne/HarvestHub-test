import { createAlliance, fetchMemberships, fetchParticipants, joinAlliance } from "../alliance/api.js?v=20260724-network-retry-1";
import { setActiveAllianceId } from "../alliance/page-context.js?v=20260718-1";

const byId = id => document.getElementById(id);
const state = { client: null, session: null, memberships: [], choosingAlliance: false };

function showMessage(text, type = "info") {
  const box = byId("allianceMessage");
  if (!box) return;
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

function roleLabel(role) {
  if (role === "owner") return "Полные права";
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

async function openDashboard(allianceId) {
  const membership = state.memberships.find(item => item.alliance_id === allianceId);
  if (!membership) return;
  setActiveAllianceId(allianceId);

  try {
    const result = await fetchParticipants(state.client, allianceId);
    if (result.error) return showMessage(getReadableError(result.error), "error");

    const participants = Array.isArray(result.data) ? result.data : [];
    const current = participants.find(item => item.linked_user_id === state.session?.user?.id) || null;
    const alliance = membership.alliances || {};
    const canEdit = membership.role === "owner" || membership.role === "editor";

    byId("allianceDashboardName").textContent = alliance.name || "Союз";
    byId("allianceDashboardState").textContent = alliance.state_number ? `Штат ${alliance.state_number}` : "";
    byId("allianceDashboardNickname").textContent = current?.nickname || "Аккаунт не связан";
    byId("allianceDashboardRank").textContent = current?.rank_name || "—";
    byId("allianceDashboardRole").textContent = roleLabel(membership.role);
    document.querySelectorAll("[data-alliance-edit-only]").forEach(card => { card.hidden = !canEdit; });
    const ownPowerButton = byId("allianceOwnPowerButton");
    if (ownPowerButton) ownPowerButton.hidden = canEdit || !current;
    showDashboard();
    showMessage("");
  } catch (error) {
    showMessage(getReadableError(error), "error");
  }
}

function renderMemberships() {
  const field = byId("allianceHubSelectorField");
  const select = byId("allianceHubSelector");
  field.hidden = state.memberships.length === 0;
  if (!state.memberships.length) {
    showEntry();
    return;
  }
  select.innerHTML = state.memberships.map(item => {
    const alliance = item.alliances || {};
    return `<option value="${item.alliance_id}">${alliance.name || "Без названия"}${alliance.state_number ? ` · штат ${alliance.state_number}` : ""}</option>`;
  }).join("");
  const stored = localStorage.getItem("harvesthub_active_alliance_id");
  const active = state.memberships.find(item => item.alliance_id === stored)?.alliance_id || state.memberships[0].alliance_id;
  select.value = active;
  if (state.choosingAlliance) showEntry();
  else openDashboard(active);
}

async function loadMemberships() {
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
  if (!state.session) {
    byId("allianceHubAccountHint").hidden = false;
    return showMessage("Сначала войди в аккаунт HarvestHub.", "error");
  }
  const button = event.submitter;
  button.disabled = true;
  try {
    const result = await joinAlliance(state.client, byId("allianceHubJoinCode").value.trim().toUpperCase());
    if (result.error) return showMessage(getReadableError(result.error), "error");
    byId("allianceHubJoinCode").value = "";
    setActiveAllianceId(result.data);
    state.choosingAlliance = false;
    await loadMemberships();
    showMessage("Союзный штаб подключён.", "success");
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
    state.choosingAlliance = true;
    renderMemberships();
    return;
  }
  await loadMemberships();
}

export async function init() {
  state.client = window.harvestHubSupabase;
  if (!state.client) return showMessage("Не удалось подключить Supabase.", "error");
  byId("allianceHubJoinForm")?.addEventListener("submit", handleJoin);
  byId("allianceHubCreateForm")?.addEventListener("submit", handleCreate);
  byId("allianceHubSelector")?.addEventListener("change", event => { state.choosingAlliance = false; openDashboard(event.target.value); });
  byId("allianceDashboardChangeButton")?.addEventListener("click", showEntry);
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
