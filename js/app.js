// После полной загрузки страницы
window.addEventListener("DOMContentLoaded", () => {

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

    document.addEventListener("click", event => {
        const homeLink = event.target.closest("[data-home-link='true']");
        if (!homeLink) return;
        loadPage("home.html");
    });

    const lastPage = localStorage.getItem("currentPage") || "home.html";

loadPage(lastPage);

});