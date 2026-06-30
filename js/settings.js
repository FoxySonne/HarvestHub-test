function clearSiteCache() {

    if (!confirm("Очистить кэш HarvestHub?")) {

        return;

    }

    if ("caches" in window) {

        caches.keys().then(cacheNames => {

            cacheNames.forEach(cacheName => caches.delete(cacheName));

        });

    }

    // Сбрасываем последнюю открытую страницу

    localStorage.removeItem("currentPage");

    location.reload();

}