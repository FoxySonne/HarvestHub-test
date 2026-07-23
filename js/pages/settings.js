async function resetAllSiteData() {
    if (!confirm("Очистить все локальные данные HarvestHub на этом устройстве? Синхронизированные данные в аккаунте останутся без изменений. На этом устройстве потребуется войти в аккаунт заново.")) return;

    try {
        // Завшаем только локальную сессию, чтобы облачные данные не восстановились
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

function escapeSettingsHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function initAdvancedModeSetting() {
    const toggle = document.getElementById("advancedModeToggle");
    const message = document.getElementById("advancedModeAccessMessage");
    const accountButton = document.getElementById("advancedModeAccountButton");
    if (!toggle) return { loaded: true, hasAccess: false, isAdmin: false };

    const session = await getRegisteredAccountSession();
    const accessManager = window.harvestHubAdvancedModeAccess;
    const status = accessManager
        ? await accessManager.refresh()
        : { loaded: true, hasAccess: false, isAdmin: false };
    const signedIn = Boolean(session?.user);
    const allowed = signedIn && status.hasAccess;

    toggle.disabled = !allowed;
    toggle.checked = allowed && typeof window.getAdvancedMode === "function" && window.getAdvancedMode();

    if (!signedIn) {
        if (message) message.textContent = "Продвинутый режим доступен только зарегистрированным пользователям.";
        if (accountButton) accountButton.hidden = false;
    } else if (!allowed) {
        if (message) message.textContent = "Доступ пока не выдан администратором сайта.";
        if (accountButton) accountButton.hidden = true;
    } else {
        if (message) message.textContent = "Доступ выдан. Режим можно включать и выключать.";
        if (accountButton) accountButton.hidden = true;
    }

    toggle.addEventListener("change", () => {
        if (!allowed) {
            toggle.checked = false;
            return;
        }
        if (typeof window.setAdvancedMode === "function") {
            toggle.checked = window.setAdvancedMode(toggle.checked);
        }
    });

    return status;
}

function renderAdvancedModeAccounts(accounts) {
    const list = document.getElementById("advancedModeAccountList");
    if (!list) return;

    if (!accounts.length) {
        list.innerHTML = '<p class="cloud-login-note">Зарегистрированных пользователей пока нет.</p>';
        return;
    }

    list.innerHTML = accounts.map(account => {
        const userId = escapeSettingsHtml(account.user_id);
        const nickname = escapeSettingsHtml(account.nickname || account.email || "Пользователь");
        const email = escapeSettingsHtml(account.email || "Email не указан");
        const state = account.state ? ` · штат ${escapeSettingsHtml(account.state)}` : "";
        const hasAccess = Boolean(account.has_access);
        const isAdmin = Boolean(account.is_admin);
        const badgeClass = hasAccess ? "game-profile-badge is-active" : "game-profile-badge";
        const buttonClass = hasAccess && !isAdmin ? "game-profile-select danger-button" : "game-profile-select";
        const buttonText = isAdmin ? "Администратор" : hasAccess ? "Отозвать" : "Выдать доступ";

        return `
            <article class="game-profile-card">
                <div class="game-profile-card-copy">
                    <div class="game-profile-card-title">
                        <strong>${nickname}</strong>
                        <span class="${badgeClass}">${hasAccess ? "Доступ выдан" : "Нет доступа"}</span>
                    </div>
                    <p>${email}${state}</p>
                </div>
                <div class="game-profile-actions">
                    <button
                        type="button"
                        class="${buttonClass}"
                        data-advanced-access-user="${userId}"
                        data-advanced-access-enabled="${hasAccess ? "0" : "1"}"
                        ${isAdmin ? "disabled" : ""}
                    >${buttonText}</button>
                </div>
            </article>`;
    }).join("");
}

async function loadAdvancedModeAccounts() {
    const manager = window.harvestHubAdvancedModeAccess;
    if (!manager) throw new Error("Управление доступом пока недоступно.");
    const accounts = await manager.listAccounts();
    renderAdvancedModeAccounts(accounts);
}

async function initAdvancedModeAdmin(status) {
    const card = document.getElementById("advancedModeAdminCard");
    const list = document.getElementById("advancedModeAccountList");
    if (!card || !list || !status?.isAdmin) return;

    card.hidden = false;
    setSettingsMessage("advancedModeAdminMessage", "Загружаем пользователей…");

    try {
        await loadAdvancedModeAccounts();
        setSettingsMessage("advancedModeAdminMessage", "");
    } catch (error) {
        console.error("Не удалось загрузить пользователей:", error);
        setSettingsMessage("advancedModeAdminMessage", "Не удалось загрузить список пользователей.", "error");
    }

    list.addEventListener("click", async event => {
        const button = event.target.closest?.("[data-advanced-access-user]");
        if (!button || button.disabled) return;

        const userId = button.dataset.advancedAccessUser;
        const enabled = button.dataset.advancedAccessEnabled === "1";
        const normalText = button.textContent;
        button.disabled = true;
        button.textContent = enabled ? "Выдаём…" : "Отзываем…";
        setSettingsMessage("advancedModeAdminMessage", "");

        try {
            await window.harvestHubAdvancedModeAccess.setAccess(userId, enabled);
            await loadAdvancedModeAccounts();
            setSettingsMessage(
                "advancedModeAdminMessage",
                enabled ? "Доступ выдан." : "Доступ отозван.",
                "success"
            );
        } catch (error) {
            console.error("Не удалось изменить доступ:", error);
            button.disabled = false;
            button.textContent = normalText;
            setSettingsMessage("advancedModeAdminMessage", error?.message || "Не удалось изменить доступ.", "error");
        }
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
    document.getElementById("resetSiteDataButton")?.addEventListener("click", resetAllSiteData);
    const accessStatus = await initAdvancedModeSetting();
    await initAdvancedModeAdmin(accessStatus);
    await initAccountSecurity();
}

window.resetAllSiteData = resetAllSiteData;
window.clearSiteCache = clearSiteCache;
window.settingsInit = initSettingsPage;
