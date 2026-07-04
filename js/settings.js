async function clearSiteCache() {

    if (!confirm("Очистить кэш HarvestHub?")) {

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

        localStorage.removeItem("currentPage");
        sessionStorage.clear();

        window.location.reload();

    } catch (error) {

        console.error("Ошибка при очистке кэша:", error);
        alert("Не удалось полностью очистить кэш. Попробуй обновить страницу вручную.");

    }

}

function initAdvancedModeSetting() {

    const toggle = document.getElementById("advancedModeToggle");

    if (!toggle) return;

    toggle.value = typeof window.getAdvancedMode === "function" && window.getAdvancedMode() ? "1" : "0";

    toggle.addEventListener("change", () => {

        if (typeof window.setAdvancedMode === "function") {
            window.setAdvancedMode(toggle.value === "1");
        }

    });

}

function init() {

    initAdvancedModeSetting();

}
