(() => {
  let resetInProgress = false;

  function getCurrentPage() {
    return window.harvestHubNavigation?.getCurrentPage?.()
      || localStorage.getItem("currentPage")
      || "";
  }

  function removeCurrentPageLocalState() {
    const pageName = getCurrentPage();
    const keys = window.getPageFormStorageKeys?.(pageName) || [];
    keys.forEach(key => localStorage.removeItem(key));
    window.clearProfileBlockState?.(pageName);
    if (pageName === "calculator/turbo-vs.html") {
      window.clearTurboVsWeekState?.();
      localStorage.removeItem("harvesthub_troop_training_transfer_applied_turbo_vs");
    }
    if (pageName === "calculator/troop-training.html") window.clearTroopTrainingTransfer?.();
    return pageName;
  }

  async function runPageSpecificReset(pageName) {
    const handler = window.harvestHubCalculatorResetHandlers?.[pageName];
    if (typeof handler === "function") await handler();
  }

  async function clearRemoteState(pageName) {
    if (pageName === "calculator/turbo-vs.html") {
      await window.harvestHubTurboVsCloudSync?.forceUpload?.();
      return;
    }
    await window.harvestHubCalculatorFormsCloudSync?.forceUpload?.(pageName);
    if (pageName === "calculator/troop-training.html") {
      await window.harvestHubCalculatorFormsCloudSync?.forceTransferUpload?.();
    }
  }

  async function resetCurrentPage(button) {
    if (resetInProgress) return;
    if (!window.confirm("Удалить данные только этой страницы? Это действие нельзя отменить.")) return;

    resetInProgress = true;
    button.disabled = true;
    const status = button.closest(".calculator-data-actions")?.querySelector("[data-calculator-reset-status]");
    if (status) status.textContent = "Удаляем…";

    const pageName = removeCurrentPageLocalState();
    try {
      await runPageSpecificReset(pageName);
      await clearRemoteState(pageName);
      if (status) status.textContent = "Данные этой страницы удалены.";
      if (typeof window.loadPage === "function") {
        await window.loadPage(pageName, { skipCurrentSave: true, trackVisit: false, behavior: "auto" });
      }
    } catch (error) {
      console.error("Не удалось удалить данные страницы:", error);
      if (status) status.textContent = "Не удалось удалить данные. Попробуйте ещё раз.";
    } finally {
      resetInProgress = false;
      button.disabled = false;
    }
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-calculator-reset]");
    if (!button) return;
    event.preventDefault();
    resetCurrentPage(button);
  });
})();
