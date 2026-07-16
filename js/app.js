// После полной загрузки страницы
window.addEventListener("DOMContentLoaded", () => {
    const mainTitleContainer = document.getElementById("main-title-container");
    const originalLoadPage = window.loadPage;

    function updateMainTitleVisibility(pageName) {
        if (!mainTitleContainer) return;
        mainTitleContainer.hidden = pageName !== "home.html";
    }

    if (typeof originalLoadPage === "function") {
        window.loadPage = async function(pageName) {
            updateMainTitleVisibility(pageName);
            return originalLoadPage(pageName);
        };
    }

    const lastPage = localStorage.getItem("currentPage") || "home.html";
    updateMainTitleVisibility(lastPage);

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
    ).then(() => updateMainTitleVisibility(localStorage.getItem("currentPage") || lastPage));

    document.addEventListener("click", event => {
        const homeLink = event.target.closest("[data-home-link='true']");
        if (!homeLink) return;
        window.loadPage("home.html");
    });

    window.loadPage(lastPage);
});