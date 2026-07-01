      import { database } from "../data/database.js";

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
    if (!day) return;

    const container = document.getElementById("actionList");
    container.innerHTML = "";

    // 🔹 разворачиваем список (action + category)
    function resolveDayList(list = []) {

      return list.flatMap(item => {

        // старый формат
        if (typeof item === "string") {
          return item;
        }

        // действие
        if (item.type === "action") {
          return item.id;
        }

        // категория
        if (item.type === "category") {
          return database.action
            .filter(action => action.categoryId === item.id)
            .map(action => action.id);
        }

        return [];

      });

    }

    // 🔹 добавляем поддержку разных типов действий
    function appendInputs(container, action) {

      // уровни
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

      // диапазон
      else if (action.quantityOptions) {

        const select = document.createElement("select");

        for (
          let i = action.quantityOptions.min;
          i <= action.quantityOptions.max;
          i++
        ) {

          const option = document.createElement("option");
          option.value = i;
          option.textContent = i;

          select.appendChild(option);

        }

        container.append(select);

      }

      // обычное поле
      else {

        const input = document.createElement("input");
        input.type = "number";
        input.placeholder = "0";

        container.append(input);

      }

    }

    // 🔹 пустое поле
    function appendEmpty(container) {

      const input = document.createElement("input");
      input.disabled = true;
      input.placeholder = "—";

      container.appendChild(input);

    }

    // 🔹 создаём строку
    function createRow(action, turtleIds, vsIds) {
    
      const row = document.createElement("div");
      row.className = "row";
      // 🔹 левый блок (Черепашка)

      const turtleWrapper = document.createElement("div");
      turtleWrapper.className = "input-group";

      if (turtleIds.includes(action.id)) {
        appendInputs(turtleWrapper, action);
      } else {
        appendEmpty(turtleWrapper);
      }

      // 🔹 название действия

      const label = document.createElement("span");
      label.className = "label";
      label.textContent = action.name;

      // 🔹 правый блок (VS)

      const vsWrapper = document.createElement("div");
      vsWrapper.className = "input-group";

      if (vsIds.includes(action.id)) {
        appendInputs(vsWrapper, action);
      } else {
        appendEmpty(vsWrapper);
      }

      row.append(
        turtleWrapper,
        label,
        vsWrapper
      );

      return row;

    }

    // 👉 разворачиваем категории

    const turtleIds = resolveDayList(day.turtle);
    const vsIds = resolveDayList(day.vs);

    // 👉 объединяем без дублей

    const allIds = [...new Set([
      ...turtleIds,
      ...vsIds
    ])];

    // 👉 чтобы не искать каждое действие заново,
    // создаём карту один раз

    const actionMap = new Map(
      database.action.map(action => [action.id, action])
    );

    const actions = allIds
      .map(id => actionMap.get(id))
      .filter(Boolean);

    // 👉 выводим по категориям
    // (названия категорий не показываем)

    database.category.forEach(category => {

      const categoryActions = actions.filter(
        action => action.categoryId === category.id
      );

      if (!categoryActions.length) return;

      categoryActions.forEach(action => {

        container.appendChild(
          createRow(
            action,
            turtleIds,
            vsIds
          )
        );

      });

    });

  }

  // 🔹 старт

  const firstDay = database.dayOrder[0];

  if (firstDay) {

    select.value = firstDay;
    renderDay(firstDay);

  }

  // 🔹 переключение дней

  select.addEventListener("change", e => {

    renderDay(e.target.value);

  });

}

// 🔹 запуск

initDaySelector();
