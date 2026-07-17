const TEXT_REPLACEMENTS = [
  [/Расчет/g, "Расчёт"],
  [/расчет/g, "расчёт"],
  [/Еще/g, "Ещё"],
  [/еще/g, "ещё"],
  [/Турбочерепашка&VS/g, "Турбочерепашка & VS"]
];

const ATTRIBUTE_REPLACEMENTS = ["title", "aria-label", "placeholder", "data-tooltip"];

function polishText(value) {
  if (!value) return value;
  return TEXT_REPLACEMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function polishTextNode(node) {
  const polished = polishText(node.nodeValue);
  if (polished !== node.nodeValue) node.nodeValue = polished;
}

function polishAttributes(element) {
  ATTRIBUTE_REPLACEMENTS.forEach(attribute => {
    if (!element.hasAttribute(attribute)) return;
    const value = element.getAttribute(attribute);
    const polished = polishText(value);
    if (polished !== value) element.setAttribute(attribute, polished);
  });
}

function polishElement(root = document.body) {
  if (!root) return;
  if (root.nodeType === Node.ELEMENT_NODE) polishAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE && ["SCRIPT", "STYLE", "TEXTAREA"].includes(node.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let node = walker.currentNode;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) polishTextNode(node);
    if (node.nodeType === Node.ELEMENT_NODE) polishAttributes(node);
    node = walker.nextNode();
  }
}

function schedulePolish() {
  window.setTimeout(() => polishElement(document.body), 0);
}

const observer = new MutationObserver(mutations => {
  mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) polishTextNode(node);
    if (node.nodeType === Node.ELEMENT_NODE) polishElement(node);
  }));
});

function start() {
  polishElement(document.body);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start);
else start();

window.addEventListener("harvesthub:advanced-mode-change", schedulePolish);
window.harvestHubPolishText = schedulePolish;
