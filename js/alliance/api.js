export function fetchMemberships(client) {
  return client
    .from("alliance_members")
    .select("alliance_id, role, alliances(id, name, state_number, invite_code)")
    .order("joined_at", { ascending: true });
}

export function fetchParticipants(client, allianceId) {
  return client
    .from("participants")
    .select("*")
    .eq("alliance_id", allianceId)
    .order("nickname", { ascending: true });
}

export function createAlliance(client, { name, stateNumber, userId }) {
  return client
    .from("alliances")
    .insert({ name, state_number: stateNumber, created_by: userId })
    .select("id")
    .single();
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
