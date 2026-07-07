import { RESOURCE_CONFIG } from "./config.js";
import { getAdvancedMode, getElement } from "./dom.js";
import { parseNumber, parseTimeToSeconds, roundTroops } from "./format.js";

export function parseAvailableResource(inputId) {
  const input = getElement(inputId);
  const value = parseNumber(input?.value);
  const activeUnit = document.querySelector(`[data-unit-for="${inputId}"] .is-active`)?.dataset.unit || "raw";

  return activeUnit === "m" ? value * 1000000 : value;
}

export function getAvailableData() {
  const resources = {};

  RESOURCE_CONFIG.forEach(resource => {
    resources[resource.key] = parseAvailableResource(resource.availableId);
  });

  return {
    resources,
    time: parseTimeToSeconds(getElement("troopAvailableTime")?.value, true),
    garrisonCapacity: parseNumber(getElement("troopGarrisonCapacity")?.value),
    desired: parseNumber(getElement("troopDesiredAmount")?.value),
    currentAmount: parseNumber(getElement("troopCurrentAmount")?.value),
    currentLevel: getElement("troopCurrentLevel")?.value || ""
  };
}

export function isStageEnabled(stage) {
  const checkbox = getElement(`troopStage${stage}Enabled`);
  return checkbox ? checkbox.checked : true;
}

export function getStageData(stageCard) {
  const stage = Number(stageCard.dataset.stage);
  const costs = {
    food: parseNumber(getElement(`troopStage${stage}Food`)?.value),
    wood: parseNumber(getElement(`troopStage${stage}Wood`)?.value),
    metal: parseNumber(getElement(`troopStage${stage}Metal`)?.value),
    fuel: parseNumber(getElement(`troopStage${stage}Fuel`)?.value)
  };
  const time = parseTimeToSeconds(getElement(`troopStage${stage}Time`)?.value, false);
  const level = getElement(`troopStage${stage}Level`)?.value || "";
  const enabled = isStageEnabled(stage);
  const hasCost = Object.values(costs).some(value => value > 0) || time > 0;

  return {
    stage,
    type: stage === 1 ? "training" : "upgrade",
    level,
    title: stage === 1 ? "Обучение" : "Улучшение",
    costs,
    time,
    isActive: enabled && (stage === 1 || hasCost)
  };
}

export function getActiveStages() {
  const isAdvanced = getAdvancedMode();

  return Array.from(document.querySelectorAll(".troop-stage-card"))
    .filter(card => isAdvanced || Number(card.dataset.stage) === 1)
    .map(getStageData)
    .filter(stage => stage.isActive);
}

export function getCostForTroops(stages, troops) {
  const multiplier = troops / 1000;
  const resources = { food: 0, wood: 0, metal: 0, fuel: 0 };
  let time = 0;

  stages.forEach(stage => {
    RESOURCE_CONFIG.forEach(resource => {
      resources[resource.key] += stage.costs[resource.key] * multiplier;
    });

    time += stage.time * multiplier;
  });

  return { resources, time };
}

export function getMaxTroopsByAvailable(stages, available) {
  if (stages.length === 0) return 0;

  const perThousand = getCostForTroops(stages, 1000);
  const limits = [];

  RESOURCE_CONFIG.forEach(resource => {
    const cost = perThousand.resources[resource.key];
    if (cost > 0) limits.push((available.resources[resource.key] / cost) * 1000);
  });

  if (perThousand.time > 0) limits.push((available.time / perThousand.time) * 1000);

  const freeGarrison = Math.max(available.garrisonCapacity - available.currentAmount, 0);
  if (available.garrisonCapacity > 0) limits.push(freeGarrison);

  if (limits.length === 0) return 0;

  return roundTroops(Math.min(...limits));
}

export function buildCalculation() {
  const available = getAvailableData();
  const stages = getActiveStages();
  const maxTroops = getMaxTroopsByAvailable(stages, available);
  const desired = available.desired;
  const possibleTroops = desired > 0 ? Math.min(desired, maxTroops) : maxTroops;
  const targetTroops = desired > 0 ? desired : possibleTroops;
  const required = getCostForTroops(stages, targetTroops);
  const spent = getCostForTroops(stages, possibleTroops);
  const remainders = { resources: {}, time: Math.max(available.time - spent.time, 0) };
  const missing = { resources: {}, time: Math.max(required.time - available.time, 0), garrison: 0 };
  const freeGarrison = Math.max(available.garrisonCapacity - available.currentAmount, 0);

  RESOURCE_CONFIG.forEach(resource => {
    const key = resource.key;
    remainders.resources[key] = Math.max(available.resources[key] - spent.resources[key], 0);
    missing.resources[key] = Math.max(required.resources[key] - available.resources[key], 0);
  });

  if (available.garrisonCapacity > 0) {
    missing.garrison = Math.max(targetTroops - freeGarrison, 0);
  }

  return {
    available,
    stages,
    possibleTroops: roundTroops(possibleTroops),
    targetTroops: roundTroops(targetTroops),
    required,
    spent,
    remainders,
    missing,
    desiredMode: desired > 0
  };
}

export function calculateExtraTraining(calculation) {
  const stages = calculation.stages;
  const perThousand = getCostForTroops(stages, 1000);
  const limits = [];

  RESOURCE_CONFIG.forEach(resource => {
    const cost = perThousand.resources[resource.key];
    if (cost > 0) limits.push((calculation.remainders.resources[resource.key] / cost) * 1000);
  });

  if (perThousand.time > 0) limits.push((calculation.remainders.time / perThousand.time) * 1000);

  const freeGarrison = Math.max(
    calculation.available.garrisonCapacity - calculation.available.currentAmount - calculation.possibleTroops,
    0
  );

  if (calculation.available.garrisonCapacity > 0) limits.push(freeGarrison);

  const extraTroops = limits.length ? roundTroops(Math.min(...limits)) : 0;
  const nextBatchTroops = stages.length > 0 ? extraTroops + 1000 : 0;
  const nextBatchRequired = getCostForTroops(stages, nextBatchTroops);
  const shortages = { resources: {}, time: 0, garrison: 0 };

  RESOURCE_CONFIG.forEach(resource => {
    const key = resource.key;
    shortages.resources[key] = Math.max(nextBatchRequired.resources[key] - calculation.remainders.resources[key], 0);
  });

  shortages.time = Math.max(nextBatchRequired.time - calculation.remainders.time, 0);
  shortages.garrison = Math.max(nextBatchTroops - freeGarrison, 0);

  return { extraTroops, nextBatchTroops, shortages };
}