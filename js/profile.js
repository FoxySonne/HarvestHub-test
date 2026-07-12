function escapeProfileHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderProfilePage() {
  const container = document.getElementById("profilePageContent");
  if (!container) return;

  const profile = window.harvestHubAccount?.getProfile?.();
  if (!profile) {
    container.innerHTML = `
      <p>Профиль не выбран.</p>
      <button type="button" data-account-button>Войти или создать профиль</button>
    `;
    return;
  }

  if (profile.type === "quick") {
    container.innerHTML = `
      <div class="profile-page-heading">
        <div>
          <h2>${escapeProfileHtml(profile.nickname)}</h2>
          <p>Штат ${escapeProfileHtml(profile.state)}</p>
        </div>
        <button type="button" class="profile-edit-button" id="editQuickProfileButton" aria-label="Изменить данные профиля">✎</button>
      </div>
      <p class="profile-kind">Быстрый профиль</p>
      <p class="account-warning profile-warning">
        Данные этого профиля хранятся только на текущем устройстве. Они могут быть потеряны при очистке данных браузера, удалении данных сайта или переходе на другое устройство. Для сохранения и синхронизации данных между устройствами
        <button type="button" class="account-inline-action" id="createFullProfileButton">создайте полноценный профиль</button>.
      </p>
    `;

    document.getElementById("createFullProfileButton")?.addEventListener("click", () => {
      window.harvestHubAccount?.open?.();
      window.harvestHubAccount?.setTab?.("account");
    });

    document.getElementById("editQuickProfileButton")?.addEventListener("click", () => {
      window.harvestHubAccount?.open?.();
      window.harvestHubAccount?.setTab?.("quick");
      const nickname = document.getElementById("quickProfileNickname");
      const state = document.getElementById("quickProfileState");
      if (nickname) nickname.value = profile.nickname || "";
      if (state) state.value = profile.state || "";
    });
    return;
  }

  const maskedEmail = profile.email
    ? profile.email.replace(/^(.{2}).*(@.*)$/, "$1***$2")
    : "";

  container.innerHTML = `
    <div class="profile-page-heading">
      <div>
        <h2>${escapeProfileHtml(profile.nickname)}</h2>
        <p>Штат ${escapeProfileHtml(profile.state)}</p>
      </div>
    </div>
    <p class="profile-kind">Профиль</p>
    <p>${escapeProfileHtml(maskedEmail)}</p>
    <p class="profile-sync-status">Данные синхронизируются между устройствами.</p>
    <button type="button" id="profileLogoutButton">Выйти</button>
  `;

  document.getElementById("profileLogoutButton")?.addEventListener("click", async () => {
    await window.harvestHubAccount?.signOut?.();
    renderProfilePage();
  });
}

export function init() {
  renderProfilePage();
}
