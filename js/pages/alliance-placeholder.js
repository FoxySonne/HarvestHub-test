import { loadAlliancePageContext, fillAllianceCompactHeader } from "../alliance/page-context.js?v=20260718-1";

export async function init() {
  const currentPage = localStorage.getItem("currentPage") || "";
  if (currentPage.endsWith("alliance/reservoir-activity.html")) {
    const module = await import("./alliance-reservoir-activity.js?v=20260811-fullscreen-viewport-1");
    return module.init();
  }

  const box = document.getElementById("allianceMessage");
  try {
    const context = await loadAlliancePageContext(window.harvestHubSupabase);
    fillAllianceCompactHeader(context);
  } catch (error) {
    if (box) box.hidden = true;
    window.harvestHubNotifications?.error(error, "Не удалось загрузить раздел союзного штаба.");
  }
}
