let savedScrollY = 0;

export function setAllianceTableFullscreen(element, open, {
  elementClass = "is-alliance-table-fullscreen",
  bodyClass = "alliance-table-fullscreen-open"
} = {}) {
  if (!element) return;

  if (open && !document.body.classList.contains("alliance-fullscreen-open")) {
    savedScrollY = window.scrollY;
    document.body.style.setProperty("--alliance-fullscreen-scroll", `-${savedScrollY}px`);
  }

  element.classList.toggle(elementClass, open);
  document.body.classList.toggle(bodyClass, open);
  document.body.classList.toggle("alliance-fullscreen-open", open);

  if (!open) {
    document.body.style.removeProperty("--alliance-fullscreen-scroll");
    window.scrollTo(0, savedScrollY);
  }
}
