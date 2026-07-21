(() => {
  const STORAGE_KEY = "harvesthub_theme";
  const THEMES = new Set(["dark", "light"]);

  function normalizeTheme(theme) {
    return THEMES.has(theme) ? theme : "dark";
  }

  function getTheme() {
    return normalizeTheme(localStorage.getItem(STORAGE_KEY));
  }

  function syncControls() {
    const isLight = getTheme() === "light";
    document.querySelectorAll("[data-theme-toggle]").forEach(toggle => {
      toggle.checked = isLight;
      toggle.setAttribute("aria-checked", String(isLight));
    });
  }

  function applyTheme(theme) {
    const normalizedTheme = normalizeTheme(theme);
    document.documentElement.dataset.theme = normalizedTheme;
    document.documentElement.style.colorScheme = normalizedTheme;
    syncControls();
    return normalizedTheme;
  }

  function setTheme(theme, { notify = true } = {}) {
    const previousTheme = getTheme();
    const appliedTheme = normalizeTheme(theme);
    localStorage.setItem(STORAGE_KEY, appliedTheme);
    applyTheme(appliedTheme);

    if (notify && appliedTheme !== previousTheme) {
      window.dispatchEvent(new CustomEvent("harvesthub:theme-change", {
        detail: { theme: appliedTheme }
      }));
    }

    return appliedTheme;
  }

  document.addEventListener("change", event => {
    const toggle = event.target.closest?.("[data-theme-toggle]");
    if (!toggle) return;
    setTheme(toggle.checked ? "light" : "dark");
  });

  window.addEventListener("storage", event => {
    if (event.key === STORAGE_KEY) applyTheme(event.newValue);
  });

  window.addEventListener("DOMContentLoaded", syncControls);

  window.harvestHubTheme = {
    getTheme,
    setTheme,
    applyTheme,
    syncControls
  };

  applyTheme(getTheme());
})();
