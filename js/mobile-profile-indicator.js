(() => {
  function getProfile() {
    return window.harvestHubAccount?.getProfile?.()
      || (typeof window.getActiveProfile === "function" ? window.getActiveProfile() : null);
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
      button.removeAttribute("data-mobile-profile-id");
      button.innerHTML = profileIcon();
      button.title = "Войти или создать профиль";
      button.setAttribute("aria-label", "Войти или создать профиль");
      return;
    }

    const profileId = String(profile.id || profile.nickname || "profile");
    const sameProfile = button.dataset.mobileProfileId === profileId
      && button.querySelector(".topbar-sync-status")
      && button.querySelector(".topbar-profile-name")
      && button.querySelector(".topbar-profile-icon");

    button.classList.add("has-mobile-profile");
    button.dataset.mobileProfileId = profileId;

    if (!sameProfile) {
      button.innerHTML = `
        <span class="topbar-sync-status" aria-hidden="true"></span>
        <span class="topbar-profile-name"></span>
        ${profileIcon()}
      `;
    }

    const name = button.querySelector(".topbar-profile-name");
    if (name) name.textContent = profile.nickname || "Профиль";

    button.title = `Открыть профиль ${profile.nickname}`;
    button.setAttribute("aria-label", `Открыть профиль ${profile.nickname}`);

    window.setTimeout(() => window.harvestHubSyncStatus?.refresh?.(), 0);
    window.setTimeout(() => window.harvestHubSyncStatus?.refresh?.(), 200);
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