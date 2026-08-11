let savedScrollY = 0;
const fullscreenPlaceholders = new WeakMap();

export function setAllianceTableFullscreen(element, open, {
  elementClass = "is-alliance-table-fullscreen",
  bodyClass = "alliance-table-fullscreen-open"
} = {}) {
  if (!element) return;

  if (open && !document.body.classList.contains("alliance-fullscreen-open")) {
    savedScrollY = window.scrollY;
    document.body.style.setProperty("--alliance-fullscreen-scroll", `-${savedScrollY}px`);
  }

  if (open && !fullscreenPlaceholders.has(element)) {
    const placeholder = document.createComment("alliance-table-fullscreen-placeholder");
    element.before(placeholder);
    fullscreenPlaceholders.set(element, placeholder);
    document.body.append(element);
  }

  element.classList.toggle(elementClass, open);
  document.body.classList.toggle(bodyClass, open);
  document.body.classList.toggle("alliance-fullscreen-open", open);

  if (!open) {
    const placeholder = fullscreenPlaceholders.get(element);
    if (placeholder?.parentNode) {
      placeholder.before(element);
      placeholder.remove();
    }
    fullscreenPlaceholders.delete(element);
    document.body.style.removeProperty("--alliance-fullscreen-scroll");
    window.scrollTo(0, savedScrollY);
  }
}
