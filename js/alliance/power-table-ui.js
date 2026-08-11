(() => {
  const TABLE_SELECTOR = ".power-table";

  function dataRows(table) {
    return [...table.tBodies[0]?.rows || []].filter(row => !row.classList.contains("power-inline-editor-row"));
  }

  function compactPowerContent(table) {
    if (!table || table.dataset.powerBulkMode === "true") return;
    const headers = table.querySelectorAll("thead th");
    const powerHeader = headers[3];
    if (powerHeader && powerHeader.dataset.compactLabelReady !== "true") {
      powerHeader.textContent = "1 отряд";
      powerHeader.dataset.compactLabelReady = "true";
    }

    dataRows(table).forEach(row => {
      const cell = row.cells[2];
      if (!cell || cell.dataset.mobileDateReady === "true") return;
      const match = cell.textContent.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (!match) return;
      const full = `${match[1]}.${match[2]}.${match[3]}`;
      const short = `${match[1]}.${match[2]}`;
      cell.dataset.mobileDateReady = "true";
      cell.title = full;
      cell.innerHTML = `<span class="power-date-full">${full}</span><span class="power-date-short" aria-hidden="true">${short}</span>`;
    });
  }

  function scrollSearchMatch(table) {
    const row = table?.querySelector("tbody tr.alliance-table-search-match");
    const wrapper = table?.closest(".power-table-wrap");
    if (!row || !wrapper) return;

    requestAnimationFrame(() => {
      if (!row.isConnected || !wrapper.isConnected) return;
      const rowRect = row.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      const target = wrapper.scrollTop + (rowRect.top - wrapperRect.top) - ((wrapper.clientHeight - rowRect.height) / 2);
      wrapper.scrollTop = Math.max(0, target);
    });
  }

  function setupHeaders(table) {
    if (!table) return;
    compactPowerContent(table);
  }

  function setupCurrentPage() {
    const table = document.querySelector(TABLE_SELECTOR);
    if (!table) return;
    setupHeaders(table);
    scrollSearchMatch(table);
  }

  document.addEventListener("harvesthub:page-loaded", setupCurrentPage);
  new MutationObserver(setupCurrentPage).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-power-bulk-mode", "class"]
  });
  setupCurrentPage();
})();
