export function fetchAllianceSquadPower(client, allianceId) {
  return client.rpc("get_alliance_squad_power", {
    target_alliance_id: allianceId
  });
}

export function saveAllianceSquadPower(client, allianceId, payload) {
  return client.rpc("save_alliance_squad_power", {
    target_alliance_id: allianceId,
    target_participant_id: payload.participantId,
    target_measured_on: payload.measuredOn,
    target_squad_1: payload.squad1,
    target_squad_2: payload.squad2,
    target_squad_3: payload.squad3,
    target_squad_4: payload.squad4,
    target_squad_5: payload.squad5
  });
}

export function setAlliancePowerSeasonStart(client, allianceId, startDate) {
  return client.rpc("set_alliance_power_season_start", {
    target_alliance_id: allianceId,
    target_start: startDate || null
  });
}
