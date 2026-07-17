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

    const lastPage = localStorage.getItem("currentPage") || "home.html";

loadPage(lastPage);

});
