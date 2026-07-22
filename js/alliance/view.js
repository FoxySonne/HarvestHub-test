function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

function nicknameHistoryTitle(history, currentNickname) {
  if (!Array.isArray(history) || history.length === 0) return "";
  const current = String(currentNickname || "").trim().toLowerCase();
  const previous = [];
  const seen = new Set();
  history.forEach(item => {
    const nickname = String(typeof item === "string" ? item : item?.old_nickname || "").trim();
    const key = nickname.toLowerCase();
    if (!nickname || key === current || seen.has(key)) return;
    seen.add(key);
    previous.push(nickname);
  });
  return previous.length ? `Предыдущие никнеймы:\n${previous.join("\n")}` : "";
}

export function renderMembershipOptions(members) {
  return members.map(item => {
    const alliance = item.alliances;
    const stateSuffix = alliance?.state_number
      ? ` · штат ${escapeHtml(alliance.state_number)}`
      : "";
    return `<option value="${escapeHtml(item.alliance_id)}">${escapeHtml(alliance?.name || "Без названия")}${stateSuffix}</option>`;
  }).join("");
}

export function renderParticipantRows(participants, canEdit, canSeePrivate) {
  return participants.map(participant => {
    const history = nicknameHistoryTitle(participant.nickname_history, participant.nickname);
    const nicknameClass = history
      ? "participant-nickname tooltip participant-nickname-history"
      : "participant-nickname";
    const nicknameAttributes = history
      ? ` data-tooltip="${escapeHtml(history)}" tabindex="0"`
      : "";

    const actions = canEdit
      ? `<div class="participant-row-actions">
          <button type="button" class="secondary-button" data-participant-edit="${escapeHtml(participant.id)}">Изменить</button>
          ${participant.member_status !== "left" ? `<button type="button" class="danger-button" data-participant-delete="${escapeHtml(participant.id)}">Ушел</button>` : ""}
        </div>`
      : "";

    const privateAttribute = canSeePrivate ? "" : " hidden";
    const twinDetails = canSeePrivate && participant.is_twin
      ? `<small class="participant-twin-details"><span class="participant-twin-badge">Твин</span><span>Основа: ${escapeHtml(participant.primary_nickname || "не указана")}</span></small>`
      : "";

    return `<tr class="participant-row">
      <td><div class="participant-nickname-cell"><strong class="${nicknameClass}"${nicknameAttributes}>${escapeHtml(participant.nickname)}</strong>${twinDetails}</div></td>
      <td>${escapeHtml(participant.rank_name || "—")}</td>
      <td>${formatBirthday(participant.birthday)}</td>
      <td class="participant-private-column"${privateAttribute}>${formatTimezone(participant.timezone_offset)}</td>
      <td class="participant-private-column"${privateAttribute}>${escapeHtml(participant.comment || "—")}</td>
      <td>${actions}</td>
    </tr>`;
  }).join("");
}
