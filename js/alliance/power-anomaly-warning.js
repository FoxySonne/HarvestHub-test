const WARNING_LIMIT_MILLIONS = 500;

function parsePower(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function warnForValue(value, label = "Сила 1-го отряда") {
  const power = parsePower(value);
  if (power === null || power <= WARNING_LIMIT_MILLIONS) return true;
  return window.confirm(`${label} указана выше 500 млн (${String(value).trim()} млн). Проверь значение перед сохранением. Всё равно сохранить?`);
}

function handleSubmit(event) {
  const form = event.target;
  if (form?.id === "powerForm") {
    const input = form.querySelector("#powerSquad1");
    if (!warnForValue(input?.value)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    return;
  }

  if (form?.matches?.("[data-power-row-form]")) {
    const input = form.querySelector('[data-power-row-squad="1"]');
    const nickname = form.querySelector(".power-inline-editor-title strong")?.textContent?.trim();
    if (!warnForValue(input?.value, nickname ? `Сила 1-го отряда у ${nickname}` : undefined)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
}

function handleBulkSave(event) {
  if (!event.target.closest?.("#powerBulkSave")) return;
  const suspicious = [...document.querySelectorAll('[data-bulk-participant] [data-bulk-squad="1"]')]
    .filter(input => !input.disabled && (parsePower(input.value) ?? 0) > WARNING_LIMIT_MILLIONS);
  if (!suspicious.length) return;
  const message = suspicious.length === 1
    ? "В общей таблице сила 1-го отряда у одного игрока указана выше 500 млн. Проверь значение. Всё равно сохранить?"
    : `В общей таблице у ${suspicious.length} игроков сила 1-го отряда указана выше 500 млн. Проверь значения. Всё равно сохранить?`;
  if (!window.confirm(message)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    suspicious[0]?.focus();
  }
}

export function initPowerAnomalyWarning() {
  window.harvestHubPowerAnomalyWarning?.destroy?.();
  const controller = new AbortController();
  const options = { capture: true, signal: controller.signal };
  document.addEventListener("submit", handleSubmit, options);
  document.addEventListener("click", handleBulkSave, options);
  window.harvestHubPowerAnomalyWarning = { destroy: () => controller.abort() };
}
