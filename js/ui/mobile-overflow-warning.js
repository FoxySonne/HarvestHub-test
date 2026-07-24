(() => {
  const STORAGE_KEY = "harvesthub_mobile_overflow_warning_seen";
  const MOBILE_QUERY = "(max-width: 899px)";
  let checkTimer = null;

  function hasUnexpectedOverflow() {
    if (!window.matchMedia(MOBILE_QUERY).matches) return false;
    const viewport = document.documentElement.clientWidth;
    const pageWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    return pageWidth > viewport + 6;
  }

  function closeWarning() {
    document.getElementById("mobileOverflowWarning")?.remove();
    sessionStorage.setItem(STORAGE_KEY, "1");
  }

  function showWarning() {
    if (sessionStorage.getItem(STORAGE_KEY) === "1" || document.getElementById("mobileOverflowWarning")) return;
    const overlay = document.createElement("div");
    overlay.id = "mobileOverflowWarning";
    overlay.className = "mobile-overflow-warning";
    overlay.innerHTML = `
      <div class="mobile-overflow-warning__dialog" role="dialog" aria-modal="true" aria-labelledby="mobileOverflowWarningTitle">
        <h3 id="mobileOverflowWarningTitle">Содержимое не помещается по ширине</h3>
        <p>Сайт уже попытался адаптировать страницу под экран, но браузер всё ещё показывает часть содержимого шире доступной области.</p>
        <p><strong>iPhone и iPad, Safari:</strong> нажмите «AA» в адресной строке, откройте масштаб страницы и выберите меньшее значение.</p>
        <p><strong>Android и Chrome:</strong> откройте меню браузера и уменьшите масштаб страницы. На некоторых устройствах этот пункт находится в настройках специальных возможностей.</p>
        <p><strong>Компьютер:</strong> используйте Ctrl− или Cmd−.</p>
        <button type="button">ОК</button>
      </div>`;
    overlay.querySelector("button")?.addEventListener("click", closeWarning);
    document.body.append(overlay);
  }

  function scheduleCheck() {
    clearTimeout(checkTimer);
    checkTimer = window.setTimeout(() => {
      if (hasUnexpectedOverflow()) showWarning();
    }, 450);
  }

  window.addEventListener("resize", scheduleCheck);
  window.addEventListener("orientationchange", scheduleCheck);
  window.addEventListener("load", scheduleCheck);

  const observer = new MutationObserver(scheduleCheck);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleCheck();
})();