import { initPowerSection } from "../alliance/power-section.js?v=20260727-power-inline-bulk-1";
import { loadAlliancePageContext, fillAllianceCompactHeader, canEditAlliance } from "../alliance/page-context.js?v=20260718-1";

function applyOwnPowerMode(participantId) {
  const statistics = document.getElementById("powerStatisticsCard");
  const season = document.getElementById("powerSeasonSettings");
  if (statistics) statistics.hidden = true;
  if (season) season.hidden = true;
  const title = document.getElementById("powerEditorTitle");
  if (title) title.textContent = "Добавить силу своих отрядов";

  const select = document.getElementById("powerParticipant");
  if (!select) return;
  select.dataset.lockedParticipantId = participantId;
  if ([...select.options].some(option => option.value === participantId)) {
    select.value = participantId;
    select.disabled = true;
  }
}

export async function init() {
  const box = document.getElementById("allianceMessage");
  try {
    const context = await loadAlliancePageContext(window.harvestHubSupabase);
    const canEdit = canEditAlliance(context);
    if (!canEdit && !context.currentParticipant) {
      window.loadPage?.("alliance/members.html");
      return;
    }
    fillAllianceCompactHeader(context);
    initPowerSection();
    if (!canEdit) applyOwnPowerMode(context.currentParticipant.id);
  } catch (error) {
    if (!box) return;
    box.hidden = false;
    box.dataset.type = "error";
    box.textContent = error.message;
  }
}
