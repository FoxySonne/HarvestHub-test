(() => {
  function prepareTooltip(tooltip) {
    if (!(tooltip instanceof HTMLElement) || tooltip.dataset.touchTooltipReady === "true") return;

    tooltip.dataset.touchTooltipReady = "true";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "tooltip-trigger";
    trigger.textContent = "?";
    trigger.setAttribute("aria-label", "Показать подсказку");
    trigger.setAttribute("aria-expanded", "false");

    trigger.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      const willOpen = !tooltip.classList.contains("is-open");

      document.querySelectorAll(".tooltip.is-open").forEach(openTooltip => {
        if (openTooltip === tooltip) return;
        openTooltip.classList.remove("is-open");
        openTooltip.querySelector(".tooltip-trigger")?.setAttribute("aria-expanded", "false");
      });

      tooltip.classList.toggle("is-open", willOpen);
      trigger.setAttribute("aria-expanded", String(willOpen));
    });

    tooltip.appendChild(trigger);
  }

  function prepareTooltips(root = document) {
    root.querySelectorAll?.(".tooltip[data-tooltip]").forEach(prepareTooltip);
  }

  document.addEventListener("click", event => {
    if (event.target.closest?.(".tooltip")) return;

    document.querySelectorAll(".tooltip.is-open").forEach(tooltip => {
      tooltip.classList.remove("is-open");
      tooltip.querySelector(".tooltip-trigger")?.setAttribute("aria-expanded", "false");
    });
  });

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches?.(".tooltip[data-tooltip]")) prepareTooltip(node);
        prepareTooltips(node);
      });
    });
  });

  function start() {
    prepareTooltips();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();