import { database } from "../data/database.js";

/* ==========================================================
РАЗВОРАЧИВАЕМ СПИСОК ДНЯ
Поддерживает:
- "blue_bolt"
- { type: "action", id: "blue_bolt" }
- { type: "category", id: "equipment" }
========================================================== */

function resolveDayList(list) {
  return list.flatMap(item => {
    if (typeof item === "string") {
      return item;
    }

    if (item.type === "action") {
      return item.id;
    }

    if (item.type === "category") {
      return database.action
        .filter(action => action.categoryId === item.id)
        .map(action => action.id);
    }

    return [];
  });
}

/* ==========================================================
ПОЛУЧАЕМ ДЕЙСТВИЕ ПО ID
========================================================== */

function getActionById(actionId) {
  return database.action.find(action => action.id === actionId);
}

/* ==========================================================
СОЗДАЁМ СТРОКУ ДЕЙСТВИЯ
========================================================== */

function createActionRow(action, eventType) {
  const row = document.createElement("div");
  row.className = "action-row";

  const label = document.createElement("label");
  label.textContent = action.name;

  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.value = "0";

  input.dataset.actionId = action.id;
  input.dataset.eventType = eventType;

  input.addEventListener("input", updateTotals);

  row.append(label, input);

  return row;
}

/* ==========================================================
ПОЛУЧАЕМ ОЧКИ ЗА ДЕЙСТВИЕ
Пока безопасная версия: если очков нет — считаем 0.
========================================================== */

function getPoints(actionId, eventType) {
  if (!database.points) return 0;
  if (!database.points[actionId]) return 0;

  return database.points[actionId][eventType] || 0;
}

/* ==========================================================
ОБНОВЛЯЕМ ИТОГИ
========================================================== */

function updateTotals() {
  let turtleTotal = 0;
  let vsTotal = 0;

  const inputs = document.querySelectorAll(".action-row input");

  inputs.forEach(input => {
    const value = Number(input.value) || 0;
    const actionId = input.dataset.actionId;
    const eventType = input.dataset.eventType;

    const points = getPoints(actionId, eventType);
    const total = value * points;

    if (eventType === "turtle") {
      turtleTotal += total;
    }

    if (eventType === "vs") {
      vsTotal += total;
    }
  });

  const turtleTotalElement = document.getElementById("turtleTotal");
  const vsTotalElement = document.getElementById("vsTotal");

  if (turtleTotalElement) {
    turtleTotalElement.textContent = turtleTotal.toLocaleString("ru-RU");
  }

  if (vsTotalElement) {
    vsTotalElement.textContent = vsTotal.toLocaleString("ru-RU");
  }
}

/* ==========================================================
РИСУЕМ ДЕНЬ
========================================================== */

function renderDay(dayId) {
  const day = database.days[dayId];

  if (!day) return;

  const turtleList = document.getElementById("turtleList");
  const vsList = document.getElementById("vsList");

  if (!turtleList || !vsList) {
    console.error("Не найдены контейнеры turtleList или vsList");
    return;
  }

  turtleList.innerHTML = "";
  vsList.innerHTML = "";

  const turtleIds = resolveDayList(day.turtle || []);
  const vsIds = resolveDayList(day.vs || []);

  turtleIds.forEach(actionId => {
    const action = getActionById(actionId);
    if (!action) return;

    turtleList.appendChild(createActionRow(action, "turtle"));
  });

  vsIds.forEach(actionId => {
    const action = getActionById(actionId);
    if (!action) return;

    vsList.appendChild(createActionRow(action, "vs"));
  });

  updateTotals();
}

/* ==========================================================
ЗАПУСК КАЛЬКУЛЯТОРА
========================================================== */

function initTurboVsCalculator() {
  const daySelector = document.getElementById("daySelector");

  if (!daySelector) return;

  daySelector.innerHTML = "";

  database.dayOrder.forEach(dayId => {
    const day = database.days[dayId];

    if (!day) return;

    const option = document.createElement("option");
    option.value = dayId;
    option.textContent = day.name;

    daySelector.appendChild(option);
  });

  daySelector.addEventListener("change", () => {
    renderDay(daySelector.value);
  });

  renderDay(daySelector.value);
}

initTurboVsCalculator();
