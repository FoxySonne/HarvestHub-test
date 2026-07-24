(() => {
  const STORAGE_PREFIX = "harvesthub_vs_draft_v1";
  const AUTOSAVE_INTERVAL = 60_000;
  let intervalId = null;
  let observer = null;
  let restoreTimer = null;

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
    else writeDraft(draft);
    updateStatus();
  }

  function collectRegular() {
    const participant = byId("vsParticipant");
    const date = byId("vsResultDate");
    const points = byId("vsPoints");
    const vacation = byId("vsVacation");
    if (!participant || !date || !points || !vacation) return null;
    if (!points.value.trim() && !vacation.checked) return null;
    return {
      participantId: participant.value,
      resultDate: date.value,
      points: points.value,
      vacation: vacation.checked
    };
  }

  function collectBulk() {
    const card = byId("vsBulkCard");
    if (!card || card.hidden) return null;
    const values = [];
    card.querySelectorAll("[data-vs-bulk-participant]").forEach(row => {
      row.querySelectorAll("[data-vs-bulk-day]").forEach(input => {
        if (!input.value.trim()) return;
        values.push({
          participantId: row.dataset.vsBulkParticipant,
          day: input.dataset.vsBulkDay,
          value: input.value
        });
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
    const draft = {
      ...existing,
      savedAt: new Date().toISOString()
    };
    if (regular) draft.regular = regular;
    if (bulk) draft.bulk = bulk;
    if (!regular && !bulk && !existing.regular && !existing.bulk) return;
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
  }

  function restoreBulk(draft) {
    const bulk = draft?.bulk;
    const card = byId("vsBulkCard");
    if (!bulk || !card || card.hidden) return;
    if (bulk.week !== (byId("vsBulkWeekLabel")?.textContent || "")) return;
    bulk.values.forEach(item => {
      const row = card.querySelector(`[data-vs-bulk-participant="${CSS.escape(item.participantId)}"]`);
      const input = row?.querySelector(`[data-vs-bulk-day="${CSS.escape(String(item.day))}"]`);
      if (input && !input.disabled) input.value = item.value;
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
    if (message === "Результат сохранён.") removeDraftSection("regular");
    if (message === "Результаты недели сохранены.") removeDraftSection("bulk");
  }

  function scheduleRestore() {
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(restoreDraft, 50);
  }

  function start() {
    if (!byId("vsResultForm")) return;
    ensureStatus();
    scheduleRestore();
    clearInterval(intervalId);
    intervalId = setInterval(saveDraft, AUTOSAVE_INTERVAL);
  }

  document.addEventListener("input", event => {
    if (event.target.closest("#vsResultForm, #vsBulkCard")) saveDraft();
  });

  document.addEventListener("change", event => {
    if (event.target.closest("#vsResultForm, #vsBulkCard")) saveDraft();
  });

  window.addEventListener("pagehide", saveDraft);

  observer = new MutationObserver(() => {
    start();
    scheduleRestore();
    handleSuccessMessage();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  start();
})();