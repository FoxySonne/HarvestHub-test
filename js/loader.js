// Загрузка любого HTML-файла в нужное место страницы
function loadBlock(containerId, filePath) {

    const container = document.getElementById(containerId);

    if (!container) return;

    fetch(filePath)
        .then(response => response.text())
        .then(html => {
            container.innerHTML = html;
        });

}

// Загрузка страницы в центральную область
function loadPage(pageName) {

    loadBlock("page-content", "pages/" + pageName);

}
