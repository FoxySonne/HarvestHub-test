function clearSiteCache() {

    if (!confirm("Очистить кэш HarvestHub?")) {

        return;

    }

    // Удаляем кэш браузера

    if ("caches" in window) {

        caches.keys().then(cacheNames => {

            cacheNames.forEach(cacheName => {

                caches.delete(cacheName);

            });

        });

    }

    // Через небольшую паузу обновляем страницу

    setTimeout(() => {

        location.reload(true);

    }, 500);

}