// После полной загрузки страницы
window.addEventListener("DOMContentLoaded", () => {

    // Левое меню
    loadBlock(
        "sidebar-container",
        "components/sidebar.html"
    );

    // Правая колонка
    loadBlock(
        "rightbar-container",
        "components/rightbar.html"
    );

    // Главная страница
    loadPage(
        "pages/home.html"
    );

});
