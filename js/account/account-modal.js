(() => {
  function showMessage(message, type = "") {
    const element = document.getElementById("accountMessage");
    if (!element) return;
    element.textContent = message || "";
    element.dataset.type = type;
  }

  function setTab(tab) {
    const modal = document.getElementById("accountModal");
    if (!modal) return;
    modal.dataset.activeTab = tab;
    modal.querySelectorAll("[data-account-tab]").forEach(button => {
      const active = button.dataset.accountTab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    showMessage("");
  }

  function setCloudMode(mode) {
    const panel = document.querySelector('[data-account-panel="account"]');
    if (!panel) return;
    panel.dataset.cloudMode = mode;
    panel.querySelectorAll("[data-cloud-mode-button]").forEach(button => {
      const active = button.dataset.cloudModeButton === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    showMessage("");
  }

  function setButtonBusy(button, busy, busyText, normalText) {
    if (!button) return;
    button.disabled = busy;
    button.textContent = busy ? busyText : normalText;
  }

  function getFriendlyAuthError(error) {
    const raw = String(error?.message || error || "").toLowerCase();
    if (raw.includes("invalid login credentials")) return "Неверный email или пароль.";
    if (raw.includes("email not confirmed")) return "Сначала подтвердите email по ссылке из письма.";
    if (raw.includes("user already registered")) return "Профиль с таким email уже существует. Перейдите во вкладку «Войти».";
    if (raw.includes("password should be")) return "Пароль должен содержать не менее 8 символов.";
    if (raw.includes("rate limit") || raw.includes("too many requests")) return "Слишком много попыток. Подождите и попробуйте снова.";
    return error?.message || "Не удалось выполнить действие. Попробуйте позже.";
  }

  function togglePassword(inputId, button) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.textContent = show ? "Скрыть" : "Показать";
    button.setAttribute("aria-label", show ? "Скрыть пароль" : "Показать пароль");
  }

  function openRecoveryMode() {
    const modal = document.getElementById("accountModal");
    if (!modal) return;
    modal.classList.add("is-recovery", "is-open");
    document.body.classList.add("account-modal-open");
    showMessage("Введите новый пароль для профиля.");
  }

  function injectModal() {
    if (document.getElementById("accountModal")) return;

    document.body.insertAdjacentHTML("beforeend", `
      <div id="accountModal" class="account-modal" aria-hidden="true">
        <div class="account-modal-backdrop" data-account-close></div>
        <section class="account-dialog" role="dialog" aria-modal="true" aria-labelledby="accountDialogTitle">
          <button type="button" class="account-close" data-account-close aria-label="Закрыть">×</button>
          <h2 id="accountDialogTitle">Профиль HarvestHub</h2>
          <div class="account-standard-content">
            <div class="account-tabs" role="tablist">
              <button type="button" class="is-active" data-account-tab="quick" role="tab" aria-selected="true">Быстрый профиль</button>
              <button type="button" data-account-tab="account" role="tab" aria-selected="false">Полноценный профиль</button>
            </div>
            <div class="account-panels">
              <form class="account-panel" data-account-panel="quick" id="quickProfileForm">
                <label class="form-group"><span>Никнейм</span><input id="quickProfileNickname" required></label>
                <label class="form-group"><span>Номер штата</span><input id="quickProfileState" inputmode="numeric" required></label>
                <p class="account-warning">Данные этого профиля хранятся только на текущем устройстве. Они могут быть потеряны при очистке данных браузера, удалении данных сайта или переходе на другое устройство. Для сохранения и синхронизации данных между устройствами необходимо создать полноценный профиль.</p>
                <button type="submit">Создать быстрый профиль</button>
              </form>
              <section class="account-panel" data-account-panel="account" data-cloud-mode="signup">
                <div class="cloud-mode-switch" role="tablist" aria-label="Действие с полноценным профилем">
                  <button type="button" class="is-active" data-cloud-mode-button="signup" role="tab" aria-selected="true">Создать новый</button>
                  <button type="button" data-cloud-mode-button="login" role="tab" aria-selected="false">Войти</button>
                </div>
                <form id="cloudSignupForm" data-cloud-mode-panel="signup">
                  <label class="form-group"><span>Никнейм</span><input id="cloudProfileNickname" required autocomplete="nickname"></label>
                  <label class="form-group"><span>Номер штата</span><input id="cloudProfileState" inputmode="numeric" required></label>
                  <label class="form-group"><span>Email</span><input id="cloudProfileEmail" type="email" required autocomplete="email"></label>
                  <label class="form-group"><span>Пароль</span><span class="password-field"><input id="cloudProfilePassword" type="password" required minlength="8" autocomplete="new-password"><button type="button" data-password-toggle="cloudProfilePassword">Показать</button></span></label>
                  <label class="form-group"><span>Повторите пароль</span><span class="password-field"><input id="cloudProfilePasswordConfirm" type="password" required minlength="8" autocomplete="new-password"><button type="button" data-password-toggle="cloudProfilePasswordConfirm">Показать</button></span></label>
                  <p class="cloud-login-note">После регистрации на почту придёт письмо для подтверждения email.</p>
                  <button type="submit" id="createCloudProfile">Создать профиль</button>
                </form>
                <form id="cloudLoginForm" data-cloud-mode-panel="login">
                  <label class="form-group"><span>Email профиля</span><input id="cloudLoginEmail" type="email" required autocomplete="email"></label>
                  <label class="form-group"><span>Пароль</span><span class="password-field"><input id="cloudLoginPassword" type="password" required autocomplete="current-password"><button type="button" data-password-toggle="cloudLoginPassword">Показать</button></span></label>
                  <button type="submit" id="loginCloudProfile">Войти</button>
                  <button type="button" id="forgotCloudPassword" class="account-link-button">Забыли пароль?</button>
                </form>
              </section>
            </div>
          </div>
          <form id="passwordRecoveryForm" class="password-recovery-form">
            <p class="cloud-login-note">Ссылка подтверждена. Установите новый пароль.</p>
            <label class="form-group"><span>Новый пароль</span><span class="password-field"><input id="recoveryPassword" type="password" required minlength="8" autocomplete="new-password"><button type="button" data-password-toggle="recoveryPassword">Показать</button></span></label>
            <label class="form-group"><span>Повторите новый пароль</span><span class="password-field"><input id="recoveryPasswordConfirm" type="password" required minlength="8" autocomplete="new-password"><button type="button" data-password-toggle="recoveryPasswordConfirm">Показать</button></span></label>
            <button type="submit" id="saveRecoveredPassword">Сохранить новый пароль</button>
          </form>
          <p id="accountMessage" class="account-message"></p>
        </section>
      </div>`);

    bindModalEvents();
  }

  function bindModalEvents() {
    const session = window.harvestHubAccountSession;
    const ui = window.harvestHubAccountUI;

    document.querySelectorAll("[data-account-close]").forEach(element => element.addEventListener("click", ui.close));
    document.querySelectorAll("[data-account-tab]").forEach(element => element.addEventListener("click", () => setTab(element.dataset.accountTab)));
    document.querySelectorAll("[data-cloud-mode-button]").forEach(element => element.addEventListener("click", () => setCloudMode(element.dataset.cloudModeButton)));
    document.querySelectorAll("[data-password-toggle]").forEach(element => element.addEventListener("click", () => togglePassword(element.dataset.passwordToggle, element)));

    document.getElementById("quickProfileForm")?.addEventListener("submit", event => {
      event.preventDefault();
      try {
        window.harvestHubAccountStorage.createQuickProfile(
          document.getElementById("quickProfileNickname").value,
          document.getElementById("quickProfileState").value
        );
        ui.close();
        window.loadPage?.("profile.html");
      } catch (error) {
        showMessage(error.message, "error");
      }
    });

    document.getElementById("cloudSignupForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = document.getElementById("createCloudProfile");
      showMessage("");
      setButtonBusy(button, true, "Создаём профиль…", "Создать профиль");
      try {
        await session.signUpWithPassword(
          document.getElementById("cloudProfileEmail").value,
          document.getElementById("cloudProfilePassword").value,
          document.getElementById("cloudProfilePasswordConfirm").value,
          document.getElementById("cloudProfileNickname").value,
          document.getElementById("cloudProfileState").value
        );
        showMessage("Профиль создан. Проверьте почту и подтвердите email по ссылке из письма.", "success");
        form.reset();
      } catch (error) {
        showMessage(getFriendlyAuthError(error), "error");
      } finally {
        setButtonBusy(button, false, "", "Создать профиль");
      }
    });

    document.getElementById("cloudLoginForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const button = document.getElementById("loginCloudProfile");
      showMessage("");
      setButtonBusy(button, true, "Входим…", "Войти");
      try {
        await session.signInWithPassword(
          document.getElementById("cloudLoginEmail").value,
          document.getElementById("cloudLoginPassword").value
        );
        ui.close();
        window.loadPage?.("profile.html");
      } catch (error) {
        showMessage(getFriendlyAuthError(error), "error");
      } finally {
        setButtonBusy(button, false, "", "Войти");
      }
    });

    document.getElementById("forgotCloudPassword")?.addEventListener("click", async () => {
      showMessage("");
      try {
        await session.sendPasswordReset(document.getElementById("cloudLoginEmail").value);
        showMessage("Письмо для восстановления пароля отправлено. Проверьте почту.", "success");
      } catch (error) {
        showMessage(getFriendlyAuthError(error), "error");
      }
    });

    document.getElementById("passwordRecoveryForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const button = document.getElementById("saveRecoveredPassword");
      showMessage("");
      setButtonBusy(button, true, "Сохраняем…", "Сохранить новый пароль");
      try {
        await session.updateRecoveredPassword(
          document.getElementById("recoveryPassword").value,
          document.getElementById("recoveryPasswordConfirm").value
        );
        document.getElementById("accountModal")?.classList.remove("is-recovery");
        showMessage("Пароль изменён. Теперь можно входить с новым паролем.", "success");
        setTab("account");
        setCloudMode("login");
      } catch (error) {
        showMessage(getFriendlyAuthError(error), "error");
      } finally {
        setButtonBusy(button, false, "", "Сохранить новый пароль");
      }
    });
  }

  async function init() {
    injectModal();
    window.harvestHubAccountUI.init();
    await window.harvestHubAccountSession.init();
  }

  window.harvestHubAccountModal = { setTab, setCloudMode, openRecoveryMode, injectModal };
  window.harvestHubAccount = {
    getProfile: window.harvestHubAccountStorage.getActiveProfile,
    open: window.harvestHubAccountUI.open,
    close: window.harvestHubAccountUI.close,
    setTab,
    setCloudMode,
    signOut: window.harvestHubAccountSession.signOutAccount,
    syncCloudProfile: window.harvestHubGameProfileManager.syncCloudProfile,
    render: window.harvestHubAccountUI.render
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
