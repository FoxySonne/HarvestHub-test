import { initPowerSection } from "../alliance/power-section.js?v=20260723-own-power-1";
import { loadAlliancePageContext, fillAllianceCompactHeader, canEditAlliance } from "../alliance/page-context.js?v=20260718-1";

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
    initPowerSection({ ownOnly: !canEdit, participantId: context.currentParticipant?.id || "" });
  } catch (error) {
    if (!box) return;
    box.hidden = false;
    box.dataset.type = "error";
    box.textContent = error.message;
  }
}