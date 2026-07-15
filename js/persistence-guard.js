(() => {
  const ACTIVE_PROFILE_STORAGE_KEY = "harvesthub_active_profile";
  let lastProfileId = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) || "";
  let profileReloadScheduled = false;

  function getCurrentPage() {
    return localStorage.getItem("currentPage") || "";
  }

  function saveCurrentPageState() {
    const page = getCurrentPage();
    if (!page || typeof window.savePageFormState !== "function") return;
    window.savePageFormState(page);
  }

  function isPersistablePageField(target) {
    if (!(target instanceof HTMLElement)) return false;
    if (!target.closest("#page-content")) return false;
    if (!target.matches("input, select, textarea")) return false;
    if (target.dataset.noPersist === "true") return false;

    const type = String(target.type || "").toLowerCase();
    return !["button", "submit", "reset", "hidden", "file"].includes(type);
  }

  function handleDynamicFieldChange(event) {
    if (!isPersistablePageField(event.target)) return;
    saveCurrentPageState();
  }

  function handleProfileChange(event) {
    const nextProfileId = event.detail?.profile?.id || "";

    // Supabase восстанавливает уже активный профиль и повторно отправляет
    // profile-change. Калькуляторы не должны воспринимать это как смену профиля:
    // Турбо/VS иначе сохраняет ещё не восстановленный экран поверх данных профиля.
    if (nextProfileId === lastProfileId) {
      event.stopImmediatePropagation();
      return;
    }

    lastProfileId = nextProfileId;

    // При настоящей смене профиля безопаснее заново инициализировать страницу:
    // старые динамические модули не должны сохранять экран в область нового профиля.
    event.stopImmediatePropagation();

    if (profileReloadScheduled) return;
    profileReloadScheduled = true;

    window.setTimeout(() => {
      window.location.reload();
    }, 0);
  }

  document.addEventListener("input", handleDynamicFieldChange, true);
  document.addEventListener("change", handleDynamicFieldChange, true);

  window.addEventListener("harvesthub:advanced-mode-change", () => {
    window.setTimeout(saveCurrentPageState, 0);
  });

  window.addEventListener("harvesthub:profile-change", handleProfileChange, true);
})();
