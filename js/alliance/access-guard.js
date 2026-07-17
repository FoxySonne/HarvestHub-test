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

  function showMessage(message) {
    const element = getElement("allianceMessage");
    if (!element) return;
    element.hidden = false;
    element.textContent = message;
    element.dataset.type = "error";
  }

  function applyAccessState() {
    scheduled = false;
    if (!document.querySelector(".alliance-page")) return;

    const signedIn = Boolean(session?.user);
    const advanced = hasAdvancedMode();
    const allowed = signedIn && advanced;

    const hint = getElement("allianceAccountHint");
    const management = getElement("allianceManagementCard");
    const accountButton = getElement("allianceAccountButton");
    const advancedButton = getElement("allianceAdvancedModeButton");
    const hintText = getElement("allianceAccessHintText");

    if (management) management.hidden = !allowed;
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
      if (editor) editor.hidden = true;
      if (invite) invite.hidden = true;
    }
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

  document.addEventListener("submit", event => {
    const protectedForms = ["allianceCreateForm", "allianceJoinForm", "participantForm"];
    if (!protectedForms.includes(event.target?.id) || canManageAlliance()) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    showMessage(
      session?.user
        ? "Для создания и редактирования союзного штаба включи продвинутый режим."
        : "Для создания и редактирования союзного штаба войди в аккаунт и включи продвинутый режим."
    );
  }, true);

  document.addEventListener("click", event => {
    const advancedButton = event.target.closest?.("#allianceAdvancedModeButton");
    if (advancedButton) {
      event.preventDefault();
      window.loadPage?.("settings.html");
      return;
    }

    const protectedControl = event.target.closest?.(
      "[data-participant-edit], [data-participant-delete], #allianceCopyCodeButton"
    );
    if (!protectedControl || canManageAlliance()) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    showMessage("Для редактирования союзного штаба включи продвинутый режим.");
  }, true);

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("storage", scheduleApply);
  window.addEventListener("harvesthub:profile-change", refreshSession);
  window.addEventListener("DOMContentLoaded", refreshSession);

  if (window.harvestHubSupabase) {
    window.harvestHubSupabase.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      scheduleApply();
    });
  }

  refreshSession();
})();
