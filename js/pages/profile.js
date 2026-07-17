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

function renderQuickProfile(container, profile) {
  container.innerHTML = `
    <header class="profile-hero">
      <p class="profile-eyebrow">Быстрый профиль</p>
      <h1>${escapeProfileHtml(profile.nickname)}</h1>
      <p class="profile-state">Штат ${escapeProfileHtml(profile.state)}</p>
    </header>
    <p class="account-warning profile-warning">Данные этого профиля хранятся только на текущем устройстве. Для синхронизации между устройствами создайте полноценный профиль.</p>
    <div class="profile-page-actions"><button type="button" id="profileLogoutButton">Выйти</button></div>`;
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

function renderAccountProfile(container, accountProfile, profiles) {
  const active = profiles.find(profile => profile.id === accountProfile.gameProfileId)
    || profiles.find(profile => profile.is_active)
    || profiles[0];
  if (!active) throw new Error("Игровой профиль не найден.");

  container.innerHTML = `
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

    <div class="profile-page-actions"><button type="button" id="profileLogoutButton">Выйти из аккаунта</button></div>`;

  bindAccountProfileEvents(active);
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
      const { profiles } = await window.harvestHubGameProfileManager.listGameProfiles();
      renderAccountProfile(container, window.harvestHubAccount?.getProfile?.() || profile, profiles);
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
