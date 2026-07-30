async function resetAllSiteData() {
    if (!confirm("Очистить все локальные данные HarvestHub на этом устройстве? Синхронизированные данные в аккаунте останутся без изменений. На этом устройстве потребуется войти в аккаунт заново.")) return;

    try {
        // Завершаем только локальную сессию, чтобы облачные данные не восстановились
        // сразу после очистки. Данные аккаунта и user_app_state в Supabase не меняются.
        if (window.harvestHubSupabase) {
            const { error } = await window.harvestHubSupabase.auth.signOut({ scope: "local" });
            if (error) throw error;
        }

        if ("caches" in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
        }
        if ("serviceWorker" in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(registration => registration.unregister()));
        }

        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem("currentPage", "settings.html");

        const pageContent = document.getElementById("page-content");
        if (pageContent) pageContent.innerHTML = "";

        window.location.replace(`${window.location.pathname}?reset=${Date.now()}`);
    } catch (error) {
        console.error("Ошибка при локальном сбросе данных:", error);
        alert("Не удалось полностью очистить локальные данные. Попробуй ещё раз.");
    }
}

async function clearSiteCache() {
    return resetAllSiteData();
}

function setSettingsMessage(id, message, type = "") {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message || "";
    element.dataset.type = type;
}

function getSettingsAuthError(error, fallback = "Не удалось выполнить действие.") {
    const raw = String(error?.message || error || "").toLowerCase();

    if (raw.includes("new password should be different from the old password") || raw.includes("same password")) {
        return "Новый пароль должен отличаться от текущего.";
    }
    if (raw.includes("password should be at least") || raw.includes("password should be")) {
        return "Пароль должен содержать не менее 8 символов.";
    }
    if (raw.includes("invalid login credentials")) {
        return "Текущий пароль введён неверно.";
    }
    if (raw.includes("email not confirmed")) {
        return "Сначала подтвердите email по ссылке из письма.";
    }
    if (raw.includes("rate limit") || raw.includes("too many requests")) {
        return "Слишком много попыток. Подождите и попробуйте снова.";
    }
    if (raw.includes("weak password")) {
        return "Пароль слишком простой. Используйте более надёжный пароль.";
    }

    return fallback;
}

function allianceLabel(item) {
    const name = String(item?.alliance_name || "Союз").trim();
    const state = String(item?.state_number || "").trim();
    return state ? `${name} (штат ${state})` : name;
}

function formatAccountDeletionBlockers(blockers) {
    const reasons = [];
    const ownerships = Array.isArray(blockers?.ownerships) ? blockers.ownerships : [];
    const r5Assignments = Array.isArray(blockers?.r5_assignments) ? blockers.r5_assignments : [];

    if (ownerships.length) {
        reasons.push(`Сначала передайте владение: ${ownerships.map(allianceLabel).join(", ")}.`);
    }
    if (r5Assignments.length) {
        reasons.push(`Сначала передайте роль Р5: ${r5Assignments.map(allianceLabel).join(", ")}.`);
    }

    return reasons.length
        ? `Аккаунт пока нельзя удалить. ${reasons.join(" ")}`
        : "Аккаунт пока нельзя удалить. Проверьте роли в союзном штабе и попробуйте снова.";
}

function getAccountDeletionError(data, error) {
    if (data?.code === "ACCOUNT_DELETE_BLOCKED") {
        return formatAccountDeletionBlockers(data.blockers);
    }
    if (data?.code === "UNAUTHORIZED") {
        return "Сессия устарела. Войдите в аккаунт заново и повторите удаление.";
    }
    if (data?.code === "BLOCKERS_CHECK_FAILED") {
        return "Не удалось проверить роли в союзах. Попробуйте ещё раз позже.";
    }
    if (data?.code === "SERVER_CONFIG_ERROR") {
        return "Удаление аккаунта временно недоступно из-за настройки сервера.";
    }
    return getSettingsAuthError(error, "Не удалось удалить аккаунт. Попробуйте ещё раз позже.");
}

function toggleSettingsPassword(inputId, button) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.textContent = show ? "Скрыть" : "Показать";
}

async function getRegisteredAccountSession() {
    const profile = window.harvestHubAccount?.getProfile?.();
    if (profile?.type !== "account" || !window.harvestHubSupabase) return null;
    const { data } = await window.harvestHubSupabase.auth.getSession();
    return data.session || null;
}

async function initAccountSecurity() {
    const card = document.getElementById("accountSecurityCard");
    const session = await getRegisteredAccountSession();
    if (!card || !session?.user) return;
    card.hidden = false;

    document.querySelectorAll("[data-settings-password-toggle]").forEach(button => {
        button.addEventListener("click", () => toggleSettingsPassword(button.dataset.settingsPasswordToggle, button));
    });

    document.getElementById("changePasswordForm")?.addEventListener("submit", async event => {
        event.preventDefault();
        const password = document.getElementById("settingsNewPassword").value;
        const confirmation = document.getElementById("settingsNewPasswordConfirm").value;
        const button = document.getElementById("saveSettingsPassword");
        setSettingsMessage("passwordSettingsMessage", "");

        if (password.length < 8) return setSettingsMessage("passwordSettingsMessage", "Пароль должен содержать не менее 8 символов.", "error");
        if (password !== confirmation) return setSettingsMessage("passwordSettingsMessage", "Пароли не совпадают.", "error");

        button.disabled = true;
        button.textContent = "Сохраняем…";
        const { error } = await window.harvestHubSupabase.auth.updateUser({ password });
        button.disabled = false;
        button.textContent = "Сохранить новый пароль";

        if (error) {
            return setSettingsMessage(
                "passwordSettingsMessage",
                getSettingsAuthError(error, "Не удалось изменить пароль."),
                "error"
            );
        }

        event.currentTarget.reset();
        setSettingsMessage("passwordSettingsMessage", "Новый пароль сохранён.", "success");
    });

    const deleteModal = document.getElementById("deleteAccountModal");
    const closeDeleteModal = () => {
        if (deleteModal) deleteModal.hidden = true;
        document.body.classList.remove("account-delete-open");
        document.getElementById("deleteAccountForm")?.reset();
        setSettingsMessage("deleteAccountMessage", "");
    };

    document.getElementById("openDeleteAccountDialog")?.addEventListener("click", () => {
        if (deleteModal) deleteModal.hidden = false;
        document.body.classList.add("account-delete-open");
    });
    document.querySelectorAll("[data-delete-close]").forEach(button => button.addEventListener("click", closeDeleteModal));

    document.getElementById("deleteAccountForm")?.addEventListener("submit", async event => {
        event.preventDefault();
        const password = document.getElementById("deleteAccountPassword").value;
        const button = document.getElementById("confirmDeleteAccount");
        const email = session.user.email || "";

        button.disabled = true;
        button.textContent = "Проверяем…";
        setSettingsMessage("deleteAccountMessage", "");

        const { error: loginError } = await window.harvestHubSupabase.auth.signInWithPassword({ email, password });
        if (loginError) {
            button.disabled = false;
            button.textContent = "Удалить аккаунт";
            return setSettingsMessage(
                "deleteAccountMessage",
                getSettingsAuthError(loginError, "Не удалось проверить текущий пароль."),
                "error"
            );
        }

        button.textContent = "Удаляем…";
        const { data, error: deleteError } = await window.harvestHubSupabase.functions.invoke("delete-account", {
            body: { confirmation: "DELETE_ACCOUNT" }
        });
        const deletionConfirmed = data?.ok === true && data?.deleted === true;

        if (deleteError || !deletionConfirmed) {
            button.disabled = false;
            button.textContent = "Удалить аккаунт";
            return setSettingsMessage(
                "deleteAccountMessage",
                getAccountDeletionError(data, deleteError),
                "error"
            );
        }

        await window.harvestHubSupabase.auth.signOut({ scope: "local" });
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace(window.location.pathname);
    });
}

async function initSettingsPage() {
    document.getElementById("resetSiteDataButton")?.addEventListener("click", resetAllSiteData);
    await initAccountSecurity();
}

window.resetAllSiteData = resetAllSiteData;
window.clearSiteCache = clearSiteCache;
window.settingsInit = initSettingsPage;
