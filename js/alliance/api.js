export async function fetchMemberships(client) {
  const rpcResult = await client.rpc("get_my_alliance_hubs");

  if (!rpcResult.error && Array.isArray(rpcResult.data) && rpcResult.data.length > 0) {
    return {
      ...rpcResult,
      data: rpcResult.data.map(item => ({
        ...item,
        alliances: item.alliances || item.alliance || null
      }))
    };
  }

  const directResult = await client
    .from("alliance_members")
    .select("alliance_id, role, alliances(id, name, state_number, invite_code)")
    .order("joined_at", { ascending: true });

  if (!directResult.error && Array.isArray(directResult.data)) {
    return directResult;
  }

  return rpcResult.error ? rpcResult : directResult;
}

export function fetchParticipants(client, allianceId) {
  return client
    .from("participants")
    .select("*")
    .eq("alliance_id", allianceId)
    .order("nickname", { ascending: true });
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

export function saveParticipant(client, { id, allianceId, payload, userId }) {
  if (id) {
    return client
      .from("participants")
      .update(payload)
      .eq("id", id)
      .eq("alliance_id", allianceId);
  }

  return client
    .from("participants")
    .insert({ ...payload, created_by: userId });
}

export function deleteParticipant(client, { id, allianceId }) {
  return client
    .from("participants")
    .delete()
    .eq("id", id)
    .eq("alliance_id", allianceId);
}
