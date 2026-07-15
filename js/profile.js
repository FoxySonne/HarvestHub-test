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

async function getPrimaryGameProfile() {
  if (!window.harvestHubSupabase) throw new Error("Supabase пока недоступен.");
  const { data: sessionData, error: sessionError } = await window.harvestHubSupabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) throw new Error("Сессия аккаунта не найдена.");
  const user = sessionData.session.user;

  const { data, error } = await window.harvestHubSupabase
    .from("game_profiles")
    .select("id,nickname,state,is_primary,data,created_at,updated_at")
    .eq("user_id", user.id)
    .eq("is_primary", true)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("Основной игровой профиль не найден.");
  return { user, gameProfile: data };
}

function syncLocalAccountProfile(accountProfile, gameProfile) {
  if (!accountProfile || !gameProfile) return accountProfile;
  const updated = {
    ...accountProfile,
    nickname: gameProfile.nickname,
    state: gameProfile.state,
    gameProfileId: gameProfile.id,
    gameProfilesCount: 1,
    isPrimaryGameProfile: true
  };

  try {
    const profiles = JSON.parse(localStorage.getItem("harvesthub_profiles") || "{}");
    profiles[updated.id] = updated;
    localStorage.setItem("harvesthub_profiles", JSON.stringify(profiles));
  } catch (error) {
    console.warn("Не удалось обновить локальный профиль:", error);
  }

  window.harvestHubAccount?.render?.();
  return updated;
}

async function savePrimaryProfile(accountProfile, gameProfile, nickname, state) {
  const cleanNickname = String(nickname || "").trim();
  const cleanState = String(state || "").trim();
  if (!cleanNickname || !cleanState) throw new Error("Заполни никнейм и номер штата.");

  const { error } = await window.harvestHubSupabase
    .from("game_profiles")
    .update({ nickname: cleanNickname, state: cleanState })
    .eq("id", gameProfile.id);
  if (error) throw error;

  const { data, error: userError } = await window.harvestHubSupabase.auth.updateUser({
    data: { nickname: cleanNickname, state: cleanState }
  });
  if (userError) throw userError;
  if (data.user) await window.harvestHubAccount?.syncCloudProfile?.(data.user);

  syncLocalAccountProfile(accountProfile, { ...gameProfile, nickname: cleanNickname, state: cleanState });
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

function renderAccountProfile(container, profile, gameProfile) {
  container.innerHTML = `
    <header class="profile-hero">
      <p class="profile-eyebrow">Профиль HarvestHub</p>
      <div class="profile-title-row">
        <h1>${escapeProfileHtml(gameProfile.nickname)}</h1>
        <button type="button" class="profile-edit-button" id="editAccountProfileButton" aria-label="Изменить профиль" title="Изменить профиль">✎</button>
      </div>
      <p class="profile-state">Штат ${escapeProfileHtml(gameProfile.state)}</p>
      <p class="profile-email">${escapeProfileHtml(maskProfileEmail(profile.email))}</p>
      <p class="profile-sync-status"></p>
    </header>

    <form id="accountProfileEditForm" class="profile-edit-form" hidden>
      <label class="form-group"><span>Никнейм</span><input id="accountProfileNickname" value="${escapeProfileHtml(gameProfile.nickname)}" required></label>
      <label class="form-group"><span>Номер штата</span><input id="accountProfileState" value="${escapeProfileHtml(gameProfile.state)}" inputmode="numeric" required></label>
      <div class="profile-edit-actions"><button type="button" id="cancelAccountProfileEdit">Отмена</button><button type="submit" id="saveAccountProfileEdit">Сохранить</button></div>
      <p id="profileEditMessage" class="settings-form-message"></p>
    </form>

    <section class="game-profiles-section">
      <h2>Основной игровой профиль</h2>
      <p class="profile-single-mode-note">Дополнительные игровые профили временно отключены, пока настраивается стабильная синхронизация между устройствами.</p>
    </section>

    <div class="profile-page-actions"><button type="button" id="profileLogoutButton">Выйти</button></div>`;

  const editForm = document.getElementById("accountProfileEditForm");
  document.getElementById("editAccountProfileButton")?.addEventListener("click", () => {
    editForm.hidden = false;
    document.getElementById("accountProfileNickname")?.focus();
  });
  document.getElementById("cancelAccountProfileEdit")?.addEventListener("click", () => {
    editForm.hidden = true;
    editForm.reset();
    document.getElementById("profileEditMessage").textContent = "";
  });
  editForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("saveAccountProfileEdit");
    const message = document.getElementById("profileEditMessage");
    button.disabled = true;
    button.textContent = "Сохраняем…";
    message.textContent = "";
    try {
      await savePrimaryProfile(profile, gameProfile, document.getElementById("accountProfileNickname").value, document.getElementById("accountProfileState").value);
      await renderProfilePage();
    } catch (error) {
      message.textContent = error.message || "Не удалось сохранить изменения.";
      message.dataset.type = "error";
      button.disabled = false;
      button.textContent = "Сохранить";
    }
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
    container.innerHTML = `<header class="profile-hero"><p class="profile-eyebrow">Профиль HarvestHub</p><h1>Загружаем профиль…</h1></header>`;
    try {
      const { gameProfile } = await getPrimaryGameProfile();
      const syncedProfile = syncLocalAccountProfile(profile, gameProfile);
      renderAccountProfile(container, syncedProfile, gameProfile);
      window.harvestHubSyncStatus?.markSynced?.();
    } catch (error) {
      container.innerHTML = `<header class="profile-hero"><p class="profile-eyebrow">Профиль HarvestHub</p><h1>${escapeProfileHtml(profile.nickname)}</h1></header><p class="account-warning profile-warning">Не удалось загрузить профиль: ${escapeProfileHtml(error.message || "неизвестная ошибка")}</p><div class="profile-page-actions"><button type="button" id="profileLogoutButton">Выйти</button></div>`;
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