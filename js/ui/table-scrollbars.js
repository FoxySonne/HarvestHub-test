(() => {
  const TABLE_SELECTOR = "[data-horizontal-scroll]";
  const instances = new WeakMap();

  function createTopScrollbar(wrapper) {
    if (!(wrapper instanceof HTMLElement) || instances.has(wrapper)) return;

    const scrollbar = document.createElement("div");
    scrollbar.className = "table-scrollbar-top";
    scrollbar.setAttribute("aria-hidden", "true");

    const spacer = document.createElement("div");
    scrollbar.appendChild(spacer);
    wrapper.before(scrollbar);

    let syncing = false;

    function update() {
      if (!wrapper.isConnected || !scrollbar.isConnected) return;
      const scrollWidth = Math.max(wrapper.scrollWidth, wrapper.firstElementChild?.scrollWidth || 0);
      spacer.style.width = `${scrollWidth}px`;
      scrollbar.hidden = scrollWidth <= wrapper.clientWidth + 1;
      if (!scrollbar.hidden) scrollbar.scrollLeft = wrapper.scrollLeft;
    }

    function syncScroll(source, target) {
      if (syncing) return;
      syncing = true;
      target.scrollLeft = source.scrollLeft;
      requestAnimationFrame(() => {
        syncing = false;
      });
    }

    scrollbar.addEventListener("scroll", () => syncScroll(scrollbar, wrapper), { passive: true });
    wrapper.addEventListener("scroll", () => syncScroll(wrapper, scrollbar), { passive: true });

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(wrapper);
    if (wrapper.firstElementChild instanceof Element) resizeObserver.observe(wrapper.firstElementChild);

    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(wrapper, { childList: true, subtree: true, attributes: true });

    instances.set(wrapper, { scrollbar, resizeObserver, mutationObserver, update });
    requestAnimationFrame(update);
  }

  function initTableScrollbars(root = document) {
    root.querySelectorAll?.(TABLE_SELECTOR).forEach(createTopScrollbar);
    instances.forEach?.(instance => instance.update());
  }

  document.addEventListener("harvesthub:page-loaded", () => {
    requestAnimationFrame(() => initTableScrollbars(document));
  });

  window.addEventListener("resize", () => initTableScrollbars(document));

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initTableScrollbars(document), { once: true });
  } else {
    initTableScrollbars(document);
  }

  window.harvestHubTableScrollbars = {
    refresh: () => initTableScrollbars(document)
  };
})();
