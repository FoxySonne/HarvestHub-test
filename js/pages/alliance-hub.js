import { createAlliance, fetchMemberships, fetchParticipants, joinAlliance } from "../alliance/api.js?v=20260718-40";
import { setActiveAllianceId } from "../alliance/page-context.js?v=20260718-1";

const byId = id => document.getElementById(id);
const state = { client: null, session: null, memberships: [] };

function showMessage(text, type = "info") {
  const box = byId("allianceMessage");
  if (!box) return;
  box.hidden = !text;
  box.textContent = text;
  box.dataset.type = type;
}

function roleLabel(role) {
  if (role === "owner") return "Полные права";
  if (role === "editor") return "Редактор";
  return "Смотритель";
}

async function openDashboard(allianceId) {
  const membership = state.memberships.find(item => item.alliance_id === allianceId);
  if (!membership) return;
  setActiveAllianceId(allianceId);
  const result = await fetchParticipants(state.client, allianceId);
  if (result.error) return showMessage(result.error.message, "error");
  const participants = Array.isArray(result.data) ? result.data : [];
  const current = participants.find(item => item.linked_user_id === state.session?.user?.id) || null;
  const alliance = membership.alliances || {};

  byId("allianceDashboard").hidden = false;
  byId("allianceDashboardName").textContent = alliance.name || "Союз";
  byId("allianceDashboardState").textContent = alliance.state_number ? `Штат ${alliance.state_number}` : "";
  byId("allianceDashboardNickname").textContent = current?.nickname || "Аккаунт не связан";
  byId("allianceDashboardRank").textContent = current?.rank_name || "—";
  byId("allianceDashboardRole").textContent = roleLabel(membership.role);
}

function renderMemberships() {
  const field = byId("allianceHubSelectorField");
  const select = byId("allianceHubSelector");
  field.hidden = state.memberships.length === 0;
  if (!state.memberships.length) {
    byId("allianceDashboard").hidden = true;
    return;
  }
  select.innerHTML = state.memberships.map(item => {
    const alliance = item.alliances || {};
    return `<option value="${item.alliance_id}">${alliance.name || "Без названия"}${alliance.state_number ? ` · штат ${alliance.state_number}` : ""}</option>`;
  }).join("");
  const stored = localStorage.getItem("harvesthub_active_alliance_id");
  const active = state.memberships.find(item => item.alliance_id === stored)?.alliance_id || state.memberships[0].alliance_id;
  select.value = active;
  openDashboard(active);
}

async function loadMemberships() {
  const result = await fetchMemberships(state.client);
  if (result.error) return showMessage(result.error.message, "error");
  state.memberships = result.data || [];
  renderMemberships();
}

async function handleJoin(event) {
  event.preventDefault();
  if (!state.session) {
    byId("allianceHubAccountHint").hidden = false;
    return showMessage("Сначала войди в аккаунт HarvestHub.", "error");
  }
  const button = event.submitter;
  button.disabled = true;
  const result = await joinAlliance(state.client, byId("allianceHubJoinCode").value.trim().toUpperCase());
  button.disabled = false;
  if (result.error) return showMessage(result.error.message, "error");
  byId("allianceHubJoinCode").value = "";
  setActiveAllianceId(result.data);
  await loadMemberships();
  showMessage("Союзный штаб подключён.", "success");
}

async function handleCreate(event) {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  const result = await createAlliance(state.client, {
    name: byId("allianceHubCreateName").value,
    stateNumber: byId("allianceHubCreateState").value
  });
  button.disabled = false;
  if (result.error) return showMessage(result.error.message, "error");
  byId("allianceHubCreateName").value = "";
  byId("allianceHubCreateState").value = "";
  setActiveAllianceId(result.data);
  await loadMemberships();
  showMessage("Союзный штаб создан.", "success");
}

async function applySession(session) {
  state.session = session;
  byId("allianceCreateCard").hidden = !session;
  byId("allianceHubAccountHint").hidden = Boolean(session);
  if (!session) {
    state.memberships = [];
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
  byId("allianceHubSelector")?.addEventListener("change", event => openDashboard(event.target.value));
  const sessionResult = await state.client.auth.getSession();
  if (sessionResult.error) return showMessage(sessionResult.error.message, "error");
  await applySession(sessionResult.data.session);
  state.client.auth.onAuthStateChange((_event, session) => applySession(session));
}
