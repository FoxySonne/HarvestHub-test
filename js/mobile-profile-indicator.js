(() => {
  function getProfile() {
    return window.harvestHubAccount?.getProfile?.()
      || (typeof window.getActiveProfile === "function" ? window.getActiveProfile() : null);
  }

  function render() {
    const group = document.getElementById("topbarProfileGroup");
    const name = document.getElementById("topbarProfileName");
    const button = group?.querySelector(".topbar-account-trigger");
    if (!group || !name || !button) return;

    const profile = getProfile();

    if (!profile) {
      group.classList.remove("has-mobile-profile");
      name.textContent = "";
      button.title = "Войти или создать профиль";
      button.setAttribute("aria-label", "Войти или создать профиль");
      return;
    }

    group.classList.add("has-mobile-profile");
    name.textContent = profile.nickname || "Профиль";
    button.title = `Открыть профиль ${profile.nickname}`;
    button.setAttribute("aria-label", `Открыть профиль ${profile.nickname}`);

    window.setTimeout(() => window.harvestHubSyncStatus?.refresh?.(), 0);
  }

  function scheduleRender() {
    window.setTimeout(render, 0);
    window.setTimeout(render, 100);
    window.setTimeout(render, 400);
  }

  window.addEventListener("harvesthub:profile-change", scheduleRender);
  window.addEventListener("harvesthub:account-profile-render", scheduleRender);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleRender, { once: true });
  } else {
    scheduleRender();
  }
})();