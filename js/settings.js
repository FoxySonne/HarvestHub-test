async function resetAllSiteData() {
    if (!confirm("Сбросить все данные HarvestHub? Будут удалены сохранённые значения калькуляторов, настройки, профили и локальные данные сайта на этом устройстве.")) {
        return;
    }

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

function initAdvancedModeSetting() {
    const toggle = document.getElementById("advancedModeToggle");
    if (!toggle) return;

    toggle.checked = typeof window.getAdvancedMode === "function" && window.getAdvancedMode();
    toggle.addEventListener("change", () => {
        if (typeof window.setAdvancedMode === "function") {
            window.setAdvancedMode(toggle.checked);
        }
    });
}

function initSettingsPage() {
    initAdvancedModeSetting();
}

window.resetAllSiteData = resetAllSiteData;
window.clearSiteCache = clearSiteCache;
window.settingsInit = initSettingsPage;