(() => {
  const STORAGE_PREFIX = "harvesthub_vs_draft_v1";
  const AUTOSAVE_INTERVAL = 60_000;
  let currentForm = null;
  let lastMessage = "";
  let dirtyRegular = false;
  const dirtyBulk = new Set();

  function byId(id) {
    return document.getElementById(id);
  }

  function allianceId() {
    return localStorage.getItem("harvesthub_active_alliance_id") || "unknown";
  }

  function storageKey() {
    return `${STORAGE_PREFIX}:${allianceId()}`;
  }

  function readDraft() {
    try {
      return JSON.parse(localStorage.getItem(storageKey()) || "null");
    } catch {
      return null;
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

  function removeDraftSection(section) {
    const draft = readDraft();
    if (!draft) return;
    delete draft[section];
    if (!draft.regular && !draft.bulk) localStorage.removeItem(storageKey());
    else localStorage.setItem(storageKey(), JSON.stringify(draft));
    updateStatus();
  }

  function collectRegular() {
    if (!dirtyRegular) return null;
    const participant = byId("vsParticipant");
    const date = byId("vsResultDate");
    const points = byId("vsPoints");
    const vacation = byId("vsVacation");
    if (!participant || !date || !points || !vacation) return null;
    return {
      participantId: participant.value,
      resultDate: date.value,
      points: points.value,
      vacation: vacation.checked
    };
  }

  function bulkCellKey(input) {
    const row = input.closest("[data-vs-bulk-participant]");
    return row ? `${row.dataset.vsBulkParticipant}:${input.dataset.vsBulkDay}` : "";
  }

  function collectBulk() {
    const card = byId("vsBulkCard");
    if (!card || card.hidden || !dirtyBulk.size) return null;
    const values = [];
    card.querySelectorAll("[data-vs-bulk-day]").forEach(input => {
      const key = bulkCellKey(input);
      if (!key || !dirtyBulk.has(key)) return;
      const row = input.closest("[data-vs-bulk-participant]");
      values.push({
        participantId: row.dataset.vsBulkParticipant,
        day: input.dataset.vsBulkDay,
        value: input.value
      });
    });
    if (!values.length) return null;
    return {
      week: byId("vsBulkWeekLabel")?.textContent || "",
      values
    };
  }

  function saveDraft() {
    if (!byId("vsResultForm")) return;
    const existing = readDraft() || {};
    const regular = collectRegular();
    const bulk = collectBulk();
    if (!regular && !bulk) return;
    const draft = { ...existing, savedAt: new Date().toISOString() };
    if (regular) draft.regular = regular;
    if (bulk) draft.bulk = bulk;
    writeDraft(draft);
  }

  function restoreRegular(draft) {
    const regular = draft?.regular;
    const participant = byId("vsParticipant");
    const date = byId("vsResultDate");
    const points = byId("vsPoints");
    const vacation = byId("vsVacation");
    if (!regular || !participant || !date || !points || !vacation) return;
    if (regular.resultDate !== date.value) return;
    if ([...participant.options].some(option => option.value === regular.participantId)) participant.value = regular.participantId;
    points.value = regular.points || "";
    vacation.checked = Boolean(regular.vacation);
    points.disabled = vacation.checked;
    dirtyRegular = true;
  }

  function restoreBulk(draft) {
    const bulk = draft?.bulk;
    const card = byId("vsBulkCard");
    if (!bulk || !card || card.hidden) return;
    if (bulk.week !== (byId("vsBulkWeekLabel")?.textContent || "")) return;
    bulk.values.forEach(item => {
      const row = card.querySelector(`[data-vs-bulk-participant="${CSS.escape(item.participantId)}"]`);
      const input = row?.querySelector(`[data-vs-bulk-day="${CSS.escape(String(item.day))}"]`);
      if (!input || input.disabled) return;
      input.value = item.value;
      dirtyBulk.add(`${item.participantId}:${item.day}`);
    });
  }

  function restoreDraft() {
    const draft = readDraft();
    if (!draft || !byId("vsResultForm")) return;
    restoreRegular(draft);
    restoreBulk(draft);
    updateStatus(draft.savedAt, "Локальный черновик восстановлен");
  }

  function ensureStatus() {
    const bulkActions = document.querySelector(".vs-bulk-actions");
    const regularActions = byId("vsResultForm")?.querySelector(".alliance-actions");
    [regularActions, bulkActions].forEach(container => {
      if (!container || container.querySelector("[data-vs-draft-status]")) return;
      const status = document.createElement("small");
      status.dataset.vsDraftStatus = "true";
      status.className = "vs-draft-status";
      container.append(status);
    });
  }

  function updateStatus(savedAt, text) {
    ensureStatus();
    let label = text || "";
    if (!label && savedAt) {
      const time = new Date(savedAt);
      label = `Черновик сохранён на устройстве в ${time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
    }
    document.querySelectorAll("[data-vs-draft-status]").forEach(status => {
      status.textContent = label;
    });
  }

  function handleSuccessMessage() {
    const message = byId("allianceMessage")?.textContent || "";
    if (!message || message === lastMessage) return;
    lastMessage = message;
    if (message === "Результат сохранён.") {
      dirtyRegular = false;
      removeDraftSection("regular");
    }
    if (message === "Результаты недели сохранены.") {
      dirtyBulk.clear();
      removeDraftSection("bulk");
    }
  }

  function detectPage() {
    const form = byId("vsResultForm");
    if (!form) {
      currentForm = null;
      return;
    }
    ensureStatus();
    handleSuccessMessage();
    if (form === currentForm) return;
    currentForm = form;
    lastMessage = "";
    dirtyRegular = false;
    dirtyBulk.clear();
    setTimeout(restoreDraft, 100);
  }

  document.addEventListener("input", event => {
    if (event.target.closest("#vsResultForm")) dirtyRegular = true;
    if (event.target.matches("[data-vs-bulk-day]")) {
      const key = bulkCellKey(event.target);
      if (key) dirtyBulk.add(key);
    }
  });

  document.addEventListener("change", event => {
    if (event.target.closest("#vsResultForm")) dirtyRegular = true;
  });

  document.addEventListener("click", event => {
    if (event.target.closest("#vsBulkOpen")) setTimeout(restoreDraft, 150);
  });

  window.addEventListener("pagehide", saveDraft);
  setInterval(saveDraft, AUTOSAVE_INTERVAL);
  setInterval(detectPage, 1000);
  detectPage();
})();