export async function fetchReservoirWeeks(client, allianceId) {
  return client
    .from("alliance_reservoir_weeks")
    .select("*")
    .eq("alliance_id", allianceId)
    .order("event_date", { ascending: false });
}

export async function ensureReservoirWeek(client, allianceId, eventDate) {
  const existing = await client
    .from("alliance_reservoir_weeks")
    .select("*")
    .eq("alliance_id", allianceId)
    .eq("event_date", eventDate)
    .maybeSingle();
  if (existing.error) return existing;
  if (existing.data) return existing;
  return client
    .from("alliance_reservoir_weeks")
    .insert({ alliance_id: allianceId, event_date: eventDate, event_hour_msk: 14 })
    .select("*")
    .single();
}

export async function updateReservoirWeek(client, weekId, patch) {
  return client
    .from("alliance_reservoir_weeks")
    .update(patch)
    .eq("id", weekId)
    .select("*")
    .single();
}

export async function fetchReservoirEntries(client, weekId) {
  return client
    .from("alliance_reservoir_participants")
    .select("*")
    .eq("week_id", weekId);
}

export async function saveReservoirEntries(client, rows) {
  return client
    .from("alliance_reservoir_participants")
    .upsert(rows, { onConflict: "week_id,participant_id" });
}
