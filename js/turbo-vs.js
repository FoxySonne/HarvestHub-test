import { database } from "../data/database.js";

// 🔹 разворачиваем список (actions + categories)

function resolveDayList(list) {

  return list.flatMap(item => {

    // если просто строка (старый формат)

    if (typeof item === "string") {

      return item;

    }

    // если конкретное действие

    if (item.type === "action") {

      return item.id;

    }

    // если категория

    if (item.type === "category") {

      return database.actions

        .filter(a => a.categoryId === item.id)

        .map(a => a.id);

    }

    return [];

  });

}

// 🔹 создаём строку

function createRow(action, turtleIds, vsIds) {

  const row = document.createElement("div");

  row.className = "row";

  const isTurtle = turtleIds.includes(action.id);

  const isVs = vsIds.includes(action.id);

  // левый input (турбочерепашка)

  const turtleInput = document.createElement("input");

  turtleInput.type = "number";

  turtleInput.className = "input";

  if (!isTurtle) {

    turtleInput.disabled = true;

    turtleInput.placeholder = "—";

  }

  // название действия

  const label = document.createElement("span");

  label.className = "label";

  label.textContent = action.name;

  // правый input (VS)

  const vsInput = document.createElement("input");

  vsInput.type = "number";

  vsInput.className = "input";

  if (!isVs) {

    vsInput.disabled = true;

    vsInput.placeholder = "—";

  }

  row.append(turtleInput, label, vsInput);

  return row;

}

// 🔹 рендер дня

function renderDay(dayKey) {

  const day = database.days[dayKey];

  const container = document.getElementById("actionsList");

  container.innerHTML = "";

  // 👉 разворачиваем категории

  const turtleIds = resolveDayList(day.turtle);

  const vsIds = resolveDayList(day.vs);

  // 👉 объединяем без дублей

  const allIds = [...new Set([...turtleIds, ...vsIds])];

  // 👉 получаем actions

  const actions = allIds

    .map(id => database.actions.find(a => a.id === id))

    .filter(Boolean);

  // 👉 группировка по категориям (БЕЗ вывода названий)

  database.categories.forEach(category => {

    const categoryActions = actions.filter(

      a => a.categoryId === category.id

    );

    if (categoryActions.length === 0) return;

    categoryActions.forEach(action => {

      container.appendChild(

        createRow(action, turtleIds, vsIds)

      );

    });

  });

}

// 🔹 инициализация dropdown

function initDaySelector() {

  const select = document.getElementById("daySelector");

  Object.entries(database.days).forEach(([key, day]) => {

    const option = document.createElement("option");

    option.value = key;

    option.textContent = day.name;

    select.appendChild(option);

  });

  // старт

  const firstDay = Object.keys(database.days)[0];

  select.value = firstDay;

  renderDay(firstDay);

  // переключение

  select.addEventListener("change", (e) => {

    renderDay(e.target.value);

  });

}

// 🔹 запуск

initDaySelector();