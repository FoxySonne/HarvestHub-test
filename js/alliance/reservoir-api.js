export function fetchReservoirActivity(client, allianceId) {
  return client.rpc("get_reservoir_activity", {
    target_alliance_id: allianceId
  });
}

export function ensureReservoirWeek(client, allianceId, eventDate) {
  return client.rpc("get_or_create_reservoir_week", {
    target_alliance_id: allianceId,
    target_event_date: eventDate
  });
}

export function saveReservoirWeekRoster(client, weekId, eventHourMsk, rows) {
  return client.rpc("save_reservoir_week_roster", {
    target_week_id: weekId,
    target_event_hour_msk: eventHourMsk,
    target_rows: rows
  });
}

export function closeReservoirWeek(client, weekId) {
  return client.rpc("close_reservoir_week", {
    target_week_id: weekId
  });
}

export async function fetchReservoirWeeks(client, allianceId) {
  return client
    .from("alliance_reservoir_weeks")
    .select("*, alliance_reservoir_participants(*)")
    .eq("alliance_id", allianceId)
    .order("event_date", { ascending: false });
}

export async function fetchReservoirEntries(client, weekId) {
  return client
    .from("alliance_reservoir_participants")
    .select("*")
    .eq("week_id", weekId);
}
