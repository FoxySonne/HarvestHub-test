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

function fillTowerSelect() {
  const towerSelect = byId("territoryTowerSize");
  if (!towerSelect) return;

  towerSelect.innerHTML = EVENT.towers
    .map(item => `<option value="${item.size}">${item.size}</option>`)
    .join("");
}

function fillLairSelect() {
  const lairSelect = byId("territoryLairSize");
  if (!lairSelect) return;

  lairSelect.innerHTML = EVENT.lairs
    .map(item => `<option value="${item.size}">${item.size}</option>`)
    .join("");
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

function renderLairOpponentFields() {
  const container = byId("territoryLairOpponents");
  if (!container) return;

  container.innerHTML = [1, 2, 3].map(index => `
    <section class="season-panel" data-territory-lair-opponent="${index}">
      <h4>Соперник ${index}</h4>
      <label class="season-field">
        <span>Текущий счёт</span>
        <input id="territoryLairOpponent${index}Score" type="text" inputmode="decimal" placeholder="Например, 68К">
      </label>
    </section>
  `).join("");
}

function syncOpponentVisibility() {
  const count = Math.min(3, Math.max(1, readInteger("territoryOpponentCount", 1)));
  document.querySelectorAll("[data-territory-opponent]").forEach(section => {
    section.hidden = Number(section.dataset.territoryOpponent) > count;
  });
}

function syncLairOpponentVisibility() {
  const count = Math.min(3, Math.max(1, readInteger("territoryLairOpponentCount", 1)));
  document.querySelectorAll("[data-territory-lair-opponent]").forEach(section => {
    section.hidden = Number(section.dataset.territoryLairOpponent) > count;
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

function readLairOpponents() {
  const count = Math.min(3, Math.max(1, readInteger("territoryLairOpponentCount", 1)));
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    return {
      index,
      score: parseScore(byId(`territoryLairOpponent${index}Score`)?.value)
    };
  });
}

function setLairStatus(state, title, message) {
  const card = byId("territoryLairStatus");
  if (card) card.dataset.state = state;
  setText("territoryLairStatusTitle", title);
  setText("territoryLairStatusMessage", message);
}

function clearLairResults() {
  [
    "territoryLairMainThreat",
    "territoryLairHitsNeeded",
    "territoryLairPointsNeeded",
    "territoryLairTargetScore",
    "territoryLairLead"
  ].forEach(id => setText(id, "—"));
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

function renderTowerProjectionRows(rows) {
  const body = byId("territoryTowerProjectionBody");
  if (!body) return;

  body.innerHTML = rows.map(row => `
    <tr>
      <td>${row.label}</td>
      <td>${formatNumber(row.score)}</td>
      <td>+${formatNumber(row.currentGain)}</td>
      <td>${formatNumber(row.currentFinal)}</td>
      <td>+${formatNumber(row.fullGain)}</td>
      <td>${formatNumber(row.fullFinal)}</td>
    </tr>
  `).join("");
}

function renderTowerProjectionMessage(message) {
  const body = byId("territoryTowerProjectionBody");
  if (body) body.innerHTML = `<tr><td colspan="6">${message}</td></tr>`;
}

function updateTowerCalculator() {
  const clock = getEventClock();
  const tower = getSelectedTower();
  const ourScore = parseScore(byId("territoryOurScore")?.value);
  const ourRate = Math.max(0, readNumber("territoryOurRate", 0));
  const opponents = readOpponents();
  const remainingMinutes = clock.remainingMinutes;
  const towerMaxRate = tower.maxPointsPerMinute;

  setText("territoryCurrentTime", formatMoscowTime(clock.now));
  setText("territoryTimeLeft", clock.isOpen ? formatDuration(remainingMinutes) : "событие завершено");
  setText("territoryTowerMaxRate", `${formatNumber(towerMaxRate)} очк./мин`);
  syncOpponentVisibility();

  if (ourScore == null || opponents.some(item => item.score == null)) {
    renderTowerProjectionMessage("Введите текущие очки всех участников.");
    return;
  }

  const totalCurrentRate = ourRate + opponents.reduce((sum, item) => sum + item.rate, 0);
  if (ourRate > towerMaxRate || opponents.some(item => item.rate > towerMaxRate) || totalCurrentRate > towerMaxRate) {
    renderTowerProjectionMessage(`Проверьте очки в минуту: максимум вышки ${tower.size} — ${towerMaxRate} очк./мин.`);
    return;
  }

  const totalExpectedRetakes = opponents.reduce((sum, item) => sum + item.attacks, 0);
  const ourCurrentGain = ourRate * remainingMinutes + totalExpectedRetakes;
  const ourFullGain = towerMaxRate * remainingMinutes + totalExpectedRetakes;

  const rows = [{
    label: "Мы",
    score: ourScore,
    currentGain: ourCurrentGain,
    currentFinal: ourScore + ourCurrentGain,
    fullGain: ourFullGain,
    fullFinal: ourScore + ourFullGain
  }];

  opponents.forEach(opponent => {
    const currentGain = opponent.rate * remainingMinutes + opponent.attacks;
    const fullGain = towerMaxRate * remainingMinutes + opponent.attacks;

    rows.push({
      label: `Соперник ${opponent.index}`,
      score: opponent.score,
      currentGain,
      currentFinal: opponent.score + currentGain,
      fullGain,
      fullFinal: opponent.score + fullGain
    });
  });

  renderTowerProjectionRows(rows);
}

function updateLairCalculator() {
  const lair = getSelectedLair();
  const ourScoreRaw = parseScore(byId("territoryLairOurScore")?.value);
  const opponentsRaw = readLairOpponents();

  syncLairOpponentVisibility();
  setText("territoryLairPointsPerHit", formatNumber(lair.pointsPerHit));

  if (ourScoreRaw == null || opponentsRaw.some(item => item.score == null)) {
    clearLairResults();
    setText("territoryLairPointsPerHit", formatNumber(lair.pointsPerHit));
    setLairStatus("neutral", "Введите текущие очки", "Можно вводить значения так, как их показывает игра: например 35К и 68К.");
    return;
  }

  const conservative = conservativeScores(ourScoreRaw, opponentsRaw);
  const mainThreat = conservative.opponents.reduce((highest, opponent) => {
    if (!highest || opponent.conservativeScore > highest.conservativeScore) return opponent;
    return highest;
  }, null);

  if (!mainThreat) {
    clearLairResults();
    setText("territoryLairPointsPerHit", formatNumber(lair.pointsPerHit));
    setLairStatus("neutral", "Введите счёт соперника", "Для расчёта нужен хотя бы один соперник.");
    return;
  }

  const scoreGap = mainThreat.conservativeScore - conservative.our;
  const hitsNeeded = scoreGap < 0 ? 0 : Math.floor(scoreGap / lair.pointsPerHit) + 1;
  const pointsNeeded = hitsNeeded * lair.pointsPerHit;
  const targetScore = ourScoreRaw + pointsNeeded;
  const conservativeLead = conservative.our + pointsNeeded - mainThreat.conservativeScore;

  setText("territoryLairMainThreat", `Соперник ${mainThreat.index}`);
  setText("territoryLairHitsNeeded", formatNumber(hitsNeeded));
  setText("territoryLairPointsNeeded", formatNumber(pointsNeeded));
  setText("territoryLairTargetScore", `≈ ${formatGameScore(targetScore)}`);
  setText("territoryLairLead", formatNumber(Math.max(0, conservativeLead)));

  if (hitsNeeded === 0) {
    setLairStatus(
      "success",
      "Вы уже впереди всех соперников",
      "Если соперники больше не атакуют логово, дополнительных ударов для первого места не требуется."
    );
    return;
  }

  setLairStatus(
    "success",
    `Для захвата потребуется ${hitsNeeded} ${hitsNeeded === 1 ? "якорь" : "якоря/якорей"}`,
    `После ${hitsNeeded} ${hitsNeeded === 1 ? "удара" : "ударов"} ваш счёт станет выше текущего счёта всех соперников.`
  );
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

  fillTowerSelect();
  fillLairSelect();
  renderOpponentFields();
  renderLairOpponentFields();
  bindInputs();

  window.harvestHubStorage?.restorePageFormState?.(PAGE_NAME);
  syncOpponentVisibility();
  syncLairOpponentVisibility();
  updateAll();

  window.harvestHubOilDnaCopperTimer = window.setInterval(updateTowerCalculator, UPDATE_INTERVAL_MS);
}
