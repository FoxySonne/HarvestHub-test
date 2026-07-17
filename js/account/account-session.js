(() => {
  function getClient() {
    return window.harvestHubSupabase || null;
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

    const client = getClient();
    if (!client) throw new Error("Supabase пока недоступен.");

    const { data, error } = await client.auth.signUp({
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

    const client = getClient();
    if (!client) throw new Error("Supabase пока недоступен.");

    const { data, error } = await client.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) throw error;
    if (data.user) await window.harvestHubGameProfileManager.syncCloudProfile(data.user);
    return data;
  }

  async function sendPasswordReset(email) {
    const cleanEmail = String(email || "").trim();
    if (!cleanEmail) throw new Error("Сначала укажи email профиля.");

    const client = getClient();
    if (!client) throw new Error("Supabase пока недоступен.");

    const { error } = await client.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: getAuthRedirectUrl()
    });
    if (error) throw error;
  }

  async function updateRecoveredPassword(password, confirmation) {
    validatePassword(password, confirmation);
    const client = getClient();
    if (!client) throw new Error("Supabase пока недоступен.");
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
  }

  async function signOutAccount() {
    const profile = window.harvestHubAccountStorage.getActiveProfile();
    const client = getClient();
    await window.harvestHubCloudSync?.flushAll?.();
    if (profile?.type === "account" && client) await client.auth.signOut();
    window.harvestHubAccountStorage.clearActiveProfile();
  }

  async function refreshCloudProfile() {
    const client = getClient();
    if (!client) return;
    const { data } = await client.auth.getSession();
    if (data.session?.user) await window.harvestHubGameProfileManager.syncCloudProfile(data.session.user);
  }

  async function init() {
    const client = getClient();
    if (!client) return;

    await refreshCloudProfile();

    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") window.harvestHubAccountModal?.openRecoveryMode?.();
      if (session?.user) {
        window.harvestHubGameProfileManager.syncCloudProfile(session.user).catch(error => {
          console.warn("Не удалось обновить игровой профиль аккаунта:", error);
        });
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshCloudProfile().catch(() => {});
    });
    window.setInterval(() => refreshCloudProfile().catch(() => {}), 60000);
  }

  window.harvestHubAccountSession = {
    signUpWithPassword,
    signInWithPassword,
    sendPasswordReset,
    updateRecoveredPassword,
    signOutAccount,
    init
  };
})();
