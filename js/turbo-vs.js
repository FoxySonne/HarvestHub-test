import { database } from "../data/database.js";

// 🔹 создаём строку

function createRow(action, day) {

  const row = document.createElement("div");

  row.className = "row";

  // левый input (турбочерепашка)

  const turtleInput = document.createElement("input");

  turtleInput.type = "number";

  turtleInput.className = "input";

  if (!day.turtle.includes(action.id)) {

    turtleInput.disabled = true;

  }

  // название действия

  const label = document.createElement("span");

  label.className = "label";

  label.textContent = action.name;

  // правый input (VS)

  const vsInput = document.createElement("input");

  vsInput.type = "number";

  vsInput.className = "input";

  if (!day.vs.includes(action.id)) {

    vsInput.disabled = true;

  }

  row.append(turtleInput, label, vsInput);

  return row;

}

// 🔹 рендер списка

function renderDay(dayKey) {

  const day = database.days[dayKey];

  const container = document.getElementById("actionsList");

  container.innerHTML = "";

  const allIds = [...new Set([...day.turtle, ...day.vs])];

  allIds.forEach(id => {

    const action = database.actions.find(a => a.id === id);

    container.appendChild(createRow(action, day));

  });

}

// 🔹 старт (пока просто понедельник)

renderDay("mon");


function initDaySelector() {

  const select = document.getElementById("daySelector");

  Object.entries(database.days).forEach(([key, day]) => {

    const option = document.createElement("option");

    option.value = key;        // 👈 ВАЖНО: ключ

    option.textContent = day.name; // 👈 отображение

    select.appendChild(option);

  });

  // стартовый день

  select.value = "mon";

  renderDay("mon");

  // переключение

  select.addEventListener("change", (e) => {

    renderDay(e.target.value);

  });

}
