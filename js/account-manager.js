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

  async function sendEmailCode(email, nickname, state) {
    const cleanEmail = String(email || "").trim();
    const cleanNickname = String(nickname || "").trim();
    const cleanState = String(state || "").trim();
    if (!cleanEmail || !cleanNickname || !cleanState) throw new Error("Заполни никнейм, номер штата и email.");
    if (!window.harvestHubSupabase) throw new Error("Supabase пока недоступен.");

    localStorage.setItem(PENDING_KEY, JSON.stringify({ nickname: cleanNickname, state: cleanState, email: cleanEmail }));
    const { error } = await window.harvestHubSupabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: true }
    });
    if (error) throw error;
  }

  async function verifyEmailCode(email, token) {
    const cleanEmail = String(email || "").trim();
    const cleanToken = String(token || "").trim();
    if (!cleanEmail || !cleanToken) throw new Error("Укажи email и код из письма.");

    const { data, error } = await window.harvestHubSupabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: "email"
    });
    if (error) throw error;
    await syncCloudProfile(data.user);
    return data.user;
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

  function renderAccountButtons() {
    const profile = getActiveProfile();
    document.querySelectorAll("[data-account-button]").forEach(button => {
      button.textContent = profile ? profile.nickname : "Профиль";
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
                <button type="submit">Получить код</button>
              </div>
              <div id="cloudProfileCodeStep" hidden>
                <label class="form-group"><span>Код из письма</span><input id="cloudProfileCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label>
                <button type="button" id="verifyCloudProfileCode">Подтвердить</button>
                <button type="button" class="secondary-button" id="resendCloudProfileCode">Отправить код повторно</button>
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
      try {
        await sendEmailCode(
          document.getElementById("cloudProfileEmail").value,
          document.getElementById("cloudProfileNickname").value,
          document.getElementById("cloudProfileState").value
        );
        document.getElementById("cloudProfileDetails").hidden = true;
        document.getElementById("cloudProfileCodeStep").hidden = false;
        showMessage("Код отправлен на почту.", "success");
      } catch (error) { showMessage(error.message, "error"); }
    });

    document.getElementById("verifyCloudProfileCode")?.addEventListener("click", async () => {
      showMessage("");
      try {
        await verifyEmailCode(document.getElementById("cloudProfileEmail").value, document.getElementById("cloudProfileCode").value);
        closeAccountModal();
        window.loadPage?.("profile.html");
      } catch (error) { showMessage(error.message, "error"); }
    });

    document.getElementById("resendCloudProfileCode")?.addEventListener("click", async () => {
      try {
        await sendEmailCode(
          document.getElementById("cloudProfileEmail").value,
          document.getElementById("cloudProfileNickname").value,
          document.getElementById("cloudProfileState").value
        );
        showMessage("Новый код отправлен.", "success");
      } catch (error) { showMessage(error.message, "error"); }
    });
  }

  async function init() {
    injectModal();
    renderAccountButtons();
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
    syncCloudProfile
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();