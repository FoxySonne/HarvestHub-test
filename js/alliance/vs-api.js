export function fetchAllianceVsStatistics(client, allianceId, dateFrom, dateTo) {
  return client.rpc("get_alliance_vs_statistics", {
    target_alliance_id: allianceId,
    target_date_from: dateFrom,
    target_date_to: dateTo
  });
}

export function saveAllianceVsResult(client, allianceId, payload) {
  return client.rpc("save_alliance_vs_result", {
    target_alliance_id: allianceId,
    target_participant_id: payload.participantId,
    target_result_date: payload.resultDate,
    target_points: payload.points,
    target_is_vacation: payload.isVacation
  });
}

export function setAllianceVsDailyTarget(client, allianceId, dailyTarget) {
  return client.rpc("set_alliance_vs_daily_target", {
    target_alliance_id: allianceId,
    target_daily_target: dailyTarget
  });
}
