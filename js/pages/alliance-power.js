import { initPowerSection } from "../alliance/power-section.js?v=20260727-power-missing-marker-1";
import { initPowerInlineRowEditor } from "../alliance/power-inline-row-editor.js?v=20260728-power-row-editor-1";
import { initPowerAnomalyWarning } from "../alliance/power-anomaly-warning.js?v=20260730-power-500m-warning-1";
import { loadAlliancePageContext, fillAllianceCompactHeader, canEditAlliance } from "../alliance/page-context.js?v=20260718-1";

export async function init() {
  const box = document.getElementById("allianceMessage");
  try {
    const context = await loadAlliancePageContext(window.harvestHubSupabase);
    const canManage = canEditAlliance(context);
    if (!canManage && !context.currentParticipant) {
      window.loadPage?.("alliance/members.html");
      return;
    }
    fillAllianceCompactHeader(context);
    initPowerSection();
    initPowerInlineRowEditor({
      canManage,
      currentParticipantId: context.currentParticipant?.id || ""
    });
    initPowerAnomalyWarning();
  } catch (error) {
    if (box) box.hidden = true;
    window.harvestHubNotifications?.error(error, "Не удалось загрузить замеры силы.");
  }
}
