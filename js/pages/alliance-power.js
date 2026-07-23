import { initPowerSection } from "../alliance/power-section.js?v=20260723-editing-1";
import { loadAlliancePageContext, fillAllianceCompactHeader, canEditAlliance } from "../alliance/page-context.js?v=20260718-1";

function applyOwnPowerMode(participantId) {
  const statistics = document.getElementById("powerStatisticsCard");
  const season = document.getElementById("powerSeasonSettings");
  const bulk = document.getElementById("powerBulkCard");
  if (statistics) statistics.hidden = true;
  if (season) season.hidden = true;
  if (bulk) bulk.hidden = true;
  const title = document.getElementById("powerEditorTitle");
  if (title) title.textContent = "Добавить силу своих отрядов";

  const select = document.getElementById("powerParticipant");
  if (!select) return;
  const lockSelect = () => {
    if (![...select.options].some(option => option.value === participantId)) return;
    select.value = participantId;
    select.disabled = true;
  };
  lockSelect();
  new MutationObserver(lockSelect).observe(select, { childList: true });
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