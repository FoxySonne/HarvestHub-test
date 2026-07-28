(() => {
  let mobilePopover = null;
  let activeTooltip = null;

  function isMobileTooltipMode() {
    return window.matchMedia("(max-width: 899px)").matches;
  }

  function ensureMobilePopover() {
    if (mobilePopover?.isConnected) return mobilePopover;
    mobilePopover = document.createElement("div");
    mobilePopover.className = "mobile-tooltip-popover";
    mobilePopover.hidden = true;
    mobilePopover.setAttribute("role", "tooltip");
    document.body.appendChild(mobilePopover);
    return mobilePopover;
  }

  function closeMobilePopover() {
    if (mobilePopover) mobilePopover.hidden = true;
    if (activeTooltip) {
      activeTooltip.classList.remove("is-open");
      activeTooltip.querySelector(".tooltip-trigger")?.setAttribute("aria-expanded", "false");
    }
    activeTooltip = null;
  }

  function positionMobilePopover(trigger) {
    const popover = ensureMobilePopover();
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const maxWidth = Math.min(280, window.innerWidth - viewportPadding * 2);
    popover.style.maxWidth = `${maxWidth}px`;
    popover.style.left = `${viewportPadding}px`;
    popover.style.top = `${Math.max(viewportPadding, rect.bottom + 8)}px`;

    requestAnimationFrame(() => {
      const popoverRect = popover.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - popoverRect.width / 2;
      left = Math.max(viewportPadding, Math.min(left, window.innerWidth - popoverRect.width - viewportPadding));
      let top = rect.bottom + 8;
      if (top + popoverRect.height > window.innerHeight - viewportPadding) {
        top = Math.max(viewportPadding, rect.top - popoverRect.height - 8);
      }
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    });
  }

  function openMobilePopover(tooltip, trigger) {
    const popover = ensureMobilePopover();
    const willOpen = activeTooltip !== tooltip || popover.hidden;
    closeMobilePopover();
    if (!willOpen) return;

    activeTooltip = tooltip;
    tooltip.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    popover.textContent = tooltip.dataset.tooltip || "";
    popover.hidden = false;
    positionMobilePopover(trigger);
  }

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

      if (isMobileTooltipMode()) {
        openMobilePopover(tooltip, trigger);
        return;
      }

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
    if (event.target.closest?.(".tooltip, .mobile-tooltip-popover")) return;
    closeMobilePopover();
    document.querySelectorAll(".tooltip.is-open").forEach(tooltip => {
      tooltip.classList.remove("is-open");
      tooltip.querySelector(".tooltip-trigger")?.setAttribute("aria-expanded", "false");
    });
  });

  window.addEventListener("resize", closeMobilePopover, { passive: true });
  window.addEventListener("scroll", closeMobilePopover, { passive: true, capture: true });

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
