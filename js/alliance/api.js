export async function fetchMemberships(client) {
  const rpcResult = await client.rpc("get_my_alliance_hubs");
  if (!rpcResult.error && Array.isArray(rpcResult.data)) {
    return {
      ...rpcResult,
      data: rpcResult.data.map(item => ({
        ...item,
        alliances: item.alliances || item.alliance || null
      }))
    };
  }

  return client
    .from("alliance_members")
    .select("alliance_id, role, alliances(id, name, state_number, invite_code)")
    .order("joined_at", { ascending: true });
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
    participant_comment: payload.comment
  });
}

export function deleteParticipant(client, { id, allianceId }) {
  return client
    .from("participants")
    .update({ member_status: "left" })
    .eq("id", id)
    .eq("alliance_id", allianceId);
}
