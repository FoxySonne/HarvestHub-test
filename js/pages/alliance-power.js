import { initPowerSection } from "../alliance/power-section.js?v=20260718-54";
import { loadAlliancePageContext, fillAllianceCompactHeader } from "../alliance/page-context.js?v=20260718-1";

export async function init() {
  const box = document.getElementById("allianceMessage");
  try {
    const context = await loadAlliancePageContext(window.harvestHubSupabase);
    fillAllianceCompactHeader(context);
    initPowerSection();
  } catch (error) {
    if (!box) return;
    box.hidden = false;
    box.dataset.type = "error";
    box.textContent = error.message;
  }
}
