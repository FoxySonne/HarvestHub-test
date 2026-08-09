import { seasonDatabase } from "../../data/season-database.js";

const PAGE_NAME = "calculator/oil-dna-copper.html";
const EVENT = seasonDatabase.territoryEvent;
const UPDATE_INTERVAL_MS = 30 * 1000;
const EVENT_END_UTC_MINUTE = 23 * 60 + 50;
const MOSCOW_UTC_OFFSET_MINUTES = 3 * 60;
const TOWER_POINTS = [
  { key: "barrel1", type: "barrel", index: 1, rate: EVENT.scoring.barrelPointsPerMinute },
  { key: "barrel2", type: "barrel", index: 2, rate: EVENT.scoring.barrelPointsPerMinute },
  { key: "crane1", type: "crane", index: 1, rate: EVENT.scoring.cranePointsPerMinute },
  { key: "crane2", type: "crane", index: 2, rate: EVENT.scoring.cranePointsPerMinute }
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

function getOpponentCount() {
  return Math.min(3, Math.max(1, readInteger("territoryOpponentCount", 1)));
}

function getLairOpponentCount() {
  return Math.min(3, Math.max(1, readInteger("territoryLairOpponentCount", 1)));
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

  let multiplier = input.dataset.scorePlain === "true" ? 1 : 1000;
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

function formatEnteredScore(entry) {
  if (!entry) return "—";
  if (entry.multiplier === 1000000) return `${formatDecimal(entry.value / 1000000)}М`;
  if (entry.multiplier === 1000) return `${formatDecimal(entry.value / 1000)}К`;
  return formatNumber(entry.value);
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
  const isOpen = currentUtcMinute < EVENT_END_UTC_MINUTE;

  return {
    now,
    currentUtcMinute,
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
  if (!select) return;
  select.innerHTML = EVENT.towers.map(item => `<option value="${item.size}">${item.size}</option>`).join("");
}

function fillLairSelect() {
  const select = byId("territoryLairSize");
  if (!select) return;
  select.innerHTML = EVENT.lairs.map(item => `<option value="${item.size}">${item.size}</option>`).join("");
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
          <input id="territoryOpponent${index}Score" data-score-input type="text" inputmode="decimal" placeholder="Например, 19">
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
        <input id="territoryLairOpponent${index}Score" data-score-input type="text" inputmode="decimal" placeholder="Например, 68">
      </label>
    </section>
  `).join("");
}

function isTowerPointAvailable(point, tower) {
  return point.type === "barrel" ? point.index <= tower.barrels : point.index <= tower.cranes;
}

function syncOpponentVisibility() {
  const count = getOpponentCount();
  document.querySelectorAll("[data-territory-opponent]").forEach(section => {
    section.hidden = Number(section.dataset.territoryOpponent) > count;
  });
}

function syncLairOpponentVisibility() {
  const count = getLairOpponentCount();
  document.querySelectorAll("[data-territory-lair-opponent]").forEach(section => {
    section.hidden = Number(section.dataset.territoryLairOpponent) > count;
  });
}

function syncOwnershipMatrix() {
  const tower = getSelectedTower();
  const count = getOpponentCount();

  document.querySelectorAll("[data-territory-owner-row]").forEach(row => {
    const owner = row.dataset.territoryOwnerRow;
    const opponentIndex = owner.startsWith("opponent") ? Number(owner.replace("opponent", "")) : 0;
    row.hidden = opponentIndex > count;
  });

  document.querySelectorAll("[data-territory-point-owner]").forEach(input => {
    const point = TOWER_POINTS.find(item => item.key === input.dataset.territoryPoint);
    const owner = input.dataset.territoryPointOwner;
    const opponentIndex = owner.startsWith("opponent") ? Number(owner.replace("opponent", "")) : 0;
    const ownerActive = opponentIndex === 0 || opponentIndex <= count;
    const available = point ? isTowerPointAvailable(point, tower) : false;
    input.disabled = !ownerActive || !available;
    if (input.disabled) input.checked = false;
  });
}

function readOpponents() {
  const count = getOpponentCount();
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    return {
      index,
      score: readScoreInput(`territoryOpponent${index}Score`),
      attacks: readInteger(`territoryOpponent${index}Attacks`, 0)
    };
  });
}

function readLairOpponents() {
  const count = getLairOpponentCount();
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    return {
      index,
      score: readScoreInput(`territoryLairOpponent${index}Score`)
    };
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
    const checked = document.querySelector(
      `[data-territory-point-owner][data-territory-point="${point.key}"]:checked`
    );
    const owner = checked?.dataset.territoryPointOwner;
    if (!owner || !Object.prototype.hasOwnProperty.call(rates, owner)) return;
    rates[owner] += point.rate;
    pointCounts[owner] += 1;
  });

  return {
    rates,
    pointCounts,
    availablePointCount: availablePoints.length
  };
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

function scoreUncertainty(entry) {
  return entry?.abbreviated ? EVENT.scoring.conservativeHiddenPointsBufferPerSide : 0;
}

function conservativeOurScore(entry) {
  return Math.max(0, entry.value - scoreUncertainty(entry));
}

function conservativeOpponentScore(entry) {
  return entry.value + scoreUncertainty(entry);
}

function optimisticScore(entry) {
  return entry.value + scoreUncertainty(entry);
}

function pessimisticScore(entry) {
  return Math.max(0, entry.value - scoreUncertainty(entry));
}

function buildTowerParticipants(ourScore, opponents) {
  return [
    { key: "us", label: "Мы", score: ourScore },
    ...opponents.map(opponent => ({
      key: `opponent${opponent.index}`,
      label: `Соперник ${opponent.index}`,
      score: opponent.score
    }))
  ];
}

function renderTowerProjectionRows(rows) {
  const body = byId("territoryTowerProjectionBody");
  if (!body) return;

  body.innerHTML = rows.map(row => `
    <tr>
      <td>${row.label}</td>
      <td>${formatEnteredScore(row.score)}</td>
      <td>${formatNumber(row.currentFinal)}</td>
      <td>${formatNumber(row.fullFinal)}</td>
    </tr>
  `).join("");
}

function renderTowerProjectionMessage(message) {
  const body = byId("territoryTowerProjectionBody");
  if (body) body.innerHTML = `<tr><td colspan="4">${message}</td></tr>`;
}

function renderTimeProjectionRows(rows) {
  const body = byId("territoryTimeProjectionBody");
  if (!body) return;

  body.innerHTML = rows.map(row => `
    <tr>
      <td>${row.label}</td>
      <td>${formatNumber(row.score)}</td>
    </tr>
  `).join("");
}

function renderTimeProjectionMessage(message) {
  const body = byId("territoryTimeProjectionBody");
  if (body) body.innerHTML = `<tr><td colspan="2">${message}</td></tr>`;
}

function readProjectionTarget(clock) {
  const value = String(byId("territoryProjectionTime")?.value || "").trim();
  if (!value) return { message: "Выберите время." };
  if (!clock.isOpen) return { message: "Событие уже завершено." };

  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return { message: "Укажите время в формате ЧЧ:ММ." };

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const targetMoscowMinute = hours * 60 + minutes;
  const targetUtcMinute = (targetMoscowMinute - MOSCOW_UTC_OFFSET_MINUTES + 1440) % 1440;

  if (targetUtcMinute > EVENT_END_UTC_MINUTE) {
    return { message: "Событие заканчивается в 02:50 МСК." };
  }
  if (targetUtcMinute < clock.currentUtcMinute) {
    return { message: "Выбранное время уже прошло." };
  }

  return {
    label: value,
    minutesAhead: targetUtcMinute - clock.currentUtcMinute
  };
}

function updateTimeProjection({ clock, ourScore, opponents, ownership }) {
  const target = readProjectionTarget(clock);
  if (!target.label) {
    setText("territoryTimeProjectionTitle", "Прогноз на выбранное время");
    renderTimeProjectionMessage(target.message);
    return;
  }

  setText("territoryTimeProjectionTitle", `Прогноз на ${target.label} МСК`);

  if (!ourScore || opponents.some(item => !item.score)) {
    renderTimeProjectionMessage("Введите текущие очки всех участников.");
    return;
  }

  const rows = [{
    label: "Мы",
    score: ourScore.value + (ownership.rates.us || 0) * target.minutesAhead
  }];

  opponents.forEach(opponent => {
    rows.push({
      label: `Соперник ${opponent.index}`,
      score: opponent.score.value
        + (ownership.rates[`opponent${opponent.index}`] || 0) * target.minutesAhead
    });
  });

  renderTimeProjectionRows(rows);
}

function canWinAfterFullCapture({ candidate, participants, ownership, minute, remainingMinutes, towerMaxRate }) {
  const candidateRate = ownership.rates[candidate.key] || 0;
  const captureBonus = Math.max(
    0,
    ownership.availablePointCount - (ownership.pointCounts[candidate.key] || 0)
  );
  const afterCaptureMinutes = Math.max(0, remainingMinutes - minute);
  const candidateFinal = optimisticScore(candidate.score)
    + candidateRate * minute
    + captureBonus
    + towerMaxRate * afterCaptureMinutes;

  return participants.every(other => {
    if (other.key === candidate.key) return true;
    const otherFinal = pessimisticScore(other.score)
      + (ownership.rates[other.key] || 0) * minute;
    return candidateFinal > otherFinal;
  });
}

function findLastChanceMinute({ candidate, participants, ownership, remainingMinutes, towerMaxRate }) {
  for (let minute = remainingMinutes; minute >= 0; minute -= 1) {
    if (canWinAfterFullCapture({
      candidate,
      participants,
      ownership,
      minute,
      remainingMinutes,
      towerMaxRate
    })) {
      return minute;
    }
  }
  return null;
}

function renderLastChanceRows({ clock, participants, ownership, towerMaxRate }) {
  const body = byId("territoryLastChanceBody");
  if (!body) return;

  if (!clock.isOpen || participants.some(item => !item.score)) {
    body.innerHTML = `<tr><td colspan="3">${clock.isOpen ? "Введите текущие очки всех участников." : "Событие уже завершено."}</td></tr>`;
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

    if (minute == null) {
      return `
        <tr>
          <td>${participant.label}</td>
          <td>Шанса уже нет</td>
          <td>—</td>
        </tr>
      `;
    }

    const deadline = new Date(clock.now.getTime() + minute * 60 * 1000);
    const deadlineText = minute === clock.remainingMinutes
      ? "02:50 МСК"
      : `${formatMoscowTime(deadline)} МСК`;
    const remainingText = minute === 0 ? "прямо сейчас" : formatDuration(minute);

    return `
      <tr>
        <td>${participant.label}</td>
        <td>${deadlineText}</td>
        <td>${remainingText}</td>
      </tr>
    `;
  }).join("");
}

function calculateSafeStopMinute({ ourScore, opponents, ownership, remainingMinutes, towerMaxRate }) {
  const ourBase = conservativeOurScore(ourScore);
  const ourRate = ownership.rates.us || 0;
  const totalExpectedRetakes = opponents.reduce((sum, item) => sum + item.attacks, 0);

  for (let minute = 0; minute <= remainingMinutes; minute += 1) {
    const allSafe = opponents.every(opponent => {
      const opponentKey = `opponent${opponent.index}`;
      const opponentRate = ownership.rates[opponentKey] || 0;
      const afterStopMinutes = Math.max(0, remainingMinutes - minute);
      const captureBonus = afterStopMinutes > 0
        ? Math.max(0, ownership.availablePointCount - (ownership.pointCounts[opponentKey] || 0))
        : 0;

      const ourFinal = ourBase + ourRate * minute + totalExpectedRetakes;
      const opponentFinal = conservativeOpponentScore(opponent.score)
        + opponentRate * minute
        + opponent.attacks
        + towerMaxRate * afterStopMinutes
        + captureBonus;

      return ourFinal > opponentFinal;
    });

    if (allSafe) return minute;
  }

  return null;
}

function clearGuaranteeResults() {
  setText("territoryHoldTime", "—");
  setText("territorySafeTime", "—");
  setText("territoryGuaranteeScore", "—");
}

function updateSafeTime({ clock, ourScore, opponents, ownership, towerMaxRate }) {
  if (!clock.isOpen || !ourScore || opponents.some(item => !item.score)) {
    clearGuaranteeResults();
    return;
  }

  const mathematicalMinute = calculateSafeStopMinute({
    ourScore,
    opponents,
    ownership,
    remainingMinutes: clock.remainingMinutes,
    towerMaxRate
  });

  if (mathematicalMinute == null) {
    clearGuaranteeResults();
    setText("territorySafetyNote", "При текущем раскладе безопасного момента до конца события нет.");
    return;
  }

  const safetyMinutes = EVENT.scoring.calculationSafetyMinutes;
  const recommendedMinute = Math.min(clock.remainingMinutes, mathematicalMinute + safetyMinutes);
  const safeTime = new Date(clock.now.getTime() + recommendedMinute * 60 * 1000);
  const ourRate = ownership.rates.us || 0;
  const totalExpectedRetakes = opponents.reduce((sum, item) => sum + item.attacks, 0);
  const scoreAtGuarantee = ourScore.value + ourRate * recommendedMinute + totalExpectedRetakes;

  setText("territoryHoldTime", formatDuration(recommendedMinute));
  setText("territorySafeTime", formatMoscowTime(safeTime));
  setText("territoryGuaranteeScore", `≈ ${formatCompactScore(scoreAtGuarantee)}`);

  if (mathematicalMinute + safetyMinutes > clock.remainingMinutes) {
    setText(
      "territorySafetyNote",
      "Математическая граница слишком близко к окончанию события, поэтому безопаснее держать вышку до 02:50 МСК."
    );
    return;
  }

  setText(
    "territorySafetyNote",
    `Время уже включает дополнительные ${safetyMinutes} минуты запаса и +1 очко сопернику за каждую точку, которую ему придётся захватить после нашего ухода.`
  );
}

function updateTowerCalculator() {
  const clock = getEventClock();
  const tower = getSelectedTower();
  const ourScore = readScoreInput("territoryOurScore");
  const opponents = readOpponents();
  const remainingMinutes = clock.remainingMinutes;
  const towerMaxRate = tower.maxPointsPerMinute;

  syncOpponentVisibility();
  syncOwnershipMatrix();
  const ownership = getOwnershipState();
  const participants = buildTowerParticipants(ourScore, opponents);

  setText("territoryCurrentTime", formatMoscowTime(clock.now));
  setText("territoryTimeLeft", clock.isOpen ? formatDuration(remainingMinutes) : "событие завершено");
  setText("territoryTowerMaxRate", `${formatNumber(towerMaxRate)} очк./мин`);
  updateTimeProjection({ clock, ourScore, opponents, ownership });
  renderLastChanceRows({ clock, participants, ownership, towerMaxRate });

  if (!ourScore || opponents.some(item => !item.score)) {
    renderTowerProjectionMessage("Введите текущие очки всех участников.");
    updateSafeTime({ clock, ourScore, opponents, ownership, towerMaxRate });
    return;
  }

  const totalExpectedRetakes = opponents.reduce((sum, item) => sum + item.attacks, 0);
  const ourCurrentFinal = ourScore.value + (ownership.rates.us || 0) * remainingMinutes + totalExpectedRetakes;
  const ourCaptureBonus = clock.isOpen
    ? ownership.availablePointCount - (ownership.pointCounts.us || 0)
    : 0;
  const ourFullFinal = ourScore.value + towerMaxRate * remainingMinutes + totalExpectedRetakes + ourCaptureBonus;

  const rows = [{
    label: "Мы",
    score: ourScore,
    currentFinal: ourCurrentFinal,
    fullFinal: ourFullFinal
  }];

  opponents.forEach(opponent => {
    const ownerKey = `opponent${opponent.index}`;
    const currentFinal = opponent.score.value
      + (ownership.rates[ownerKey] || 0) * remainingMinutes
      + opponent.attacks;
    const captureBonus = clock.isOpen
      ? ownership.availablePointCount - (ownership.pointCounts[ownerKey] || 0)
      : 0;
    const fullFinal = opponent.score.value
      + towerMaxRate * remainingMinutes
      + opponent.attacks
      + captureBonus;

    rows.push({
      label: `Соперник ${opponent.index}`,
      score: opponent.score,
      currentFinal,
      fullFinal
    });
  });

  renderTowerProjectionRows(rows);
  updateSafeTime({ clock, ourScore, opponents, ownership, towerMaxRate });
}

function updateLairCalculator() {
  const lair = getSelectedLair();
  const ourScore = readScoreInput("territoryLairOurScore");
  const opponents = readLairOpponents();

  syncLairOpponentVisibility();
  setText("territoryLairPointsPerHit", formatNumber(lair.pointsPerHit));

  if (!ourScore || opponents.some(item => !item.score)) {
    clearLairResults();
    setText("territoryLairPointsPerHit", formatNumber(lair.pointsPerHit));
    setLairStatus("neutral", "Введите текущие очки", "К счёту без обозначения автоматически добавляется «К». Если это обычные очки, удалите «К».");
    return;
  }

  const ourConservative = conservativeOurScore(ourScore);
  const mainThreat = opponents.reduce((highest, opponent) => {
    const value = conservativeOpponentScore(opponent.score);
    if (!highest || value > highest.conservativeScore) {
      return { ...opponent, conservativeScore: value };
    }
    return highest;
  }, null);

  if (!mainThreat) {
    clearLairResults();
    setText("territoryLairPointsPerHit", formatNumber(lair.pointsPerHit));
    setLairStatus("neutral", "Введите счёт соперника", "Для расчёта нужен хотя бы один соперник.");
    return;
  }

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
  syncOpponentVisibility();
  syncLairOpponentVisibility();
  syncOwnershipMatrix();
  updateTowerCalculator();
  updateLairCalculator();
}

function bindScoreInputs() {
  document.querySelectorAll("[data-score-input]").forEach(input => {
    input.dataset.scorePreviousValue = input.value;

    input.addEventListener("input", () => {
      const previous = String(input.dataset.scorePreviousValue || "").trim();
      const current = String(input.value || "").trim();
      const previousWithoutK = previous.replace(/[кk]$/i, "").trim();

      if (/[кk]$/i.test(previous) && current && current === previousWithoutK) {
        input.dataset.scorePlain = "true";
      } else if (/[кkмm]$/i.test(current)) {
        delete input.dataset.scorePlain;
      } else if (!current) {
        delete input.dataset.scorePlain;
      }

      input.dataset.scorePreviousValue = current;
      updateAll();
    });

    input.addEventListener("blur", () => {
      const value = String(input.value || "").trim();
      if (!value || /[кkмm]$/i.test(value) || input.dataset.scorePlain === "true") return;

      input.value = `${value}К`;
      input.dataset.scorePreviousValue = input.value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
}

function markRestoredPlainScores() {
  document.querySelectorAll("[data-score-input]").forEach(input => {
    const value = String(input.value || "").trim();
    if (value && !/[кkмm]$/i.test(value)) input.dataset.scorePlain = "true";
    input.dataset.scorePreviousValue = value;
  });
}

function bindOwnershipInputs() {
  document.querySelectorAll("[data-territory-point-owner]").forEach(input => {
    input.addEventListener("change", () => {
      if (input.checked) {
        document.querySelectorAll(
          `[data-territory-point-owner][data-territory-point="${input.dataset.territoryPoint}"]`
        ).forEach(other => {
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
    ".season-page select, .season-page input:not([data-score-input]):not([data-territory-point-owner])"
  ).forEach(input => {
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
  bindScoreInputs();
  bindOwnershipInputs();
  bindOtherInputs();

  window.harvestHubStorage?.restorePageFormState?.(PAGE_NAME);
  markRestoredPlainScores();
  updateAll();

  window.harvestHubOilDnaCopperTimer = window.setInterval(updateTowerCalculator, UPDATE_INTERVAL_MS);
}
