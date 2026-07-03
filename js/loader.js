const QUICK_LINKS_STORAGE_KEY = "harvesthub_page_visits";
const MAX_QUICK_LINKS = 5;

const pagesDatabase = [
    { title: "Главная", path: "home.html", group: "Основное" },
    { title: "База знаний", path: "knowledge.html", group: "Основное" },
    { title: "Калькулятор", path: "calculator.html", group: "Основное" },
    { title: "Ивенты", path: "events.html", group: "Основное" },
    { title: "Список дел", path: "todo.html", group: "Основное" },
    { title: "События", path: "timeline.html", group: "Основное" },
    { title: "Советы", path: "tips.html", group: "Основное" },
    { title: "Настройки", path: "settings.html", group: "Основное" },
    { title: "Игра по-крупному", path: "calculator/ipk.html", group: "Калькуляторы" },
    { title: "Турбочерепашка & VS", path: "calculator/turbo-vs.html", group: "Калькуляторы" },
    { title: "Сезонные ресурсы", path: "calculator/season-resources.html", group: "Калькуляторы" }
];

function readPageVisits() {
    try {
        return JSON.parse(localStorage.getItem(QUICK_LINKS_STORAGE_KEY) || "{}");
    } catch (e) {
        console.warn("Не удалось прочитать статистику быстрых ссылок:", e);
        return {};
    }
}

function savePageVisits(visits) {
    try {
        localStorage.setItem(QUICK_LINKS_STORAGE_KEY, JSON.stringify(visits));
    } catch (e) {
        console.warn("Не удалось сохранить статистику быстрых ссылок:", e);
    }
}

function getPageByPath(pagePath) {
    return pagesDatabase.find(page => page.path === pagePath);
}

function trackPageVisit(pageName) {
    if (!getPageByPath(pageName)) return;

    const visits = readPageVisits();
    visits[pageName] = (Number(visits[pageName]) || 0) + 1;
    savePageVisits(visits);
}

function getDefaultQuickLinks() {
    return [
        "calculator/ipk.html",
        "calculator/turbo-vs.html",
        "calculator/season-resources.html",
        "calculator.html",
        "events.html"
    ].map(getPageByPath).filter(Boolean);
}

function getPopularPages(currentPage = "") {
    const visits = readPageVisits();

    const popularPages = pagesDatabase
        .map(page => ({
            ...page,
            visits: Number(visits[page.path]) || 0
        }))
        .filter(page => page.visits > 0 && page.path !== currentPage)
        .sort((a, b) => {
            if (b.visits !== a.visits) return b.visits - a.visits;
            return a.title.localeCompare(b.title, "ru");
        });

    if (popularPages.length > 0) {
        return popularPages.slice(0, MAX_QUICK_LINKS);
    }

    return getDefaultQuickLinks()
        .filter(page => page.path !== currentPage)
        .slice(0, MAX_QUICK_LINKS);
}

function renderQuickLinks(currentPage = localStorage.getItem("currentPage") || "") {
    const container = document.getElementById("quickLinks");

    if (!container) return;

    const pages = getPopularPages(currentPage);

    if (pages.length === 0) {
        container.innerHTML = `<p class="quick-links-empty">Пока нет статистики переходов</p>`;
        return;
    }

    container.innerHTML = pages.map(page => `
        <a href="#" class="quick-link-item" data-page-path="${page.path}">
            <span>${page.title}</span>
            <small>${page.group}</small>
        </a>
    `).join("");

    container.querySelectorAll(".quick-link-item").forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();
            const pagePath = link.dataset.pagePath;

            if (pagePath) {
                loadPage(pagePath);
            }
        });
    });
}

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

    if (containerId === "rightbar-container") {
        renderQuickLinks();
    }

    return true;
}

// Загрузка страницы в центральную область
async function loadPage(pageName) {

    const isLoaded = await loadBlock("page-content", "pages/" + pageName);

    if (!isLoaded) return;

    // Запоминаем последнюю открытую страницу
    localStorage.setItem("currentPage", pageName);

    trackPageVisit(pageName);
    renderQuickLinks(pageName);

    if (window.innerWidth < 900 && typeof closeMenu === "function") {
        closeMenu();
    }

}

window.loadPage = loadPage;
window.loadBlock = loadBlock;
window.renderQuickLinks = renderQuickLinks;
