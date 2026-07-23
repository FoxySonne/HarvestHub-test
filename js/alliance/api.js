export async function fetchMemberships(client) {
  const result = await client.rpc("get_my_alliance_hubs_v2");
  return {
    data: Array.isArray(result.data) ? result.data : [],
    error: result.error
  };
}

export function fetchParticipants(client, allianceId) {
  return client.rpc("get_alliance_participants", {
    target_alliance_id: allianceId
  });
}

export function fetchAllianceForGuest(client, code) {
  return client.rpc("open_alliance_by_code", {
    access_code: String(code || "").trim().toUpperCase()
  });
}

export function createAlliance(client, { name, stateNumber }) {
  return client.rpc("create_alliance_hub", {
    alliance_name: String(name || "").trim(),
    alliance_state_number: String(stateNumber || "").trim()
  });
}

export function joinAlliance(client, code) {
  return client.rpc("join_alliance_by_code", { join_code: code });
}

export function saveParticipant(client, { id, allianceId, payload }) {
  return client.rpc("save_alliance_participant", {
    target_alliance_id: allianceId,
    participant_id: id || null,
    participant_nickname: payload.nickname,
    participant_rank: payload.rank_name,
    participant_status: payload.member_status,
    participant_timezone: payload.timezone_offset,
    participant_birthday: payload.birthday || null,
    participant_comment: payload.comment,
    participant_is_twin: payload.is_twin,
    participant_primary_id: payload.primary_participant_id || null,
    participant_primary_nickname: payload.primary_nickname || null
  });
}

export function findDepartedParticipant(client, { allianceId, nickname }) {
  return client.rpc("find_recent_departed_participant", {
    target_alliance_id: allianceId,
    target_nickname: String(nickname || "").trim()
  });
}

export function restoreParticipant(client, { id, allianceId }) {
  return client.rpc("restore_alliance_participant", {
    target_alliance_id: allianceId,
    target_participant_id: id
  });
}

export function markParticipantLeft(client, { id, allianceId }) {
  return client.rpc("mark_alliance_participant_left", {
    target_alliance_id: allianceId,
    target_participant_id: id
  });
}

export function linkParticipantAccount(client, allianceId, participantId, email) {
  return client.rpc("link_alliance_participant_account", {
    target_alliance_id: allianceId,
    target_participant_id: participantId,
    target_email: String(email || "").trim()
  });
}

export function unlinkParticipantAccount(client, allianceId, participantId) {
  return client.rpc("unlink_alliance_participant_account", {
    target_alliance_id: allianceId,
    target_participant_id: participantId
  });
}

export function setAllianceMemberRole(client, allianceId, userId, role) {
  return client.rpc("set_alliance_member_role", {
    target_alliance_id: allianceId,
    target_user_id: userId,
    target_role: role
  });
}

export function transferAllianceR5(client, allianceId, participantId, previousRole) {
  return client.rpc("transfer_alliance_r5", {
    target_alliance_id: allianceId,
    target_participant_id: participantId,
    previous_r5_role: previousRole
  });
}

export function transferAllianceOwner(client, allianceId, userId, previousRole) {
  return client.rpc("transfer_alliance_owner", {
    target_alliance_id: allianceId,
    target_user_id: userId,
    previous_owner_role: previousRole
  });
}
