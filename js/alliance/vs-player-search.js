(() => {
  const HIGHLIGHT_CLASS = "vs-search-match";
  let highlightTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function isVsPage() {
    return Boolean(byId("vsMainSearch") && byId("vsTableBody"));
  }

  function activeMode() {
    const bulkCard = byId("vsBulkCard");
    return bulkCard && !bulkCard.hidden ? "bulk" : "main";
  }

  function searchForm(mode) {
    return document.querySelector(`[data-vs-search="${mode}"]`);
  }

  function openSearch(mode = activeMode()) {
    const form = searchForm(mode);
    if (!form) return;
    form.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => form.querySelector('input[type="search"]')?.focus(), 250);
  }

  function closeSearch(form) {
    if (!form) return;
    form.hidden = true;
    const status = form.querySelector("[data-vs-search-status]");
    if (status) status.textContent = "";
  }

  function normalize(value) {
    return String(value || "").trim().toLocaleLowerCase("ru-RU");
  }

  function rowsForMode(mode) {
    return mode === "bulk"
      ? [...document.querySelectorAll("#vsBulkBody tr")]
      : [...document.querySelectorAll("#vsTableBody tr")];
  }

  function nicknameForRow(row, mode) {
    const selector = mode === "bulk" ? "td:first-child strong" : "td:nth-child(2) strong";
    return row.querySelector(selector)?.textContent || "";
  }

  function clearHighlight() {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(row => row.classList.remove(HIGHLIGHT_CLASS));
    clearTimeout(highlightTimer);
  }

  function revealRow(row, mode) {
    clearHighlight();
    row.classList.add(HIGHLIGHT_CLASS);
    row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

    const tableWrap = row.closest(".alliance-table-wrap");
    if (tableWrap) tableWrap.scrollLeft = 0;

    if (mode === "bulk") {
      window.setTimeout(() => {
        const firstInput = [...row.querySelectorAll("input")].find(input => !input.disabled);
        firstInput?.focus({ preventScroll: true });
        firstInput?.select?.();
      }, 450);
    }

    highlightTimer = window.setTimeout(clearHighlight, 2600);
  }

  function runSearch(form) {
    const mode = form.dataset.vsSearch;
    const input = form.querySelector('input[type="search"]');
    const status = form.querySelector("[data-vs-search-status]");
    const query = normalize(input?.value);
    if (!query) {
      if (status) status.textContent = "Введите никнейм игрока.";
      input?.focus();
      return;
    }

    const rows = rowsForMode(mode);
    const exact = rows.find(row => normalize(nicknameForRow(row, mode)) === query);
    const partial = rows.find(row => normalize(nicknameForRow(row, mode)).includes(query));
    const match = exact || partial;

    if (!match) {
      if (status) status.textContent = "Игрок не найден.";
      input?.focus();
      input?.select?.();
      return;
    }

    if (status) status.textContent = `Найден: ${nicknameForRow(match, mode)}`;
    revealRow(match, mode);
  }

  document.addEventListener("click", event => {
    const openButton = event.target.closest("[data-vs-search-open]");
    if (openButton) {
      openSearch(openButton.dataset.vsSearchOpen);
      return;
    }

    if (event.target.closest("#vsFloatingSearch")) {
      openSearch(activeMode());
      return;
    }

    const closeButton = event.target.closest("[data-vs-search-close]");
    if (closeButton) closeSearch(closeButton.closest("[data-vs-search]"));
  });

  document.addEventListener("submit", event => {
    const form = event.target.closest("[data-vs-search]");
    if (!form) return;
    event.preventDefault();
    runSearch(form);
  });

  document.addEventListener("keydown", event => {
    if (!isVsPage()) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "f") {
      event.preventDefault();
      openSearch(activeMode());
      return;
    }

    if (event.key === "Escape") {
      const visible = [...document.querySelectorAll("[data-vs-search]")].find(form => !form.hidden);
      if (visible) {
        event.preventDefault();
        closeSearch(visible);
      }
    }
  });
})();