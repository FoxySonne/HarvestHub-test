function parseAlliance(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function fetchMemberships(client) {
  const rpcResult = await client.rpc("get_my_alliance_hubs");
  let memberships = [];

  if (!rpcResult.error && Array.isArray(rpcResult.data)) {
    memberships = rpcResult.data.map(item => ({
      alliance_id: item.alliance_id || item.id || "",
      role: item.role || "viewer",
      alliances: parseAlliance(item.alliances || item.alliance)
    })).filter(item => item.alliance_id);
  }

  if (!memberships.length) {
    const directResult = await client
      .from("alliance_members")
      .select("alliance_id, role, alliances(id, name, state_number, invite_code)")
      .order("joined_at", { ascending: true });

    if (directResult.error) return rpcResult.error ? rpcResult : directResult;

    memberships = (directResult.data || []).map(item => ({
      alliance_id: item.alliance_id,
      role: item.role || "viewer",
      alliances: parseAlliance(item.alliances)
    })).filter(item => item.alliance_id);
  }

  const missingIds = memberships
    .filter(item => !item.alliances?.id)
    .map(item => item.alliance_id);

  if (missingIds.length) {
    const { data: allianceRows } = await client
      .from("alliances")
      .select("id, name, state_number, invite_code")
      .in("id", missingIds);

    const byId = new Map((allianceRows || []).map(item => [item.id, item]));
    memberships = memberships.map(item => ({
      ...item,
      alliances: item.alliances?.id ? item.alliances : byId.get(item.alliance_id) || null
    }));
  }

  return { data: memberships, error: null };
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
