const COLLAPSIBLE_CARD_STATE_PREFIX = "harvesthub_collapsible_card_state:";

function isMobileViewport() {
  return window.matchMedia("(max-width: 899px)").matches;
}

function getCurrentPageName() {
  return localStorage.getItem("currentPage") || "unknown";
}

function getCardTitle(card) {
  const title = card.querySelector(".collapsible-card-title, h1, h2, h3, h4");
  return title?.textContent?.trim() || "block";
}

function getCardStateKey(card, index) {
  const title = getCardTitle(card).toLowerCase().replace(/\s+/g, "_");
  return `${COLLAPSIBLE_CARD_STATE_PREFIX}${getCurrentPageName()}:${index}:${title}`;
}

function findDirectTitle(card) {
  return Array.from(card.children).find(child => /^H[1-4]$/.test(child.tagName));
}

function ensureCardHeader(card) {
  let header = Array.from(card.children).find(child => child.classList.contains("card-header"));

  if (header) {
    header.classList.add("collapsible-card-header");
    return header;
  }

  const directTitle = findDirectTitle(card);

  if (!directTitle) return null;

  header = document.createElement("div");
  header.className = "card-header collapsible-card-header";

  directTitle.classList.add("collapsible-card-title");
  card.insertBefore(header, directTitle);
  header.appendChild(directTitle);

  return header;
}

function setCardCollapsed(card, collapsed) {
  const button = card.querySelector(".collapsible-card-toggle");

  card.classList.toggle("is-collapsed", collapsed);
  card.dataset.collapsed = collapsed ? "true" : "false";

  if (button) {
    button.textContent = collapsed ? "Развернуть" : "Свернуть";
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }
}

function bindCard(card, index) {
  if (!card || card.dataset.collapsibleCardBound === "true") return;
  if (card.dataset.noCollapse === "true") return;

  const header = ensureCardHeader(card);
  if (!header) return;

  card.classList.add("collapsible-card");
  card.dataset.collapsibleCardBound = "true";

  let button = header.querySelector(".collapsible-card-toggle");

  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "collapsible-card-toggle";
    button.setAttribute("aria-label", "Свернуть или развернуть блок");
    header.appendChild(button);
  }

  const stateKey = getCardStateKey(card, index);
  const savedValue = localStorage.getItem(stateKey);
  const shouldCollapse = savedValue === "collapsed";

  setCardCollapsed(card, shouldCollapse);

  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();

    const collapsed = card.dataset.collapsed !== "true";
    setCardCollapsed(card, collapsed);
    localStorage.setItem(stateKey, collapsed ? "collapsed" : "expanded");
  });
}

function bindCollapsibleCards() {
  const pageContent = document.getElementById("page-content");
  if (!pageContent) return;

  Array.from(pageContent.querySelectorAll(":scope > .card, :scope > section.card, .page-section > .card, .season-page > .card"))
    .forEach((card, index) => bindCard(card, index));
}

const observer = new MutationObserver(() => bindCollapsibleCards());

window.addEventListener("DOMContentLoaded", () => {
  bindCollapsibleCards();

  const pageContent = document.getElementById("page-content");
  if (pageContent) observer.observe(pageContent, { childList: true, subtree: true });
});

window.addEventListener("harvesthub:profile-block-ready", () => bindCollapsibleCards());
window.addEventListener("harvesthub:advanced-mode-change", () => bindCollapsibleCards());
window.addEventListener("resize", () => bindCollapsibleCards());

window.bindCollapsibleCards = bindCollapsibleCards;
