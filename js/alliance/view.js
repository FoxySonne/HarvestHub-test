import { escapeHtml } from "./view-utils.js";

const STATUS_LABELS = {
  main: "Основной состав",
  reserve: "Резерв",
  inactive: "Неактивен",
  left: "Вышел"
};

function formatBirthday(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? escapeHtml(value)
    : date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function formatTimezone(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number === 0 ? "МСК" : `МСК${number > 0 ? "+" : ""}${number}`;
}

function nicknameHistoryTitle(history) {
  if (!Array.isArray(history) || history.length === 0) return "";
  return history
    .slice(0, 6)
    .map(item => {
      const date = item.changed_at ? new Date(item.changed_at).toLocaleDateString("ru-RU") : "";
      return `${item.old_nickname} → ${item.new_nickname}${date ? ` · ${date}` : ""}`;
    })
    .join("\n");
}

export function renderMembershipOptions(members) {
  return members.map(item => {
    const alliance = item.alliances;
    const stateSuffix = alliance?.state_number ? ` · штат ${escapeHtml(alliance.state_number)}` : "";
    return `<option value="${escapeHtml(item.alliance_id)}">${escapeHtml(alliance?.name || "Без названия")}${stateSuffix}</option>`;
  }).join("");
}

export function renderParticipantRows(participants, canEdit, canSeePrivate) {
  return participants.map(participant => {
    const history = nicknameHistoryTitle(participant.nickname_history);
    const actions = canEdit
      ? `<div class="participant-row-actions">
          <button type="button" class="secondary-button" data-participant-edit="${escapeHtml(participant.id)}">Изменить</button>
          ${participant.member_status !== "left"
            ? `<button type="button" class="danger-button" data-participant-delete="${escapeHtml(participant.id)}">Отметить вышедшим</button>`
            : ""}
        </div>`
      : "";

    return `<tr class="participant-row participant-row-${escapeHtml(participant.member_status || "main")}">
      <td><strong class="participant-nickname${history ? " has-history" : "}" ${history ? `title="${escapeHtml(history)}" tabindex="0"` : ""}>${escapeHtml(participant.nickname)}</strong></td>
      <td>${escapeHtml(participant.rank_name || "—")}</td>
      <td><span class="participant-status participant-status-${escapeHtml(participant.member_status || "main")}">${escapeHtml(STATUS_LABELS[participant.member_status] || "Основной состав")}</span></td>
      <td>${formatBirthday(participant.birthday)}</td>
      <td class="participant-private-column"${canSeePrivate ? "" : " hidden"}>${formatTimezone(participant.timezone_offset)}</td>
      <td class="participant-private-column"${canSeePrivate ? "" : " hidden"}>${escapeHtml(participant.comment || "—")}</td>
      <td>${actions}</td>
    </tr>`;
  }).join("");
}
