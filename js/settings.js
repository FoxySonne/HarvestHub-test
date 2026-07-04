async function resetAllSiteData() {

    if (!confirm("Сбросить все данные HarvestHub? Будут удалены сохранённые значения калькуляторов, настройки, профили и локальные данные сайта на этом устройстве.")) {

        return;

    }

    try {

        if ("caches" in window) {

            const cacheNames = await caches.keys();

            await Promise.all(
                cacheNames.map(cacheName => caches.delete(cacheName))
            );

        }

        if ("serviceWorker" in navigator) {

            const registrations = await navigator.serviceWorker.getRegistrations();

            await Promise.all(
                registrations.map(registration => registration.unregister())
            );

        }

        localStorage.clear();
        sessionStorage.clear();

        window.location.reload();

    } catch (error) {

        console.error("Ошибка при сбросе данных:", error);
        alert("Не удалось полностью сбросить данные. Попробуй обновить страницу вручную.");

    }

}

async function clearSiteCache() {

    return resetAllSiteData();

}

function initAdvancedModeSetting() {

    const toggle = document.getElementById("advancedModeToggle");

    if (!toggle) return;

    toggle.checked = typeof window.getAdvancedMode === "function" && window.getAdvancedMode();

    toggle.addEventListener("change", () => {

        if (typeof window.setAdvancedMode === "function") {
            window.setAdvancedMode(toggle.checked);
        }

        updateProfileStatus();

    });

}

function getProfileFormValues() {

    return {
        nickname: document.getElementById("profileNickname")?.value || "",
        state: document.getElementById("profileState")?.value || "",
        pin: document.getElementById("profilePin")?.value || ""
    };

}

function setProfileMessage(message) {

    const element = document.getElementById("profileMessage");

    if (element) element.textContent = message || "";

}

function confirmLocalDataStorage() {

    return confirm(
        "Нажимая эту кнопку, ты соглашаешься, что HarvestHub будет сохранять данные профиля и введённые в калькуляторах значения на этом устройстве.\n\n" +
        "Данные хранятся локально в браузере этого устройства и могут быть удалены при сбросе данных сайта, очистке браузера или localStorage.\n\n" +
        "Код из 4 цифр нужен только для доступа к локальному профилю. Пока данные не синхронизируются между устройствами автоматически."
    );

}

function updateProfileStatus() {

    const status = document.getElementById("profileStatus");

    if (!status) return;

    const profile = typeof window.getActiveProfile === "function" ? window.getActiveProfile() : null;

    if (!profile) {
        status.textContent = "Профиль не выбран";
        return;
    }

    status.textContent = `Выбран профиль: ${profile.nickname}, штат ${profile.state}`;

}

function createProfileFromSettings() {

    const values = getProfileFormValues();

    if (typeof window.createUserProfile !== "function") return;

    const result = window.createUserProfile(values.nickname, values.state, values.pin);

    setProfileMessage(result.message);
    updateProfileStatus();

}

function loginProfileFromSettings() {

    const values = getProfileFormValues();

    if (typeof window.loginUserProfile !== "function") return;

    const result = window.loginUserProfile(values.nickname, values.state, values.pin);

    setProfileMessage(result.message);
    updateProfileStatus();

}

function logoutProfileFromSettings() {

    if (typeof window.logoutUserProfile !== "function") return;

    const result = window.logoutUserProfile();

    setProfileMessage(result.message);
    updateProfileStatus();

}

function initSettingsPage() {

    initAdvancedModeSetting();
    updateProfileStatus();

}

window.resetAllSiteData = resetAllSiteData;
window.clearSiteCache = clearSiteCache;
window.confirmLocalDataStorage = confirmLocalDataStorage;
window.createProfileFromSettings = createProfileFromSettings;
window.loginProfileFromSettings = loginProfileFromSettings;
window.logoutProfileFromSettings = logoutProfileFromSettings;
window.settingsInit = initSettingsPage;
