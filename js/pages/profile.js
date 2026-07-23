function escapeProfileHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function maskProfileEmail(email) {
  return email ? email.replace(/^(.{2}).*(@.*)$/, "$1***$2") : "";
}

function formatProfileDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(date);
}

function getAdvancedAccessStore() {
  return window.harvestHubAdvancedAccessStore || null;
}

async function getAdvancedAccessStatus() {
  const manager = window.harvestHubAdvancedModeAccess;
  if (!manager) return { loaded: true, hasAccess: false, isAdmin: false };
  try {
    return await manager.refresh();
  } catch {
    return manager.getStatus?.() || { loaded: true, hasAccess: false, isAdmin: false };
  }
}

function renderAdvancedModeSwitch({ checked = false, disabled = false, statusText = "" } = {}) {
  return `
    <label class="profile-access-switch-row">
      <span class="profile-access-switch-copy">
        <strong>Продвинутый режим</strong>
        <small>${escapeProfileHtml(statusText)}</small>
      </span>
      <span class="ipk-switch">
        <input id="profileAdvancedModeToggle" type="checkbox" data-no-persist="true" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
        <span class="ipk-switch-track"><span class="ipk-switch-thumb">✓</span></span>
      </span>
    </label>`;
}

function renderQuickProfileAccessCard() {
  return `
    <aside class="profile-side-column">
      <section class="profile-access-card">
        ${renderAdvancedModeSwitch({ disabled: true, statusText: "Требуется зарегистрированный аккаунт" })}
        <p class="profile-access-description">Продвинутый режим открывает отслеживание игрового прогресса, создание и использование союзного штаба и дополнительные возможности калькуляторов.</p>
        <button type="button" class="profile-access-request" data-account-button>Войти или создать аккаунт</button>
      </section>
    </aside>`;
}

function renderAccountAccessCard(status, summary = {}) {
  if (status.isAdmin) {
    if (typeof window.setAdvancedMode === "function") window.setAdvancedMode(true);
    const requestCount = Number(summary.pendingRequests) || 0;
    return `
      <aside class="profile-side-column">
        <section class="profile-access-card">
          ${renderAdvancedModeSwitch({ checked: true, disabled: true, statusText: "Включён постоянно для владельца сайта" })}
          <p class="profile-access-owner-note">Доступ владельца бессрочный.</p>
          <div class="profile-access-owner-actions">
            <button type="button" data-advanced-admin-page="requests">Заявки${requestCount ? ` (${requestCount})` : ""}</button>
            <button type="button" data-advanced-admin-page="search">Выдать доступ</button>
            <button type="button" data-advanced-admin-page="granted">Проверить список</button>
          </div>
        </section>
      </aside>`;
  }

  if (status.hasAccess) {
    const enabled = typeof window.getAdvancedMode === "function" && window.getAdvancedMode();
    const expiration = status.expiresOn ? `Доступ действует до ${formatProfileDate(status.expiresOn)} включительно.` : "Доступ выдан бессрочно.";
    return `
      <aside class="profile-side-column">
        <section class="profile-access-card">
          ${renderAdvancedModeSwitch({ checked: enabled, statusText: "Доступ активен" })}
          <p class="profile-access-description">Продвинутый режим открывает отслеживание игрового прогресса, создание и использование союзного штаба и дополнительные возможности калькуляторов.</p>
          <p class="profile-access-status">${escapeProfileHtml(expiration)}</p>
        </section>
      </aside>`;
  }

  return `
    <aside class="profile-side-column">
      <section class="profile-access-card">
        ${renderAdvancedModeSwitch({ disabled: true, statusText: status.isExpired ? "Срок доступа закончился" : "Доступ пока не выдан" })}
        <p class="profile-access-description">Продвинутый режим открывает отслеживание собственного игрового прогресса, создание и использование союзного штаба и полезные дополнительные возможности в калькуляторах.</p>
        ${status.requestStatus === "pending"
          ? '<p class="profile-access-status">Заявка ожидает одобрения</p>'
          : '<button type="button" class="profile-access-request" id="requestAdvancedAccessButton">Оставить заявку</button>'}
      </section>
    </aside>`;
}

function renderQuickProfile(container, profile) {
  container.innerHTML = `
    <div class="profile-layout">
      <div class="profile-main-column">
        <header class="profile-hero">
          <p class="profile-eyebrow">Быстрый профиль</p>
          <h1>${escapeProfileHtml(profile.nickname)}</h1>
          <p class="profile-state">Штат ${escapeProfileHtml(profile.state)}</p>
        </header>
        <p class="account-warning profile-warning">Данные этого профиля хранятся только на текущем устройстве. Для синхронизации между устройствами создайте полноценный профиль.</p>
        <div class="profile-page-actions"><button type="button" id="profileLogoutButton">Выйти</button></div>
      </div>
      ${renderQuickProfileAccessCard()}
    </div>`;
}

function renderGameProfileCards(profiles, activeProfileId) {
  return profiles.map(profile => {
    const active = profile.id === activeProfileId;
    return `
      <article class="game-profile-card${active ? " is-active" : ""}">
        <div class="game-profile-card-copy">
          <div class="game-profile-card-title">
            <h3>${escapeProfileHtml(profile.nickname)}</h3>
            ${profile.is_primary ? '<span class="game-profile-badge">Основной</span>' : ""}
            ${active ? '<span class="game-profile-badge is-active">Выбран</span>' : ""}
          </div>
          <p>Штат ${escapeProfileHtml(profile.state)}</p>
        </div>
        <div class="game-profile-actions">
          ${active
            ? '<button type="button" class="game-profile-select" disabled>Используется</button>'
            : `<button type="button" class="game-profile-select" data-game-profile-select="${escapeProfileHtml(profile.id)}">Переключиться</button>`}
          ${profile.is_primary
            ? ""
            : `<button type="button" class="game-profile-delete danger-button" data-game-profile-delete="${escapeProfileHtml(profile.id)}" data-game-profile-name="${escapeProfileHtml(profile.nickname)}">Удалить</button>`}
        </div>
      </article>`;
  }).join("");
}

function renderAccountProfile(container, accountProfile, profiles, accessStatus, accessSummary) {
  const active = profiles.find(profile => profile.id === accountProfile.gameProfileId)
    || profiles.find(profile => profile.is_active)
    || profiles[0];
  if (!active) throw new Error("Игровой профиль не найден.");

  container.innerHTML = `
    <div class="profile-layout">
      <div class="profile-main-column">
        <header class="profile-hero">
          <p class="profile-eyebrow">Профиль HarvestHub</p>
          <div class="profile-title-row">
            <h1>${escapeProfileHtml(active.nickname)}</h1>
            <button type="button" class="profile-edit-button" id="editAccountProfileButton" aria-label="Изменить игровой профиль" title="Изменить игровой профиль">✎</button>
          </div>
          <p class="profile-state">Штат ${escapeProfileHtml(active.state)}</p>
          <p class="profile-email">Аккаунт: ${escapeProfileHtml(maskProfileEmail(accountProfile.email))}</p>
          <p class="profile-sync-status"></p>
        </header>

        <form id="accountProfileEditForm" class="profile-edit-form" hidden>
          <h2>Изменить выбранный профиль</h2>
          <label class="form-group"><span>Никнейм</span><input id="accountProfileNickname" value="${escapeProfileHtml(active.nickname)}" required></label>
          <label class="form-group"><span>Номер штата</span><input id="accountProfileState" value="${escapeProfileHtml(active.state)}" inputmode="numeric" required></label>
          <div class="profile-edit-actions"><button type="button" id="cancelAccountProfileEdit">Отмена</button><button type="submit" id="saveAccountProfileEdit">Сохранить</button></div>
          <p id="profileEditMessage" class="settings-form-message"></p>
        </form>

        <section class="game-profiles-section">
          <div class="game-profiles-heading">
            <div><h2>Игровые профили</h2><p>Данные калькуляторов сохраняются отдельно. Продвинутый режим действует на весь аккаунт.</p></div>
            <button type="button" id="showCreateGameProfile">Добавить профиль</button>
          </div>
          <div class="game-profile-list">${renderGameProfileCards(profiles, active.id)}</div>
          <form id="createGameProfileForm" class="profile-edit-form game-profile-create-form" hidden>
            <h3>Новый игровой профиль</h3>
            <label class="form-group"><span>Никнейм</span><input id="newGameProfileNickname" required></label>
            <label class="form-group"><span>Номер штата</span><input id="newGameProfileState" inputmode="numeric" required></label>
            <div class="profile-edit-actions"><button type="button" id="cancelCreateGameProfile">Отмена</button><button type="submit" id="createGameProfileButton">Создать и переключиться</button></div>
            <p id="createGameProfileMessage" class="settings-form-message"></p>
          </form>
        </section>

        <div class="profile-page-actions"><button type="button" id="profileLogoutButton">Выйти из аккаунта</button></div>
      </div>
      ${renderAccountAccessCard(accessStatus, accessSummary)}
    </div>`;

  bindAccountProfileEvents(active);
  bindProfileAccessEvents(accessStatus);
}

function bindProfileAccessEvents(status) {
  document.getElementById("profileAdvancedModeToggle")?.addEventListener("change", event => {
    if (!status.hasAccess || status.isAdmin) return;
    if (typeof window.setAdvancedMode === "function") event.target.checked = window.setAdvancedMode(event.target.checked);
  });

  document.getElementById("requestAdvancedAccessButton")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Отправляем…";
    try {
      await getAdvancedAccessStore()?.requestAccess();
      await window.harvestHubAdvancedModeAccess?.refresh?.();
      await renderProfilePage();
    } catch (error) {
      button.disabled = false;
      button.textContent = "Оставить заявку";
      window.alert(error.message || "Не удалось отправить заявку.");
    }
  });

  document.querySelectorAll("[data-advanced-admin-page]").forEach(button => {
    button.addEventListener("click", () => {
      getAdvancedAccessStore()?.setAdminTab(button.dataset.advancedAdminPage);
      window.loadPage?.("advanced-access.html");
    });
  });
}

function setFormBusy(button, busy, busyText, normalText) {
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? busyText : normalText;
}

function bindAccountProfileEvents(activeProfile) {
  const manager = window.harvestHubGameProfileManager;
  const editForm = document.getElementById("accountProfileEditForm");
  const createForm = document.getElementById("createGameProfileForm");

  document.getElementById("editAccountProfileButton")?.addEventListener("click", () => {
    editForm.hidden = false;
    document.getElementById("accountProfileNickname")?.focus();
  });
  document.getElementById("cancelAccountProfileEdit")?.addEventListener("click", () => {
    editForm.hidden = true;
    editForm.reset();
    document.getElementById("profileEditMessage").textContent = "";
  });
  document.getElementById("showCreateGameProfile")?.addEventListener("click", () => {
    createForm.hidden = false;
    document.getElementById("newGameProfileNickname")?.focus();
  });
  document.getElementById("cancelCreateGameProfile")?.addEventListener("click", () => {
    createForm.hidden = true;
    createForm.reset();
    document.getElementById("createGameProfileMessage").textContent = "";
  });

  editForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("saveAccountProfileEdit");
    const message = document.getElementById("profileEditMessage");
    setFormBusy(button, true, "Сохраняем…", "Сохранить");
    message.textContent = "";
    try {
      await manager.updateGameProfile(
        activeProfile.id,
        document.getElementById("accountProfileNickname").value,
        document.getElementById("accountProfileState").value
      );
      await renderProfilePage();
    } catch (error) {
      message.textContent = error.message || "Не удалось сохранить изменения.";
      message.dataset.type = "error";
      setFormBusy(button, false, "", "Сохранить");
    }
  });

  createForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("createGameProfileButton");
    const message = document.getElementById("createGameProfileMessage");
    setFormBusy(button, true, "Создаём…", "Создать и переключиться");
    message.textContent = "";
    try {
      await manager.createGameProfile(
        document.getElementById("newGameProfileNickname").value,
        document.getElementById("newGameProfileState").value
      );
      await renderProfilePage();
    } catch (error) {
      message.textContent = error.message || "Не удалось создать профиль.";
      message.dataset.type = "error";
      setFormBusy(button, false, "", "Создать и переключиться");
    }
  });

  document.querySelectorAll("[data-game-profile-select]").forEach(button => {
    button.addEventListener("click", async () => {
      const normalText = button.textContent;
      setFormBusy(button, true, "Переключаем…", normalText);
      try {
        await manager.activateGameProfile(button.dataset.gameProfileSelect);
        await renderProfilePage();
      } catch (error) {
        setFormBusy(button, false, "", normalText);
        window.alert(error.message || "Не удалось переключить профиль.");
      }
    });
  });

  document.querySelectorAll("[data-game-profile-delete]").forEach(button => {
    button.addEventListener("click", async () => {
      const profileName = button.dataset.gameProfileName || "этот профиль";
      if (!window.confirm(`Удалить игровой профиль «${profileName}»? Его сохранённые данные будут удалены без возможности восстановления.`)) return;
      const normalText = button.textContent;
      setFormBusy(button, true, "Удаляем…", normalText);
      try {
        await manager.deleteGameProfile(button.dataset.gameProfileDelete);
        await renderProfilePage();
      } catch (error) {
        setFormBusy(button, false, "", normalText);
        window.alert(error.message || "Не удалось удалить профиль.");
      }
    });
  });
}

async function renderProfilePage() {
  const container = document.getElementById("profilePageContent");
  if (!container) return;
  const profile = window.harvestHubAccount?.getProfile?.();

  if (!profile) {
    container.innerHTML = `<header class="profile-hero"><p class="profile-eyebrow">Профиль HarvestHub</p><h1>Профиль не выбран</h1></header><button type="button" data-account-button>Войти или создать профиль</button>`;
    return;
  }

  if (profile.type === "quick") {
    renderQuickProfile(container, profile);
  } else {
    container.innerHTML = `<header class="profile-hero"><p class="profile-eyebrow">Профиль HarvestHub</p><h1>Загружаем профили…</h1></header>`;
    try {
      const [{ profiles }, accessStatus] = await Promise.all([
        window.harvestHubGameProfileManager.listGameProfiles(),
        getAdvancedAccessStatus()
      ]);
      let accessSummary = { pendingRequests: 0, activeAccessTotal: 0 };
      if (accessStatus.isAdmin) accessSummary = await getAdvancedAccessStore()?.getAdminSummary?.() || accessSummary;
      renderAccountProfile(container, window.harvestHubAccount?.getProfile?.() || profile, profiles, accessStatus, accessSummary);
      window.harvestHubSyncStatus?.markSynced?.();
    } catch (error) {
      container.innerHTML = `<header class="profile-hero"><p class="profile-eyebrow">Профиль HarvestHub</p><h1>${escapeProfileHtml(profile.nickname)}</h1></header><p class="account-warning profile-warning">Не удалось загрузить профили: ${escapeProfileHtml(error.message || "неизвестная ошибка")}</p><div class="profile-page-actions"><button type="button" id="profileLogoutButton">Выйти</button></div>`;
    }
  }

  document.getElementById("profileLogoutButton")?.addEventListener("click", async () => {
    await window.harvestHubCloudSync?.flushAll?.();
    await window.harvestHubAccount?.signOut?.();
    await renderProfilePage();
  });
}

export function init() {
  renderProfilePage();
}