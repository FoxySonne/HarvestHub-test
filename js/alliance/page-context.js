import { fetchMemberships, fetchParticipants } from "./api.js?v=20260723-1";
import { ACTIVE_ALLIANCE_STORAGE_KEY } from "./config.js";

export function getActiveAllianceId() {
  return localStorage.getItem(ACTIVE_ALLIANCE_STORAGE_KEY) || "";
}

export function setActiveAllianceId(allianceId) {
  if (allianceId) localStorage.setItem(ACTIVE_ALLIANCE_STORAGE_KEY, allianceId);
  else localStorage.removeItem(ACTIVE_ALLIANCE_STORAGE_KEY);
}

export async function loadAlliancePageContext(client, { requireAlliance = true } = {}) {
  if (!client) throw new Error("Не удалось подключить Supabase.");

  const sessionResult = await client.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  const session = sessionResult.data.session;
  if (!session) {
    if (requireAlliance) window.loadPage?.("alliance/members.html");
    return { session: null, memberships: [], membership: null, alliance: null, participants: [], currentParticipant: null };
  }

  const membershipsResult = await fetchMemberships(client);
  if (membershipsResult.error) throw membershipsResult.error;
  const memberships = membershipsResult.data || [];

  let allianceId = getActiveAllianceId();
  let membership = memberships.find(item => item.alliance_id === allianceId) || null;
  if (!membership && memberships.length) {
    membership = memberships[0];
    allianceId = membership.alliance_id;
    setActiveAllianceId(allianceId);
  }

  if (!membership) {
    if (requireAlliance) window.loadPage?.("alliance/members.html");
    return { session, memberships, membership: null, alliance: null, participants: [], currentParticipant: null };
  }

  const participantsResult = await fetchParticipants(client, allianceId);
  if (participantsResult.error) throw participantsResult.error;
  const participants = Array.isArray(participantsResult.data) ? participantsResult.data : [];
  const currentParticipant = participants.find(item => item.linked_user_id === session.user.id) || null;

  return {
    session,
    memberships,
    membership,
    alliance: membership.alliances || null,
    participants,
    currentParticipant
  };
}

export function fillAllianceCompactHeader(context) {
  const allianceName = document.getElementById("allianceContextName");
  const participantName = document.getElementById("allianceContextNickname");
  const participantRank = document.getElementById("allianceContextRank");
  const role = document.getElementById("allianceContextRole");
  if (allianceName) allianceName.textContent = context.alliance?.name || "Союзный штаб";
  if (participantName) participantName.textContent = context.currentParticipant?.nickname || "Аккаунт не связан с участником";
  if (participantRank) participantRank.textContent = context.currentParticipant?.rank_name || "—";
  if (role) role.textContent = context.membership?.role === "owner" ? "Полные права" : context.membership?.role === "editor" ? "Редактор" : "Наблюдатель";
}

export function canEditAlliance(context) {
  return context.membership?.role === "owner" || context.membership?.role === "editor";
}

export function canManageAllianceRoles(context) {
  return context.membership?.role === "owner";
}
