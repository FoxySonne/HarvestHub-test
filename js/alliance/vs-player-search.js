(() => {
  const HIGHLIGHT_CLASS = "alliance-table-search-match";
  const TABLE_SELECTOR = ".alliance-subpage .alliance-table";
  const RANK_WEIGHT = { "Р5": 5, "Р4": 4, "Р3": 3, "Р2": 2, "Р1": 1 };
  let highlightTimer = null;
  let activeTable = null;
  let observerTimer = null;

  function normalize(value) {
    return String(value || "").trim().toLocaleLowerCase("ru-RU");
  }

  function tableId(table) {
    if (!table.dataset.allianceTableId) {
      table.dataset.allianceTableId = `alliance-table-${Math.random().toString(36).slice(2, 9)}`;
    }
    return table.dataset.allianceTableId;
  }

  function tableWrapper(table) {
    return table.closest(".alliance-table-wrap") || table.parentElement;
  }

  function nicknameColumn(table) {
    const headers = [...table.querySelectorAll("thead th")];
    let index = headers.findIndex(th => /^(участник|никнейм|игрок)$/i.test(th.textContent.trim()));
    if (index < 0) index = headers.findIndex(th => /(участник|никнейм|игрок)/i.test(th.textContent));
    return index >= 0 ? index : Math.min(1, headers.length - 1);
  }

  function rowNickname(row, table) {
    const cell = row.cells[nicknameColumn(table)];
    return cell?.querySelector("strong")?.textContent || cell?.textContent || "";
  }

  function rows(table) {
    return [...table.tBodies].flatMap(body => [...body.rows]).filter(row => row.cells.length > 1);
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
    if (/(место|сила|очки|сумма|прирост|выполнено|пн|вт|ср|чт|пт|сб|дни|недел|месяц|сезон|%)/i.test(text)) return "number";
    if (text.includes("дата") || text.includes("день рождения")) return "date";
    return "text";
  }

  function cellSortValue(row, index, type) {
    const text = row.cells[index]?.textContent?.trim() || "";
    if (type === "rank") return RANK_WEIGHT[text.split(/\s+/)[0]] || 0;
    if (type === "number") return parseCompactNumber(text);
    if (type === "date") {
      const parts = text.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/);
      return parts ? Number(`${parts[3] || 2000}${String(parts[2]).padStart(2, "0")}${String(parts[1]).padStart(2, "0")}`) : 0;
    }
    return normalize(text);
  }

  function sortTable(table, index, direction, updateButton = true) {
    const header = table.querySelectorAll("thead th")[index];
    if (!header) return;
    const type = columnType(header.textContent);
    const currentRows = rows(table);
    const sortedRows = [...currentRows].sort((a, b) => {
      const left = cellSortValue(a, index, type);
      const right = cellSortValue(b, index, type);
      const result = typeof left === "string" ? left.localeCompare(right, "ru", { numeric: true }) : left - right;
      return direction === "asc" ? result : -result;
    });
    const body = table.tBodies[0];
    if (!body) return;
    if (sortedRows.some((row, rowIndex) => row !== currentRows[rowIndex])) {
      sortedRows.forEach(row => body.append(row));
    }
    table.dataset.sortColumn = String(index);
    table.dataset.sortDirection = direction;

    if (updateButton) {
      table.querySelectorAll(".alliance-column-sort").forEach(button => {
        button.dataset.direction = "";
        button.setAttribute("aria-pressed", "false");
      });
      const button = header.querySelector(".alliance-column-sort");
      if (button) {
        button.dataset.direction = direction;
        button.setAttribute("aria-pressed", "true");
      }
    }
  }

  function setupSorting(table) {
    const headers = [...table.querySelectorAll("thead th")];
    if (!headers.length) return;
    headers.forEach((header, index) => {
      const label = header.textContent.trim();
      if (!label || header.querySelector(".alliance-column-sort") || /^(действия)?$/i.test(label)) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "alliance-column-sort";
      button.dataset.column = String(index);
      button.setAttribute("aria-label", `Сортировать по столбцу ${label}`);
      button.setAttribute("aria-pressed", "false");
      header.append(button);
    });

    if (!table.dataset.sortInitialized) {
      table.dataset.sortInitialized = "true";
      const nicknameIndex = nicknameColumn(table);
      window.setTimeout(() => sortTable(table, nicknameIndex, "asc"), 0);
      return;
    }

    if (table.dataset.sortColumn !== undefined) {
      window.setTimeout(() => sortTable(table, Number(table.dataset.sortColumn), table.dataset.sortDirection || "asc", false), 0);
    }
  }

  function createSearchForm(table) {
    const wrapper = tableWrapper(table);
    if (!wrapper || document.querySelector(`[data-alliance-table-search-for="${CSS.escape(tableId(table))}"]`)) return;

    const form = document.createElement("form");
    form.className = "alliance-table-search";
    form.dataset.allianceTableSearchFor = tableId(table);
    form.hidden = true;
    form.innerHTML = `
      <input type="search" placeholder="Введите никнейм игрока" autocomplete="off" data-no-persist="true" aria-label="Никнейм игрока">
      <button type="submit">Найти</button>
      <button type="button" class="secondary-button" data-alliance-search-close aria-label="Закрыть поиск">×</button>
      <small data-alliance-search-status></small>`;
    wrapper.before(form);

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "secondary-button alliance-table-search-trigger";
    trigger.dataset.allianceSearchOpen = tableId(table);
    trigger.setAttribute("aria-label", "Найти игрока");

    const controls = form.previousElementSibling;
    if (controls?.classList?.contains("alliance-actions") || controls?.classList?.contains("vs-table-controls") || controls?.classList?.contains("alliance-roster-tools")) {
      controls.append(trigger);
    } else {
      const toolbar = document.createElement("div");
      toolbar.className = "alliance-table-search-toolbar";
      toolbar.append(trigger);
      form.before(toolbar);
    }
  }

  function hideOldControls() {
    ["participantSearch", "participantSort", "vsSort"].forEach(id => {
      const element = document.getElementById(id);
      if (!element) return;
      const label = element.closest("label");
      (label || element).hidden = true;
    });
  }

  function setupTables() {
    hideOldControls();
    document.querySelectorAll(TABLE_SELECTOR).forEach(table => {
      setupSorting(table);
      createSearchForm(table);
    });
    ensureFloatingButton();
  }

  function clearHighlight() {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(row => row.classList.remove(HIGHLIGHT_CLASS));
    clearTimeout(highlightTimer);
  }

  function revealRow(row, table) {
    clearHighlight();
    row.classList.add(HIGHLIGHT_CLASS);
    row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    const wrapper = tableWrapper(table);
    if (wrapper) wrapper.scrollLeft = 0;
    window.setTimeout(() => {
      const input = [...row.querySelectorAll("input, select, textarea")].find(field => !field.disabled && field.offsetParent !== null);
      input?.focus({ preventScroll: true });
      input?.select?.();
    }, 450);
    highlightTimer = window.setTimeout(clearHighlight, 2600);
  }

  function runSearch(form) {
    const table = document.querySelector(`${TABLE_SELECTOR}[data-alliance-table-id="${CSS.escape(form.dataset.allianceTableSearchFor)}"]`);
    const input = form.querySelector('input[type="search"]');
    const status = form.querySelector("[data-alliance-search-status]");
    const query = normalize(input?.value);
    if (!table || !query) {
      if (status) status.textContent = "Введите никнейм игрока.";
      input?.focus();
      return;
    }
    const allRows = rows(table);
    const exact = allRows.find(row => normalize(rowNickname(row, table)) === query);
    const partial = allRows.find(row => normalize(rowNickname(row, table)).includes(query));
    const match = exact || partial;
    if (!match) {
      if (status) status.textContent = "Игрок не найден.";
      input?.focus();
      input?.select?.();
      return;
    }
    if (status) status.textContent = `Найден: ${rowNickname(match, table).trim()}`;
    activeTable = table;
    revealRow(match, table);
  }

  function openSearch(table) {
    if (!table) return;
    activeTable = table;
    const form = document.querySelector(`[data-alliance-table-search-for="${CSS.escape(tableId(table))}"]`);
    if (!form) return;
    form.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => form.querySelector('input[type="search"]')?.focus(), 250);
  }

  function nearestVisibleTable() {
    const visible = [...document.querySelectorAll(TABLE_SELECTOR)].filter(table => table.offsetParent !== null);
    if (!visible.length) return null;
    const center = window.innerHeight / 2;
    return visible.sort((a, b) => Math.abs(a.getBoundingClientRect().top - center) - Math.abs(b.getBoundingClientRect().top - center))[0];
  }

  function ensureFloatingButton() {
    const hasTables = Boolean(document.querySelector(TABLE_SELECTOR));
    let button = document.getElementById("allianceFloatingSearch");
    if (!button && hasTables) {
      button = document.createElement("button");
      button.id = "allianceFloatingSearch";
      button.type = "button";
      button.className = "alliance-floating-search";
      button.setAttribute("aria-label", "Найти игрока");
      document.body.append(button);
    }
    if (button) button.hidden = !hasTables;
  }

  document.addEventListener("click", event => {
    const sortButton = event.target.closest(".alliance-column-sort");
    if (sortButton) {
      const table = sortButton.closest("table");
      const index = Number(sortButton.dataset.column);
      const next = sortButton.dataset.direction === "asc" ? "desc" : "asc";
      sortTable(table, index, next);
      return;
    }

    const trigger = event.target.closest("[data-alliance-search-open]");
    if (trigger) {
      const table = document.querySelector(`${TABLE_SELECTOR}[data-alliance-table-id="${CSS.escape(trigger.dataset.allianceSearchOpen)}"]`);
      openSearch(table);
      return;
    }

    if (event.target.closest("#allianceFloatingSearch")) {
      openSearch(activeTable?.offsetParent !== null ? activeTable : nearestVisibleTable());
      return;
    }

    const close = event.target.closest("[data-alliance-search-close]");
    if (close) {
      const form = close.closest(".alliance-table-search");
      if (form) form.hidden = true;
    }
  });

  document.addEventListener("submit", event => {
    const form = event.target.closest(".alliance-table-search");
    if (!form) return;
    event.preventDefault();
    runSearch(form);
  });

  document.addEventListener("keydown", event => {
    if (!document.querySelector(TABLE_SELECTOR)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "f") {
      event.preventDefault();
      openSearch(nearestVisibleTable());
      return;
    }
    if (event.key === "Escape") {
      const form = [...document.querySelectorAll(".alliance-table-search")].find(item => !item.hidden);
      if (form) {
        event.preventDefault();
        form.hidden = true;
      }
    }
  });

  const observer = new MutationObserver(() => {
    clearTimeout(observerTimer);
    observerTimer = window.setTimeout(setupTables, 80);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setupTables();
})();