(() => {
  const PROFILES_KEY = "harvesthub_profiles";
  const ACTIVE_KEY = "harvesthub_active_profile";
  const PENDING_KEY = "harvesthub_pending_cloud_profile";

  function readProfiles() {
    try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || "{}"); }
    catch { return {}; }
  }

  function writeProfiles(profiles) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  }

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

    const id = `quick:${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
    return saveProfile({
      id,
      type: "quick",
      nickname: cleanNickname,
      state: cleanState,
      createdAt: new Date().toISOString()
    });
  }

  function getAuthRedirectUrl() {
    return new URL("./", window.location.href).toString().split("#")[0].split("?")[0];
  }

  async function sendMagicLink(email, nickname, state) {
    const cleanEmail = String(email || "").trim();
    const cleanNickname = String(nickname || "").trim();
    const cleanState = String(state || "").trim();
    if (!cleanEmail || !cleanNickname || !cleanState) throw new Error("Заполни никнейм, номер штата и email.");
    if (!window.harvestHubSupabase) throw new Error("Supabase пока недоступен.");

    const pendingProfile = { nickname: cleanNickname, state: cleanState, email: cleanEmail };
    localStorage.setItem(PENDING_KEY, JSON.stringify(pendingProfile));

    const { error } = await window.harvestHubSupabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: getAuthRedirectUrl(),
        data: {
          nickname: cleanNickname,
          state: cleanState
        }
      }
    });
    if (error) throw error;
  }

  async function syncCloudProfile(user) {
    if (!user) return null;
    let pending = {};
    try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "{}"); } catch {}

    const nickname = pending.nickname || user.user_metadata?.nickname || user.email?.split("@")[0] || "Пользователь";
    const state = pending.state || user.user_metadata?.state || "";

    if (pending.nickname || pending.state) {
      await window.harvestHubSupabase.auth.updateUser({ data: { nickname, state } });
      localStorage.removeItem(PENDING_KEY);
    }

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
    if (profile?.type === "account" && window.harvestHubSupabase) {
      await window.harvestHubSupabase.auth.signOut();
    }
    localStorage.removeItem(ACTIVE_KEY);
    dispatchChange(null);
  }

  function openAccount() {
    const profile = getActiveProfile();
    if (profile) {
      window.loadPage?.("profile.html");
    } else {
      document.getElementById("accountModal")?.classList.add("is-open");
      document.body.classList.add("account-modal-open");
    }
  }

  function closeAccountModal() {
    document.getElementById("accountModal")?.classList.remove("is-open");
    document.body.classList.remove("account-modal-open");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderDesktopProfileCard(profile) {
    const content = document.getElementById("desktopProfileContent");
    if (!content) return;

    if (!profile) {
      content.innerHTML = `
        <p class="desktop-profile-text">Сохраняйте данные и используйте их на разных устройствах.</p>
        <button type="button" class="account-trigger desktop-profile-button" data-account-button>Войти или создать профиль</button>`;
      return;
    }

    const status = profile.type === "quick"
      ? "Быстрый профиль"
      : "Данные синхронизируются";

    content.innerHTML = `
      <div class="desktop-profile-user">
        <strong>${escapeHtml(profile.nickname)}</strong>
        <span>Штат ${escapeHtml(profile.state)}</span>
      </div>
      <p class="desktop-profile-status">${status}</p>
      <button type="button" class="account-trigger desktop-profile-button" data-account-button>Открыть профиль</button>`;
  }

  function renderAccountButtons() {
    const profile = getActiveProfile();
    renderDesktopProfileCard(profile);

    document.querySelectorAll("[data-account-button]").forEach(button => {
      if (button.classList.contains("desktop-profile-button")) {
        button.textContent = profile ? "Открыть профиль" : "Войти или создать профиль";
      } else {
        button.textContent = profile ? profile.nickname : "Профиль";
      }
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
  }

  function showMessage(message, type = "") {
    const element = document.getElementById("accountMessage");
    if (!element) return;
    element.textContent = message || "";
    element.dataset.type = type;
  }

  function startMagicLinkCooldown(button, seconds = 60) {
    if (!button) return;
    let remaining = seconds;
    button.disabled = true;
    button.textContent = `Повторная отправка через ${remaining} сек.`;

    const timer = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(timer);
        button.disabled = false;
        button.textContent = "Отправить ссылку повторно";
        return;
      }
      button.textContent = `Повторная отправка через ${remaining} сек.`;
    }, 1000);
  }

  function getFriendlyAuthError(error) {
    const rawMessage = String(error?.message || error || "").toLowerCase();
    if (rawMessage.includes("rate limit") || rawMessage.includes("too many requests")) {
      return "Лимит отправки писем временно исчерпан. Подожди до часа и попробуй снова.";
    }
    if (rawMessage.includes("email address not authorized")) {
      return "Этот email пока не разрешён для встроенной почты Supabase.";
    }
    return error?.message || "Не удалось отправить ссылку. Попробуй позже.";
  }

  function injectModal() {
    if (document.getElementById("accountModal")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <div id="accountModal" class="account-modal" aria-hidden="true">
        <div class="account-modal-backdrop" data-account-close></div>
        <section class="account-dialog" role="dialog" aria-modal="true" aria-labelledby="accountDialogTitle">
          <button type="button" class="account-close" data-account-close aria-label="Закрыть">×</button>
          <h2 id="accountDialogTitle">Профиль HarvestHub</h2>
          <div class="account-tabs" role="tablist">
            <button type="button" class="is-active" data-account-tab="quick" role="tab" aria-selected="true">Быстрый профиль</button>
            <button type="button" data-account-tab="account" role="tab" aria-selected="false">Создать профиль</button>
          </div>
          <div class="account-panels">
            <form class="account-panel" data-account-panel="quick" id="quickProfileForm">
              <label class="form-group"><span>Никнейм</span><input id="quickProfileNickname" required></label>
              <label class="form-group"><span>Номер штата</span><input id="quickProfileState" inputmode="numeric" required></label>
              <p class="account-warning">Данные этого профиля хранятся только на текущем устройстве. Они могут быть потеряны при очистке данных браузера, удалении данных сайта или переходе на другое устройство. Для сохранения и синхронизации данных между устройствами необходимо создать полноценный профиль.</p>
              <button type="submit">Создать быстрый профиль</button>
            </form>
            <form class="account-panel" data-account-panel="account" id="cloudProfileForm">
              <div id="cloudProfileDetails">
                <label class="form-group"><span>Никнейм</span><input id="cloudProfileNickname" required></label>
                <label class="form-group"><span>Номер штата</span><input id="cloudProfileState" inputmode="numeric" required></label>
                <label class="form-group"><span>Email</span><input id="cloudProfileEmail" type="email" required autocomplete="email"></label>
                <button type="submit" id="sendCloudProfileLink">Отправить ссылку для входа</button>
              </div>
            </form>
          </div>
          <p id="accountMessage" class="account-message"></p>
        </section>
      </div>`);

    document.querySelectorAll("[data-account-close]").forEach(el => el.addEventListener("click", closeAccountModal));
    document.querySelectorAll("[data-account-tab]").forEach(el => el.addEventListener("click", () => setTab(el.dataset.accountTab)));

    document.getElementById("quickProfileForm")?.addEventListener("submit", event => {
      event.preventDefault();
      try {
        createQuickProfile(document.getElementById("quickProfileNickname").value, document.getElementById("quickProfileState").value);
        closeAccountModal();
        window.loadPage?.("profile.html");
      } catch (error) { showMessage(error.message, "error"); }
    });

    document.getElementById("cloudProfileForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      showMessage("");
      const submitButton = document.getElementById("sendCloudProfileLink");
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Отправляем ссылку…";
      }

      try {
        await sendMagicLink(
          document.getElementById("cloudProfileEmail").value,
          document.getElementById("cloudProfileNickname").value,
          document.getElementById("cloudProfileState").value
        );
        showMessage("Ссылка для входа отправлена на почту. Открой письмо и нажми «Sign in», чтобы завершить создание профиля.", "success");
        startMagicLinkCooldown(submitButton, 60);
      } catch (error) {
        showMessage(getFriendlyAuthError(error), "error");
        startMagicLinkCooldown(submitButton, 60);
      }
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
      window.harvestHubSupabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) syncCloudProfile(session.user);
      });
    }
  }

  window.harvestHubAccount = {
    getProfile: getActiveProfile,
    open: openAccount,
    close: closeAccountModal,
    setTab,
    signOut: signOutAccount,
    syncCloudProfile,
    render: renderAccountButtons
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();