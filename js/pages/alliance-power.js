import { initPowerSection } from "../alliance/power-section.js?v=20260723-editing-1";
import { loadAlliancePageContext, fillAllianceCompactHeader, canEditAlliance } from "../alliance/page-context.js?v=20260718-1";

export async function init() {
  const box = document.getElementById("allianceMessage");
  try {
    const context = await loadAlliancePageContext(window.harvestHubSupabase);
    if (!canEditAlliance(context)) {
      window.loadPage?.("alliance/members.html");
      return;
    }
    fillAllianceCompactHeader(context);
    initPowerSection();
  } catch (error) {
    if (!box) return;
    box.hidden = false;
    box.dataset.type = "error";
    box.textContent = error.message;
  }
}