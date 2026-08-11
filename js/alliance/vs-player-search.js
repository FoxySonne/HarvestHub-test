(() => {
  const HIGHLIGHT_CLASS = "alliance-table-search-match";
  const TABLE_SELECTOR = "#page-content .data-table";
  const SEARCHABLE_TABLE_SELECTOR = "#page-content .alliance-subpage .data-table";
  const RANK_WEIGHT = { "Р5": 5, "Р4": 4, "Р3": 3, "Р2": 2, "Р1": 1 };
  const LEGACY_CONTROL_IDS = [
    "participantSearch",
    "participantSort",
    "powerSearch",
    "powerSort",
    "reservoirSearch",
    "vsSort",
    "vsStatsSearch",
    "vsStatsSort"
  ];
  const NON_SORTABLE_HEADER = /^(?:№|место|позиция|действие|действия)$/i;
  const sortState = new Map();
  let highlightTimer = null;
  let activeTable = null;
  let observerTimer = null;

  function normalize(value) {
    return String(value || "").trim().toLocaleLowerCase("ru-RU");
  }

  function currentPageName() {
    return window.harvestHubNavigation?.getCurrentPage?.() || localStorage.getItem("currentPage") || "alliance";
  }

  function stableTableKey(table) {
    const tables = [...document.querySelectorAll(TABLE_SELECTOR)];
    const index = Math.max(0, tables.indexOf(table));
    const headers = [...table.querySelectorAll("thead th")]
      .map(header => normalize(header.childNodes[0]?.textContent || header.textContent))
      .join("|");
    return `${currentPageName()}::${table.id || index}::${headers}`;
  }

  function tableId(table) {
    if (!table.dataset.allianceTableId) {
      table.dataset.allianceTableId = `alliance-table-${Math.random().toString(36).slice(2, 9)}`;
    }
    return table.dataset.allianceTableId;
  }

  function tableBySearchId(id) {
    return [...document.querySelectorAll(SEARCHABLE_TABLE_SELECTOR)]
      .find(table => table.dataset.allianceTableId === id) || null;
  }

  function tableWrapper(table) {
    return table.closest(".data-table-wrap") || table.parentElement;
  }

  function nicknameColumn(table) {
    const headers = [...table.querySelectorAll("thead th")];
    let index = headers.findIndex(th => /^(участник|никнейм|игрок)$/i.test(th.childNodes[0]?.textContent?.trim() || th.textContent.trim()));
    if (index < 0) index = headers.findIndex(th => /(участник|никнейм|игрок)/i.test(th.textContent));
    return index;
  }

  function rowNickname(row, table) {
    const cell = row.cells[nicknameColumn(table)];
    return cell?.querySelector("strong")?.textContent || cell?.textContent || "";
  }

  function rows(table) {
    return [...table.querySelectorAll("tbody > tr")]
      .filter(row => row.cells.length > 1
        && !row.classList.contains("power-inline-editor-row")
        && !row.classList.contains("vs-inline-editor-row"));
  }

  function rowSearchId(row) {
    if (!row.dataset.allianceSearchRowId) {
      row.dataset.allianceSearchRowId = `alliance-row-${Math.random().toString(36).slice(2, 10)}`;
    }
    return row.dataset.allianceSearchRowId;
  }

  function rowBySearchId(table, id) {
    return rows(table).find(row => row.dataset.allianceSearchRowId === id) || null;
  }

  function parseCompactNumber(value) {
    const text = String(value || "").replace(/\s/g, "").replace(",", ".").toUpperCase();
    if (!text || text === "—" || text === "-") return 0;
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) return 0;
    const number = Number(match[0]);
    const multiplier = text.includes("Т") || text.includes("T") ? 1e12
      : text.includes("В") || text.includes("B") ? 1e9
      : text.includes("М") || text.includes("M") ? 1e6
      : text.includes("К") || text.includes("K") ? 1e3
      : 1;
    return Number.isFinite(number) ? number * multiplier : 0;
  }

  function columnType(headerText) {
    const text = normalize(headerText);
    if (text.includes("ранг")) return "rank";
    if (/(дата|неделя|день рождения|регистрация|окончание|время)/i.test(text)) return "date";
    if (/(место|сила|очки|сумма|прирост|выполнено|сч[её]т|количество|всего|процент|%|пн|вт|ср|чт|пт|сб|дни|месяц|сезон)/i.test(text)) return "number";
    return "text";
  }

  function cellText(cell) {
    if (!cell) return "";
    if (cell.dataset.sortValue !== undefined) return cell.dataset.sortValue;
    const select = cell.querySelector("select");
    if (select) return select.selectedOptions[0]?.textContent || select.value;
    const input = cell.querySelector('input:not([type="checkbox"]), textarea');
    if (input) return input.value;
    return cell.querySelector("strong")?.textContent || cell.textContent || "";
  }

  function parseDateValue(value) {
    const text = String(value || "").trim();
    const iso = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return Number(`${iso[1]}${String(iso[2]).padStart(2, "0")}${String(iso[3]).padStart(2, "0")}`);
    const date = text.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/);
    if (date) return Number(`${date[3] || 2000}${String(date[2]).padStart(2, "0")}${String(date[1]).padStart(2, "0")}`);
    const time = text.match(/(\d{1,2})(?::(\d{2}))?/);
    return time ? Number(time[1]) * 60 + Number(time[2] || 0) : 0;
  }

  function cellSortValue(row, index, type) {
    const text = cellText(row.cells[index]).trim();
    if (type === "rank") return RANK_WEIGHT[text.split(/\s+/)[0]] || 0;
    if (type === "number") return parseCompactNumber(text);
    if (type === "date") return parseDateValue(text);
    return normalize(text);
  }

  function sortingBlocked(table) {
    return table?.dataset.powerRowEditing === "true"
      || table?.dataset.powerBulkMode === "true"
      || table?.dataset.vsBulkMode === "true";
  }

  function columnHasSortableValues(table, index) {
    const currentRows = rows(table);
    if (!currentRows.length) return true;
    return currentRows.some(row => {
      const cell = row.cells[index];
      if (!cell) return false;
      return !/^(?:|—|-)$/.test(cellText(cell).trim());
    });
  }

  function sortableHeader(table, header, index) {
    const label = (header.childNodes[0]?.textContent || header.textContent).trim();
    return label
      && !NON_SORTABLE_HEADER.test(label)
      && !header.hasAttribute("data-no-sort")
      && columnHasSortableValues(table, index);
  }

  function updateSortHeaders(table, index, direction) {
    table.querySelectorAll("thead th").forEach((header, headerIndex) => {
      const active = headerIndex === index && header.classList.contains("data-table-sortable");
      header.classList.toggle("data-table-sort-active", active);
      const sortDirection = active ? direction : "";
      if (header.dataset.tableSortDirection !== sortDirection) header.dataset.tableSortDirection = sortDirection;
      if (header.classList.contains("data-table-sortable")) {
        const ariaSort = active ? (direction === "asc" ? "ascending" : "descending") : "none";
        if (header.getAttribute("aria-sort") !== ariaSort) header.setAttribute("aria-sort", ariaSort);
      } else {
        header.removeAttribute("aria-sort");
      }
    });
  }

  function updatePlaces(table) {
    const headers = [...table.querySelectorAll("thead th")];
    const placeIndex = headers.findIndex(header => /^место$/i.test((header.childNodes[0]?.textContent || header.textContent).trim()));
    if (placeIndex < 0) return;
    rows(table).forEach((row, index) => {
      const cell = row.cells[placeIndex];
      const place = String(index + 1);
      if (cell && cell.textContent !== place) cell.textContent = place;
    });
  }

  function sortTable(table, index, direction, remember = true) {
    if (!table || sortingBlocked(table)) return;
    const header = table.querySelectorAll("thead th")[index];
    if (!header || !header.classList.contains("data-table-sortable")) return;
    const type = columnType(header.childNodes[0]?.textContent || header.textContent);
    const currentRows = rows(table);
    const sortedRows = [...currentRows].sort((a, b) => {
      const left = cellSortValue(a, index, type);
      const right = cellSortValue(b, index, type);
      const result = typeof left === "string" ? left.localeCompare(right, "ru", { numeric: true }) : left - right;
      return direction === "asc" ? result : -result;
    });
    const body = table.tBodies[0];
    if (!body) return;
    const orderChanged = sortedRows.some((row, rowIndex) => currentRows[rowIndex] !== row);
    if (orderChanged) sortedRows.forEach(row => body.append(row));
    table.dataset.sortColumn = String(index);
    table.dataset.sortDirection = direction;
    if (remember) sortState.set(stableTableKey(table), { index, direction });
    updatePlaces(table);
    updateSortHeaders(table, index, direction);
  }

  function clearSortingHeaders(table) {
    table.querySelectorAll("thead th").forEach(header => {
      header.classList.remove("data-table-sortable", "data-table-sort-active");
      header.removeAttribute("tabindex");
      header.removeAttribute("role");
      header.removeAttribute("aria-label");
      header.removeAttribute("aria-sort");
      delete header.dataset.tableSortColumn;
      delete header.dataset.tableSortDirection;
    });
  }

  function setupSorting(table) {
    const headers = [...table.querySelectorAll("thead th")];
    if (!headers.length) return;
    if (sortingBlocked(table)) {
      clearSortingHeaders(table);
      return;
    }
    headers.forEach((header, index) => {
      const label = (header.childNodes[0]?.textContent || header.textContent).trim();
      if (!sortableHeader(table, header, index)) {
        header.classList.remove("data-table-sortable", "data-table-sort-active");
        header.removeAttribute("tabindex");
        header.removeAttribute("role");
        header.removeAttribute("aria-label");
        header.removeAttribute("aria-sort");
        delete header.dataset.tableSortColumn;
        delete header.dataset.tableSortDirection;
        return;
      }
      header.classList.add("data-table-sortable");
      if (header.dataset.tableSortColumn !== String(index)) header.dataset.tableSortColumn = String(index);
      if (header.tabIndex !== 0) header.tabIndex = 0;
      if (header.getAttribute("role") !== "button") header.setAttribute("role", "button");
      const ariaLabel = `Сортировать по столбцу ${label}`;
      if (header.getAttribute("aria-label") !== ariaLabel) header.setAttribute("aria-label", ariaLabel);
    });

    const saved = sortState.get(stableTableKey(table));
    const initialIndex = Number(table.dataset.sortInitialColumn);
    const state = saved || (Number.isInteger(initialIndex) && initialIndex >= 0
      ? { index: initialIndex, direction: table.dataset.sortInitialDirection === "asc" ? "asc" : "desc" }
      : null);
    if (state && headers[state.index]?.classList.contains("data-table-sortable")) {
      window.setTimeout(() => sortTable(table, state.index, state.direction, Boolean(saved)), 0);
    }
    else {
      if (saved) sortState.delete(stableTableKey(table));
      delete table.dataset.sortColumn;
      delete table.dataset.sortDirection;
      updateSortHeaders(table, -1, "");
    }
  }

  function createSearchForm(table) {
    if (nicknameColumn(table) < 0) return;
    const wrapper = tableWrapper(table);
    if (!wrapper || document.querySelector(`[data-alliance-table-search-for="${CSS.escape(tableId(table))}"]`)) return;

    const form = document.createElement("form");
    form.className = "alliance-table-search";
    form.dataset.allianceTableSearchFor = tableId(table);
    form.dataset.allianceSearchIndex = "-1";
    form.dataset.allianceSearchQuery = "";
    form.setAttribute("role", "search");
    form.hidden = true;
    form.innerHTML = `
      <input type="search" placeholder="Найти игрока" autocomplete="off" data-no-persist="true" aria-label="Никнейм игрока" aria-autocomplete="list">
      <small data-alliance-search-status aria-live="polite">0/0</small>
      <button type="button" class="secondary-button alliance-table-search-nav" data-alliance-search-prev aria-label="Предыдущее совпадение">↑</button>
      <button type="button" class="secondary-button alliance-table-search-nav" data-alliance-search-next aria-label="Следующее совпадение">↓</button>
      <button type="button" class="secondary-button alliance-table-search-close" data-alliance-search-close aria-label="Закрыть поиск">×</button>
      <div class="alliance-table-search-results" data-alliance-search-results hidden></div>`;
    wrapper.before(form);

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "secondary-button alliance-table-search-trigger";
    trigger.dataset.allianceSearchOpen = tableId(table);
    trigger.setAttribute("aria-label", "Найти игрока");
    trigger.setAttribute("aria-expanded", "false");

    const toolbar = document.createElement("div");
    toolbar.className = "alliance-table-search-toolbar";
    toolbar.append(trigger);
    form.before(toolbar);
  }

  function hideOldControls() {
    LEGACY_CONTROL_IDS.forEach(id => {
      const element = document.getElementById(id);
      if (!element) return;
      const label = element.closest("label");
      const control = label || element;
      control.hidden = true;
      control.classList.add("alliance-table-legacy-control");
      control.setAttribute("aria-hidden", "true");
    });
  }

  function setupTables() {
    hideOldControls();
    document.querySelectorAll(TABLE_SELECTOR).forEach(table => {
      setupSorting(table);
    });
    document.querySelectorAll(SEARCHABLE_TABLE_SELECTOR).forEach(createSearchForm);
  }

  function clearHighlight() {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(row => row.classList.remove(HIGHLIGHT_CLASS));
    clearTimeout(highlightTimer);
  }

  function verticalScrollContainer(row) {
    let node = row.parentElement;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2) return node;
      node = node.parentElement;
    }
    return null;
  }

  function scrollRowIntoView(row) {
    const scroller = verticalScrollContainer(row);
    if (!scroller) {
      row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      return;
    }
    const rowRect = row.getBoundingClientRect();
    const scrollRect = scroller.getBoundingClientRect();
    const target = scroller.scrollTop + (rowRect.top - scrollRect.top) - ((scroller.clientHeight - rowRect.height) / 2);
    scroller.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }

  function revealRow(row, table) {
    clearHighlight();
    row.classList.add(HIGHLIGHT_CLASS);
    scrollRowIntoView(row);
    const wrapper = tableWrapper(table);
    if (wrapper) wrapper.scrollTo({ left: 0, behavior: "smooth" });
    window.setTimeout(() => {
      const input = [...row.querySelectorAll("input, select, textarea")].find(field => !field.disabled && field.offsetParent !== null);
      input?.focus({ preventScroll: true });
      input?.select?.();
    }, 450);
    highlightTimer = window.setTimeout(clearHighlight, 2600);
  }

  function matchPriority(nickname, query) {
    const normalized = normalize(nickname);
    if (normalized === query) return 0;
    if (normalized.startsWith(query)) return 1;
    if (normalized.split(/[\s._\-]+/).some(part => part.startsWith(query))) return 2;
    return normalized.includes(query) ? 3 : 99;
  }

  function rankedMatches(table, query) {
    return rows(table)
      .map(row => ({ row, nickname: rowNickname(row, table).trim() }))
      .map(item => ({ ...item, priority: matchPriority(item.nickname, query) }))
      .filter(item => item.priority < 99)
      .sort((a, b) => a.priority - b.priority || a.nickname.localeCompare(b.nickname, "ru", { numeric: true }));
  }

  function clearSuggestions(form) {
    const results = form.querySelector("[data-alliance-search-results]");
    if (!results) return;
    results.hidden = true;
    results.innerHTML = "";
  }

  function suggestionButtons(form) {
    return [...form.querySelectorAll("[data-alliance-search-result]")];
  }

  function focusSuggestion(form, index) {
    const buttons = suggestionButtons(form);
    const button = buttons[index];
    if (!button) return false;
    button.focus();
    button.scrollIntoView({ block: "nearest" });
    return true;
  }

  function renderSuggestions(form) {
    const table = tableBySearchId(form.dataset.allianceTableSearchFor);
    const input = form.querySelector('input[type="search"]');
    const status = form.querySelector("[data-alliance-search-status]");
    const results = form.querySelector("[data-alliance-search-results]");
    const query = normalize(input?.value);
    form.dataset.allianceSearchIndex = "-1";
    form.dataset.allianceSearchQuery = query;
    if (!table || !results || !query) {
      clearSuggestions(form);
      if (status) status.textContent = "0/0";
      return [];
    }

    const matches = rankedMatches(table, query);
    if (!matches.length) {
      clearSuggestions(form);
      if (status) status.textContent = "0/0";
      return [];
    }

    results.innerHTML = matches.slice(0, 12).map(({ row, nickname }) => `
      <button type="button" class="alliance-table-search-result" data-alliance-search-result="${rowSearchId(row)}">
        <strong>${nickname.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</strong>
      </button>`).join("");
    results.hidden = false;
    if (status) status.textContent = `0/${matches.length}`;
    return matches;
  }

  function chooseResult(form, row, index = -1, total = 0) {
    const table = tableBySearchId(form.dataset.allianceTableSearchFor);
    const status = form.querySelector("[data-alliance-search-status]");
    if (!table || !row) return;
    if (index >= 0) form.dataset.allianceSearchIndex = String(index);
    if (status) status.textContent = index >= 0 && total ? `${index + 1}/${total}` : "1/1";
    activeTable = table;
    clearSuggestions(form);
    revealRow(row, table);
  }

  function runSearch(form, direction = 1) {
    const table = tableBySearchId(form.dataset.allianceTableSearchFor);
    const input = form.querySelector('input[type="search"]');
    const status = form.querySelector("[data-alliance-search-status]");
    const query = normalize(input?.value);
    if (!table || !query) {
      if (status) status.textContent = "0/0";
      input?.focus();
      return;
    }
    const matches = rankedMatches(table, query);
    if (!matches.length) {
      if (status) status.textContent = "0/0";
      input?.focus();
      input?.select?.();
      return;
    }
    const sameQuery = form.dataset.allianceSearchQuery === query;
    let index = sameQuery ? Number(form.dataset.allianceSearchIndex || -1) : -1;
    index = direction < 0
      ? (index <= 0 ? matches.length - 1 : index - 1)
      : (index + 1) % matches.length;
    form.dataset.allianceSearchQuery = query;
    chooseResult(form, matches[index].row, index, matches.length);
  }

  function openSearch(table) {
    if (!table) return;
    activeTable = table;
    createSearchForm(table);
    document.querySelectorAll(".alliance-table-search").forEach(item => {
      if (item.dataset.allianceTableSearchFor !== tableId(table)) {
        item.hidden = true;
        document.querySelector(`[data-alliance-search-open="${CSS.escape(item.dataset.allianceTableSearchFor)}"]`)?.setAttribute("aria-expanded", "false");
      }
    });
    const form = document.querySelector(`[data-alliance-table-search-for="${CSS.escape(tableId(table))}"]`);
    if (!form) return;
    form.hidden = false;
    document.querySelector(`[data-alliance-search-open="${CSS.escape(tableId(table))}"]`)?.setAttribute("aria-expanded", "true");
    window.setTimeout(() => {
      const input = form.querySelector('input[type="search"]');
      input?.focus();
      input?.select?.();
      if (input?.value) renderSuggestions(form);
    }, 0);
  }

  function nearestVisibleTable() {
    const visible = [...document.querySelectorAll(SEARCHABLE_TABLE_SELECTOR)]
      .filter(table => nicknameColumn(table) >= 0 && table.offsetParent !== null);
    if (!visible.length) return null;
    const center = window.innerHeight / 2;
    return visible.sort((a, b) => Math.abs(a.getBoundingClientRect().top - center) - Math.abs(b.getBoundingClientRect().top - center))[0];
  }

  document.addEventListener("click", event => {
    const sortHeader = event.target.closest("th.data-table-sortable");
    const otherInteractiveTarget = event.target.closest("button, a, input, select, textarea");
    if (sortHeader && !otherInteractiveTarget) {
      event.preventDefault();
      const table = sortHeader.closest("table");
      const index = Number(sortHeader.dataset.tableSortColumn);
      const next = table.dataset.sortColumn === String(index) && table.dataset.sortDirection === "desc" ? "asc" : "desc";
      sortTable(table, index, next);
      return;
    }

    const resultButton = event.target.closest("[data-alliance-search-result]");
    if (resultButton) {
      const form = resultButton.closest(".alliance-table-search");
      const table = form && tableBySearchId(form.dataset.allianceTableSearchFor);
      const row = table && rowBySearchId(table, resultButton.dataset.allianceSearchResult);
      const query = normalize(form?.querySelector('input[type="search"]')?.value);
      const matches = table && query ? rankedMatches(table, query) : [];
      const index = row ? matches.findIndex(item => item.row === row) : -1;
      chooseResult(form, row, index, matches.length);
      return;
    }

    const trigger = event.target.closest("[data-alliance-search-open]");
    if (trigger) {
      openSearch(tableBySearchId(trigger.dataset.allianceSearchOpen));
      return;
    }

    const previous = event.target.closest("[data-alliance-search-prev]");
    if (previous) {
      runSearch(previous.closest(".alliance-table-search"), -1);
      return;
    }

    const next = event.target.closest("[data-alliance-search-next]");
    if (next) {
      runSearch(next.closest(".alliance-table-search"), 1);
      return;
    }

    const close = event.target.closest("[data-alliance-search-close]");
    if (close) {
      const form = close.closest(".alliance-table-search");
      if (form) {
        clearSuggestions(form);
        form.hidden = true;
        document.querySelector(`[data-alliance-search-open="${CSS.escape(form.dataset.allianceTableSearchFor)}"]`)?.setAttribute("aria-expanded", "false");
      }
    }
  });

  document.addEventListener("input", event => {
    const input = event.target.closest('.alliance-table-search input[type="search"]');
    if (input) renderSuggestions(input.closest(".alliance-table-search"));
  });

  document.addEventListener("keydown", event => {
    const sortHeader = event.target.closest?.("th.data-table-sortable");
    if (sortHeader && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      const table = sortHeader.closest("table");
      const index = Number(sortHeader.dataset.tableSortColumn);
      const next = table.dataset.sortColumn === String(index) && table.dataset.sortDirection === "desc" ? "asc" : "desc";
      sortTable(table, index, next);
      return;
    }

    const input = event.target.closest?.('.alliance-table-search input[type="search"]');
    if (input && (event.key === "ArrowDown" || event.key === "ArrowUp" || (event.key === "Tab" && !event.shiftKey))) {
      const form = input.closest(".alliance-table-search");
      const buttons = suggestionButtons(form);
      const index = event.key === "ArrowUp" ? buttons.length - 1 : 0;
      if (focusSuggestion(form, index)) {
        event.preventDefault();
      }
      return;
    }

    const result = event.target.closest?.("[data-alliance-search-result]");
    if (result && event.key === "Enter") {
      event.preventDefault();
      result.click();
      return;
    }

    if (result && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Tab")) {
      const form = result.closest(".alliance-table-search");
      const buttons = suggestionButtons(form);
      const index = buttons.indexOf(result);
      const step = event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey) ? -1 : 1;
      const nextIndex = index + step;
      if (focusSuggestion(form, nextIndex)) {
        event.preventDefault();
      } else if (nextIndex < 0) {
        event.preventDefault();
        form.querySelector('input[type="search"]')?.focus();
      } else if (event.key !== "Tab") {
        event.preventDefault();
      }
    }
  });

  document.addEventListener("submit", event => {
    const form = event.target.closest(".alliance-table-search");
    if (!form) return;
    event.preventDefault();
  });

  window.addEventListener("keydown", event => {
    if (!document.querySelector(SEARCHABLE_TABLE_SELECTOR)) return;
    const isFindShortcut = (event.ctrlKey || event.metaKey)
      && (event.code === "KeyF" || String(event.key || "").toLocaleLowerCase("ru-RU") === "f");
    if (isFindShortcut) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openSearch((activeTable && activeTable.offsetParent !== null) ? activeTable : nearestVisibleTable());
      return;
    }
    if (event.key === "Escape") {
      const form = [...document.querySelectorAll(".alliance-table-search")].find(item => !item.hidden);
      if (form) {
        event.preventDefault();
        clearSuggestions(form);
        form.hidden = true;
        document.querySelector(`[data-alliance-search-open="${CSS.escape(form.dataset.allianceTableSearchFor)}"]`)?.setAttribute("aria-expanded", "false");
      }
    }
  }, true);

  const observer = new MutationObserver(() => {
    clearTimeout(observerTimer);
    observerTimer = window.setTimeout(setupTables, 80);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("harvesthub:page-loaded", () => requestAnimationFrame(setupTables));
  window.harvestHubTableSorting = {
    refresh(table) {
      if (table) setupSorting(table);
      else document.querySelectorAll(TABLE_SELECTOR).forEach(setupSorting);
    }
  };
  setupTables();
})();
