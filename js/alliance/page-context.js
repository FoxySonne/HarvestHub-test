import { fetchMemberships, fetchParticipants } from "./api.js?v=20260725-guest-access-1";
import { ACTIVE_ALLIANCE_STORAGE_KEY, GUEST_ALLIANCE_STORAGE_KEY } from "./config.js";

export function getActiveAllianceId() {
  return localStorage.getItem(ACTIVE_ALLIANCE_STORAGE_KEY) || "";
}

export function setActiveAllianceId(allianceId) {
  if (allianceId) localStorage.setItem(ACTIVE_ALLIANCE_STORAGE_KEY, allianceId);
  else localStorage.removeItem(ACTIVE_ALLIANCE_STORAGE_KEY);
}

export function getGuestAllianceContext() {
  try {
    const value = JSON.parse(sessionStorage.getItem(GUEST_ALLIANCE_STORAGE_KEY) || "null");
    if (!value?.alliance?.id || !Array.isArray(value.participants)) return null;
    return value;
  } catch {
    sessionStorage.removeItem(GUEST_ALLIANCE_STORAGE_KEY);
    return null;
  }
}

export function setGuestAllianceContext(value) {
  if (!value?.alliance?.id || !Array.isArray(value.participants)) {
    clearGuestAllianceContext();
    return;
  }
  sessionStorage.setItem(GUEST_ALLIANCE_STORAGE_KEY, JSON.stringify(value));
}

export function clearGuestAllianceContext() {
  sessionStorage.removeItem(GUEST_ALLIANCE_STORAGE_KEY);
}

function guestPageContext(session, memberships, guestData) {
  return {
    session,
    memberships,
    membership: null,
    alliance: guestData.alliance,
    participants: guestData.participants,
    currentParticipant: null,
    isGuest: true,
    guestData
  };
}

export async function loadAlliancePageContext(client, { requireAlliance = true } = {}) {
  if (!client) throw new Error("Не удалось подключить Supabase.");

  const sessionResult = await client.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  const session = sessionResult.data.session;
  let memberships = [];

  if (session) {
    const membershipsResult = await fetchMemberships(client);
    if (membershipsResult.error) throw membershipsResult.error;
    memberships = membershipsResult.data || [];
  }

  let allianceId = getActiveAllianceId();
  let membership = memberships.find(item => item.alliance_id === allianceId) || null;
  const guestData = getGuestAllianceContext();

  if (!membership && guestData?.alliance?.id === allianceId) {
    return guestPageContext(session, memberships, guestData);
  }

  if (!membership && memberships.length) {
    membership = memberships[0];
    allianceId = membership.alliance_id;
    setActiveAllianceId(allianceId);
    clearGuestAllianceContext();
  }

  if (!membership) {
    if (requireAlliance) window.loadPage?.("alliance/members.html");
    return { session, memberships, membership: null, alliance: null, participants: [], currentParticipant: null, isGuest: false, guestData: null };
  }

  const participantsResult = await fetchParticipants(client, allianceId);
  if (participantsResult.error) throw participantsResult.error;
  const participants = Array.isArray(participantsResult.data) ? participantsResult.data : [];
  const currentParticipant = participants.find(item => item.linked_user_id === session.user.id && item.member_status !== "left") || null;

  return {
    session,
    memberships,
    membership,
    alliance: membership.alliances || null,
    participants,
    currentParticipant,
    isGuest: false,
    guestData: null
  };
}

export function fillAllianceCompactHeader(context) {
  const allianceName = document.getElementById("allianceContextName");
  const participantName = document.getElementById("allianceContextNickname");
  const participantRank = document.getElementById("allianceContextRank");
  const role = document.getElementById("allianceContextRole");
  const isR5 = context.currentParticipant?.rank_name === "Р5";
  if (allianceName) allianceName.textContent = context.alliance?.name || "Союзный штаб";
  if (participantName) participantName.textContent = context.isGuest
    ? "Гостевой просмотр"
    : context.currentParticipant?.nickname || "Аккаунт не связан с участником";
  if (participantRank) participantRank.textContent = context.currentParticipant?.rank_name || "—";
  if (role) role.textContent = context.isGuest
    ? "Гость"
    : context.membership?.role === "owner"
      ? "Владелец"
      : isR5
        ? "Р5 · полные права"
        : context.membership?.role === "editor"
          ? "Редактор"
          : "Наблюдатель";
}

export function canEditAlliance(context) {
  if (context.isGuest) return false;
  return context.membership?.role === "owner"
    || context.membership?.role === "editor"
    || context.currentParticipant?.rank_name === "Р5";
}

export function canManageAllianceRoles(context) {
  if (context.isGuest) return false;
  return context.membership?.role === "owner"
    || context.currentParticipant?.rank_name === "Р5";
}
