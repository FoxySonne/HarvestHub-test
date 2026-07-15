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

function syncLocalActiveGameProfile(accountProfile, gameProfile, totalProfiles) {
  if (!accountProfile || accountProfile.type !== "account" || !gameProfile) return accountProfile;

  const updatedProfile = {
    ...accountProfile,
    nickname: gameProfile.nickname,
    state: gameProfile.state,
    gameProfileId: gameProfile.id,
    gameProfilesCount: totalProfiles,
    isPrimaryGameProfile: Boolean(gameProfile.is_primary)
  };

  try {
    const profiles = JSON.parse(localStorage.getItem("harvesthub_profiles") || "{}");
    profiles[updatedProfile.id] = updatedProfile;
    localStorage.setItem("harvesthub_profiles", JSON.stringify(profiles));
  } catch (error) {
    console.warn("Не удалось обновить локальную копию игрового профиля:", error);
  }

  window.harvestHubAccount?.render?.();
  window.dispatchEvent(new CustomEvent("harvesthub:profile-change", { detail: { profile: updatedProfile } }));
  return updatedProfile;
}

async function getCurrentUser() {
  if (!window.harvestHubSupabase) throw new Error("Supabase пока недоступен.");
  const { data, error } = await window.harvestHubSupabase.auth.getSession();
  if (error || !data.session?.user) throw new Error("Сессия аккаунта не найдена. Войдите заново.");
  return data.session.user;
}

async function loadAccountGameProfiles(accountProfile) {
  const user = await getCurrentUser();
  const { data, error } = await window.harvestHubSupabase
    .from("game_profiles")
    .select("id,user_id,nickname,state,is_primary,is_active,data,created_at,updated_at")
    .eq("user_id", user.id)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;

  const gameProfiles = Array.isArray(data) ? data : [];
  const activeGameProfile = gameProfiles.find(item => item.is_active)
    || gameProfiles.find(item => item.is_primary)
    || gameProfiles[0]
    || null;

  const syncedAccountProfile = activeGameProfile
    ? syncLocalActiveGameProfile(accountProfile, activeGameProfile, gameProfiles.length)
    : accountProfile;

  return { accountProfile: syncedAccountProfile, gameProfiles, activeGameProfile, user };
}

async function saveGameProfileChanges(accountProfile, gameProfile, nickname, state) {
  const cleanNickname = String(nickname || "").trim();
  const cleanState = String(state || "").trim();
  if (!cleanNickname || !cleanState) throw new Error("Заполни никнейм и номер штата.");
  if (!gameProfile?.id) throw new Error("Игровой профиль не найден.");

  const { error } = await window.harvestHubSupabase
    .from("game_profiles")
    .update({ nickname: cleanNickname, state: cleanState })
    .eq("id", gameProfile.id);
  if (error) throw error;

  if (gameProfile.is_primary) {
    const { data, error: userError } = await window.harvestHubSupabase.auth.updateUser({
      data: { nickname: cleanNickname, state: cleanState }
    });
    if (userError) throw userError;
    if (data.user) await window.harvestHubAccount?.syncCloudProfile?.(data.user);
  }

  if (gameProfile.is_active) {
    syncLocalActiveGameProfile(accountProfile, { ...gameProfile, nickname: cleanNickname, state: cleanState }, accountProfile.gameProfilesCount || 1);
  }
}

async function createGameProfile(nickname, state, totalProfiles) {
  if (totalProfiles >= 4) throw new Error("Можно создать не более четырёх игровых профилей.");
  const cleanNickname = String(nickname || "").trim();
  const cleanState = String(state || "").trim();
  if (!cleanNickname || !cleanState) throw new Error("Заполни никнейм и номер штата.");
  const user = await getCurrentUser();

  const { error } = await window.harvestHubSupabase.from("game_profiles").insert({
    user_id: user.id,
    nickname: cleanNickname,
    state: cleanState,
    is_primary: false,
    is_active: false,
    data: {}
  });
  if (error) throw error;
}

async function activateGameProfile(targetProfile, currentProfile) {
  if (!targetProfile?.id || targetProfile.id === currentProfile?.id) return;
  const user = await getCurrentUser();

  const { error: clearError } = await window.harvestHubSupabase
    .from("game_profiles")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .eq("is_active", true);
  if (clearError) throw clearError;

  const { error: activateError } = await window.harvestHubSupabase
    .from("game_profiles")
    .update({ is_active: true })
    .eq("id", targetProfile.id);

  if (activateError) {
    if (currentProfile?.id) {
      await window.harvestHubSupabase.from("game_profiles").update({ is_active: true }).eq("id", currentProfile.id);
    }
    throw activateError;
  }
}

async function deleteGameProfile(targetProfile, activeProfile, primaryProfile) {
  if (!targetProfile?.id) throw new Error("Игровой профиль не найден.");
  if (targetProfile.is_primary) throw new Error("Основной игровой профиль удалить нельзя.");

  const wasActive = targetProfile.id === activeProfile?.id;
  const { error } = await window.harvestHubSupabase.from("game_profiles").delete().eq("id", targetProfile.id);
  if (error) throw error;

  if (wasActive && primaryProfile?.id) {
    const { error: activateError } = await window.harvestHubSupabase
      .from("game_profiles")
      .update({ is_active: true })
      .eq("id", primaryProfile.id);
    if (activateError) throw activateError;
  }
}

function renderQuickProfile(container, profile) {
  container.innerHTML = `
    <header class="profile-hero">
      <p class="profile-eyebrow">Быстрый профиль</p>
      <h1>${escapeProfileHtml(profile.nickname)}</h1>
      <p class="profile-state">Штат ${escapeProfileHtml(profile.state)}</p>
    </header>
    <p class="account-warning profile-warning">Данные этого профиля хранятся только на текущем устройстве. Они могут быть потеряны при очистке данных браузера, удалении данных сайта или переходе на другое устройство. Для сохранения и синхронизации данных между устройствами <button type="button" class="account-inline-action" id="createFullProfileButton">создайте полноценный профиль</button>.</p>
    <div class="profile-page-actions"><button type="button" id="profileLogoutButton">Выйти</button></div>`;

  document.getElementById("createFullProfileButton")?.addEventListener("click", () => {
    window.harvestHubAccount?.open?.();
    window.harvestHubAccount?.setTab?.("account");
  });
}

function renderGameProfilesList(gameProfiles, activeGameProfile) {
  return gameProfiles.map(gameProfile => {
    const isActive = gameProfile.id === activeGameProfile?.id;
    return `
      <article class="game-profile-item${isActive ? " is-active" : ""}" data-game-profile-id="${escapeProfileHtml(gameProfile.id)}">
        <button type="button" class="game-profile-select" data-select-game-profile="${escapeProfileHtml(gameProfile.id)}" ${isActive ? "disabled" : ""}>
          <strong>${escapeProfileHtml(gameProfile.nickname)}</strong>
          <span>Штат ${escapeProfileHtml(gameProfile.state)}</span>
        </button>
        <div class="game-profile-controls">
          ${isActive ? '<span class="game-profile-active-label">Активный</span>' : '<button type="button" class="game-profile-action" data-select-game-profile="' + escapeProfileHtml(gameProfile.id) + '">Выбрать</button>'}
          <button type="button" class="game-profile-action" data-edit-game-profile="${escapeProfileHtml(gameProfile.id)}" aria-label="Изменить игровой профиль">✎</button>
          ${gameProfile.is_primary ? "" : `<button type="button" class="game-profile-action is-danger" data-delete-game-profile="${escapeProfileHtml(gameProfile.id)}" aria-label="Удалить игровой профиль">Удалить</button>`}
        </div>
      </article>`;
  }).join("");
}

function openGameProfileForm(mode, gameProfile = null) {
  const form = document.getElementById("gameProfileManageForm");
  if (!form) return;
  form.hidden = false;
  form.dataset.mode = mode;
  form.dataset.profileId = gameProfile?.id || "";
  document.getElementById("gameProfileFormTitle").textContent = mode === "edit" ? "Изменить игровой профиль" : "Добавить игровой профиль";
  document.getElementById("gameProfileManageNickname").value = gameProfile?.nickname || "";
  document.getElementById("gameProfileManageState").value = gameProfile?.state || "";
  document.getElementById("gameProfileManageMessage").textContent = "";
  document.getElementById("gameProfileManageNickname").focus();
}

function closeGameProfileForm() {
  const form = document.getElementById("gameProfileManageForm");
  if (!form) return;
  form.hidden = true;
  form.reset();
  form.dataset.mode = "";
  form.dataset.profileId = "";
}

function bindAccountProfileActions(profile, gameProfiles, activeGameProfile) {
  const primaryProfile = gameProfiles.find(item => item.is_primary) || gameProfiles[0];
  const activeEditForm = document.getElementById("accountProfileEditForm");

  document.getElementById("editAccountProfileButton")?.addEventListener("click", () => {
    activeEditForm.hidden = false;
    document.getElementById("accountProfileNickname")?.focus();
  });
  document.getElementById("cancelAccountProfileEdit")?.addEventListener("click", () => {
    activeEditForm.hidden = true;
    activeEditForm.reset();
    document.getElementById("profileEditMessage").textContent = "";
  });
  activeEditForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("saveAccountProfileEdit");
    const message = document.getElementById("profileEditMessage");
    button.disabled = true;
    button.textContent = "Сохраняем…";
    message.textContent = "";
    try {
      await saveGameProfileChanges(profile, activeGameProfile, document.getElementById("accountProfileNickname").value, document.getElementById("accountProfileState").value);
      await renderProfilePage();
    } catch (error) {
      message.textContent = error.message || "Не удалось сохранить изменения.";
      message.dataset.type = "error";
      button.disabled = false;
      button.textContent = "Сохранить";
    }
  });

  document.getElementById("addGameProfileButton")?.addEventListener("click", () => openGameProfileForm("create"));
  document.getElementById("cancelGameProfileManage")?.addEventListener("click", closeGameProfileForm);

  document.querySelectorAll("[data-select-game-profile]").forEach(button => {
    button.addEventListener("click", async () => {
      const target = gameProfiles.find(item => item.id === button.dataset.selectGameProfile);
      if (!target || target.id === activeGameProfile.id) return;
      button.disabled = true;
      try {
        await activateGameProfile(target, activeGameProfile);
        await renderProfilePage();
      } catch (error) {
        alert(error.message || "Не удалось переключить игровой профиль.");
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-edit-game-profile]").forEach(button => {
    button.addEventListener("click", () => {
      const target = gameProfiles.find(item => item.id === button.dataset.editGameProfile);
      if (target) openGameProfileForm("edit", target);
    });
  });

  document.querySelectorAll("[data-delete-game-profile]").forEach(button => {
    button.addEventListener("click", async () => {
      const target = gameProfiles.find(item => item.id === button.dataset.deleteGameProfile);
      if (!target) return;
      if (!confirm(`Удалить игровой профиль «${target.nickname}»? Все связанные с ним данные будут потеряны.`)) return;
      button.disabled = true;
      try {
        await deleteGameProfile(target, activeGameProfile, primaryProfile);
        await renderProfilePage();
      } catch (error) {
        alert(error.message || "Не удалось удалить игровой профиль.");
        button.disabled = false;
      }
    });
  });

  document.getElementById("gameProfileManageForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = document.getElementById("saveGameProfileManage");
    const message = document.getElementById("gameProfileManageMessage");
    const nickname = document.getElementById("gameProfileManageNickname").value;
    const state = document.getElementById("gameProfileManageState").value;
    button.disabled = true;
    button.textContent = "Сохраняем…";
    message.textContent = "";

    try {
      if (form.dataset.mode === "edit") {
        const target = gameProfiles.find(item => item.id === form.dataset.profileId);
        await saveGameProfileChanges(profile, target, nickname, state);
      } else {
        await createGameProfile(nickname, state, gameProfiles.length);
      }
      await renderProfilePage();
    } catch (error) {
      message.textContent = error.message || "Не удалось сохранить игровой профиль.";
      message.dataset.type = "error";
      button.disabled = false;
      button.textContent = "Сохранить";
    }
  });
}

function renderAccountProfile(container, profile, gameProfiles, activeGameProfile) {
  if (!activeGameProfile) {
    container.innerHTML = `<header class="profile-hero"><p class="profile-eyebrow">Профиль HarvestHub</p><h1>${escapeProfileHtml(profile.nickname)}</h1><p class="profile-email">${escapeProfileHtml(maskProfileEmail(profile.email))}</p></header><p class="account-warning profile-warning">Для этого аккаунта не найден игровой профиль. Обновите страницу или войдите заново.</p><div class="profile-page-actions"><button type="button" id="profileLogoutButton">Выйти</button></div>`;
    return;
  }

  container.innerHTML = `
    <header class="profile-hero">
      <p class="profile-eyebrow">Профиль HarvestHub</p>
      <div class="profile-title-row"><h1>${escapeProfileHtml(activeGameProfile.nickname)}</h1><button type="button" class="profile-edit-button" id="editAccountProfileButton" aria-label="Изменить профиль" title="Изменить профиль">✎</button></div>
      <p class="profile-state">Штат ${escapeProfileHtml(activeGameProfile.state)}</p>
      <p class="profile-email">${escapeProfileHtml(maskProfileEmail(profile.email))}</p>
      <p class="profile-sync-status"><span></span>Данные синхронизируются между устройствами</p>
    </header>

    <form id="accountProfileEditForm" class="profile-edit-form" hidden>
      <label class="form-group"><span>Никнейм</span><input id="accountProfileNickname" value="${escapeProfileHtml(activeGameProfile.nickname)}" required></label>
      <label class="form-group"><span>Номер штата</span><input id="accountProfileState" value="${escapeProfileHtml(activeGameProfile.state)}" inputmode="numeric" required></label>
      <div class="profile-edit-actions"><button type="button" id="cancelAccountProfileEdit">Отмена</button><button type="submit" id="saveAccountProfileEdit">Сохранить</button></div>
      <p id="profileEditMessage" class="settings-form-message"></p>
    </form>

    <section class="game-profiles-section">
      <div class="game-profiles-heading">
        <div><h2>Игровые профили</h2><p>${gameProfiles.length} из 4</p></div>
        <button type="button" id="addGameProfileButton" ${gameProfiles.length >= 4 ? "disabled" : ""}>Добавить профиль</button>
      </div>
      <div class="game-profiles-list">${renderGameProfilesList(gameProfiles, activeGameProfile)}</div>

      <form id="gameProfileManageForm" class="profile-edit-form game-profile-manage-form" hidden>
        <h3 id="gameProfileFormTitle">Добавить игровой профиль</h3>
        <label class="form-group"><span>Никнейм</span><input id="gameProfileManageNickname" required></label>
        <label class="form-group"><span>Номер штата</span><input id="gameProfileManageState" inputmode="numeric" required></label>
        <div class="profile-edit-actions"><button type="button" id="cancelGameProfileManage">Отмена</button><button type="submit" id="saveGameProfileManage">Сохранить</button></div>
        <p id="gameProfileManageMessage" class="settings-form-message"></p>
      </form>
    </section>

    <div class="profile-page-actions"><button type="button" id="profileLogoutButton">Выйти</button></div>`;

  bindAccountProfileActions(profile, gameProfiles, activeGameProfile);
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
    container.innerHTML = `<header class="profile-hero"><p class="profile-eyebrow">Профиль HarvestHub</p><h1>Загружаем профиль…</h1></header>`;
    try {
      const result = await loadAccountGameProfiles(profile);
      renderAccountProfile(container, result.accountProfile, result.gameProfiles, result.activeGameProfile);
    } catch (error) {
      container.innerHTML = `<header class="profile-hero"><p class="profile-eyebrow">Профиль HarvestHub</p><h1>${escapeProfileHtml(profile.nickname)}</h1><p class="profile-state">Штат ${escapeProfileHtml(profile.state)}</p><p class="profile-email">${escapeProfileHtml(maskProfileEmail(profile.email))}</p></header><p class="account-warning profile-warning">Не удалось загрузить игровые профили: ${escapeProfileHtml(error.message || "неизвестная ошибка")}</p><div class="profile-page-actions"><button type="button" id="profileLogoutButton">Выйти</button></div>`;
    }
  }

  document.getElementById("profileLogoutButton")?.addEventListener("click", async () => {
    if (typeof window.setAdvancedMode === "function") window.setAdvancedMode(false);
    await window.harvestHubAccount?.signOut?.();
    await renderProfilePage();
  });
}

export function init() {
  renderProfilePage();
}