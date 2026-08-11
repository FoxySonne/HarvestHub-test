(() => {
  const TABLE_SELECTOR = "[data-horizontal-scroll]";
  const instances = new Map();

  function normalizedHeader(header) {
    return String(header?.childNodes?.[0]?.textContent || header?.textContent || "")
      .trim()
      .toLocaleLowerCase("ru-RU");
  }

  function columnKind(label) {
    if (!label || /^(действия?|управление)$/i.test(label)) return "action";
    if (/^(место|позиция|№)$/i.test(label)) return "position";
    if (/(участник|никнейм|игрок)/i.test(label)) return "player";
    if (/(email|комментарий|союз)/i.test(label)) return "name";
    if (/ранг/i.test(label)) return "rank";
    if (/(дата|неделя|день рождения|регистрация|окончание|время)/i.test(label)) return "date";
    if (/(место|сила|очки|сумма|прирост|выполнено|счёт|количество|всего|процент|%|пн|вт|ср|чт|пт|сб)/i.test(label)) return "number";
    return "text";
  }

  function cellHasValue(cell) {
    if (!cell) return false;
    if (cell.dataset.sortValue !== undefined) return String(cell.dataset.sortValue).trim() !== "";
    const select = cell.querySelector("select");
    if (select) return String(select.value || select.selectedOptions[0]?.textContent || "").trim() !== "";
    const input = cell.querySelector('input:not([type="checkbox"]), textarea');
    if (input) return String(input.value || "").trim() !== "";
    return !/^(?:|—|-)$/.test(String(cell.textContent || "").trim());
  }

  function setColumnEmpty(header, cells, empty) {
    [header, ...cells].forEach(cell => {
      if (empty && cell.dataset.columnEmpty !== "true") cell.dataset.columnEmpty = "true";
      else if (!empty && cell.dataset.columnEmpty !== undefined) delete cell.dataset.columnEmpty;
    });
  }

  function applyColumnKinds(table) {
    if (!(table instanceof HTMLTableElement)) return;
    const headers = [...table.querySelectorAll("thead th")];
    headers.forEach((header, index) => {
      const kind = columnKind(normalizedHeader(header));
      const label = String(header.childNodes?.[0]?.textContent || header.textContent || "").trim();
      if (header.dataset.columnKind !== kind) header.dataset.columnKind = kind;
      if (label && header.title !== label) header.title = label;
      const cells = [...table.tBodies].flatMap(body => [...body.rows])
        .map(row => row.cells[index])
        .filter(Boolean);
      cells.forEach(cell => {
        if (cell.dataset.columnKind !== kind) cell.dataset.columnKind = kind;
        if (kind === "player") {
          const nickname = cell.querySelector("strong")?.textContent?.trim();
          if (nickname && !cell.title) cell.title = nickname;
        }
      });
      setColumnEmpty(header, cells, cells.length > 0 && !cells.some(cellHasValue));
    });
  }

  function installAxisLock(wrapper) {
    let gesture = null;

    wrapper.addEventListener("touchstart", event => {
      if (event.touches.length !== 1) {
        gesture = null;
        return;
      }
      const touch = event.touches[0];
      gesture = {
        axis: "",
        x: touch.clientX,
        y: touch.clientY,
        scrollLeft: wrapper.scrollLeft,
        scrollTop: wrapper.scrollTop
      };
    }, { passive: true });

    wrapper.addEventListener("touchmove", event => {
      if (!gesture || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.x;
      const deltaY = touch.clientY - gesture.y;
      if (!gesture.axis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 7) {
        gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
      }
      if (gesture.axis === "x") {
        event.preventDefault();
        wrapper.scrollLeft = gesture.scrollLeft - deltaX;
        wrapper.scrollTop = gesture.scrollTop;
      } else if (gesture.axis === "y") {
        event.preventDefault();
        wrapper.scrollLeft = gesture.scrollLeft;
        wrapper.scrollTop = gesture.scrollTop - deltaY;
      }
    }, { passive: false });

    const endGesture = () => { gesture = null; };
    wrapper.addEventListener("touchend", endGesture, { passive: true });
    wrapper.addEventListener("touchcancel", endGesture, { passive: true });

    wrapper.addEventListener("wheel", event => {
      const startLeft = wrapper.scrollLeft;
      const startTop = wrapper.scrollTop;
      const horizontalDelta = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
      const verticalDelta = event.shiftKey ? 0 : event.deltaY;
      event.preventDefault();
      if (Math.abs(horizontalDelta) > Math.abs(verticalDelta)) {
        wrapper.scrollLeft = startLeft + horizontalDelta;
        wrapper.scrollTop = startTop;
      } else {
        wrapper.scrollLeft = startLeft;
        wrapper.scrollTop = startTop + verticalDelta;
      }
    }, { passive: false });

    return {
      current() {
        return gesture;
      }
    };
  }

  function createTopScrollbar(wrapper) {
    if (!(wrapper instanceof HTMLElement) || instances.has(wrapper)) return;

    const scrollbar = document.createElement("div");
    scrollbar.className = "table-scrollbar-top";
    scrollbar.setAttribute("aria-hidden", "true");

    const spacer = document.createElement("div");
    scrollbar.appendChild(spacer);
    wrapper.before(scrollbar);
    const axisLock = installAxisLock(wrapper);

    let syncing = false;

    function update() {
      if (!wrapper.isConnected || !scrollbar.isConnected) return;
      const table = wrapper.querySelector("table");
      applyColumnKinds(table);
      const scrollWidth = Math.max(wrapper.scrollWidth, table?.scrollWidth || 0);
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
    wrapper.addEventListener("scroll", () => {
      const gesture = axisLock.current();
      if (gesture?.axis === "x" && wrapper.scrollTop !== gesture.scrollTop) wrapper.scrollTop = gesture.scrollTop;
      if (gesture?.axis === "y" && wrapper.scrollLeft !== gesture.scrollLeft) wrapper.scrollLeft = gesture.scrollLeft;
      syncScroll(wrapper, scrollbar);
    }, { passive: true });

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(wrapper);
    const table = wrapper.querySelector("table");
    if (table) resizeObserver.observe(table);

    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(wrapper, { childList: true, subtree: true, attributes: true });

    instances.set(wrapper, { scrollbar, resizeObserver, mutationObserver, update });
    requestAnimationFrame(update);
  }

  function refreshTableScrollbars(root = document) {
    root.querySelectorAll?.(".data-table").forEach(applyColumnKinds);
    root.querySelectorAll?.(TABLE_SELECTOR).forEach(createTopScrollbar);

    instances.forEach((instance, wrapper) => {
      if (wrapper.isConnected && instance.scrollbar.isConnected) {
        instance.update();
        return;
      }

      instance.resizeObserver.disconnect();
      instance.mutationObserver.disconnect();
      instance.scrollbar.remove();
      instances.delete(wrapper);
    });
  }

  document.addEventListener("harvesthub:page-loaded", () => {
    requestAnimationFrame(() => refreshTableScrollbars(document));
  });

  window.addEventListener("resize", () => refreshTableScrollbars(document));

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => refreshTableScrollbars(document), { once: true });
  } else {
    refreshTableScrollbars(document);
  }

  window.harvestHubTableScrollbars = {
    refresh: () => refreshTableScrollbars(document)
  };
})();
