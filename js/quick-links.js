import { pagesDatabase } from "../data/pages-database.js";

const STORAGE_KEY = "harvesthub_page_visits";
const MAX_QUICK_LINKS = 5;

function readVisits() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (error) {
    console.warn("Не удалось прочитать статистику быстрых ссылок:", error);
    return {};
  }
}

function saveVisits(visits) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visits));
  } catch (error) {
    console.warn("Не удалось сохранить статистику быстрых ссылок:", error);
  }
}

function getPageByPath(pagePath) {
  return pagesDatabase.find(page => page.path === pagePath);
}

function getDefaultPages() {
  return [
    "calculator/ipk.html",
    "calculator/turbo-vs.html",
    "calculator/season-resources.html",
    "calculator.html",
    "events.html"
  ]
    .map(getPageByPath)
    .filter(Boolean);
}

function getPopularPages(currentPagePath = "") {
  const visits = readVisits();
  const pagesWithVisits = pagesDatabase
    .map(page => ({
      ...page,
      visits: Number(visits[page.path]) || 0
    }))
    .filter(page => page.visits > 0)
    .sort((a, b) => {
      if (b.visits !== a.visits) return b.visits - a.visits;
      return a.title.localeCompare(b.title, "ru");
    });

  const popularPages = pagesWithVisits.length > 0 ? pagesWithVisits : getDefaultPages();

  return popularPages
    .filter(page => page.path !== currentPagePath)
    .slice(0, MAX_QUICK_LINKS);
}

export function trackPageVisit(pagePath) {
  if (!getPageByPath(pagePath)) return;

  const visits = readVisits();
  visits[pagePath] = (Number(visits[pagePath]) || 0) + 1;
  saveVisits(visits);
}

export function renderQuickLinks(currentPagePath = localStorage.getItem("currentPage") || "") {
  const container = document.getElementById("quickLinks");

  if (!container) return;

  const pages = getPopularPages(currentPagePath);

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

      if (pagePath && typeof window.loadPage === "function") {
        window.loadPage(pagePath);
      }
    });
  });
}
