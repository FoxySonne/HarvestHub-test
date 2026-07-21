import { TROOP_LEVEL_DEFAULTS } from "./data-model.js";

export function createTurboVsView({ getPoints, getTroopRowsFromState, onControlChange }) {
  function getQuantityControl(row) {
    return row.querySelector("input[data-action-id], select[data-action-id]");
  }

  function getRowActionId(row) {
    return row.dataset.actionId ||
      getQuantityControl(row)?.dataset.actionId ||
      row.querySelector(".action-level-select")?.dataset.levelActionId ||
      "";
  }

  function getRowEventType(row) {
    return row.dataset.eventType || row.querySelector("[data-event-type]")?.dataset.eventType || "";
  }

  function getLineState(line) {
    return {
      level: line.querySelector("select")?.value || line.dataset.level || "",
      value: line.querySelector("input")?.value || "0"
    };
  }

  function getRowState(row) {
    if (row.classList.contains("action-row-multi-level")) {
      const rows = Array.from(row.querySelectorAll(".action-multi-line")).map(getLineState);
      const filledRows = rows.filter(item => Number(item.value) > 0);
      const lastFilled = filledRows[filledRows.length - 1] || rows[rows.length - 1] || { level: "", value: "0" };

      return {
        value: String(Math.max(0, ...rows.map(item => Number(item.value) || 0))),
        level: lastFilled.level || null,
        rows
      };
    }

    const quantityControl = getQuantityControl(row);
    const levelSelect = row.querySelector(".action-level-select");

    return {
      value: quantityControl?.value || "0",
      level: levelSelect?.value || null
    };
  }

  function setRowState(row, state = {}) {
    if (row.classList.contains("action-row-multi-level")) {
      const savedRows = getTroopRowsFromState(state);
      const lines = Array.from(row.querySelectorAll(".action-multi-line"));

      lines.forEach((line, index) => {
        const levelSelect = line.querySelector("select");
        const lineLevel = String(levelSelect?.value || line.dataset.level || "");
        const quantityInput = line.querySelector("input");
        const saved = savedRows.find(item => String(item.level) === lineLevel) || savedRows[index];

        if (levelSelect && saved?.level != null) levelSelect.value = String(saved.level);
        if (quantityInput) quantityInput.value = String(saved?.value ?? "0");
      });
      return;
    }

    const quantityControl = getQuantityControl(row);
    const levelSelect = row.querySelector(".action-level-select");
    if (quantityControl) quantityControl.value = String(state?.value ?? "0");
    if (levelSelect && state?.level != null) levelSelect.value = String(state.level);
  }

  function createTextRow(text) {
    const row = document.createElement("div");
    row.className = "action-row action-row-text";
    row.textContent = text;
    return row;
  }

  function createNeedOutput(actionId, eventType) {
    const output = document.createElement("div");
    output.className = "action-need-output";
    output.dataset.actionId = actionId;
    output.dataset.eventType = eventType;
    output.dataset.noPersist = "true";
    output.innerHTML = `<span>нужно</span><strong>0</strong>`;
    return output;
  }

  function createQuantitySelect(action, eventType) {
    const select = document.createElement("select");
    select.className = "action-quantity-select";
    select.dataset.actionId = action.id;
    select.dataset.eventType = eventType;
    select.dataset.noPersist = "true";

    const zeroOption = document.createElement("option");
    zeroOption.value = "0";
    zeroOption.textContent = "0";
    select.appendChild(zeroOption);

    for (let value = action.quantityOptions.min; value <= action.quantityOptions.max; value++) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
    return select;
  }

  function createNumberInput(action, eventType) {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.value = "0";
    input.dataset.actionId = action.id;
    input.dataset.eventType = eventType;
    input.dataset.noPersist = "true";
    return input;
  }

  function createLevelSelect(action, eventType, defaultLevel) {
    const select = document.createElement("select");
    select.className = "action-level-select";
    select.dataset.levelActionId = action.id;
    select.dataset.eventType = eventType;
    select.dataset.noPersist = "true";

    action.options.forEach(optionData => {
      const option = document.createElement("option");
      option.value = optionData.value;
      option.textContent = optionData.label;
      select.appendChild(option);
    });
    select.value = String(defaultLevel);
    return select;
  }

  function createTroopLevelSelect(action, eventType, defaultLevel) {
    const select = document.createElement("select");
    select.className = "action-level-select";
    select.dataset.levelActionId = action.id;
    select.dataset.eventType = eventType;
    select.dataset.noPersist = "true";

    action.options
      .filter(option => TROOP_LEVEL_DEFAULTS.includes(Number(option.value)))
      .forEach(optionData => {
        const option = document.createElement("option");
        option.value = optionData.value;
        option.textContent = optionData.label;
        select.appendChild(option);
      });

    select.value = String(defaultLevel);
    return select;
  }

  function createMultiLine(action, eventType, defaultLevel) {
    const line = document.createElement("div");
    line.className = "action-multi-line";

    const levelSelect = createTroopLevelSelect(action, eventType, defaultLevel);
    const quantityInput = createNumberInput(action, eventType);
    const needOutput = createNeedOutput(action.id, eventType);
    quantityInput.className = "action-quantity-input";
    quantityInput.dataset.hasLevel = "true";

    line.append(levelSelect, quantityInput, needOutput);
    return line;
  }

  function createTroopMultiControls(action, eventType) {
    const controls = document.createElement("div");
    controls.className = "action-controls action-multi-controls";

    TROOP_LEVEL_DEFAULTS.forEach(defaultLevel => {
      controls.appendChild(createMultiLine(action, eventType, defaultLevel));
    });
    return controls;
  }

  function createActionRow(action, eventType) {
    const row = document.createElement("div");
    row.className = "action-row action-row-with-need";
    row.dataset.actionId = action.id;
    row.dataset.eventType = eventType;
    const label = document.createElement("label");
    label.textContent = action.name;
    let controls;

    if (action.id === "troop_upgrade" && action.options) {
      row.classList.add("action-row-multi-level");
      controls = createTroopMultiControls(action, eventType);
    } else {
      controls = document.createElement("div");
      controls.className = "action-controls";
      if (action.options) {
        row.classList.add("action-row-with-level");
        const levelSelect = createLevelSelect(action, eventType, action.options[0]?.value ?? 1);
        const quantityInput = createNumberInput(action, eventType);
        quantityInput.className = "action-quantity-input";
        quantityInput.dataset.hasLevel = "true";
        controls.append(levelSelect, quantityInput, createNeedOutput(action.id, eventType));
      } else {
        const spacer = document.createElement("div");
        spacer.className = "action-level-spacer";
        controls.append(spacer, action.quantityOptions
          ? createQuantitySelect(action, eventType)
          : createNumberInput(action, eventType), createNeedOutput(action.id, eventType));
      }
    }

    row.append(label, controls);
    row.querySelectorAll("input, select").forEach(control => {
      control.addEventListener(control.tagName === "SELECT" ? "change" : "input", () => {
        onControlChange(action.id, control);
      });
    });
    return row;
  }

  function calculateRowTotal(row) {
    const eventType = getRowEventType(row);
    const actionId = getRowActionId(row);
    if (row.classList.contains("action-row-multi-level")) {
      return Array.from(row.querySelectorAll(".action-multi-line")).reduce((sum, line) => {
        const level = line.querySelector("select")?.value || null;
        const quantity = Number(line.querySelector("input")?.value) || 0;
        return sum + quantity * getPoints(actionId, eventType, level);
      }, 0);
    }
    const quantity = Number(getQuantityControl(row)?.value) || 0;
    const level = row.querySelector(".action-level-select")?.value || null;
    return quantity * getPoints(actionId, eventType, level);
  }

  return {
    calculateRowTotal,
    createActionRow,
    createTextRow,
    getRowActionId,
    getRowEventType,
    getRowState,
    setRowState
  };
}
