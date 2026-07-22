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

export async function saveReservoirLayout(client, weekId, payload) {
  const layoutResult = await client
    .from("alliance_reservoir_layouts")
    .upsert({
      week_id: weekId,
      general_comment: payload.generalComment || "",
      published_at: payload.publishedAt || null,
      updated_at: new Date().toISOString()
    }, { onConflict: "week_id" });
  if (layoutResult.error) return layoutResult;

  const deleteAssignments = await client.from("alliance_reservoir_assignments").delete().eq("week_id", weekId);
  if (deleteAssignments.error) return deleteAssignments;
  if (payload.assignments.length) {
    const assignmentResult = await client.from("alliance_reservoir_assignments").insert(payload.assignments.map(item => ({
      week_id: weekId,
      location_key: item.locationKey,
      participant_id: item.participantId,
      sort_order: item.sortOrder || 0
    })));
    if (assignmentResult.error) return assignmentResult;
  }

  const deleteNotes = await client.from("alliance_reservoir_location_notes").delete().eq("week_id", weekId);
  if (deleteNotes.error) return deleteNotes;
  const notes = payload.notes.filter(item => item.comment.trim());
  if (notes.length) {
    const notesResult = await client.from("alliance_reservoir_location_notes").insert(notes.map(item => ({
      week_id: weekId,
      location_key: item.locationKey,
      comment: item.comment.trim()
    })));
    if (notesResult.error) return notesResult;
  }

  return { data: true, error: null };
}

export async function resetReservoirLayout(client, weekId) {
  const assignments = await client.from("alliance_reservoir_assignments").delete().eq("week_id", weekId);
  if (assignments.error) return assignments;
  const notes = await client.from("alliance_reservoir_location_notes").delete().eq("week_id", weekId);
  if (notes.error) return notes;
  return client.from("alliance_reservoir_layouts").upsert({
    week_id: weekId,
    general_comment: "",
    published_at: null,
    updated_at: new Date().toISOString()
  }, { onConflict: "week_id" });
}
