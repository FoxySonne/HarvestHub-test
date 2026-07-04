const QUICK_LINKS_STORAGE_KEY = "harvesthub_page_visits";
const PAGE_FORM_STATE_PREFIX = "harvesthub_page_form_state:";
const ADVANCED_MODE_STORAGE_KEY = "harvesthub_advanced_mode";
const MAX_QUICK_LINKS = 5;

let currentLoadedPage = localStorage.getItem("currentPage") || "";

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

function isAdvancedModeEnabled() {
    return localStorage.getItem(ADVANCED_MODE_STORAGE_KEY) === "1";
}

function applyAdvancedModeSetting() {
    const enabled = isAdvancedModeEnabled();

    document.documentElement.classList.toggle("advanced-mode", enabled);
    document.documentElement.dataset.advancedMode = enabled ? "on" : "off";

    if (document.body) {
        document.body.classList.toggle("advanced-mode", enabled);
        document.body.dataset.advancedMode = enabled ? "on" : "off";
    }

    return enabled;
}

function setAdvancedMode(enabled) {
    localStorage.setItem(ADVANCED_MODE_STORAGE_KEY, enabled ? "1" : "0");
    const applied = applyAdvancedModeSetting();

    window.dispatchEvent(new CustomEvent("harvesthub:advanced-mode-change", {
        detail: { enabled: applied }
    }));

    return applied;
}

function getPageFormStateKey(pageName) {
    return `${PAGE_FORM_STATE_PREFIX}${pageName}`;
}

function readJsonStorage(key, fallback = {}) {
    try {
        return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (e) {
        console.warn(`Не удалось прочитать данные из localStorage: ${key}`, e);
        return fallback;
    }
}

function writeJsonStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn(`Не удалось сохранить данные в localStorage: ${key}`, e);
    }
}

function getPersistableFields(container) {
    if (!container) return [];

    return Array.from(container.querySelectorAll("input, select, textarea"))
        .filter(field => {
            const type = (field.type || "").toLowerCase();
            return !["button", "submit", "reset", "hidden", "file"].includes(type);
        });
}

function getFieldKey(field, index) {
    const buildingRow = field.closest?.(".season-building-row");

    if (buildingRow?.dataset?.buildingId) {
        if (field.classList.contains("season-building-enabled")) {
            return `building:${buildingRow.dataset.buildingId}:enabled`;
        }

        if (field.classList.contains("season-building-current")) {
            return `building:${buildingRow.dataset.buildingId}:current`;
        }

        if (field.classList.contains("season-building-target")) {
            return `building:${buildingRow.dataset.buildingId}:target`;
        }
    }

    if (field.id) return `id:${field.id}`;
    if (field.name) return `name:${field.name}`;

    return `field:${field.tagName.toLowerCase()}:${field.type || "value"}:${index}`;
}

function getFieldValue(field) {
    const type = (field.type || "").toLowerCase();

    if (type === "checkbox" || type === "radio") {
        return field.checked;
    }

    return field.value;
}

function setFieldValue(field, value) {
    const type = (field.type || "").toLowerCase();

    if (type === "checkbox" || type === "radio") {
        field.checked = Boolean(value);
        return;
    }

    field.value = String(value ?? "");
}

function savePageFormState(pageName = currentLoadedPage) {
    if (!pageName) return;

    const container = document.getElementById("page-content");
    const fields = getPersistableFields(container);

    if (fields.length === 0) return;

    const state = {};

    fields.forEach((field, index) => {
        state[getFieldKey(field, index)] = getFieldValue(field);
    });

    writeJsonStorage(getPageFormStateKey(pageName), state);
}

function restorePageFormState(pageName) {
    const container = document.getElementById("page-content");
    const fields = getPersistableFields(container);
    const state = readJsonStorage(getPageFormStateKey(pageName), null);

    if (!state || typeof state !== "object") return;

    const restoredFields = [];

    fields.forEach((field, index) => {
        const key = getFieldKey(field, index);

        if (!Object.prototype.hasOwnProperty.call(state, key)) return;

        setFieldValue(field, state[key]);
        restoredFields.push(field);
    });

    restoredFields.forEach(field => {
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

function bindPageFormPersistence(pageName) {
    const container = document.getElementById("page-content");
    const fields = getPersistableFields(container);

    fields.forEach(field => {
        if (field.dataset.formPersistenceBound === pageName) return;

        field.dataset.formPersistenceBound = pageName;

        field.addEventListener("input", () => savePageFormState(pageName));
        field.addEventListener("change", () => savePageFormState(pageName));
    });
}

function readPageVisits() {
    return readJsonStorage(QUICK_LINKS_STORAGE_KEY, {});
}

function savePageVisits(visits) {
    writeJsonStorage(QUICK_LINKS_STORAGE_KEY, visits);
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

function getGlobalInitName(fileName) {
    return fileName
        .split("-")
        .map((part, index) => index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
        .join("") + "Init";
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
        } else {
            const globalInitName = getGlobalInitName(fileName);

            if (typeof window[globalInitName] === "function") {
                window[globalInitName]();
            }
        }

    } catch (e) {
        // JS для этой страницы отсутствует — это нормально.
        // Но если JS есть и сломался, эту ошибку теперь видно в консоли.
        console.warn(`JS-модуль для страницы ${fileName} не был запущен:`, e);

        const globalInitName = getGlobalInitName(fileName);

        if (typeof window[globalInitName] === "function") {
            window[globalInitName]();
        }
    }

    if (containerId === "rightbar-container") {
        renderQuickLinks();
    }

    return true;
}

// Загрузка страницы в центральную область
async function loadPage(pageName) {

    savePageFormState(currentLoadedPage);

    const isLoaded = await loadBlock("page-content", "pages/" + pageName);

    if (!isLoaded) return;

    currentLoadedPage = pageName;
    localStorage.setItem("currentPage", pageName);

    restorePageFormState(pageName);
    bindPageFormPersistence(pageName);
    savePageFormState(pageName);

    applyAdvancedModeSetting();
    trackPageVisit(pageName);
    renderQuickLinks(pageName);

    if (window.innerWidth < 900 && typeof closeMenu === "function") {
        closeMenu();
    }

}

window.addEventListener("beforeunload", () => {
    savePageFormState(currentLoadedPage || localStorage.getItem("currentPage") || "");
});

applyAdvancedModeSetting();

window.loadPage = loadPage;
window.loadBlock = loadBlock;
window.renderQuickLinks = renderQuickLinks;
window.savePageFormState = savePageFormState;
window.getAdvancedMode = isAdvancedModeEnabled;
window.setAdvancedMode = setAdvancedMode;
window.applyAdvancedModeSetting = applyAdvancedModeSetting;
