export function fetchReservoirLayout(client, weekId) {
  return Promise.all([
    client.from("alliance_reservoir_layouts").select("*").eq("week_id", weekId).maybeSingle(),
    client.from("alliance_reservoir_assignments").select("*").eq("week_id", weekId).order("sort_order"),
    client.from("alliance_reservoir_location_notes").select("*").eq("week_id", weekId)
  ]).then(([layout, assignments, notes]) => ({
    data: {
      layout: layout.data || null,
      assignments: assignments.data || [],
      notes: notes.data || []
    },
    error: layout.error || assignments.error || notes.error || null
  }));
}

export function saveReservoirLayout(client, weekId, payload) {
  return client.rpc("save_reservoir_layout", {
    target_week_id: weekId,
    target_assignments: (payload.assignments || []).map(item => ({
      location_key: item.locationKey,
      participant_id: item.participantId,
      sort_order: item.sortOrder || 0
    })),
    target_notes: (payload.notes || []).map(item => ({
      location_key: item.locationKey,
      comment: String(item.comment || "").trim()
    })),
    target_general_comment: String(payload.generalComment || "").trim(),
    target_published_at: payload.publishedAt || null
  });
}

export function resetReservoirLayout(client, weekId) {
  return client.rpc("reset_reservoir_layout", {
    target_week_id: weekId
  });
}
