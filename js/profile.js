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

async function saveAccountProfileChanges(profile, nickname, state) {
  const cleanNickname = String(nickname || "").trim();
  const cleanState = String(state || "").trim();
  if (!cleanNickname || !cleanState) throw new Error("Заполни никнейм и номер штата.");
  if (!window.harvestHubSupabase) throw new Error("Supabase пока недоступен.");

  const { data, error } = await window.harvestHubSupabase.auth.updateUser({
    data: { nickname: cleanNickname, state: cleanState }
  });
  if (error) throw error;
  await window.harvestHubAccount?.syncCloudProfile?.(data.user);
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

function renderAccountProfile(container, profile) {
  container.innerHTML = `
    <header class="profile-hero">
      <p class="profile-eyebrow">Профиль HarvestHub</p>
      <div class="profile-title-row">
        <h1>${escapeProfileHtml(profile.nickname)}</h1>
        <button type="button" class="profile-edit-button" id="editAccountProfileButton" aria-label="Изменить профиль" title="Изменить профиль">✎</button>
      </div>
      <p class="profile-state">Штат ${escapeProfileHtml(profile.state)}</p>
      <p class="profile-email">${escapeProfileHtml(maskProfileEmail(profile.email))}</p>
      <p class="profile-sync-status"><span></span>Данные синхронизируются между устройствами</p>
    </header>

    <form id="accountProfileEditForm" class="profile-edit-form" hidden>
      <label class="form-group"><span>Никнейм</span><input id="accountProfileNickname" value="${escapeProfileHtml(profile.nickname)}" required></label>
      <label class="form-group"><span>Номер штата</span><input id="accountProfileState" value="${escapeProfileHtml(profile.state)}" inputmode="numeric" required></label>
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
          <p>1 из 4</p>
        </div>
      </div>
      <article class="game-profile-item is-active">
        <div>
          <strong>${escapeProfileHtml(profile.nickname)}</strong>
          <span>Штат ${escapeProfileHtml(profile.state)}</span>
        </div>
        <span class="game-profile-active-label">Активный</span>
      </article>
    </section>

    <div class="profile-page-actions">
      <button type="button" id="profileLogoutButton">Выйти</button>
    </div>`;

  const form = document.getElementById("accountProfileEditForm");
  document.getElementById("editAccountProfileButton")?.addEventListener("click", () => {
    form.hidden = false;
    document.getElementById("accountProfileNickname")?.focus();
  });
  document.getElementById("cancelAccountProfileEdit")?.addEventListener("click", () => {
    form.hidden = true;
    document.getElementById("accountProfileNickname").value = profile.nickname || "";
    document.getElementById("accountProfileState").value = profile.state || "";
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
        document.getElementById("accountProfileNickname").value,
        document.getElementById("accountProfileState").value
      );
      renderProfilePage();
    } catch (error) {
      message.textContent = error.message || "Не удалось сохранить изменения.";
      message.dataset.type = "error";
      button.disabled = false;
      button.textContent = "Сохранить";
    }
  });
}

function renderProfilePage() {
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

  if (profile.type === "quick") renderQuickProfile(container, profile);
  else renderAccountProfile(container, profile);

  document.getElementById("profileLogoutButton")?.addEventListener("click", async () => {
    if (typeof window.setAdvancedMode === "function") window.setAdvancedMode(false);
    await window.harvestHubAccount?.signOut?.();
    renderProfilePage();
  });
}

export function init() {
  renderProfilePage();
}
