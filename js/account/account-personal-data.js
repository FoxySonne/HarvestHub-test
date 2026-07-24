(() => {
  const SECTION_ID = "accountPersonalDataSection";

  function byId(id) {
    return document.getElementById(id);
  }

  function formatBirthday(value) {
    const match = String(value || "").match(/^\d{4}-(\d{2})-(\d{2})$/);
    return match ? `${match[2]}.${match[1]}` : "";
  }

  function parseBirthday(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    const match = text.match(/^(\d{1,2})\.(\d{1,2})$/);
    if (!match) return undefined;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const date = new Date(Date.UTC(2000, month - 1, day));
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
    return `2000-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function parseTimezone(value) {
    const text = String(value ?? "").trim();
    if (!text) return 0;
    const number = Number(text);
    return Number.isInteger(number) && number >= -12 && number <= 12 ? number : undefined;
  }

  async function save(event) {
    event.preventDefault();
    const birthday = parseBirthday(byId("accountBirthday")?.value);
    const timezoneOffset = parseTimezone(byId("accountTimezone")?.value);
    const message = byId("accountPersonalDataMessage");
    const button = event.submitter;

    if (birthday === undefined) {
      message.textContent = "Укажи день рождения в формате ДД.ММ.";
      message.dataset.type = "error";
      return;
    }
    if (timezoneOffset === undefined) {
      message.textContent = "Часовой пояс должен быть целым числом от −12 до +12 относительно Москвы.";
      message.dataset.type = "error";
      return;
    }

    button.disabled = true;
    button.textContent = "Сохраняем…";
    message.textContent = "";

    const { error } = await window.harvestHubSupabase.auth.updateUser({
      data: {
        birthday,
        timezone_offset: timezoneOffset
      }
    });

    if (error) {
      button.disabled = false;
      button.textContent = "Сохранить";
      message.textContent = error.message || "Не удалось сохранить данные.";
      message.dataset.type = "error";
      return;
    }

    const syncResult = await window.harvestHubSupabase.rpc("sync_my_alliance_personal_data");
    button.disabled = false;
    button.textContent = "Сохранить";

    if (syncResult.error) {
      message.textContent = "Данные аккаунта сохранены, но не удалось обновить связанный профиль игрока. Попробуй сохранить ещё раз.";
      message.dataset.type = "error";
      return;
    }

    message.textContent = syncResult.data > 0
      ? "Данные сохранены и обновлены в связанном профиле игрока."
      : "Данные сохранены. При привязке аккаунта они подставятся в профиль игрока автоматически.";
    message.dataset.type = "success";
  }

  async function mount() {
    if (byId(SECTION_ID)) return;
    const profile = window.harvestHubAccount?.getProfile?.();
    const mainColumn = document.querySelector("#profilePageContent .profile-main-column");
    const gameProfiles = mainColumn?.querySelector(".game-profiles-section");
    if (!mainColumn || !gameProfiles || profile?.type !== "account" || !window.harvestHubSupabase) return;

    const { data, error } = await window.harvestHubSupabase.auth.getSession();
    if (error || !data.session?.user) return;
    const metadata = data.session.user.user_metadata || {};
    const timezone = Number.isInteger(Number(metadata.timezone_offset)) ? Number(metadata.timezone_offset) : 0;

    const section = document.createElement("section");
    section.id = SECTION_ID;
    section.className = "game-profiles-section account-personal-data-section";
    section.innerHTML = `
      <div class="game-profiles-heading">
        <div>
          <h2>Личные данные</h2>
          <p>Заполняются один раз для аккаунта и автоматически переносятся в состав союза при привязке аккаунта к игроку.</p>
        </div>
      </div>
      <form id="accountPersonalDataForm" class="profile-edit-form account-personal-data-form">
        <label class="form-group">
          <span>День рождения</span>
          <input id="accountBirthday" type="text" inputmode="numeric" maxlength="5" placeholder="ДД.ММ" value="${formatBirthday(metadata.birthday)}" data-no-persist="true">
        </label>
        <label class="form-group">
          <span>Часовой пояс от Москвы</span>
          <input id="accountTimezone" type="number" min="-12" max="12" step="1" value="${timezone}" data-no-persist="true">
        </label>
        <div class="profile-edit-actions"><button type="submit">Сохранить</button></div>
        <p id="accountPersonalDataMessage" class="settings-form-message"></p>
      </form>`;

    mainColumn.insertBefore(section, gameProfiles);
    byId("accountPersonalDataForm")?.addEventListener("submit", save);
  }

  const observer = new MutationObserver(() => mount());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", mount);
  mount();
})();