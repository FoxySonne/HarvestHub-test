(() => {
  const PROFILE_ICON = `
    <svg class="account-trigger-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" />
    </svg>`;

  function getProfile() {
    return window.harvestHubAccount?.getProfile?.() || null;
  }

  function renderButton(button, profile) {
    const isMobile = button.classList.contains("topbar-account-trigger");
    button.classList.toggle("has-account-profile", Boolean(profile));

    if (isMobile) {
      const nickname = profile?.nickname || "";
      button.innerHTML = `
        <span class="account-mobile-name">${escapeHtml(nickname)}</span>
        <span class="account-mobile-icon">${PROFILE_ICON}</span>`;
      button.setAttribute("aria-label", profile ? `Открыть профиль ${nickname}` : "Войти или создать профиль");
      button.title = profile ? `Открыть профиль ${nickname}` : "Войти или создать профиль";
      return;
    }

    button.innerHTML = `
      <span class="account-sidebar-icon">${PROFILE_ICON}</span>
      <span class="account-sidebar-content">
        <span class="account-sidebar-title">Профиль</span>
        ${profile ? `<small>${escapeHtml(profile.nickname)}</small>` : ""}
      </span>`;
    button.title = profile ? `Открыть профиль ${profile.nickname}` : "Войти или создать профиль";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderAll() {
    const profile = getProfile();
    document.querySelectorAll("[data-account-button]").forEach(button => renderButton(button, profile));
  }

  const observer = new MutationObserver(() => renderAll());

  function init() {
    renderAll();
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("harvesthub:profile-change", renderAll);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();