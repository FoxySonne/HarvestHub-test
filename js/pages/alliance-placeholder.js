import { loadAlliancePageContext, fillAllianceCompactHeader } from "../alliance/page-context.js?v=20260718-1";

export async function init() {
  const currentPage = localStorage.getItem("currentPage") || "";
  if (currentPage.endsWith("alliance/reservoir-activity.html")) {
    const module = await import("./alliance-reservoir-activity.js?v=20260721-1");
    return module.init();
  }

  const box = document.getElementById("allianceMessage");
  try {
    const context = await loadAlliancePageContext(window.harvestHubSupabase);
    fillAllianceCompactHeader(context);
  } catch (error) {
    if (!box) return;
    box.hidden = false;
    box.dataset.type = "error";
    box.textContent = error.message;
  }
}
