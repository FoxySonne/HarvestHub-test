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
    .filter(stage => stage.isActive)
    .sort((a, b) => a.stage - b.stage);
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

function cloneRemaining(available) {
  return {
    resources: { ...available.resources },
    time: available.time
  };
}

function createSpentState() {
  return {
    resources: { food: 0, wood: 0, metal: 0, fuel: 0 },
    time: 0
  };
}

function getMaxForSingleStage(stage, remaining, cap = Infinity) {
  const limits = [Math.max(Number(cap) || 0, 0)];

  RESOURCE_CONFIG.forEach(resource => {
    const cost = stage.costs[resource.key];
    if (cost > 0) limits.push((remaining.resources[resource.key] / cost) * 1000);
  });

  if (stage.time > 0) limits.push((remaining.time / stage.time) * 1000);
  return roundTroops(Math.max(Math.min(...limits), 0));
}

function spendStageCost(stage, troops, remaining, spent) {
  const multiplier = troops / 1000;

  RESOURCE_CONFIG.forEach(resource => {
    const key = resource.key;
    const value = stage.costs[key] * multiplier;
    remaining.resources[key] = Math.max(remaining.resources[key] - value, 0);
    spent.resources[key] += value;
  });

  const stageTime = stage.time * multiplier;
  remaining.time = Math.max(remaining.time - stageTime, 0);
  spent.time += stageTime;
}

function getLevelAmount(levels, level) {
  return roundTroops(levels.get(String(level)) || 0);
}

function setLevelAmount(levels, level, amount) {
  levels.set(String(level), roundTroops(amount));
}

function addLevelAmount(levels, level, amount) {
  setLevelAmount(levels, level, getLevelAmount(levels, level) + amount);
}

function createInitialLevelState(available) {
  const levels = new Map();
  if (available.currentLevel && available.currentAmount > 0) {
    setLevelAmount(levels, available.currentLevel, available.currentAmount);
  }
  return levels;
}

function buildSequentialStages(stages, available) {
  const remaining = cloneRemaining(available);
  const spent = createSpentState();
  const levels = createInitialLevelState(available);
  const calculatedStages = [];

  stages.forEach((stage, index) => {
    if (index === 0) {
      const freeGarrison = available.garrisonCapacity > 0
        ? Math.max(available.garrisonCapacity - available.currentAmount, 0)
        : Infinity;
      const desiredCap = available.desired > 0 ? available.desired : Infinity;
      const trainingCap = Math.min(freeGarrison, desiredCap);
      const trainedTroops = getMaxForSingleStage(stage, remaining, trainingCap);
      const existingAtTarget = getLevelAmount(levels, stage.level);

      spendStageCost(stage, trainedTroops, remaining, spent);
      addLevelAmount(levels, stage.level, trainedTroops);

      calculatedStages.push({
        ...stage,
        sourceLevel: null,
        targetLevel: stage.level,
        existing: existingAtTarget,
        incoming: 0,
        availableTroops: trainingCap,
        processedTroops: trainedTroops,
        remainingAtSource: 0,
        totalAtTarget: getLevelAmount(levels, stage.level)
      });
      return;
    }

    const previousStage = calculatedStages[index - 1];
    const sourceLevel = previousStage.targetLevel;
    const targetLevel = stage.level;
    const sourcePool = getLevelAmount(levels, sourceLevel);
    const existingAtTarget = getLevelAmount(levels, targetLevel);
    const upgradedTroops = getMaxForSingleStage(stage, remaining, sourcePool);

    spendStageCost(stage, upgradedTroops, remaining, spent);
    setLevelAmount(levels, sourceLevel, sourcePool - upgradedTroops);
    addLevelAmount(levels, targetLevel, upgradedTroops);

    calculatedStages.push({
      ...stage,
      sourceLevel,
      targetLevel,
      existing: existingAtTarget,
      incoming: sourcePool,
      availableTroops: sourcePool,
      processedTroops: upgradedTroops,
      remainingAtSource: getLevelAmount(levels, sourceLevel),
      totalAtTarget: getLevelAmount(levels, targetLevel)
    });
  });

  return { stages: calculatedStages, levels, remaining, spent };
}

function buildLevelDistribution(stages, levels, available) {
  const orderedLevels = [];

  if (available.currentLevel) orderedLevels.push(String(available.currentLevel));
  stages.forEach(stage => {
    const level = String(stage.targetLevel || stage.level || "");
    if (level && !orderedLevels.includes(level)) orderedLevels.push(level);
  });

  return orderedLevels.map((level, index) => ({
    level,
    stage: index + 1,
    amount: getLevelAmount(levels, level),
    processedTroops: stages.find(stage => String(stage.targetLevel) === level)?.processedTroops || 0
  }));
}

export function buildCalculation() {
  const available = getAvailableData();
  const activeStages = getActiveStages();
  const sequential = buildSequentialStages(activeStages, available);
  const possibleTroops = sequential.stages[0]?.processedTroops || 0;
  const targetTroops = available.desired > 0 ? available.desired : possibleTroops;
  const required = getCostForTroops(activeStages, targetTroops);
  const missing = { resources: {}, time: Math.max(required.time - available.time, 0), garrison: 0 };
  const freeGarrison = Math.max(available.garrisonCapacity - available.currentAmount, 0);

  RESOURCE_CONFIG.forEach(resource => {
    const key = resource.key;
    missing.resources[key] = Math.max(required.resources[key] - available.resources[key], 0);
  });

  if (available.garrisonCapacity > 0) {
    missing.garrison = Math.max(targetTroops - freeGarrison, 0);
  }

  return {
    available,
    stages: sequential.stages,
    distribution: buildLevelDistribution(sequential.stages, sequential.levels, available),
    possibleTroops: roundTroops(possibleTroops),
    targetTroops: roundTroops(targetTroops),
    required,
    spent: sequential.spent,
    remainders: sequential.remaining,
    missing,
    desiredMode: available.desired > 0
  };
}

export function calculateExtraTraining(calculation) {
  const firstStage = calculation.stages[0];
  if (!firstStage) {
    return {
      extraTroops: 0,
      nextBatchTroops: 0,
      shortages: { resources: { food: 0, wood: 0, metal: 0, fuel: 0 }, time: 0, garrison: 0 }
    };
  }

  const nextRoundedTotal = (Math.floor(calculation.possibleTroops / 1000) + 1) * 1000;
  const nextBatchTroops = Math.max(nextRoundedTotal - calculation.possibleTroops, 1);
  const nextBatchRequired = getCostForTroops([firstStage], nextBatchTroops);
  const freeGarrison = calculation.available.garrisonCapacity > 0
    ? Math.max(calculation.available.garrisonCapacity - calculation.available.currentAmount - calculation.possibleTroops, 0)
    : Infinity;
  const shortages = { resources: {}, time: 0, garrison: 0 };

  RESOURCE_CONFIG.forEach(resource => {
    const key = resource.key;
    shortages.resources[key] = Math.max(nextBatchRequired.resources[key] - calculation.remainders.resources[key], 0);
  });

  shortages.time = Math.max(nextBatchRequired.time - calculation.remainders.time, 0);
  shortages.garrison = calculation.available.garrisonCapacity > 0
    ? Math.max(nextBatchTroops - freeGarrison, 0)
    : 0;

  return { extraTroops: 0, nextBatchTroops, nextRoundedTotal, shortages };
}