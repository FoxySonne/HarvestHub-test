// После полной загрузки страницы
window.addEventListener("DOMContentLoaded", () => {
    const loadBlock = window.harvestHubNavigation?.loadBlock || window.loadBlock;
    const loadPage = window.harvestHubNavigation?.loadPage || window.loadPage;

    if (typeof loadBlock !== "function" || typeof loadPage !== "function") {
        console.error("Навигация HarvestHub не загрузилась.");
        return;
    }

    loadBlock(
        "sidebar-container",
        "components/sidebar.html"
    );

    loadBlock(
        "rightbar-container",
        "components/rightbar.html"
    );

    loadBlock(
        "main-title-container",
        "components/main-title.html"
    );

    const lastPage = localStorage.getItem("currentPage") || "home.html";
    loadPage(lastPage);
});