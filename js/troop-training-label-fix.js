(() => {
  function updateZeroExtraLabel() {
    const title = document.getElementById("troopExtraTitle");
    const shortages = document.getElementById("troopShortages");
    const subtitle = shortages?.previousElementSibling;

    if (!title || !subtitle || !document.querySelector(".troop-page")) return;

    const titleText = title.textContent.trim();
    const subtitleText = subtitle.textContent.trim();
    const match = subtitleText.match(/^Не хватает, чтобы обучить ещё\s+(.+?)\s+войск:$/);

    if (!/^Ещё можно обучить:\s*0\s+войск$/.test(titleText) || !match) return;

    title.textContent = `До следующих ${match[1]} войск не хватает:`;
    subtitle.textContent = "Нужно добавить:";
  }

  function scheduleUpdate() {
    window.setTimeout(updateZeroExtraLabel, 0);
  }

  document.addEventListener("input", event => {
    if (event.target.closest?.(".troop-page")) scheduleUpdate();
  });

  document.addEventListener("change", event => {
    if (event.target.closest?.(".troop-page")) scheduleUpdate();
  });

  window.addEventListener("harvesthub:advanced-mode-change", scheduleUpdate);

  const observer = new MutationObserver(scheduleUpdate);

  function start() {
    const pageContent = document.getElementById("page-content");
    if (!pageContent) return;
    observer.observe(pageContent, { childList: true, subtree: true, characterData: true });
    scheduleUpdate();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
