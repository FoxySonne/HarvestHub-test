(() => {
  let session = null;
  let scheduled = false;

  function getElement(id) {
    return document.getElementById(id);
  }

  function hasAdvancedMode() {
    return typeof window.getAdvancedMode === "function" && window.getAdvancedMode() === true;
  }

  function canManageAlliance() {
    return Boolean(session?.user) && hasAdvancedMode();
  }

  function isOwner() {
    return getElement("allianceSessionRole")?.textContent?.trim() === "Владелец";
  }

  function showMessage(message, type = "error") {
    const element = getElement("allianceMessage");
    if (!element) return;
    element.hidden = false;
    element.textContent = message;
    element.dataset.type = type;
    element.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function setBusy(button, busy, text) {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = text;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  function syncDetailsEditor() {
    const card = getElement("allianceDetailsEditorCard");
    const canEdit = canManageAlliance() && isOwner();
    if (card) card.hidden = !canEdit;
    if (!canEdit) return;

    const nameInput = getElement("allianceEditName");
    const stateInput = getElement("allianceEditState");
    const shownName = getElement("allianceOpenedName")?.textContent?.trim() || "";
    const shownState = getElement("allianceOpenedState")?.textContent?.replace(/^Штат\s*/i, "").trim() || "";

    if (nameInput && document.activeElement !== nameInput && !nameInput.value) nameInput.value = shownName === "—" ? "" : shownName;
    if (stateInput && document.activeElement !== stateInput && !stateInput.value) stateInput.value = shownState;
  }

  function applyAccessState() {
    scheduled = false;
    if (!document.querySelector(".alliance-page")) return;

    const signedIn = Boolean(session?.user);
    const advanced = hasAdvancedMode();
    const allowed = signedIn && advanced;
    const dataArea = getElement("allianceDataArea");
    const hasOpenedAlliance = Boolean(dataArea && !dataArea.hidden);

    const hint = getElement("allianceAccountHint");
    const management = getElement("allianceManagementCard");
    const accountButton = getElement("allianceAccountButton");
    const advancedButton = getElement("allianceAdvancedModeButton");
    const hintText = getElement("allianceAccessHintText");

    if (management) management.hidden = !allowed || hasOpenedAlliance;
    if (hint) hint.hidden = allowed;
    if (accountButton) accountButton.hidden = signedIn;
    if (advancedButton) advancedButton.hidden = !signedIn || advanced;

    if (hintText) {
      hintText.textContent = signedIn
        ? "Для создания штаба и изменения данных включи продвинутый режим в настройках. Просмотр по пригласительному коду остаётся доступен."
        : "Для создания штаба и изменения данных необходим полноценный аккаунт HarvestHub и включённый продвинутый режим.";
    }

    if (!allowed) {
      const editor = getElement("participantEditorCard");
      const invite = getElement("allianceInviteBox");
      const details = getElement("allianceDetailsEditorCard");
      if (editor) editor.hidden = true;
      if (invite) invite.hidden = true;
      if (details) details.hidden = true;
    }

    syncDetailsEditor();
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(applyAccessState);
  }

  async function refreshSession() {
    if (!window.harvestHubSupabase) {
      session = null;
      scheduleApply();
      return;
    }

    const { data } = await window.harvestHubSupabase.auth.getSession();
    session = data.session || null;
    scheduleApply();
  }

  async function createAlliance(event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (!canManageAlliance()) {
      showMessage(session?.user
        ? "Для создания союзного штаба включи продвинутый режим."
        : "Для создания союзного штаба войди в аккаунт и включи продвинутый режим.");
      return;
    }

    const name = getElement("allianceCreateName")?.value.trim() || "";
    const stateNumber = getElement("allianceCreateState")?.value.trim() || "";
    const button = event.submitter || event.target.querySelector("button[type='submit']");

    if (!name) return showMessage("Укажи название союза.");
    setBusy(button, true, "Создаём…");

    try {
      const { data, error } = await window.harvestHubSupabase.rpc("create_alliance_hub", {
        alliance_name: name,
        alliance_state_number: stateNumber
      });
      if (error) throw error;
      if (!data) throw new Error("Supabase не вернул идентификатор созданного штаба.");

      localStorage.setItem("harvesthub_active_alliance_id", data);
      event.target.reset();
      showMessage("Союзный штаб создан.", "success");
      await window.loadPage?.("alliance/members.html");
    } catch (error) {
      console.error("Не удалось создать союзный штаб", error);
      const message = String(error?.message || "");
      showMessage(message.includes("create_alliance_hub")
        ? "В Supabase ещё не подключена функция создания штаба. Выполни SQL-файл 003_alliance_create_rpc.sql."
        : message || "Не удалось создать союзный штаб.");
      setBusy(button, false);
    }
  }

  async function updateAllianceDetails(event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (!canManageAlliance() || !isOwner()) {
      showMessage("Изменять название и номер штата может только владелец штаба в продвинутом режиме.");
      return;
    }

    const allianceId = localStorage.getItem("harvesthub_active_alliance_id") || "";
    const name = getElement("allianceEditName")?.value.trim() || "";
    const stateNumber = getElement("allianceEditState")?.value.trim() || "";
    const button = event.submitter || event.target.querySelector("button[type='submit']");

    if (!allianceId) return showMessage("Не удалось определить текущий союзный штаб.");
    if (!name) return showMessage("Укажи название союза.");

    setBusy(button, true, "Сохраняем…");
    try {
      const { error } = await window.harvestHubSupabase
        .from("alliances")
        .update({ name, state_number: stateNumber })
        .eq("id", allianceId);
      if (error) throw error;

      const openedName = getElement("allianceOpenedName");
      const openedState = getElement("allianceOpenedState");
      if (openedName) openedName.textContent = name;
      if (openedState) openedState.textContent = stateNumber ? `Штат ${stateNumber}` : "";
      showMessage("Данные союза обновлены.", "success");
    } catch (error) {
      console.error("Не удалось обновить данные союза", error);
      showMessage(error?.message || "Не удалось обновить данные союза.");
    } finally {
      setBusy(button, false);
    }
  }

  document.addEventListener("submit", event => {
    if (event.target?.id === "allianceCreateForm") {
      createAlliance(event);
      return;
    }
    if (event.target?.id === "allianceDetailsForm") {
      updateAllianceDetails(event);
      return;
    }

    const protectedForms = ["allianceJoinForm", "participantForm"];
    if (!protectedForms.includes(event.target?.id) || canManageAlliance()) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    showMessage(session?.user
      ? "Для создания и редактирования союзного штаба включи продвинутый режим."
      : "Для создания и редактирования союзного штаба войди в аккаунт и включи продвинутый режим.");
  }, true);

  document.addEventListener("click", event => {
    const advancedButton = event.target.closest?.("#allianceAdvancedModeButton");
    if (advancedButton) {
      event.preventDefault();
      window.loadPage?.("settings.html");
      return;
    }

    const protectedControl = event.target.closest?.("[data-participant-edit], [data-participant-delete], #allianceCopyCodeButton");
    if (!protectedControl || canManageAlliance()) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    showMessage("Для редактирования союзного штаба включи продвинутый режим.");
  }, true);

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden"] });

  window.addEventListener("storage", scheduleApply);
  window.addEventListener("harvesthub:profile-change", refreshSession);
  window.addEventListener("harvesthub:advanced-mode-change", scheduleApply);
  window.addEventListener("DOMContentLoaded", refreshSession);

  if (window.harvestHubSupabase) {
    window.harvestHubSupabase.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      scheduleApply();
    });
  }

  refreshSession();
})();
