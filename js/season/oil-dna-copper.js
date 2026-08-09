import { seasonDatabase } from "../../data/season-database.js";

const PAGE_NAME = "calculator/oil-dna-copper.html";
const EVENT = seasonDatabase.territoryEvent;
const UPDATE_INTERVAL_MS = 30 * 1000;
const EVENT_END_UTC_MINUTE = 23 * 60 + 50;
const TOWER_POINTS = [
  { key: "barrel1", type: "barrel", index: 1, rate: EVENT.scoring.barrelPointsPerMinute, label: "Бочка 1" },
  { key: "barrel2", type: "barrel", index: 2, rate: EVENT.scoring.barrelPointsPerMinute, label: "Бочка 2" },
  { key: "crane1", type: "crane", index: 1, rate: EVENT.scoring.cranePointsPerMinute, label: "Кран 1" },
  { key: "crane2", type: "crane", index: 2, rate: EVENT.scoring.cranePointsPerMinute, label: "Кран 2" }
];

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

function getCount(id) {
  const input = byId(id);
  const count = Math.max(1, Math.floor(Number(input?.value) || 1));
  if (input && Number(input.value) !== count) input.value = String(count);
  return count;
}

function getOpponentCount() {
  return getCount("territoryOpponentCount");
}

function getLairOpponentCount() {
  return getCount("territoryLairOpponentCount");
}

function readScoreInput(id) {
  const input = byId(id);
  if (!input) return null;

  const normalized = String(input.value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(",", ".");

  if (!normalized) return null;

  const requiresUnit = input.dataset.scoreRequiredUnit === "true";
  let multiplier = requiresUnit || input.dataset.scorePlain !== "true" ? 1000 : 1;
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

  return {
    value: Math.round(parsed * multiplier),
    multiplier,
    abbreviated: multiplier !== 1
  };
}

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString("ru-RU");
}

function formatDecimal(value, maximumFractionDigits = 2) {
  return Number(value).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits
  });
}

function formatCompactScore(value) {
  const numeric = Math.max(0, Number(value) || 0);
  if (numeric >= 1000000) return `${formatDecimal(numeric / 1000000)}М`;
  if (numeric >= 1000) return `${formatDecimal(numeric / 1000)}К`;
  return formatNumber(numeric);
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
  const isOpen = currentUtcMinute < EVENT_END_UTC_MINUTE;

  return {
    now,
    isOpen,
    remainingMinutes: isOpen ? Math.max(0, EVENT_END_UTC_MINUTE - currentUtcMinute) : 0
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
  const select = byId("territoryTowerSize");
  if (select) select.innerHTML = EVENT.towers.map(item => `<option value="${item.size}">${item.size}</option>`).join("");
}

function fillLairSelect() {
  const select = byId("territoryLairSize");
  if (select) select.innerHTML = EVENT.lairs.map(item => `<option value="${item.size}">${item.size}</option>`).join("");
}

function opponentFieldsMarkup(index) {
  return `
    <label class="season-field" data-territory-opponent="${index}">
      <span>Соперник ${index} — текущий счёт</span>
      <input id="territoryOpponent${index}Score" data-score-input type="text" inputmode="decimal" placeholder="Например, 19">
    </label>
    <label class="season-field" data-territory-opponent="${index}">
      <span>Соперник ${index} — успешных атак</span>
      <input id="territoryOpponent${index}Attacks" type="number" min="0" step="1" value="0">
    </label>`;
}

function lairOpponentFieldMarkup(index) {
  return `
    <label class="season-field" data-territory-lair-opponent="${index}">
      <span>Соперник ${index} — текущий счёт</span>
      <input id="territoryLairOpponent${index}Score" data-score-input data-score-required-unit="true" type="text" inputmode="decimal" placeholder="Например, 4,04">
    </label>`;
}

function ownershipRowMarkup(index) {
  const ownerKey = `opponent${index}`;
  const cells = TOWER_POINTS.map(point => `
    <td>
      <label class="checkbox">
        <input id="territoryPointOpponent${index}${point.key[0].toUpperCase()}${point.key.slice(1)}" type="checkbox"
          data-territory-point-owner="${ownerKey}" data-territory-point="${point.key}"
          aria-label="Соперник ${index} держит ${point.label}">
      </label>
    </td>`).join("");

  return `<tr data-territory-owner-row="${ownerKey}"><td>Соперник ${index}</td>${cells}</tr>`;
}

function syncDynamicOpponentUi() {
  const opponentCount = getOpponentCount();
  const opponentContainer = byId("territoryOpponents");
  const ownershipBody = byId("territoryOwnershipBody");

  for (let index = 1; index <= opponentCount; index += 1) {
    if (!byId(`territoryOpponent${index}Score`)) {
      opponentContainer?.insertAdjacentHTML("beforeend", opponentFieldsMarkup(index));
    }
    if (!document.querySelector(`[data-territory-owner-row="opponent${index}"]`)) {
      ownershipBody?.insertAdjacentHTML("beforeend", ownershipRowMarkup(index));
    }
  }

  document.querySelectorAll("[data-territory-opponent]").forEach(element => {
    element.hidden = Number(element.dataset.territoryOpponent) > opponentCount;
  });
  document.querySelectorAll("[data-territory-owner-row]").forEach(row => {
    const owner = row.dataset.territoryOwnerRow;
    const index = owner.startsWith("opponent") ? Number(owner.replace("opponent", "")) : 0;
    row.hidden = index > opponentCount;
  });

  const lairCount = getLairOpponentCount();
  const lairContainer = byId("territoryLairOpponents");
  for (let index = 1; index <= lairCount; index += 1) {
    if (!byId(`territoryLairOpponent${index}Score`)) {
      lairContainer?.insertAdjacentHTML("beforeend", lairOpponentFieldMarkup(index));
    }
  }
  document.querySelectorAll("[data-territory-lair-opponent]").forEach(element => {
    element.hidden = Number(element.dataset.territoryLairOpponent) > lairCount;
  });

  bindScoreInputs();
  bindOwnershipInputs();
  bindOtherInputs();
}

function isTowerPointAvailable(point, tower) {
  return point.type === "barrel" ? point.index <= tower.barrels : point.index <= tower.cranes;
}

function syncOwnershipMatrix() {
  const tower = getSelectedTower();
  const opponentCount = getOpponentCount();

  document.querySelectorAll("[data-territory-point-owner]").forEach(input => {
    const point = TOWER_POINTS.find(item => item.key === input.dataset.territoryPoint);
    const owner = input.dataset.territoryPointOwner;
    const index = owner.startsWith("opponent") ? Number(owner.replace("opponent", "")) : 0;
    const ownerActive = index === 0 || index <= opponentCount;
    const available = point ? isTowerPointAvailable(point, tower) : false;
    input.disabled = !ownerActive || !available;
    if (input.disabled) input.checked = false;
  });
}

function readOpponents() {
  return Array.from({ length: getOpponentCount() }, (_, offset) => {
    const index = offset + 1;
    return {
      index,
      score: readScoreInput(`territoryOpponent${index}Score`),
      attacks: readInteger(`territoryOpponent${index}Attacks`, 0)
    };
  });
}

function readLairOpponents() {
  return Array.from({ length: getLairOpponentCount() }, (_, offset) => {
    const index = offset + 1;
    return { index, score: readScoreInput(`territoryLairOpponent${index}Score`) };
  });
}

function getOwnershipState() {
  const tower = getSelectedTower();
  const count = getOpponentCount();
  const rates = { us: 0 };
  const pointCounts = { us: 0 };

  for (let index = 1; index <= count; index += 1) {
    rates[`opponent${index}`] = 0;
    pointCounts[`opponent${index}`] = 0;
  }

  const availablePoints = TOWER_POINTS.filter(point => isTowerPointAvailable(point, tower));
  availablePoints.forEach(point => {
    const checked = document.querySelector(`[data-territory-point-owner][data-territory-point="${point.key}"]:checked`);
    const owner = checked?.dataset.territoryPointOwner;
    if (!owner || !Object.prototype.hasOwnProperty.call(rates, owner)) return;
    rates[owner] += point.rate;
    pointCounts[owner] += 1;
  });

  return { rates, pointCounts, availablePointCount: availablePoints.length };
}

function scoreUncertainty(entry) {
  return entry?.abbreviated ? EVENT.scoring.conservativeHiddenPointsBufferPerSide : 0;
}

function conservativeScore(entry) {
  return Math.max(0, entry.value - scoreUncertainty(entry));
}

function optimisticScore(entry) {
  return entry.value + scoreUncertainty(entry);
}

function buildTowerParticipants(ourScore, opponents) {
  const ourBonus = opponents.reduce((sum, item) => sum + item.attacks, 0);
  return [
    { key: "us", label: "Мы", score: ourScore, bonus: ourBonus },
    ...opponents.map(opponent => ({
      key: `opponent${opponent.index}`,
      label: `Соперник ${opponent.index}`,
      score: opponent.score,
      bonus: opponent.attacks
    }))
  ];
}

function nominalScoreAt(participant, ownership, minute) {
  return participant.score.value + (ownership.rates[participant.key] || 0) * minute + (participant.bonus || 0);
}

function conservativeScoreAt(participant, ownership, minute) {
  return conservativeScore(participant.score) + (ownership.rates[participant.key] || 0) * minute + (participant.bonus || 0);
}

function optimisticScoreAt(participant, ownership, minute) {
  return optimisticScore(participant.score) + (ownership.rates[participant.key] || 0) * minute + (participant.bonus || 0);
}

function captureBonusFor(participant, ownership) {
  return Math.max(0, ownership.availablePointCount - (ownership.pointCounts[participant.key] || 0));
}

function strongestOtherAt(participant, participants, ownership, minute) {
  return participants
    .filter(other => other.key !== participant.key)
    .map(other => ({ participant: other, score: nominalScoreAt(other, ownership, minute) }))
    .sort((a, b) => b.score - a.score)[0] || null;
}

function canWinAfterFullCapture({ candidate, participants, ownership, minute, remainingMinutes, towerMaxRate }) {
  const afterCaptureMinutes = Math.max(0, remainingMinutes - minute);
  const candidateFinal = optimisticScoreAt(candidate, ownership, minute)
    + captureBonusFor(candidate, ownership)
    + towerMaxRate * afterCaptureMinutes;

  return participants.every(other => {
    if (other.key === candidate.key) return true;
    return candidateFinal > conservativeScoreAt(other, ownership, minute);
  });
}

function findLastChanceMinute({ candidate, participants, ownership, remainingMinutes, towerMaxRate }) {
  for (let minute = remainingMinutes; minute >= 0; minute -= 1) {
    if (canWinAfterFullCapture({ candidate, participants, ownership, minute, remainingMinutes, towerMaxRate })) {
      return minute;
    }
  }
  return null;
}

function renderLastChanceRows({ clock, participants, ownership, towerMaxRate }) {
  const body = byId("territoryLastChanceBody");
  if (!body) return;

  if (!clock.isOpen || participants.some(item => !item.score)) {
    body.innerHTML = `<tr><td colspan="4">${clock.isOpen ? "Введите текущие очки всех участников." : "Событие уже завершено."}</td></tr>`;
    return;
  }

  body.innerHTML = participants.map(participant => {
    const minute = findLastChanceMinute({
      candidate: participant,
      participants,
      ownership,
      remainingMinutes: clock.remainingMinutes,
      towerMaxRate
    });
    const scoreMinute = minute ?? 0;
    const other = strongestOtherAt(participant, participants, ownership, scoreMinute);
    const participantScore = nominalScoreAt(participant, ownership, scoreMinute);
    const otherText = other ? `${other.participant.label} — ${formatCompactScore(other.score)}` : "—";

    if (minute == null) {
      return `<tr><td>${participant.label}</td><td>Шанса уже нет</td><td>${formatCompactScore(participantScore)}</td><td>${otherText}</td></tr>`;
    }

    const deadline = new Date(clock.now.getTime() + minute * 60 * 1000);
    const deadlineText = minute === clock.remainingMinutes ? "02:50 МСК" : `${formatMoscowTime(deadline)} МСК`;
    return `<tr><td>${participant.label}</td><td>${deadlineText}</td><td>${formatCompactScore(participantScore)}</td><td>${otherText}</td></tr>`;
  }).join("");
}

function isGuaranteedAtMinute({ holder, participants, ownership, minute, remainingMinutes, towerMaxRate }) {
  const holderScore = conservativeScoreAt(holder, ownership, minute);
  const afterCaptureMinutes = Math.max(0, remainingMinutes - minute);

  return participants.every(challenger => {
    if (challenger.key === holder.key) return true;
    const challengerFinal = optimisticScoreAt(challenger, ownership, minute)
      + captureBonusFor(challenger, ownership)
      + towerMaxRate * afterCaptureMinutes;
    return holderScore > challengerFinal;
  });
}

function findGuarantee({ participants, ownership, remainingMinutes, towerMaxRate }) {
  for (let minute = 0; minute <= remainingMinutes; minute += 1) {
    const holder = participants.find(participant => isGuaranteedAtMinute({
      holder: participant,
      participants,
      ownership,
      minute,
      remainingMinutes,
      towerMaxRate
    }));
    if (holder) return { holder, minute };
  }
  return null;
}

function renderGuarantee({ clock, participants, ownership, towerMaxRate }) {
  if (!clock.isOpen || participants.some(item => !item.score)) {
    setText("territoryGuaranteedOwner", "—");
    setText("territoryGuaranteeTime", "—");
    setText("territoryGuaranteeWinnerScore", "—");
    setText("territoryGuaranteeRivalScore", "—");
    return;
  }

  const guarantee = findGuarantee({
    participants,
    ownership,
    remainingMinutes: clock.remainingMinutes,
    towerMaxRate
  });

  if (!guarantee) {
    setText("territoryGuaranteedOwner", "До конца не определится");
    setText("territoryGuaranteeTime", "—");
    setText("territoryGuaranteeWinnerScore", "—");
    setText("territoryGuaranteeRivalScore", "—");
    return;
  }

  const safetyMinutes = EVENT.scoring.calculationSafetyMinutes;
  const recommendedMinute = Math.min(clock.remainingMinutes, guarantee.minute + safetyMinutes);
  const guaranteeTime = new Date(clock.now.getTime() + recommendedMinute * 60 * 1000);
  const rival = strongestOtherAt(guarantee.holder, participants, ownership, recommendedMinute);

  setText("territoryGuaranteedOwner", guarantee.holder.label);
  setText("territoryGuaranteeTime", recommendedMinute === clock.remainingMinutes ? "02:50 МСК" : `${formatMoscowTime(guaranteeTime)} МСК`);
  setText("territoryGuaranteeWinnerScore", formatCompactScore(nominalScoreAt(guarantee.holder, ownership, recommendedMinute)));
  setText(
    "territoryGuaranteeRivalScore",
    rival ? `${rival.participant.label} — ${formatCompactScore(rival.score)}` : "—"
  );
}

function clearLairResults() {
  ["territoryLairMainThreat", "territoryLairHitsNeeded", "territoryLairPointsNeeded", "territoryLairTargetScore", "territoryLairLead"]
    .forEach(id => setText(id, "—"));
}

function updateTowerCalculator() {
  syncDynamicOpponentUi();
  syncOwnershipMatrix();

  const clock = getEventClock();
  const tower = getSelectedTower();
  const ourScore = readScoreInput("territoryOurScore");
  const opponents = readOpponents();
  const ownership = getOwnershipState();
  const participants = buildTowerParticipants(ourScore, opponents);

  renderGuarantee({ clock, participants, ownership, towerMaxRate: tower.maxPointsPerMinute });
  renderLastChanceRows({ clock, participants, ownership, towerMaxRate: tower.maxPointsPerMinute });
}

function updateLairCalculator() {
  const lair = getSelectedLair();
  const ourScore = readScoreInput("territoryLairOurScore");
  const opponents = readLairOpponents();

  setText("territoryLairPointsPerHit", formatNumber(lair.pointsPerHit));

  if (!ourScore || opponents.some(item => !item.score)) {
    clearLairResults();
    setText("territoryLairPointsPerHit", formatNumber(lair.pointsPerHit));
    setText("territoryLairResultNote", "Введите текущие очки всех участников.");
    return;
  }

  const ourConservative = conservativeScore(ourScore);
  const mainThreat = opponents.reduce((highest, opponent) => {
    const value = optimisticScore(opponent.score);
    if (!highest || value > highest.conservativeScore) return { ...opponent, conservativeScore: value };
    return highest;
  }, null);

  const scoreGap = mainThreat.conservativeScore - ourConservative;
  const hitsNeeded = scoreGap < 0 ? 0 : Math.floor(scoreGap / lair.pointsPerHit) + 1;
  const pointsNeeded = hitsNeeded * lair.pointsPerHit;
  const targetScore = ourScore.value + pointsNeeded;
  const conservativeLead = ourConservative + pointsNeeded - mainThreat.conservativeScore;

  setText("territoryLairMainThreat", `Соперник ${mainThreat.index}`);
  setText("territoryLairHitsNeeded", formatNumber(hitsNeeded));
  setText("territoryLairPointsNeeded", formatNumber(pointsNeeded));
  setText("territoryLairTargetScore", `≈ ${formatCompactScore(targetScore)}`);
  setText("territoryLairLead", formatNumber(Math.max(0, conservativeLead)));
  setText(
    "territoryLairResultNote",
    hitsNeeded === 0
      ? "Вы уже впереди. Расчёт предполагает, что соперники больше не атакуют логово."
      : "Расчёт предполагает, что соперники больше не атакуют логово."
  );
}

function updateAll() {
  syncDynamicOpponentUi();
  syncOwnershipMatrix();
  updateTowerCalculator();
  updateLairCalculator();
}

function bindScoreInputs() {
  document.querySelectorAll("[data-score-input]").forEach(input => {
    if (input.dataset.territoryBound === "true") return;
    input.dataset.territoryBound = "true";
    input.dataset.scorePreviousValue = input.value;

    input.addEventListener("input", () => {
      const previous = String(input.dataset.scorePreviousValue || "").trim();
      const current = String(input.value || "").trim();
      const requiresUnit = input.dataset.scoreRequiredUnit === "true";
      const previousWithoutK = previous.replace(/[кk]$/i, "").trim();

      if (!requiresUnit && /[кk]$/i.test(previous) && current && current === previousWithoutK) {
        input.dataset.scorePlain = "true";
      } else if (requiresUnit || /[кkмm]$/i.test(current) || !current) {
        delete input.dataset.scorePlain;
      }

      input.dataset.scorePreviousValue = current;
      updateAll();
    });

    input.addEventListener("blur", () => {
      const value = String(input.value || "").trim();
      if (!value || /[кkмm]$/i.test(value)) return;
      if (input.dataset.scorePlain === "true" && input.dataset.scoreRequiredUnit !== "true") return;

      input.value = `${value}К`;
      input.dataset.scorePreviousValue = input.value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
}

function normalizeRestoredScores() {
  document.querySelectorAll("[data-score-input]").forEach(input => {
    const value = String(input.value || "").trim();
    const requiresUnit = input.dataset.scoreRequiredUnit === "true";

    if (requiresUnit && value && !/[кkмm]$/i.test(value)) {
      input.value = `${value}К`;
      delete input.dataset.scorePlain;
    } else if (!requiresUnit && value && !/[кkмm]$/i.test(value)) {
      input.dataset.scorePlain = "true";
    }

    input.dataset.scorePreviousValue = input.value;
  });
}

function bindOwnershipInputs() {
  document.querySelectorAll("[data-territory-point-owner]").forEach(input => {
    if (input.dataset.territoryBound === "true") return;
    input.dataset.territoryBound = "true";
    input.addEventListener("change", () => {
      if (input.checked) {
        document.querySelectorAll(`[data-territory-point-owner][data-territory-point="${input.dataset.territoryPoint}"]`)
          .forEach(other => {
            if (other !== input) other.checked = false;
          });
      }
      window.savePageFormState?.(PAGE_NAME);
      updateAll();
    });
  });
}

function bindOtherInputs() {
  document.querySelectorAll(
    ".territory-calculator-page select, .territory-calculator-page input:not([data-score-input]):not([data-territory-point-owner])"
  ).forEach(input => {
    if (input.dataset.territoryBound === "true") return;
    input.dataset.territoryBound = "true";
    input.addEventListener("input", () => {
      if (input.id === "territoryOpponentCount" || input.id === "territoryLairOpponentCount") syncDynamicOpponentUi();
      updateAll();
    });
    input.addEventListener("change", () => {
      if (input.id === "territoryOpponentCount" || input.id === "territoryLairOpponentCount") syncDynamicOpponentUi();
      updateAll();
    });
  });
}

export function init() {
  if (window.harvestHubOilDnaCopperTimer) window.clearInterval(window.harvestHubOilDnaCopperTimer);

  fillTowerSelect();
  fillLairSelect();
  syncDynamicOpponentUi();
  bindScoreInputs();
  bindOwnershipInputs();
  bindOtherInputs();

  window.harvestHubStorage?.restorePageFormState?.(PAGE_NAME);
  syncDynamicOpponentUi();
  window.harvestHubStorage?.restorePageFormState?.(PAGE_NAME);
  normalizeRestoredScores();
  syncOwnershipMatrix();
  updateAll();

  window.harvestHubOilDnaCopperTimer = window.setInterval(updateTowerCalculator, UPDATE_INTERVAL_MS);
}
