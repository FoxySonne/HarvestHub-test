export async function fetchMemberships(client) {
  const membershipResult = await client
    .from("alliance_members")
    .select("alliance_id, role, joined_at")
    .order("joined_at", { ascending: true });

  if (membershipResult.error) return membershipResult;

  const memberships = Array.isArray(membershipResult.data) ? membershipResult.data : [];
  if (!memberships.length) return { data: [], error: null };

  const ids = memberships.map(item => item.alliance_id).filter(Boolean);
  const allianceResult = await client
    .from("alliances")
    .select("id, name, state_number, invite_code")
    .in("id", ids);

  if (allianceResult.error) return allianceResult;

  const allianceById = new Map((allianceResult.data || []).map(item => [item.id, item]));
  return {
    data: memberships.map(item => ({
      alliance_id: item.alliance_id,
      role: item.role || "viewer",
      alliances: allianceById.get(item.alliance_id) || null
    })),
    error: null
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
