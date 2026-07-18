import { init as initMembers } from "./members.js?v=20260718-39";
import { initPowerSection } from "../alliance/power-section.js?v=20260718-53";
import { initVsSection } from "../alliance/vs-section.js?v=20260718-1";
import { initRoleSection } from "../alliance/role-section.js?v=20260718-1";

function formatStoredBirthday(value) {
  const match = String(value || "").match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}.${match[1]}` : String(value || "");
}

function formatBirthdayInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}.${digits.slice(2)}` : digits;
}

function toStoredBirthday(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})\.(\d{1,2})$/);
  if (!match) return value ? null : "";

  const day = Number(match[1]);
  const month = Number(match[2]);
  const testDate = new Date(Date.UTC(2000, month - 1, day));
  const valid = month >= 1 && month <= 12
    && testDate.getUTCMonth() === month - 1
    && testDate.getUTCDate() === day;

  if (!valid) return null;
  return `2000-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function setupBirthdayField() {
  const input = document.getElementById("participantBirthday");
  const form = document.getElementById("participantForm");
  if (!input || !form || input.dataset.dayMonthReady === "true") return;

  input.dataset.dayMonthReady = "true";
  input.value = formatStoredBirthday(input.value);

  input.addEventListener("input", () => {
    input.setCustomValidity("");
    input.value = formatBirthdayInput(input.value);
  });

  form.addEventListener("submit", event => {
    const displayValue = input.value;
    const storedValue = toStoredBirthday(displayValue);

    if (storedValue === null) {
      event.preventDefault();
      event.stopImmediatePropagation();
      input.setCustomValidity("Укажи дату в формате ДД.ММ, например 07.11");
      input.reportValidity();
      return;
    }

    input.setCustomValidity("");
    input.value = storedValue;
    setTimeout(() => {
      if (document.body.contains(input)) input.value = formatStoredBirthday(input.value);
    }, 0);
  }, true);

  document.addEventListener("click", event => {
    if (!event.target.closest("[data-participant-edit], #participantCancelButton")) return;
    setTimeout(() => {
      if (document.body.contains(input)) input.value = formatStoredBirthday(input.value);
    }, 0);
  });
}

export async function init() {
  await initMembers();
  setupBirthdayField();
  initPowerSection();
  initVsSection();
  initRoleSection();
}
