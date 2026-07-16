(() => {
  let initialized = false;

  function getProfile() {
    return window.harvestHubAccountStorage.getActiveProfile();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function openAccount() {
    if (getProfile()) window.loadPage?.("profile.html");
    else {
      document.getElementById("accountModal")?.classList.add("is-open");
      document.body.classList.add("account-modal-open");
    }
  }

  function closeAccountModal() {
    document.getElementById("accountModal")?.classList.remove("is-open");
    document.body.classList.remove("account-modal-open");
  }

  function renderDesktopProfileCard(profile) {
    const content = document.getElementById("desktopProfileContent");
    if (!content) return;

    if (!profile) {
      content.innerHTML = `<p class="desktop-profile-text">Сохраняйте данные и используйте их на разных устройствах.</p><button type="button" class="account-trigger desktop-profile-button" data-account-button>Войти или создать профиль</button>`;
      return;
    }

    const status = profile.type === "quick" ? "Быстрый профиль" : "Данные синхронизируются";
    content.innerHTML = `<div class="desktop-profile-user"><strong>${escapeHtml(profile.nickname)}</strong><span>Штат ${escapeHtml(profile.state)}</span></div><p class="desktop-profile-status">${status}</p><button type="button" class="account-trigger desktop-profile-button" data-account-button>Открыть профиль</button>`;
  }

  function renderAccountButtons(profile) {
    renderDesktopProfileCard(profile);
    document.querySelectorAll("[data-account-button]").forEach(button => {
      const desktop = button.classList.contains("desktop-profile-button");
      button.textContent = desktop
        ? (profile ? "Открыть профиль" : "Войти или создать профиль")
        : (profile ? profile.nickname : "Профиль");
      button.title = profile ? `Открыть профиль ${profile.nickname}` : "Войти или создать профиль";
    });
  }

  function renderMobileProfile(profile) {
    const group = document.getElementById("topbarProfileGroup");
    const name = document.getElementById("topbarProfileName");
    const button = group?.querySelector(".topbar-account-trigger");
    if (!group || !name || !button) return;

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

  function render() {
    const profile = getProfile();
    renderAccountButtons(profile);
    renderMobileProfile(profile);
  }

  function scheduleRender() {
    window.setTimeout(render, 0);
    window.setTimeout(render, 100);
    window.setTimeout(render, 400);
  }

  function init() {
    if (initialized) return;
    initialized = true;

    document.addEventListener("click", event => {
      const button = event.target.closest("[data-account-button]");
      if (!button) return;
      event.preventDefault();
      openAccount();
    });

    window.addEventListener("harvesthub:profile-change", scheduleRender);
    window.addEventListener("harvesthub:account-profile-render", scheduleRender);
    scheduleRender();
    window.setTimeout(render, 1000);
  }

  window.harvestHubAccountUI = {
    open: openAccount,
    close: closeAccountModal,
    render,
    init
  };
})();
