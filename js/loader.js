// Загрузка любого HTML-файла в нужное место страницы
function loadBlock(containerId, filePath) {

    const container = document.getElementById(containerId);

    if (!container) return;

    fetch(filePath)
        .then(response => response.text())
        .then(html => {

            container.innerHTML = html;

            // Удаляем JS предыдущей страницы
            const oldScript = document.getElementById("page-script");
            if (oldScript) {
                oldScript.remove();
            }

            // Получаем имя HTML-файла без расширения
            const fileName = filePath
                .split("/")
                .pop()
                .replace(".html", "");

            // Подключаем соответствующий JS
            const script = document.createElement("script");
            script.id = "page-script";
            script.type = "module";
            script.src = `js/${fileName}.js`;

            // Если файла нет — просто ничего не происходит
            script.onerror = () => script.remove();

            document.body.appendChild(script);

        });

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
