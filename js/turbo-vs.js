import { database } from "../../data/database.js";

// 🔹 инициализация dropdown

function initDaySelector() {

  const select = document.getElementById("daySelector");

  database.dayOrder.forEach(key => {

  const day = database.days[key];

  if (!day) return;

  const option = document.createElement("option");

  option.value = key;

  option.textContent = day.name;

  select.appendChild(option);

});


// 🔹 рендер дня

function renderDay(dayKey) {

  const day = database.days[dayKey];

  const container = document.getElementById("actionsList");

  container.innerHTML = "";


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

  const turtleIds = resolveDayList(day.turtle || []);

const vsIds = resolveDayList(day.vs || []);

  // 🔹 левый блок (черепашка)

  const turtleWrapper = document.createElement("div");

  turtleWrapper.className = "input-group";

  if (isTurtle) {

    appendInputs(turtleWrapper, action);

  } else {

    const empty = document.createElement("input");

    empty.disabled = true;

    empty.placeholder = "—";

    turtleWrapper.appendChild(empty);

  }

  // 🔹 название

  const label = document.createElement("span");

  label.className = "label";

  label.textContent = action.name;

  // 🔹 правый блок (VS)

  const vsWrapper = document.createElement("div");

  vsWrapper.className = "input-group";

  if (isVs) {

    appendInputs(vsWrapper, action);

  } else {

    const empty = document.createElement("input");

    empty.disabled = true;

    empty.placeholder = "—";

    vsWrapper.appendChild(empty);

  }

  row.append(turtleWrapper, label, vsWrapper);

  return row;

}


  // 👉 разворачиваем категории

  const turtleIds = resolveDayList(day.turtle);

  const vsIds = resolveDayList(day.vs);
  
  // 🔹 добавляем поддержку разных типов действий

function appendInputs(container, action) {

  // если есть уровни

  if (action.options) {

    const select = document.createElement("select");

    action.options.forEach(opt => {

      const option = document.createElement("option");

      option.value = opt.value;

      option.textContent = opt.label;

      select.appendChild(option);

    });

    const input = document.createElement("input");

    input.type = "number";

    input.placeholder = "0";

    container.append(select, input);

  }

  // если ограниченный диапазон

  else if (action.quantityOptions) {

    const select = document.createElement("select");

    for (let i = action.quantityOptions.min; i <= action.quantityOptions.max; i++) {

      const option = document.createElement("option");

      option.value = i;

      option.textContent = i;

      select.appendChild(option);

    }

    container.append(select);

  }

  // обычное действие

  else {

    const input = document.createElement("input");

    input.type = "number";

    input.placeholder = "0";

    container.append(input);

  }

}

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


  // старт

  const firstDay = database.dayOrder[0];

  select.value = firstDay;

  renderDay(firstDay);

  // переключение

  select.addEventListener("change", (e) => {

    renderDay(e.target.value);

  });

}

// 🔹 запуск

initDaySelector();
