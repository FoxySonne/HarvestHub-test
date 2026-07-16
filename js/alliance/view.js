import { STATUS_LABELS } from "./config.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  return Math.max(0, Number(value) || 0).toLocaleString("ru-RU");
}

export function renderMembershipOptions(members) {
  return members.map(item => {
    const alliance = item.alliances;
    const stateSuffix = alliance?.state_number ? ` · штат ${escapeHtml(alliance.state_number)}` : "";

    return `<option value="${escapeHtml(item.alliance_id)}">${escapeHtml(alliance?.name || "Без названия")}${stateSuffix}</option>`;
  }).join("");
}

export function renderParticipantRows(participants, canEdit) {
  return participants.map(participant => {
    const actions = canEdit
      ? `<div class="participant-row-actions">
          <button type="button" class="secondary-button" data-participant-edit="${participant.id}">Изменить</button>
          <button type="button" class="danger-button" data-participant-delete="${participant.id}">Удалить</button>
        </div>`
      : "";

    return `<tr>
      <td><strong>${escapeHtml(participant.nickname)}</strong></td>
      <td>${escapeHtml(participant.rank_name || "—")}</td>
      <td>${formatNumber(participant.squad_power)}</td>
      <td><span class="participant-status participant-status-${escapeHtml(participant.status)}">${escapeHtml(STATUS_LABELS[participant.status] || participant.status)}</span></td>
      <td>${escapeHtml(participant.comment || "—")}</td>
      <td>${actions}</td>
    </tr>`;
  }).join("");
}
