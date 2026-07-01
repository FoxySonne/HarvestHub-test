// Загрузка любого HTML-файла в нужное место страницы
async function loadBlock(containerId, filePath) {

    const container = document.getElementById(containerId);

    if (!container) return;

    const response = await fetch(filePath);
    const html = await response.text();

    container.innerHTML = html;

    // Получаем имя файла
    const fileName = filePath
        .split("/")
        .pop()
        .replace(".html", "");

    try {

        const module = await import(`./${fileName}.js`);

        if (typeof module.init === "function") {
            module.init();
        }

    } catch (e) {
        // JS для этой страницы отсутствует — это нормально
    }

}

// Загрузка страницы в центральную область
function loadPage(pageName) {

    // Запоминаем последнюю открытую страницу
    localStorage.setItem("currentPage", pageName);

    loadBlock("page-content", "pages/" + pageName);

    if (window.innerWidth < 900) {
        closeMenu();
    }

}
