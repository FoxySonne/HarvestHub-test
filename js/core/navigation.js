(() => {
  const SITE_ASSET_VERSION = "20260726-critical-batch-8";
  const QUICK_LINKS_STORAGE_KEY = "harvesthub_page_visits";
  const MAX_QUICK_LINKS = 5;
  const pagesDatabase = [
    { title: "Главная", path: "home.html", group: "Основное" },
    { title: "База знаний", path: "knowledge.html", group: "Основное" },
    { title: "Калькулятор", path: "calculator.html", group: "Основное" },
    { title: "Союзный штаб", path: "alliance/members.html", group: "Основное" },
    { title: "Настройки", path: "settings.html", group: "Основное" },
    { title: "Профиль", path: "profile.html", group: "Основное" },
    { title: "Управление доступом", path: "advanced-access.html", group: "Основное" },
    { title: "Калькулятор обучения войск", path: "calculator/troop-training.html", group: "Калькуляторы" },
    { title: "Калькулятор Турбо / ИПК", path: "calculator/turbo-vs.html", group: "Калькуляторы" },
    { title: "Калькулятор ИПК", path: "calculator/ipk.html", group: "Калькуляторы" },
    { title: "Сезонные ресурсы", path: "calculator/season-resources.html", group: "Калькуляторы" },
    { title: "Управление союзом", path: "alliance/manage.html", group: "Союзный штаб" },
    { title: "Состав союза", path: "alliance/roster.html", group: "Союзный штаб" },
    { title: "Сила отрядов", path: "alliance/power.html", group: "Союзный штаб" },
    { title: "VS", path: "alliance/vs.html", group: "Союзный штаб" },
    { title: "Статистика VS", path: "alliance/vs-statistics.html", group: "Союзный штаб" },
    { title: "Резервуар: активность", path: "alliance/reservoir-activity.html", group: "Союзный штаб" },
    { title: "Резервуар: расстановка", path: "alliance/reservoir-layout.html", group: "Союзный штаб" },
    { title: "Калькуляторы", path: "knowledge/calculator.html", group: "База знаний" },
    { title: "Ресурсы и предметы", path: "knowledge/resources.html", group: "База знаний" },
    { title: "Герои", path: "knowledge/heroes.html", group: "База знаний" },
    { title: "Войска", path: "knowledge/troops.html", group: "База знаний" },
    { title: "Развитие", path: "knowledge/development.html", group: "База знаний" },
    { title: "Ивенты", path: "knowledge/events.html", group: "База знаний" },
    { title: "Альянс", path: "knowledge/alliance.html", group: "База знаний" },
    { title: "Турбо", path: "knowledge/turtle.html", group: "База знаний" }
  ];

  let currentPage = localStorage.getItem("currentPage") || "home.html";
  let currentController = null;
  let currentVersion = 0;
  let activePageCleanup = null;
  let pageLoadSequence = 0;

  const moduleRoutes = {
    "home.html": "js/pages/home.js",
    "knowledge.html": "js/pages/knowledge.js",
    "calculator.html": "js/pages/calculator.js",
    "settings.html": "js/pages/settings.js",
    "profile.html": "js/pages/profile.js",
    "advanced-access.html": "js/pages/advanced-access.js",
    "calculator/troop-training.html": "js/pages/troop-training.js",
    "calculator/turbo-vs.html": "js/pages/turbo-vs.js",
    "calculator/ipk.html": "js/calculators/ipk.js",
    "calculator/season-resources.html": "js/season/season-resources.js",
    "alliance/members.html": "js/pages/alliance-hub.js",
    "alliance/manage.html": "js/pages/alliance-management.js",
    "alliance/roster.html": "js/pages/alliance-roster.js",
    "alliance/power.html": "js/pages/alliance-power.js",
    "alliance/vs.html": "js/pages/alliance-vs-current.js",
    "alliance/vs-statistics.html": "js/pages/alliance-vs-statistics.js",
    "alliance/reservoir-activity.html": "js/pages/alliance-reservoir-activity.js",
    "alliance/reservoir-layout.html": "js/pages/alliance-reservoir-layout.js",
    "knowledge/calculator.html": "js/pages/knowledge-article.js",
    "knowledge/resources.html": "js/pages/knowledge-article.js",
    "knowledge/heroes.html": "js/pages/heroes.js",
    "knowledge/troops.html": "js/pages/knowledge-article.js",
    "knowledge/development.html": "js/pages/knowledge-article.js",
    "knowledge/events.html": "js/pages/knowledge-article.js",
    "knowledge/alliance.html": "js/pages/knowledge-article.js",
    "knowledge/turtle.html": "js/pages/knowledge-article.js"
  };

  function normalizePagePath(pageName) {
    const value = String(pageName || "").trim().replace(/^\.\//, "");
    if (!value || value === "index.html" || value === "/") return "home.html";
    return value;
  }

  function readVisitStats() {
    try {
      return JSON.parse(localStorage.getItem(QUICK_LINKS_STORAGE_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }

  function trackPageVisit(pageName) {
    const stats = readVisitStats();
    const current = stats[pageName] || { count: 0, lastVisitedAt: 0 };
    stats[pageName] = { count: Number(current.count || 0) + 1, lastVisitedAt: Date.now() };
    localStorage.setItem(QUICK_LINKS_STORAGE_KEY, JSON.stringify(stats));
  }

  function quickLinkScore(item) {
    return Number(item.count || 0) * 1_000_000_000_000 + Number(item.lastVisitedAt || 0);
  }

  function renderQuickLinks(activePage) {
    const container = document.getElementById("quickLinks");
    if (!container) return;

    const stats = readVisitStats();
    const items = Object.entries(stats)
      .map(([path, item]) => ({ path, ...item, page: pagesDatabase.find(page => page.path === path) }))
      .filter(item => item.page && item.path !== activePage && item.path !== "settings.html")
      .sort((left, right) => quickLinkScore(right) - quickLinkScore(left))
      .slice(0, MAX_QUICK_LINKS);

    container.innerHTML = "";
    items.forEach(item => {
      const link = document.createElement("a");
      link.href = `#${item.path}`;
      link.className = "quick-link";
      link.dataset.page = item.path;
      link.textContent = item.page.title;
      container.appendChild(link);
    });
  }

  function highlightMenu(pageName) {
    document.querySelectorAll(".nav-link").forEach(link => {
      link.classList.toggle("active", link.dataset.page === pageName);
    });
  }

  async function runPageCleanup() {
    const cleanup = activePageCleanup;
    activePageCleanup = null;
    try {
      if (typeof cleanup === "function") await cleanup();
    } catch (error) {
      console.warn("Не удалось полностью очистить предыдущую страницу:", error);
    }
    window.harvestHubFullscreenTable?.close?.();
    window.dispatchEvent(new CustomEvent("harvesthub:page-unload", { detail: { pageName: currentPage } }));
  }

  function registerPageCleanup(callback) {
    if (typeof callback !== "function") return;
    const previous = activePageCleanup;
    activePageCleanup = async () => {
      if (typeof previous === "function") await previous();
      await callback();
    };
  }

  async function loadBlock(url, sequence) {
    const response = await fetch(`${url}?v=${encodeURIComponent(SITE_ASSET_VERSION)}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Не удалось загрузить ${url}`);
    const html = await response.text();
    if (sequence !== pageLoadSequence) return false;

    await runPageCleanup();
    if (sequence !== pageLoadSequence) return false;

    const container = document.getElementById("page-content");
    if (!container) throw new Error("Контейнер страницы не найден");
    container.innerHTML = html;
    return true;
  }

  async function initializePageModule(pageName, sequence) {
    const modulePath = moduleRoutes[pageName];
    if (!modulePath) return;

    const moduleUrl = new URL(modulePath, window.location.href);
    moduleUrl.searchParams.set("v", SITE_ASSET_VERSION);
    const module = await import(moduleUrl.href);
    if (sequence !== pageLoadSequence) return;

    const result = typeof module.init === "function" ? await module.init() : null;
    const cleanup = typeof result === "function"
      ? result
      : typeof module.destroy === "function"
        ? module.destroy
        : null;

    if (sequence !== pageLoadSequence) {
      if (typeof cleanup === "function") await cleanup();
      return;
    }
    if (cleanup) registerPageCleanup(cleanup);
  }

  async function loadPage(pageName = "home.html", options = {}) {
    const normalized = normalizePagePath(pageName);
    if (!moduleRoutes[normalized] && !pagesDatabase.some(page => page.path === normalized)) {
      console.warn("Неизвестная страница:", normalized);
      return false;
    }

    const sequence = ++pageLoadSequence;
    if (currentPage && options.skipCurrentSave !== true) window.savePageFormState?.(currentPage);

    const container = document.getElementById("page-content");
    try {
      if (!await loadBlock(`pages/${normalized}`, sequence)) return false;
      if (sequence !== pageLoadSequence) return false;

      currentPage = normalized;
      localStorage.setItem("currentPage", normalized);
      highlightMenu(normalized);
      window.applyAdvancedModeSetting?.();
      window.applyActiveProfileSetting?.();
      window.restorePageFormState?.(normalized);
      window.bindSimplePageFormState?.(normalized);
      window.bindCollapsibleCards?.();
      window.bindMobileTableCloseButtons?.();
      window.initializeTooltips?.();

      if (normalized !== "calculator/turbo-vs.html") window.stopAutoUpdate?.();
      await initializePageModule(normalized, sequence);
      if (sequence !== pageLoadSequence) return false;

      if (options.trackVisit !== false) trackPageVisit(normalized);
      renderQuickLinks(normalized);
      window.dispatchEvent(new CustomEvent("harvesthub:page-rendered", { detail: { pageName: normalized } }));
      container?.scrollIntoView?.({ behavior: options.behavior || "smooth", block: "start" });
      return true;
    } catch (error) {
      if (sequence !== pageLoadSequence) return false;
      console.error("Ошибка загрузки страницы:", error);
      if (container && !container.childElementCount) {
        container.innerHTML = "<section class=\"page-section\"><h1>Не удалось загрузить страницу</h1><p>Обновите страницу или попробуйте ещё раз.</p></section>";
      }
      return false;
    }
  }

  function createSearchIndex() {
    return pagesDatabase.map(page => ({
      title: page.title,
      path: page.path,
      group: page.group,
      haystack: `${page.title} ${page.group} ${page.path}`.toLocaleLowerCase("ru-RU")
    }));
  }

  function searchPages(query) {
    const normalized = String(query || "").trim().toLocaleLowerCase("ru-RU");
    if (!normalized) return [];
    return createSearchIndex().filter(page => page.haystack.includes(normalized)).slice(0, 10);
  }

  document.addEventListener("click", event => {
    const link = event.target.closest("[data-page]");
    if (!link) return;
    event.preventDefault();
    const page = link.dataset.page;
    if (!page || page === currentPage) return;
    loadPage(page);
  });

  window.addEventListener("popstate", () => {
    const page = normalizePagePath(location.hash.slice(1) || localStorage.getItem("currentPage") || "home.html");
    if (page !== currentPage) loadPage(page, { behavior: "auto" });
  });

  window.loadPage = loadPage;
  window.harvestHubNavigation = {
    loadPage,
    searchPages,
    renderQuickLinks,
    getCurrentPage: () => currentPage,
    getVersion: () => currentVersion,
    registerPageCleanup,
    cleanupCurrentPage: runPageCleanup
  };

  currentVersion += 1;
})();
