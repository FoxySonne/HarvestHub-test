(() => {
  const SITE_ASSET_VERSION = "20260716-11";
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
    { title: "Сезонные ресурсы", path: "calculator/season-resources.html", group: "Калькуляторы" },
    { title: "Обучение войск", path: "calculator/troop-training.html", group: "Калькуляторы" }
  ];
  const pageModulePaths = {
    home: "../pages/home.js",
    members: "../pages/members.js",
    profile: "../pages/profile.js",
    settings: "../pages/settings.js",
    ipk: "../calculators/ipk.js",
    "turbo-vs": "../calculators/turbo-vs.js",
    "troop-training": "../calculators/troop-training.js",
    "season-resources": "../season/season-resources.js"
  };

  let currentLoadedPage = localStorage.getItem("currentPage") || "";

  function readPageVisits() {
    return window.harvestHubStorage.readJsonStorage(QUICK_LINKS_STORAGE_KEY, {});
  }

  function savePageVisits(visits) {
    window.harvestHubStorage.writeJsonStorage(QUICK_LINKS_STORAGE_KEY, visits);
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
      "calculator/troop-training.html",
      "calculator.html"
    ].map(getPageByPath).filter(Boolean);
  }

  function getPopularPages(currentPage = "") {
    const visits = readPageVisits();
    const popularPages = pagesDatabase
      .map(page => ({ ...page, visits: Number(visits[page.path]) || 0 }))
      .filter(page => page.visits > 0 && page.path !== currentPage)
      .sort((a, b) => b.visits - a.visits || a.title.localeCompare(b.title, "ru"));

    if (popularPages.length > 0) return popularPages.slice(0, MAX_QUICK_LINKS);
    return getDefaultQuickLinks().filter(page => page.path !== currentPage).slice(0, MAX_QUICK_LINKS);
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
        if (pagePath) loadPage(pagePath);
      });
    });
  }

  function getGlobalInitName(fileName) {
    return fileName
      .split("-")
      .map((part, index) => index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
      .join("") + "Init";
  }

  function withCacheBust(filePath) {
    const separator = filePath.includes("?") ? "&" : "?";
    return `${filePath}${separator}v=${SITE_ASSET_VERSION}-${Date.now()}`;
  }

  async function loadBlock(containerId, filePath) {
    const container = document.getElementById(containerId);
    if (!container) return false;

    const response = await fetch(withCacheBust(filePath), { cache: "no-store" });
    if (!response.ok) {
      console.warn(`Не удалось загрузить ${filePath}:`, response.status);
      return false;
    }

    container.innerHTML = await response.text();
    const fileName = filePath.split("/").pop().replace(".html", "");
    const modulePath = pageModulePaths[fileName];

    if (modulePath) {
      try {
        const module = await import(`${modulePath}?v=${SITE_ASSET_VERSION}-${Date.now()}`);
        if (typeof module.init === "function") module.init();
        else {
          const globalInitName = getGlobalInitName(fileName);
          if (typeof window[globalInitName] === "function") window[globalInitName]();
        }
      } catch (error) {
        console.warn(`JS-модуль для страницы ${fileName} не был запущен:`, error);
        const globalInitName = getGlobalInitName(fileName);
        if (typeof window[globalInitName] === "function") window[globalInitName]();
      }
    } else {
      const globalInitName = getGlobalInitName(fileName);
      if (typeof window[globalInitName] === "function") window[globalInitName]();
    }

    if (containerId === "rightbar-container") renderQuickLinks();
    return true;
  }

  async function loadPage(pageName) {
    window.savePageFormState(currentLoadedPage);
    const isLoaded = await loadBlock("page-content", `pages/${pageName}`);
    if (!isLoaded) return;

    currentLoadedPage = pageName;
    localStorage.setItem("currentPage", pageName);

    window.harvestHubStorage.restorePageFormState(pageName);
    window.harvestHubStorage.bindPageFormPersistence(pageName);
    window.savePageFormState(pageName);
    window.applyAdvancedModeSetting();
    window.applyActiveProfileSetting();
    trackPageVisit(pageName);
    renderQuickLinks(pageName);

    if (window.innerWidth < 900 && typeof window.closeMenu === "function") window.closeMenu();
  }

  window.harvestHubNavigation = {
    getCurrentPage: () => currentLoadedPage,
    pages: pagesDatabase
  };
  window.loadPage = loadPage;
  window.loadBlock = loadBlock;
  window.renderQuickLinks = renderQuickLinks;
})();
