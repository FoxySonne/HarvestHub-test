(() => {
  const TURBO_WEEK_STATE_PREFIX = "harvesthub_turbo_vs_week_state:";
  const TROOP_TRANSFER_STORAGE_KEY = "harvesthub_troop_training_transfer";
  const PROFILE_BLOCK_STATE_PREFIX = "harvesthub_profile_block_state:";
  const PAGES = {
    "calculator/ipk.html": { label: "Игра по-крупному", sync: "forms", custom: true },
    "calculator/turbo-vs.html": { label: "Турбочерепашка & VS", sync: "turbo" },
    "calculator/season-resources.html": { label: "Сезонные ресурсы", sync: "forms" },
    "calculator/troop-training.html": { label: "Обучение войск", sync: "forms", clearTransfer: true }
  };

  let resetInProgress = false;

  function getDataScope() {
    const profileId = window.getActiveDataProfileId?.() || "";
    return profileId ? `profile:${profileId}` : "local";
  }

  function setStatus(message, isError = false) {
    const status = document.querySelector("[data-calculator-reset-status]");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  function clearLocalData(pageName, config) {
    window.harvestHubStorage?.clearPageFormState?.(pageName);
    const scope = getDataScope();
    localStorage.removeItem(`${PROFILE_BLOCK_STATE_PREFIX}${scope}:${pageName}`);

    if (config.sync === "turbo") {
      localStorage.removeItem(`${TURBO_WEEK_STATE_PREFIX}${scope}`);
    }

    if (config.clearTransfer) {
      localStorage.removeItem(`${TROOP_TRANSFER_STORAGE_KEY}:${scope}`);
    }
  }

  async function uploadClearedData(syncType) {
    if (syncType === "turbo") {
      await window.harvestHubTurboVsCloudSync?.forceUpload?.();
      return;
    }
    await window.harvestHubCalculatorFormsCloudSync?.forceUpload?.();
  }

  async function resetCalculatorPage(button) {
    if (resetInProgress) return;
    const pageName = window.harvestHubNavigation?.getCurrentPage?.() || localStorage.getItem("currentPage") || "";
    const config = PAGES[pageName];
    if (!config) return;

    const confirmed = window.confirm(
      `Удалить все сохранённые данные калькулятора «${config.label}» для текущего профиля? Данные остальных калькуляторов не изменятся.`
    );
    if (!confirmed) return;

    resetInProgress = true;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    setStatus("Удаляем данные…");

    try {
      if (config.custom) {
        const resetHandler = window.harvestHubCalculatorResetHandlers?.[pageName];
        if (typeof resetHandler !== "function") throw new Error("Калькулятор ещё загружается. Попробуйте ещё раз.");
        await resetHandler();
      }

      clearLocalData(pageName, config);
      await window.loadPage(pageName, {
        skipCurrentSave: true,
        skipProfileRefresh: true,
        skipVisit: true
      });
      await uploadClearedData(config.sync);
      setStatus("Данные этого калькулятора удалены.");
      window.dispatchEvent(new CustomEvent("harvesthub:calculator-data-reset", {
        detail: { pageName }
      }));
    } catch (error) {
      console.error(`Не удалось удалить данные калькулятора ${pageName}:`, error);
      setStatus(error?.message || "Не удалось удалить данные. Попробуйте ещё раз.", true);
    } finally {
      resetInProgress = false;
      const currentButton = document.querySelector("[data-calculator-reset]");
      if (currentButton) {
        currentButton.disabled = false;
        currentButton.removeAttribute("aria-busy");
      }
    }
  }

  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-calculator-reset]");
    if (button) resetCalculatorPage(button);
  });
})();
