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

function normalizeMemberships(data) {
  const rows = Array.isArray(data) ? data : [];
  return rows.map(item => ({
    alliance_id: item.alliance_id || item.id || "",
    role: item.role || "viewer",
    alliances: parseAlliance(item.alliances || item.alliance)
  })).filter(item => item.alliance_id);
}

export async function fetchMemberships(client) {
  const v2Result = await client.rpc("get_my_alliance_hubs_v2");
  if (!v2Result.error) {
    return { data: normalizeMemberships(v2Result.data), error: null };
  }

  const oldResult = await client.rpc("get_my_alliance_hubs");
  if (!oldResult.error) {
    const normalized = normalizeMemberships(oldResult.data);
    if (normalized.length) return { data: normalized, error: null };
  }

  const directResult = await client
    .from("alliance_members")
    .select("alliance_id, role, alliances(id, name, state_number, invite_code)")
    .order("joined_at", { ascending: true });

  if (!directResult.error) {
    return { data: normalizeMemberships(directResult.data), error: null };
  }

  return v2Result.error ? v2Result : (oldResult.error ? oldResult : directResult);
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
