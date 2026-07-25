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

  function clearStoredAccountProfile() {
    const profile = window.harvestHubAccountStorage.getActiveProfile();
    if (profile?.type === "account") window.harvestHubAccountStorage.removeProfile(profile.id);
  }

  async function syncCloudProfileWithRetry(user, attempts = 3) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await window.harvestHubGameProfileManager.syncCloudProfile(user);
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await new Promise(resolve => window.setTimeout(resolve, 700 * attempt));
      }
    }
    throw lastError;
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

    if (data.user) {
      try {
        await syncCloudProfileWithRetry(data.user);
      } catch (profileError) {
        console.warn("Вход выполнен, но профиль пока не загрузился:", profileError);
        window.setTimeout(() => {
          syncCloudProfileWithRetry(data.user).catch(retryError => {
            console.warn("Не удалось повторно загрузить игровой профиль аккаунта:", retryError);
          });
        }, 2000);
      }
    }

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
    let syncWarning = null;

    if (profile?.type === "account") {
      try {
        await window.harvestHubCloudSync?.flushAll?.();
      } catch (error) {
        syncWarning = error;
        const continueExit = window.confirm(
          "Последние изменения не удалось сохранить в облаке. Нажми «ОК», чтобы всё равно выйти, или «Отмена», чтобы остаться и повторить сохранение."
        );
        if (!continueExit) {
          const cancelled = new Error("Выход отменён: данные ещё не сохранены.");
          cancelled.code = "SYNC_EXIT_CANCELLED";
          throw cancelled;
        }
      }
    }

    try {
      if (profile?.type === "account" && client) {
        const { error } = await client.auth.signOut();
        if (error) throw error;
      }
    } catch (error) {
      console.warn("Не удалось завершить все серверные сессии, выполняется локальный выход:", error);
      if (client) {
        const { error: localError } = await client.auth.signOut({ scope: "local" });
        if (localError) console.warn("Локальный выход Supabase завершился с ошибкой:", localError);
      }
    } finally {
      if (profile?.type === "account") window.harvestHubAccountStorage.removeProfile(profile.id);
      else window.harvestHubAccountStorage.clearActiveProfile();
    }

    return { syncWarning };
  }

  async function refreshCloudProfile() {
    const client = getClient();
    if (!client) return;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session?.user) await syncCloudProfileWithRetry(data.session.user);
    else clearStoredAccountProfile();
  }

  async function init() {
    const client = getClient();
    if (!client) return;

    await refreshCloudProfile().catch(error => {
      console.warn("Не удалось восстановить профиль аккаунта при загрузке:", error);
    });

    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") window.harvestHubAccountModal?.openRecoveryMode?.();
      if (event === "SIGNED_OUT" || !session?.user) {
        clearStoredAccountProfile();
        return;
      }
      syncCloudProfileWithRetry(session.user).catch(error => {
        console.warn("Не удалось обновить игровой профиль аккаунта:", error);
      });
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
