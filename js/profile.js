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
  window.dispatchEvent(new CustomEvent("harvesthub:profile-change", {
    detail: { profile: updatedProfile }
  }));

  return updatedProfile;
}

async function loadAccountGameProfiles(accountProfile) {
  if (!window.harvestHubSupabase) throw new Error("Supabase пока недоступен.");

  const { data: sessionData, error: sessionError } = await window.harvestHubSupabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) {
    throw new Error("Сессия аккаунта не найдена. Войдите заново.");
  }

  const { data, error } = await window.harvestHubSupabase
    .from("game_profiles")
    .select("id,user_id,nickname,state,is_primary,is_active,data,created_at,updated_at")
    .eq("user_id", sessionData.session.user.id)
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

  return {
    accountProfile: syncedAccountProfile,
    gameProfiles,
    activeGameProfile
  };
}

async function saveAccountProfileChanges(profile, gameProfile, nickname, state) {
  const cleanNickname = String(nickname || "").trim();
  const cleanState = String(state || "").trim();
  if (!cleanNickname || !cleanState) throw new Error("Заполни никнейм и номер штата.");
  if (!window.harvestHubSupabase) throw new Error("Supabase пока недоступен.");
  if (!gameProfile?.id) throw new Error("Игровой профиль не найден.");

  const { error: profileError } = await window.harvestHubSupabase
    .from("game_profiles")
    .update({ nickname: cleanNickname, state: cleanState })
    .eq("id", gameProfile.id);

  if (profileError) throw profileError;

  if (gameProfile.is_primary) {
    const { data, error: userError } = await window.harvestHubSupabase.auth.updateUser({
      data: { nickname: cleanNickname, state: cleanState }
    });
    if (userError) throw userError;
    if (data.user) await window.harvestHubAccount?.syncCloudProfile?.(data.user);
  }

  syncLocalActiveGameProfile(profile, {
    ...gameProfile,
    nickname: cleanNickname,
    state: cleanState
  }, profile.gameProfilesCount || 1);
}

function renderQuickProfile(container, profile) {
  container.innerHTML = `
    <header class="profile-hero">
      <p class="profile-eyebrow">Быстрый профиль</p>
      <h1>${escapeProfileHtml(profile.nickname)}</h1>
      <p class="profile-state">Штат ${escapeProfileHtml(profile.state)}</p>
    </header>

    <p class="account-warning profile-warning">
      Данные этого профиля хранятся только на текущем устройстве. Они могут быть потеряны при очистке данных браузера, удалении данных сайта или переходе на другое устройство. Для сохранения и синхронизации данных между устройствами
      <button type="button" class="account-inline-action" id="createFullProfileButton">создайте полноценный профиль</button>.
    </p>

    <div class="profile-page-actions">
      <button type="button" id="profileLogoutButton">Выйти</button>
    </div>`;

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
        <div>
          <strong>${escapeProfileHtml(gameProfile.nickname)}</strong>
          <span>Штат ${escapeProfileHtml(gameProfile.state)}</span>
        </div>
        ${isActive ? '<span class="game-profile-active-label">Активный</span>' : ""}
      </article>`;
  }).join("");
}

function bindAccountProfileEditing(profile, activeGameProfile) {
  const form = document.getElementById("accountProfileEditForm");
  document.getElementById("editAccountProfileButton")?.addEventListener("click", () => {
    form.hidden = false;
    document.getElementById("accountProfileNickname")?.focus();
  });

  document.getElementById("cancelAccountProfileEdit")?.addEventListener("click", () => {
    form.hidden = true;
    document.getElementById("accountProfileNickname").value = activeGameProfile.nickname || "";
    document.getElementById("accountProfileState").value = activeGameProfile.state || "";
    document.getElementById("profileEditMessage").textContent = "";
  });

  form?.addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("saveAccountProfileEdit");
    const message = document.getElementById("profileEditMessage");
    button.disabled = true;
    button.textContent = "Сохраняем…";
    message.textContent = "";
    message.dataset.type = "";

    try {
      await saveAccountProfileChanges(
        profile,
        activeGameProfile,
        document.getElementById("accountProfileNickname").value,
        document.getElementById("accountProfileState").value
      );
      await renderProfilePage();
    } catch (error) {
      message.textContent = error.message || "Не удалось сохранить изменения.";
      message.dataset.type = "error";
      button.disabled = false;
      button.textContent = "Сохранить";
    }
  });
}

function renderAccountProfile(container, profile, gameProfiles, activeGameProfile) {
  if (!activeGameProfile) {
    container.innerHTML = `
      <header class="profile-hero">
        <p class="profile-eyebrow">Профиль HarvestHub</p>
        <h1>${escapeProfileHtml(profile.nickname)}</h1>
        <p class="profile-email">${escapeProfileHtml(maskProfileEmail(profile.email))}</p>
      </header>
      <p class="account-warning profile-warning">Для этого аккаунта не найден игровой профиль. Обновите страницу или войдите заново.</p>
      <div class="profile-page-actions"><button type="button" id="profileLogoutButton">Выйти</button></div>`;
    return;
  }

  container.innerHTML = `
    <header class="profile-hero">
      <p class="profile-eyebrow">Профиль HarvestHub</p>
      <div class="profile-title-row">
        <h1>${escapeProfileHtml(activeGameProfile.nickname)}</h1>
        <button type="button" class="profile-edit-button" id="editAccountProfileButton" aria-label="Изменить профиль" title="Изменить профиль">✎</button>
      </div>
      <p class="profile-state">Штат ${escapeProfileHtml(activeGameProfile.state)}</p>
      <p class="profile-email">${escapeProfileHtml(maskProfileEmail(profile.email))}</p>
      <p class="profile-sync-status"><span></span>Данные синхронизируются между устройствами</p>
    </header>

    <form id="accountProfileEditForm" class="profile-edit-form" hidden>
      <label class="form-group"><span>Никнейм</span><input id="accountProfileNickname" value="${escapeProfileHtml(activeGameProfile.nickname)}" required></label>
      <label class="form-group"><span>Номер штата</span><input id="accountProfileState" value="${escapeProfileHtml(activeGameProfile.state)}" inputmode="numeric" required></label>
      <div class="profile-edit-actions">
        <button type="button" id="cancelAccountProfileEdit">Отмена</button>
        <button type="submit" id="saveAccountProfileEdit">Сохранить</button>
      </div>
      <p id="profileEditMessage" class="settings-form-message"></p>
    </form>

    <section class="game-profiles-section">
      <div class="game-profiles-heading">
        <div>
          <h2>Игровые профили</h2>
          <p>${gameProfiles.length} из 4</p>
        </div>
      </div>
      <div class="game-profiles-list">
        ${renderGameProfilesList(gameProfiles, activeGameProfile)}
      </div>
    </section>

    <div class="profile-page-actions">
      <button type="button" id="profileLogoutButton">Выйти</button>
    </div>`;

  bindAccountProfileEditing(profile, activeGameProfile);
}

async function renderProfilePage() {
  const container = document.getElementById("profilePageContent");
  if (!container) return;

  const profile = window.harvestHubAccount?.getProfile?.();
  if (!profile) {
    container.innerHTML = `
      <header class="profile-hero">
        <p class="profile-eyebrow">Профиль HarvestHub</p>
        <h1>Профиль не выбран</h1>
      </header>
      <button type="button" data-account-button>Войти или создать профиль</button>`;
    return;
  }

  if (profile.type === "quick") {
    renderQuickProfile(container, profile);
  } else {
    container.innerHTML = `
      <header class="profile-hero">
        <p class="profile-eyebrow">Профиль HarvestHub</p>
        <h1>Загружаем профиль…</h1>
      </header>`;

    try {
      const result = await loadAccountGameProfiles(profile);
      renderAccountProfile(container, result.accountProfile, result.gameProfiles, result.activeGameProfile);
    } catch (error) {
      container.innerHTML = `
        <header class="profile-hero">
          <p class="profile-eyebrow">Профиль HarvestHub</p>
          <h1>${escapeProfileHtml(profile.nickname)}</h1>
          <p class="profile-state">Штат ${escapeProfileHtml(profile.state)}</p>
          <p class="profile-email">${escapeProfileHtml(maskProfileEmail(profile.email))}</p>
        </header>
        <p class="account-warning profile-warning">Не удалось загрузить игровые профили: ${escapeProfileHtml(error.message || "неизвестная ошибка")}</p>
        <div class="profile-page-actions"><button type="button" id="profileLogoutButton">Выйти</button></div>`;
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