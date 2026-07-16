import { getAdvancedMode, getElement } from "./dom.js";
import { formatAvailableTimeInput, formatStageTimeInput } from "./format.js";
import { applyStagePreset, initStages, renderResults, syncStageEnabledState } from "./render.js?v=20260716-2";
import { getPreferredDay, getTransferStatusHtml, getTransferTargets, saveTransferPayload, saveTurboVsTransfer } from "./storage-transfer.js";

function bindUnitToggles() {
  document.querySelectorAll(".troop-unit-toggle button").forEach(button => {
    button.addEventListener("click", () => {
      const group = button.closest(".troop-unit-toggle");
      group.querySelectorAll("button").forEach(item => item.classList.toggle("is-active", item === button));
      renderResults();
      if (typeof window.savePageFormState === "function") window.savePageFormState();
    });
  });
}

function bindTimeFormatting() {
  document.querySelectorAll("#troopAvailableTime, [data-time-format='stage']").forEach(input => {
    input.addEventListener("blur", () => {
      input.value = input.id === "troopAvailableTime" ? formatAvailableTimeInput(input.value) : formatStageTimeInput(input.value);
      renderResults();
      if (typeof window.savePageFormState === "function") window.savePageFormState();
    });
  });
}

function bindStagePresets() {
  document.querySelectorAll(".troop-stage-card").forEach(card => {
    const stage = Number(card.dataset.stage);
    const select = getElement(`troopStage${stage}Level`);

    if (!select) return;

    select.addEventListener("change", () => {
      applyStagePreset(stage);
      renderResults();
      if (typeof window.savePageFormState === "function") window.savePageFormState();
    });
  });
}

function bindStageEnabled() {
  document.querySelectorAll("[data-stage-enabled]").forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      const stage = Number(checkbox.dataset.stageEnabled);
      syncStageEnabledState(stage);
      renderResults();
      if (typeof window.savePageFormState === "function") window.savePageFormState();
    });
  });
}

function bindInputs() {
  document.querySelectorAll(".troop-page input, .troop-page select").forEach(field => {
    field.addEventListener("input", renderResults);
    field.addEventListener("change", renderResults);
  });
}

function bindTransferButtons() {
  document.querySelectorAll("[data-transfer-target]").forEach(button => {
    button.addEventListener("click", () => {
      const calculation = renderResults();
      const target = button.dataset.transferTarget;
      const payload = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        target,
        targets: getTransferTargets(target),
        preferredDay: getPreferredDay(target),
        troops: calculation.possibleTroops,
        stages: calculation.stages.map(stage => ({
          stage: stage.stage,
          type: stage.type,
          level: stage.level,
          troops: stage.processedTroops
        })),
        distribution: calculation.distribution,
        createdAt: new Date().toISOString()
      };

      saveTransferPayload(payload);
      const directSaveResult = saveTurboVsTransfer(target, payload);

      const status = getElement("troopTransferStatus");
      if (status) status.innerHTML = getTransferStatusHtml(target, calculation, directSaveResult);
    });
  });
}

function syncAdvancedMode() {
  const advanced = getAdvancedMode();
  document.querySelectorAll(".troop-stage-card[data-stage='2'], .troop-stage-card[data-stage='3']").forEach(card => {
    card.hidden = !advanced;
  });

  document.querySelectorAll(".troop-stage-card").forEach(card => syncStageEnabledState(Number(card.dataset.stage)));
  renderResults();
}

export function init() {
  initStages();
  bindUnitToggles();
  bindTimeFormatting();
  bindStagePresets();
  bindStageEnabled();
  bindInputs();
  bindTransferButtons();
  syncAdvancedMode();

  window.addEventListener("harvesthub:advanced-mode-change", syncAdvancedMode);

  if (typeof window.bindCollapsibleCards === "function") window.bindCollapsibleCards();
}