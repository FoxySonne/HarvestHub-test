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
