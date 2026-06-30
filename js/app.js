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

    loadPage("home.html");

});
