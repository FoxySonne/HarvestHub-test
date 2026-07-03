// Загрузка любого HTML-файла в нужное место страницы
async function loadBlock(containerId, filePath) {

    const container = document.getElementById(containerId);

    if (!container) return false;

    const response = await fetch(filePath);

    if (!response.ok) {
        console.warn(`Не удалось загрузить ${filePath}:`, response.status);
        return false;
    }

    const html = await response.text();

    container.innerHTML = html;

    // Получаем имя файла
    const fileName = filePath
        .split("/")
        .pop()
        .replace(".html", "");

    try {

        const module = await import(`./${fileName}.js?v=${Date.now()}`);

        if (typeof module.init === "function") {
            module.init();
        }

    } catch (e) {
        // JS для этой страницы отсутствует — это нормально.
        // Но если JS есть и сломался, эту ошибку теперь видно в консоли.
        console.warn(`JS-модуль для страницы ${fileName} не был запущен:`, e);
    }

    return true;
}

async function updateQuickLinksAfterPageLoad(pageName) {
    try {
        const module = await import(`./quick-links.js?v=${Date.now()}`);

        if (typeof module.trackPageVisit === "function") {
            module.trackPageVisit(pageName);
        }

        if (typeof module.renderQuickLinks === "function") {
            module.renderQuickLinks(pageName);
        }
    } catch (e) {
        console.warn("Быстрые ссылки не обновились:", e);
    }
}

// Загрузка страницы в центральную область
async function loadPage(pageName) {

    const isLoaded = await loadBlock("page-content", "pages/" + pageName);

    if (!isLoaded) return;

    // Запоминаем последнюю открытую страницу
    localStorage.setItem("currentPage", pageName);

    updateQuickLinksAfterPageLoad(pageName);

    if (window.innerWidth < 900) {
        closeMenu();
    }

}

window.loadPage = loadPage;
window.loadBlock = loadBlock;
