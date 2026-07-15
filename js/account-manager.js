(() => {
  const PROFILES_KEY = "harvesthub_profiles";
  const ACTIVE_KEY = "harvesthub_active_profile";

  function readProfiles() {
    try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || "{}"); }
    catch { return {}; }
  }

  function writeProfiles(profiles) { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); }

  function getActiveProfile() {
    const id = localStorage.getItem(ACTIVE_KEY) || "";
    return readProfiles()[id] || null;
  }

  function dispatchChange(profile = getActiveProfile()) {
    window.dispatchEvent(new CustomEvent("harvesthub:profile-change", { detail: { profile } }));
    renderAccountButtons();
  }

  function saveProfile(profile) {
    const profiles = readProfiles();
    profiles[profile.id] = profile;
    writeProfiles(profiles);
    localStorage.setItem(ACTIVE_KEY, profile.id);
    dispatchChange(profile);
    return profile;
  }

  function createQuickProfile(nickname, state) {
    const cleanNickname = String(nickname || "").trim();
    const cleanState = String(state || "").trim();
    if (!cleanNickname || !cleanState) throw new Error("Заполни никнейм и номер штата.");
    return saveProfile({
      id: `quick:${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
      type: "quick",
      nickname: cleanNickname,
      state: cleanState,
      createdAt: new Date().toISOString()
    });
  }

  function getAuthRedirectUrl() {
    return new URL("./", window.location.href).toString().split("#")[0].split("?")[0];
  }

  function validatePassword(password, confirmation = password) {
    if (String(password || "").length < 8) throw new Error("Пароль должен содержать не менее 8 символов.");
    if (password !== confirmation) throw new Error("Пароли не совпадают.");
  }

  async function signUpWithPassword(email, password, confirmation, nickname, state) {
    const cleanEmail = String(email || "").trim();
    const cleanNickname = String(nickname || "").trim();
    const cleanState = String(state || "").trim();
    if (!cleanEmail || !cleanNickname || !cleanState) throw new Error("Заполни никнейм, номер штата и email.");
    validatePassword(password, confirmation);
    if (!window.harvestHubSupabase) throw new Error("Supabase пока недоступен.");

    const { data, error } = await window.harvestHubSupabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
        data: { nickname: cleanNickname, state: cleanState }
      }
    });
    if (error) throw error;
    return data;
  }

  async function signInWithPassword(email, password) {
    const cleanEmail = String(email || "").trim();
    if (!cleanEmail || !password) throw new Error("Укажи email и пароль.");
    if (!window.harvestHubSupabase) throw new Error("Supabase пока недоступен.");
    const { data, error } = await window.harvestHubSupabase.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) throw error;
    if (data.user) await syncCloudProfile(data.user);
    return data;
  }

  async function sendPasswordReset(email) {
    const cleanEmail = String(email || "").trim();
    if (!cleanEmail) throw new Error("Сначала укажи email профиля.");
    if (!window.harvestHubSupabase) throw new Error("Supabase пока недоступен.");
    const { error } = await window.harvestHubSupabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: getAuthRedirectUrl()
    });
    if (error) throw error;
  }

  async function updateRecoveredPassword(password, confirmation) {
    validatePassword(password, confirmation);
    if (!window.harvestHubSupabase) throw new Error("Supabase пока недоступен.");
    const { error } = await window.harvestHubSupabase.auth.updateUser({ password });
    if (error) throw error;
  }

  async function syncCloudProfile(user) {
    if (!user) return null;
    const nickname = user.user_metadata?.nickname || user.email?.split("@")[0] || "Пользователь";
    const state = user.user_metadata?.state || "";
    return saveProfile({
      id: `account:${user.id}`,
      type: "account",
      supabaseUserId: user.id,
      nickname,
      state,
      email: user.email || "",
      createdAt: new Date().toISOString()
    });
  }

  async function signOutAccount() {
    const profile = getActiveProfile();
    if (profile?.type === "account" && window.harvestHubSupabase) await window.harvestHubSupabase.auth.signOut();
    localStorage.removeItem(ACTIVE_KEY);
    dispatchChange(null);
  }

  function openAccount() {
    const profile = getActiveProfile();
    if (profile) window.loadPage?.("profile.html");
    else {
      document.getElementById("accountModal")?.classList.add("is-open");
      document.body.classList.add("account-modal-open");
    }
  }

  function closeAccountModal() {
    document.getElementById("accountModal")?.classList.remove("is-open");
    document.body.classList.remove("account-modal-open");
  }

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
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

  function renderAccountButtons() {
    const profile = getActiveProfile();
    renderDesktopProfileCard(profile);
    document.querySelectorAll("[data-account-button]").forEach(button => {
      button.textContent = button.classList.contains("desktop-profile-button") ? (profile ? "Открыть профиль" : "Войти или создать профиль") : (profile ? profile.nickname : "Профиль");
      button.title = profile ? `Открыть профиль ${profile.nickname}` : "Войти или создать профиль";
    });
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

  function showMessage(message, type = "") {
    const element = document.getElementById("accountMessage");
    if (!element) return;
    element.textContent = message || "";
    element.dataset.type = type;
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
    modal.classList.add("is-recovery");
    modal.classList.add("is-open");
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

    document.querySelectorAll("[data-account-close]").forEach(el => el.addEventListener("click", closeAccountModal));
    document.querySelectorAll("[data-account-tab]").forEach(el => el.addEventListener("click", () => setTab(el.dataset.accountTab)));
    document.querySelectorAll("[data-cloud-mode-button]").forEach(el => el.addEventListener("click", () => setCloudMode(el.dataset.cloudModeButton)));
    document.querySelectorAll("[data-password-toggle]").forEach(el => el.addEventListener("click", () => togglePassword(el.dataset.passwordToggle, el)));

    document.getElementById("quickProfileForm")?.addEventListener("submit", event => {
      event.preventDefault();
      try {
        createQuickProfile(document.getElementById("quickProfileNickname").value, document.getElementById("quickProfileState").value);
        closeAccountModal();
        window.loadPage?.("profile.html");
      } catch (error) { showMessage(error.message, "error"); }
    });

    document.getElementById("cloudSignupForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      showMessage("");
      const button = document.getElementById("createCloudProfile");
      setButtonBusy(button, true, "Создаём профиль…", "Создать профиль");
      try {
        await signUpWithPassword(
          document.getElementById("cloudProfileEmail").value,
          document.getElementById("cloudProfilePassword").value,
          document.getElementById("cloudProfilePasswordConfirm").value,
          document.getElementById("cloudProfileNickname").value,
          document.getElementById("cloudProfileState").value
        );
        showMessage("Профиль создан. Проверьте почту и подтвердите email по ссылке из письма.", "success");
        form?.reset();
      } catch (error) { showMessage(getFriendlyAuthError(error), "error"); }
      finally { setButtonBusy(button, false, "", "Создать профиль"); }
    });

    document.getElementById("cloudLoginForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      showMessage("");
      const button = document.getElementById("loginCloudProfile");
      setButtonBusy(button, true, "Входим…", "Войти");
      try {
        await signInWithPassword(document.getElementById("cloudLoginEmail").value, document.getElementById("cloudLoginPassword").value);
        closeAccountModal();
        window.loadPage?.("profile.html");
      } catch (error) { showMessage(getFriendlyAuthError(error), "error"); }
      finally { setButtonBusy(button, false, "", "Войти"); }
    });

    document.getElementById("forgotCloudPassword")?.addEventListener("click", async () => {
      showMessage("");
      const email = document.getElementById("cloudLoginEmail").value;
      try {
        await sendPasswordReset(email);
        showMessage("Письмо для восстановления пароля отправлено. Проверьте почту.", "success");
      } catch (error) { showMessage(getFriendlyAuthError(error), "error"); }
    });

    document.getElementById("passwordRecoveryForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      showMessage("");
      const button = document.getElementById("saveRecoveredPassword");
      setButtonBusy(button, true, "Сохраняем…", "Сохранить новый пароль");
      try {
        await updateRecoveredPassword(document.getElementById("recoveryPassword").value, document.getElementById("recoveryPasswordConfirm").value);
        document.getElementById("accountModal")?.classList.remove("is-recovery");
        showMessage("Пароль изменён. Теперь можно входить с новым паролем.", "success");
        setTab("account");
        setCloudMode("login");
      } catch (error) { showMessage(getFriendlyAuthError(error), "error"); }
      finally { setButtonBusy(button, false, "", "Сохранить новый пароль"); }
    });
  }

  async function init() {
    injectModal();
    renderAccountButtons();
    window.setTimeout(renderAccountButtons, 250);
    window.setTimeout(renderAccountButtons, 1000);

    document.addEventListener("click", event => {
      const button = event.target.closest("[data-account-button]");
      if (!button) return;
      event.preventDefault();
      openAccount();
    });

    if (window.harvestHubSupabase) {
      const { data } = await window.harvestHubSupabase.auth.getSession();
      if (data.session?.user) await syncCloudProfile(data.session.user);
      window.harvestHubSupabase.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") openRecoveryMode();
        if (session?.user) syncCloudProfile(session.user);
      });
    }
  }

  window.harvestHubAccount = {
    getProfile: getActiveProfile,
    open: openAccount,
    close: closeAccountModal,
    setTab,
    setCloudMode,
    signOut: signOutAccount,
    syncCloudProfile,
    render: renderAccountButtons
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();