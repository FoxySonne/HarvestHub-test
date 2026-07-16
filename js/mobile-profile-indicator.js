(() => {
  function getProfile() {
    return window.harvestHubAccount?.getProfile?.()
      || (typeof window.getActiveProfile === "function" ? window.getActiveProfile() : null);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function profileIcon() {
    return `<span class="topbar-profile-icon" aria-hidden="true"></span>`;
  }

  function render() {
    const button = document.querySelector(".topbar-account-trigger");
    if (!button) return;

    const profile = getProfile();

    if (!profile) {
      button.classList.remove("has-mobile-profile");
      button.innerHTML = profileIcon();
      button.title = "Войти или создать профиль";
      button.setAttribute("aria-label", "Войти или создать профиль");
      return;
    }

    button.classList.add("has-mobile-profile");
    button.innerHTML = `
      <span class="topbar-sync-status" aria-hidden="true"></span>
      <span class="topbar-profile-name">${escapeHtml(profile.nickname)}</span>
      ${profileIcon()}
    `;
    button.title = `Открыть профиль ${profile.nickname}`;
    button.setAttribute("aria-label", `Открыть профиль ${profile.nickname}`);

    window.setTimeout(() => window.harvestHubSyncStatus?.refresh?.(), 0);
  }

  function scheduleRender() {
    window.setTimeout(render, 0);
    window.setTimeout(render, 150);
    window.setTimeout(render, 600);
  }

  window.addEventListener("harvesthub:profile-change", scheduleRender);
  window.addEventListener("harvesthub:account-profile-render", scheduleRender);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleRender, { once: true });
  } else {
    scheduleRender();
  }
})();
