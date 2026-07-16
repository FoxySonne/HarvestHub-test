async function resetAllSiteData() {
    if (!confirm("Сбросить все данные HarvestHub? Будут удалены сохранённые значения калькуляторов, настройки, профили и локальные данные сайта на этом устройстве.")) return;

    try {
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
        console.error("Ошибка при сбросе данных:", error);
        alert("Не удалось полностью сбросить данные. Попробуй обновить страницу вручную.");
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

async function initAdvancedModeSetting() {
    const toggle = document.getElementById("advancedModeToggle");
    const message = document.getElementById("advancedModeAccessMessage");
    const accountButton = document.getElementById("advancedModeAccountButton");
    if (!toggle) return;

    const session = await getRegisteredAccountSession();
    const allowed = Boolean(session?.user);

    toggle.disabled = !allowed;
    toggle.checked = allowed && typeof window.getAdvancedMode === "function" && window.getAdvancedMode();

    if (!allowed) {
        if (typeof window.setAdvancedMode === "function") window.setAdvancedMode(false);
        if (message) message.textContent = "Продвинутый режим доступен только пользователям с полноценным профилем.";
        if (accountButton) accountButton.hidden = false;
    } else {
        if (message) message.textContent = "Доступ включён для текущего аккаунта.";
        if (accountButton) accountButton.hidden = true;
    }

    toggle.addEventListener("change", () => {
        if (!allowed) {
            toggle.checked = false;
            return;
        }
        if (typeof window.setAdvancedMode === "function") window.setAdvancedMode(toggle.checked);
    });
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
        const { error: deleteError } = await window.harvestHubSupabase.functions.invoke("delete-account", { body: { confirmation: "DELETE_ACCOUNT" } });
        if (deleteError) {
            button.disabled = false;
            button.textContent = "Удалить аккаунт";
            return setSettingsMessage("deleteAccountMessage", "Не удалось удалить аккаунт. Попробуйте ещё раз позже.", "error");
        }

        await window.harvestHubSupabase.auth.signOut();
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace(window.location.pathname);
    });
}

async function initSettingsPage() {
    await initAdvancedModeSetting();
    await initAccountSecurity();
}

window.resetAllSiteData = resetAllSiteData;
window.clearSiteCache = clearSiteCache;
window.settingsInit = initSettingsPage;