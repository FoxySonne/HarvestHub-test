(() => {
  const STORAGE_PREFIX = "harvesthub_vs_draft_v1";
  const AUTOSAVE_INTERVAL = 60_000;
  const dirty = new Set();

  function byId(id) {
    return document.getElementById(id);
  }

  function allianceId() {
    return localStorage.getItem("harvesthub_active_alliance_id") || "unknown";
  }

  function storageKey() {
    return `${STORAGE_PREFIX}:${allianceId()}`;
  }

  function selectedWeek() {
    return window.harvestHubVsSelectedWeekStart || byId("vsWeekDate")?.value || "";
  }

  function readDraft() {
    try {
      return JSON.parse(localStorage.getItem(storageKey()) || "null") || {};
    } catch {
      return {};
    }
  }

  function writeDraft(draft) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(draft));
      updateStatus(draft.savedAt);
    } catch {
      updateStatus(null, "Не удалось сохранить черновик на устройстве");
    }
  }

  function bulkModeActive() {
    return document.querySelector("#vsCurrentTableContainer .vs-table")?.dataset.vsBulkMode === "true";
  }

  function bulkCellKey(input) {
    const row = input.closest("[data-vs-bulk-participant]");
    return row ? `${row.dataset.vsBulkParticipant}:${input.dataset.vsBulkDay}` : "";
  }

  function collectBulkValues() {
    const values = [];
    document.querySelectorAll("#vsTableBody [data-vs-bulk-day]").forEach(input => {
      const key = bulkCellKey(input);
      if (!key || !dirty.has(key)) return;
      const row = input.closest("[data-vs-bulk-participant]");
      values.push({
        participantId: row.dataset.vsBulkParticipant,
        day: input.dataset.vsBulkDay,
        value: input.value
      });
    });
    return values;
  }

  function saveBulkNow() {
    if (!bulkModeActive() || !dirty.size) return;
    const week = selectedWeek();
    if (!week) return;
    const values = collectBulkValues();
    if (!values.length) return;

    const draft = readDraft();
    const bulkByWeek = { ...(draft.bulkByWeek || {}) };
    const savedAt = new Date().toISOString();
    bulkByWeek[week] = { values, savedAt };
    writeDraft({ ...draft, bulkByWeek, savedAt });
  }

  function restoreBulk() {
    if (!bulkModeActive()) return;
    const week = selectedWeek();
    const entry = readDraft()?.bulkByWeek?.[week];
    if (!entry) {
      updateStatus();
      return;
    }

    entry.values.forEach(item => {
      const row = document.querySelector(`#vsTableBody [data-vs-bulk-participant="${CSS.escape(item.participantId)}"]`);
      const input = row?.querySelector(`[data-vs-bulk-day="${CSS.escape(String(item.day))}"]`);
      if (!input || input.disabled) return;
      input.value = item.value;
      dirty.add(`${item.participantId}:${item.day}`);
    });
    updateStatus(entry.savedAt, "Локальный черновик восстановлен");
  }

  function clearBulk(week = selectedWeek()) {
    const draft = readDraft();
    const bulkByWeek = { ...(draft.bulkByWeek || {}) };
    delete bulkByWeek[week];
    dirty.clear();

    if (Object.keys(bulkByWeek).length) {
      localStorage.setItem(storageKey(), JSON.stringify({ ...draft, bulkByWeek }));
    } else {
      localStorage.removeItem(storageKey());
    }
    updateStatus();
  }

  function updateStatus(savedAt, text = "") {
    const status = document.querySelector("[data-vs-draft-status]");
    if (!status) return;
    if (text) {
      status.textContent = text;
      return;
    }
    if (!savedAt) {
      status.textContent = "";
      return;
    }
    const time = new Date(savedAt);
    status.textContent = `Черновик сохранён на устройстве в ${time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  }

  function focusRelative(input, direction) {
    const day = input.dataset.vsBulkDay;
    const rows = [...document.querySelectorAll("#vsTableBody [data-vs-bulk-participant]")];
    const currentRow = input.closest("[data-vs-bulk-participant]");
    const currentIndex = rows.indexOf(currentRow);
    if (currentIndex < 0) return;

    for (let index = currentIndex + direction; index >= 0 && index < rows.length; index += direction) {
      const next = rows[index].querySelector(`[data-vs-bulk-day="${CSS.escape(String(day))}"]:not(:disabled)`);
      if (!next) continue;
      next.focus();
      next.select();
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
  }

  document.addEventListener("input", event => {
    if (!event.target.matches?.("#vsTableBody [data-vs-bulk-day]")) return;
    const key = bulkCellKey(event.target);
    if (key) dirty.add(key);
  });

  document.addEventListener("keydown", event => {
    const input = event.target.closest?.("#vsTableBody [data-vs-bulk-day]");
    if (!input || event.key !== "Enter" || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    const key = bulkCellKey(input);
    if (key) dirty.add(key);
    saveBulkNow();
    focusRelative(input, event.shiftKey ? -1 : 1);
  });

  document.addEventListener("harvesthub:vs-bulk-opened", () => {
    dirty.clear();
    window.setTimeout(restoreBulk, 30);
  });

  document.addEventListener("harvesthub:vs-bulk-saved", event => {
    clearBulk(event.detail?.weekStart || selectedWeek());
  });

  document.addEventListener("harvesthub:page-loaded", event => {
    if (event.detail?.pageName !== "alliance/vs.html") dirty.clear();
  });

  window.addEventListener("pagehide", saveBulkNow);
  window.setInterval(saveBulkNow, AUTOSAVE_INTERVAL);

  window.harvestHubVsDraft = {
    saveBulkNow,
    restoreBulk,
    clearBulk
  };
})();
