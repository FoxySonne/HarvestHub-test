// После полной загрузки страницы
window.addEventListener("DOMContentLoaded", function () {

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
    loadPage("home.html");

});
