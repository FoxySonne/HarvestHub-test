(() => {
  const TABLE_SELECTOR = ".power-table";
  const HEADER_SORT_KEYS = ["place", "nickname", "date", "power", "previous", "week", "month", "season", "percent"];

  function normalize(value) {
    return String(value || "").trim().toLocaleLowerCase("ru-RU");
  }

  function parseNumber(value) {
    const match = String(value || "").replace(/\s/g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  }

  function parseDate(value) {
    const match = String(value || "").match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    return match ? Number(`${match[3]}${match[2].padStart(2, "0")}${match[1].padStart(2, "0")}`) : 0;
  }

  function valueFor(row, index) {
    const text = row.cells[index]?.textContent || "";
    if (index === 1) return normalize(row.cells[index]?.querySelector("strong")?.textContent || text);
    if (index === 2) return parseDate(text);
    return parseNumber(text);
  }

  function dataRows(table) {
    return [...table.tBodies[0]?.rows || []].filter(row => !row.classList.contains("power-inline-editor-row"));
  }

  function updatePlaces(table) {
    dataRows(table).forEach((row, index) => {
      if (row.cells[0]) row.cells[0].textContent = String(index + 1);
    });
  }

  function updateHeaders(table, activeIndex, direction) {
    [...table.querySelectorAll("thead th")].forEach((header, index) => {
      header.classList.toggle("is-power-sort-active", index === activeIndex);
      header.dataset.powerSortDirection = index === activeIndex ? direction : "";
    });
  }

  function applySort(table, index, direction) {
    if (table.dataset.powerBulkMode === "true" || table.dataset.powerRowEditing === "true") return;
    const body = table.tBodies[0];
    if (!body) return;
    const rows = dataRows(table);
    rows.sort((a, b) => {
      const left = valueFor(a, index);
      const right = valueFor(b, index);
      const result = typeof left === "string" ? left.localeCompare(right, "ru", { numeric: true }) : left - right;
      return direction === "asc" ? result : -result;
    });
    rows.forEach(row => body.append(row));
    table.dataset.powerSortColumn = String(index);
    table.dataset.powerSortDirection = direction;
    updatePlaces(table);
    updateHeaders(table, index, direction);
  }

  function clearBulkHeaderState(table) {
    table.querySelectorAll("thead th").forEach(header => {
      header.classList.remove("is-power-sortable", "is-power-sort-active");
      header.removeAttribute("tabindex");
      header.removeAttribute("role");
      header.removeAttribute("aria-label");
      header.dataset.powerSortDirection = "";
    });
  }

  function setupHeaders(table) {
    if (!table) return;
    if (table.dataset.powerBulkMode === "true") {
      clearBulkHeaderState(table);
      return;
    }

    [...table.querySelectorAll("thead th")].forEach((header, index) => {
      if (!HEADER_SORT_KEYS[index] || header.dataset.powerSortReady === "true") return;
      header.dataset.powerSortReady = "true";
      header.classList.add("is-power-sortable");
      header.tabIndex = 0;
      header.setAttribute("role", "button");
      header.setAttribute("aria-label", `Сортировать по столбцу ${header.textContent.trim()}`);
      const run = () => {
        if (table.dataset.powerBulkMode === "true" || table.dataset.powerRowEditing === "true") return;
        const currentColumn = Number(table.dataset.powerSortColumn);
        const currentDirection = table.dataset.powerSortDirection || "desc";
        const direction = currentColumn === index && currentDirection === "desc" ? "asc" : "desc";
        applySort(table, index, direction);
      };
      header.addEventListener("click", run);
      header.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        run();
      });
    });
  }

  function setupCurrentPage() {
    const table = document.querySelector(TABLE_SELECTOR);
    if (table) setupHeaders(table);
  }

  document.addEventListener("harvesthub:page-loaded", setupCurrentPage);
  new MutationObserver(setupCurrentPage).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-power-bulk-mode"] });
  setupCurrentPage();
})();
