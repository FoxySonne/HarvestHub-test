(() => {
  const HIGHLIGHT_CLASS = "alliance-table-search-match";
  const TABLE_SELECTOR = "#page-content .alliance-table";
  const RANK_WEIGHT = { "Р5": 5, "Р4": 4, "Р3": 3, "Р2": 2, "Р1": 1 };
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
    if (table.dataset.allianceStableTableKey) return table.dataset.allianceStableTableKey;
    const tables = [...document.querySelectorAll(TABLE_SELECTOR)];
    const index = Math.max(0, tables.indexOf(table));
    const headers = [...table.querySelectorAll("thead th")]
      .map(header => normalize(header.childNodes[0]?.textContent || header.textContent))
      .join("|");
    const key = `${currentPageName()}::${table.id || index}::${headers}`;
    table.dataset.allianceStableTableKey = key;
    return key;
  }

  function tableId(table) {
    if (!table.dataset.allianceTableId) {
      table.dataset.allianceTableId = `alliance-table-${Math.random().toString(36).slice(2, 9)}`;
    }
    return table.dataset.allianceTableId;
  }

  function tableBySearchId(id) {
    return [...document.querySelectorAll(TABLE_SELECTOR)].find(table => table.dataset.allianceTableId === id) || null;
  }

  function tableWrapper(table) {
    return table.closest(".alliance-table-wrap") || table.parentElement;
  }

  function nicknameColumn(table) {
    const headers = [...table.querySelectorAll("thead th")];
    let index = headers.findIndex(th => /^(участник|никнейм|игрок)$/i.test(th.childNodes[0]?.textContent?.trim() || th.textContent.trim()));
    if (index < 0) index = headers.findIndex(th => /(участник|никнейм|игрок)/i.test(th.textContent));
    return index >= 0 ? index : Math.min(1, headers.length - 1);
  }

  function rowNickname(row, table) {
    const cell = row.cells[nicknameColumn(table)];
    return cell?.querySelector("strong")?.textContent || cell?.textContent || "";
  }

  function rows(table) {
    return [...table.tBodies]
      .flatMap(body => [...body.rows])
      .filter(row => row.cells.length > 1 && !row.classList.contains("power-inline-editor-row"));
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

  function updateSortButtons(table, index, direction) {
    table.querySelectorAll(".alliance-column-sort").forEach(button => {
      button.dataset.direction = "";
      button.setAttribute("aria-pressed", "false");
    });
    const button = table.querySelectorAll("thead th")[index]?.querySelector(".alliance-column-sort");
    if (button) {
      button.dataset.direction = direction;
      button.setAttribute("aria-pressed", "true");
    }
  }

  function sortTable(table, index, direction, updateButton = true) {
    if (!table || table.dataset.powerRowEditing === "true" || table.dataset.powerBulkMode === "true") return;
    const header = table.querySelectorAll("thead th")[index];
    if (!header) return;
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
    sortedRows.forEach(row => body.append(row));
    table.dataset.sortColumn = String(index);
    table.dataset.sortDirection = direction;
    sortState.set(stableTableKey(table), { index, direction });
    if (updateButton) updateSortButtons(table, index, direction);
  }

  function setupSorting(table) {
    const headers = [...table.querySelectorAll("thead th")];
    if (!headers.length) return;
    headers.forEach((header, index) => {
      const label = (header.childNodes[0]?.textContent || header.textContent).trim();
      if (!label || header.querySelector(".alliance-column-sort") || /^(действия)?$/i.test(label)) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "alliance-column-sort";
      button.dataset.column = String(index);
      button.setAttribute("aria-label", `Сортировать по столбцу ${label}`);
      button.setAttribute("aria-pressed", "false");
      header.append(button);
    });

    const saved = sortState.get(stableTableKey(table));
    if (saved) {
      window.setTimeout(() => {
        sortTable(table, saved.index, saved.direction, false);
        updateSortButtons(table, saved.index, saved.direction);
      }, 0);
      return;
    }

    if (!table.dataset.sortInitialized) {
      table.dataset.sortInitialized = "true";
      const nicknameIndex = nicknameColumn(table);
      window.setTimeout(() => {
        sortTable(table, nicknameIndex, "asc", false);
        updateSortButtons(table, nicknameIndex, "asc");
      }, 0);
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
      <input type="search" placeholder="Введите никнейм игрока" autocomplete="off" data-no-persist="true" aria-label="Никнейм игрока" aria-autocomplete="list">
      <button type="submit">Найти</button>
      <button type="button" class="secondary-button" data-alliance-search-close aria-label="Закрыть поиск">×</button>
      <div class="alliance-table-search-results" data-alliance-search-results hidden></div>
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

  function renderSuggestions(form) {
    const table = tableBySearchId(form.dataset.allianceTableSearchFor);
    const input = form.querySelector('input[type="search"]');
    const status = form.querySelector("[data-alliance-search-status]");
    const results = form.querySelector("[data-alliance-search-results]");
    const query = normalize(input?.value);
    if (!table || !results || !query) {
      clearSuggestions(form);
      if (status) status.textContent = query ? "Таблица не найдена." : "Начни вводить никнейм.";
      return [];
    }

    const matches = rankedMatches(table, query);
    if (!matches.length) {
      clearSuggestions(form);
      if (status) status.textContent = "Игроки не найдены.";
      return [];
    }

    results.innerHTML = matches.slice(0, 12).map(({ row, nickname, priority }) => `
      <button type="button" class="alliance-table-search-result" data-alliance-search-result="${rowSearchId(row)}">
        <strong>${nickname.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</strong>
        <small>${priority <= 1 ? "начинается с запроса" : "содержит запрос"}</small>
      </button>`).join("");
    results.hidden = false;
    if (status) status.textContent = `Найдено: ${matches.length}. Сначала показаны совпадения по началу ника.`;
    return matches;
  }

  function chooseResult(form, row) {
    const table = tableBySearchId(form.dataset.allianceTableSearchFor);
    const status = form.querySelector("[data-alliance-search-status]");
    if (!table || !row) return;
    if (status) status.textContent = `Выбран: ${rowNickname(row, table).trim()}`;
    activeTable = table;
    clearSuggestions(form);
    revealRow(row, table);
  }

  function runSearch(form) {
    const table = tableBySearchId(form.dataset.allianceTableSearchFor);
    const input = form.querySelector('input[type="search"]');
    const status = form.querySelector("[data-alliance-search-status]");
    const query = normalize(input?.value);
    if (!table || !query) {
      if (status) status.textContent = "Введите никнейм игрока.";
      input?.focus();
      return;
    }
    const match = rankedMatches(table, query)[0];
    if (!match) {
      if (status) status.textContent = "Игроки не найдены.";
      input?.focus();
      input?.select?.();
      return;
    }
    chooseResult(form, match.row);
  }

  function openSearch(table) {
    if (!table) return;
    activeTable = table;
    createSearchForm(table);
    const form = document.querySelector(`[data-alliance-table-search-for="${CSS.escape(tableId(table))}"]`);
    if (!form) return;
    form.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      const input = form.querySelector('input[type="search"]');
      input?.focus();
      if (input?.value) renderSuggestions(form);
    }, 100);
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
      event.preventDefault();
      const table = sortButton.closest("table");
      const index = Number(sortButton.dataset.column);
      const next = sortButton.dataset.direction === "asc" ? "desc" : "asc";
      sortTable(table, index, next);
      return;
    }

    const resultButton = event.target.closest("[data-alliance-search-result]");
    if (resultButton) {
      const form = resultButton.closest(".alliance-table-search");
      const table = form && tableBySearchId(form.dataset.allianceTableSearchFor);
      chooseResult(form, table && rowBySearchId(table, resultButton.dataset.allianceSearchResult));
      return;
    }

    const trigger = event.target.closest("[data-alliance-search-open]");
    if (trigger) {
      openSearch(tableBySearchId(trigger.dataset.allianceSearchOpen));
      return;
    }

    if (event.target.closest("#allianceFloatingSearch")) {
      openSearch(activeTable?.offsetParent !== null ? activeTable : nearestVisibleTable());
      return;
    }

    const close = event.target.closest("[data-alliance-search-close]");
    if (close) {
      const form = close.closest(".alliance-table-search");
      if (form) {
        clearSuggestions(form);
        form.hidden = true;
      }
    }
  });

  document.addEventListener("input", event => {
    const input = event.target.closest('.alliance-table-search input[type="search"]');
    if (input) renderSuggestions(input.closest(".alliance-table-search"));
  });

  document.addEventListener("keydown", event => {
    const input = event.target.closest?.('.alliance-table-search input[type="search"]');
    if (input && event.key === "ArrowDown") {
      const first = input.closest(".alliance-table-search")?.querySelector("[data-alliance-search-result]");
      if (first) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    const result = event.target.closest?.("[data-alliance-search-result]");
    if (result && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      const buttons = [...result.parentElement.querySelectorAll("[data-alliance-search-result]")];
      const index = buttons.indexOf(result);
      const next = event.key === "ArrowDown" ? buttons[index + 1] : buttons[index - 1];
      if (next) {
        event.preventDefault();
        next.focus();
      }
    }
  });

  document.addEventListener("submit", event => {
    const form = event.target.closest(".alliance-table-search");
    if (!form) return;
    event.preventDefault();
    runSearch(form);
  });

  window.addEventListener("keydown", event => {
    if (!document.querySelector(TABLE_SELECTOR)) return;
    const isFindShortcut = (event.ctrlKey || event.metaKey) && (event.code === "KeyF" || event.key.toLocaleLowerCase() === "f");
    if (isFindShortcut) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openSearch(nearestVisibleTable());
      return;
    }
    if (event.key === "Escape") {
      const form = [...document.querySelectorAll(".alliance-table-search")].find(item => !item.hidden);
      if (form) {
        event.preventDefault();
        clearSuggestions(form);
        form.hidden = true;
      }
    }
  }, true);

  const observer = new MutationObserver(() => {
    clearTimeout(observerTimer);
    observerTimer = window.setTimeout(setupTables, 80);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setupTables();
})();
