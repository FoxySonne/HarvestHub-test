import { seasonDatabase } from "../../data/season-database.js";

const PAGE_NAME = "calculator/oil-dna-copper.html";
const EVENT = seasonDatabase.territoryEvent;
const UPDATE_INTERVAL_MS = 30 * 1000;

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = byId(id);
  if (element) element.textContent = value;
}

function readNumber(id, fallback = 0) {
  const value = Number(byId(id)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function readInteger(id, fallback = 0) {
  return Math.max(0, Math.floor(readNumber(id, fallback)));
}

function parseScore(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(",", ".");

  if (!normalized) return null;

  let multiplier = 1;
  let numericPart = normalized;

  if (/[кk]$/.test(normalized)) {
    multiplier = 1000;
    numericPart = normalized.slice(0, -1);
  } else if (/[мm]$/.test(normalized)) {
    multiplier = 1000000;
    numericPart = normalized.slice(0, -1);
  }

  const parsed = Number(numericPart);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * multiplier);
}

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString("ru-RU");
}

function formatGameScore(value) {
  const step = EVENT.scoring.scoreDisplayStepPoints;
  const rounded = Math.ceil(Math.max(0, Number(value) || 0) / step) * step;
  if (rounded < 1000) return formatNumber(rounded);
  return `${(rounded / 1000).toFixed(2).replace(".", ",")}К`;
}

function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest} мин`;
  return `${hours} ч ${String(rest).padStart(2, "0")} мин`;
}

function formatMoscowTime(date) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function getEventClock(now = new Date()) {
  const currentUtcMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const endUtcMinute = 23 * 60 + 50;
  const isOpen = currentUtcMinute < endUtcMinute;

  return {
    now,
    isOpen,
    remainingMinutes: isOpen ? Math.max(0, endUtcMinute - currentUtcMinute) : 0
  };
}

function getSelectedTower() {
  const size = byId("territoryTowerSize")?.value;
  return EVENT.towers.find(item => item.size === size) || EVENT.towers[0];
}

function getSelectedLair() {
  const size = byId("territoryLairSize")?.value;
  return EVENT.lairs.find(item => item.size === size) || EVENT.lairs[0];
}

function fillDatabaseSelects() {
  const towerSelect = byId("territoryTowerSize");
  const lairSelect = byId("territoryLairSize");

  if (towerSelect) {
    towerSelect.innerHTML = EVENT.towers
      .map(item => `<option value="${item.size}">${item.size}</option>`)
      .join("");
  }

  if (lairSelect) {
    lairSelect.innerHTML = EVENT.lairs
      .map(item => `<option value="${item.size}">${item.size}</option>`)
      .join("");
  }
}

function renderOpponentFields() {
  const container = byId("territoryOpponents");
  if (!container) return;

  container.innerHTML = [1, 2, 3].map(index => `
    <section class="season-panel" data-territory-opponent="${index}">
      <h4>Соперник ${index}</h4>
      <div class="season-form-grid season-form-grid-compact">
        <label class="season-field">
          <span>Текущий счёт</span>
          <input id="territoryOpponent${index}Score" type="text" inputmode="decimal" placeholder="Например, 1,68К">
        </label>
        <label class="season-field">
          <span class="tooltip" data-tooltip="За бочку 2 очка в минуту, за кран — 1">Очков в минуту</span>
          <input id="territoryOpponent${index}Rate" type="number" min="0" step="1" value="0">
        </label>
        <label class="season-field">
          <span>Предположим успешных атак будет</span>
          <input id="territoryOpponent${index}Attacks" type="number" min="0" step="1" value="0">
        </label>
      </div>
    </section>
  `).join("");
}

function syncOpponentVisibility() {
  const count = Math.min(3, Math.max(1, readInteger("territoryOpponentCount", 1)));
  document.querySelectorAll("[data-territory-opponent]").forEach(section => {
    section.hidden = Number(section.dataset.territoryOpponent) > count;
  });
}

function readOpponents() {
  const count = Math.min(3, Math.max(1, readInteger("territoryOpponentCount", 1)));
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    return {
      index,
      score: parseScore(byId(`territoryOpponent${index}Score`)?.value),
      rate: Math.max(0, readNumber(`territoryOpponent${index}Rate`, 0)),
      attacks: readInteger(`territoryOpponent${index}Attacks`, 0)
    };
  });
}

function setTowerStatus(state, title, message) {
  const card = byId("territoryTowerStatus");
  if (card) card.dataset.state = state;
  setText("territoryTowerStatusTitle", title);
  setText("territoryTowerStatusMessage", message);
}

function clearTowerResults() {
  [
    "territoryMainThreat",
    "territoryPointsNeeded",
    "territoryTargetScore",
    "territoryHoldTime",
    "territorySafeTime"
  ].forEach(id => setText(id, "—"));
  const list = byId("territoryThreatList");
  if (list) list.innerHTML = "";
}

function validateTowerRates(tower, ourRate, opponents) {
  const totalRate = ourRate + opponents.reduce((sum, item) => sum + item.rate, 0);
  if (ourRate > tower.maxPointsPerMinute || opponents.some(item => item.rate > tower.maxPointsPerMinute)) {
    return `Одна из скоростей выше максимума для вышки ${tower.size}: ${tower.maxPointsPerMinute} очк./мин.`;
  }
  if (totalRate > tower.maxPointsPerMinute) {
    return `Сумма введённых скоростей ${totalRate} очк./мин выше максимума вышки ${tower.size}: ${tower.maxPointsPerMinute} очк./мин.`;
  }
  return "";
}

function conservativeScores(ourScore, opponents) {
  const buffer = EVENT.scoring.conservativeHiddenPointsBufferPerSide;
  return {
    our: Math.max(0, ourScore - buffer),
    opponents: opponents.map(item => ({
      ...item,
      conservativeScore: item.score + buffer
    }))
  };
}

function canWinWithCurrentDistribution(ourScore, ourRate, opponents, remainingMinutes) {
  return opponents.every(opponent => {
    const pairedCaptures = opponent.attacks;
    const ourFinal = ourScore + ourRate * remainingMinutes + pairedCaptures;
    const opponentFinal = opponent.conservativeScore
      + opponent.rate * remainingMinutes
      + pairedCaptures;
    return ourFinal > opponentFinal;
  });
}

function findSafeMinuteAgainstOpponent({
  ourScore,
  ourRate,
  opponent,
  towerMaxRate,
  remainingMinutes
}) {
  for (let minute = 0; minute <= remainingMinutes; minute += 1) {
    const pairedCaptures = opponent.attacks;
    const ourFinal = ourScore + ourRate * minute + pairedCaptures;
    const opponentFinal = opponent.conservativeScore
      + opponent.rate * minute
      + pairedCaptures
      + towerMaxRate * (remainingMinutes - minute);

    if (ourFinal > opponentFinal) return minute;
  }
  return null;
}

function renderThreatList({ ourScore, opponents, towerMaxRate, remainingMinutes }) {
  const list = byId("territoryThreatList");
  if (!list) return;

  list.innerHTML = opponents.map(opponent => {
    const pairedCaptures = opponent.attacks;
    const ourLockedScore = ourScore + pairedCaptures;
    const opponentMaximum = opponent.conservativeScore
      + pairedCaptures
      + towerMaxRate * remainingMinutes;
    const canCatch = opponentMaximum >= ourLockedScore;

    return `<div><span>Соперник ${opponent.index}</span><strong>${canCatch ? "может догнать" : "уже не догонит"}</strong></div>`;
  }).join("");
}

function updateTowerCalculator() {
  const clock = getEventClock();
  const tower = getSelectedTower();
  const ourScoreRaw = parseScore(byId("territoryOurScore")?.value);
  const ourRate = Math.max(0, readNumber("territoryOurRate", 0));
  const opponentsRaw = readOpponents();

  setText("territoryCurrentTime", formatMoscowTime(clock.now));
  setText("territoryTimeLeft", clock.isOpen ? formatDuration(clock.remainingMinutes) : "событие завершено");

  syncOpponentVisibility();

  if (!clock.isOpen) {
    clearTowerResults();
    setTowerStatus("neutral", "Событие завершено", "Новый игровой день начнётся в 03:00 МСК.");
    return;
  }

  if (ourScoreRaw == null || opponentsRaw.some(item => item.score == null)) {
    clearTowerResults();
    setTowerStatus("neutral", "Введите текущие очки", "Можно вводить значения так, как их показывает игра: например 1,93К и 1,68К.");
    return;
  }

  const rateError = validateTowerRates(tower, ourRate, opponentsRaw);
  if (rateError) {
    clearTowerResults();
    setTowerStatus("danger", "Проверьте очки в минуту", rateError);
    return;
  }

  const conservative = conservativeScores(ourScoreRaw, opponentsRaw);
  const opponents = conservative.opponents;
  const remainingMinutes = clock.remainingMinutes;
  const towerMaxRate = tower.maxPointsPerMinute;
  const winPossible = canWinWithCurrentDistribution(
    conservative.our,
    ourRate,
    opponents,
    remainingMinutes
  );

  const safeByOpponent = opponents.map(opponent => ({
    opponent,
    minute: findSafeMinuteAgainstOpponent({
      ourScore: conservative.our,
      ourRate,
      opponent,
      towerMaxRate,
      remainingMinutes
    })
  }));

  const unresolved = safeByOpponent.some(item => item.minute == null);
  const mainThreat = safeByOpponent.reduce((worst, item) => {
    if (!worst) return item;
    const current = item.minute == null ? Infinity : item.minute;
    const previous = worst.minute == null ? Infinity : worst.minute;
    return current > previous ? item : worst;
  }, null);

  setText("territoryMainThreat", mainThreat ? `Соперник ${mainThreat.opponent.index}` : "—");
  renderThreatList({
    ourScore: conservative.our,
    opponents,
    towerMaxRate,
    remainingMinutes
  });

  if (!winPossible || unresolved) {
    setText("territoryPointsNeeded", "—");
    setText("territoryTargetScore", "—");
    setText("territoryHoldTime", "до конца недостаточно");
    setText("territorySafeTime", "—");
    setTowerStatus(
      "danger",
      "При текущем распределении забрать вышку невозможно",
      "Если очки в минуту не изменятся, хотя бы один соперник закончит событие не ниже вас. Нужно изменить распределение точек и ввести данные заново."
    );
    return;
  }

  const mathematicalSafeMinute = Math.max(...safeByOpponent.map(item => item.minute));
  const safetyMinutes = EVENT.scoring.calculationSafetyMinutes;
  const recommendedMinute = mathematicalSafeMinute + safetyMinutes;
  const hasFullSafetyMargin = recommendedMinute <= remainingMinutes;
  const holdMinutes = Math.min(recommendedMinute, remainingMinutes);
  const totalExpectedRetakes = opponentsRaw.reduce((sum, item) => sum + item.attacks, 0);
  const pointsNeeded = Math.max(0, Math.round(ourRate * holdMinutes + totalExpectedRetakes));
  const targetScore = ourScoreRaw + pointsNeeded;
  const safeTime = new Date(clock.now.getTime() + holdMinutes * 60 * 1000);

  setText("territoryPointsNeeded", formatNumber(pointsNeeded));
  setText("territoryTargetScore", `≈ ${formatGameScore(targetScore)}`);
  setText("territoryHoldTime", formatDuration(holdMinutes));
  setText("territorySafeTime", formatMoscowTime(safeTime));

  if (!hasFullSafetyMargin) {
    setTowerStatus(
      "success",
      "Забрать вышку возможно, но уходить раньше конца не стоит",
      "Математическая граница достигается слишком близко к окончанию события, поэтому полный дополнительный запас 2 минуты не помещается."
    );
    return;
  }

  if (mathematicalSafeMinute === 0) {
    setTowerStatus(
      "success",
      "Вышка уже математически гарантирована",
      `Для дополнительного запаса калькулятор рекомендует сохранить текущую ситуацию ещё ${safetyMinutes} минуты.`
    );
    return;
  }

  setTowerStatus(
    "success",
    "Забрать вышку возможно",
    `После указанного безопасного момента ни один из ${opponents.length} соперников не сможет обойти вас, даже если затем получит всю вышку до конца события.`
  );
}

function setLairStatus(state, title, message) {
  const card = byId("territoryLairStatus");
  if (card) card.dataset.state = state;
  setText("territoryLairStatusTitle", title);
  setText("territoryLairStatusMessage", message);
}

function updateLairCalculator() {
  const lair = getSelectedLair();
  const hits = readInteger("territoryLairHits", 0);
  const target = readInteger("territoryLairTarget", 0);
  const totalPoints = hits * lair.pointsPerHit;

  setText("territoryLairPointsPerHit", formatNumber(lair.pointsPerHit));
  setText("territoryLairTotalPoints", formatNumber(totalPoints));

  if (target <= 0) {
    setText("territoryLairHitsNeeded", "—");
    setText("territoryLairAnchorBalance", "—");
    setLairStatus("neutral", "Введите нужное количество очков", "Один якорь равен одному удару по логову.");
    return;
  }

  const hitsNeeded = Math.ceil(target / lair.pointsPerHit);
  const balance = hits - hitsNeeded;

  setText("territoryLairHitsNeeded", formatNumber(hitsNeeded));
  setText(
    "territoryLairAnchorBalance",
    balance >= 0 ? `останется ${formatNumber(balance)}` : `не хватит ${formatNumber(Math.abs(balance))}`
  );

  if (balance >= 0) {
    setLairStatus("success", "Якорей достаточно", `Для ${formatNumber(target)} очков потребуется ${formatNumber(hitsNeeded)} ударов.`);
  } else {
    setLairStatus("danger", "Якорей недостаточно", `Нужно ещё ${formatNumber(Math.abs(balance))} якорей для указанного количества очков.`);
  }
}

function updateAll() {
  updateTowerCalculator();
  updateLairCalculator();
}

function bindInputs() {
  document.querySelectorAll(".season-page input, .season-page select").forEach(input => {
    input.addEventListener("input", updateAll);
    input.addEventListener("change", updateAll);
  });
}

export function init() {
  if (window.harvestHubOilDnaCopperTimer) {
    window.clearInterval(window.harvestHubOilDnaCopperTimer);
  }

  fillDatabaseSelects();
  renderOpponentFields();
  bindInputs();

  window.harvestHubStorage?.restorePageFormState?.(PAGE_NAME);
  syncOpponentVisibility();
  updateAll();

  window.harvestHubOilDnaCopperTimer = window.setInterval(updateTowerCalculator, UPDATE_INTERVAL_MS);
}
