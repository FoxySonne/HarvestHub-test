(() => {
  const FIELD_IDS = {
    days: "timeConverterDays",
    hours: "timeConverterHours",
    minutes: "timeConverterMinutes",
    seconds: "timeConverterSeconds"
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function readNumber(id) {
    const field = getElement(id);
    const value = Number(String(field?.value || "0").replace(",", "."));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  function formatNumber(value) {
    return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("ru-RU");
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function calculateTime() {
    const days = readNumber(FIELD_IDS.days);
    const hours = readNumber(FIELD_IDS.hours);
    const minutes = readNumber(FIELD_IDS.minutes);
    const seconds = readNumber(FIELD_IDS.seconds);

    const totalSeconds = days * 86400 + hours * 3600 + minutes * 60 + seconds;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const formattedDays = Math.floor(totalSeconds / 86400);
    const remainingSeconds = totalSeconds % 86400;
    const formattedHours = Math.floor(remainingSeconds / 3600);
    const formattedMinutes = Math.floor((remainingSeconds % 3600) / 60);
    const formattedSeconds = remainingSeconds % 60;

    return {
      totalMinutes,
      formatted: `${pad(formattedDays)}д ${pad(formattedHours)}:${pad(formattedMinutes)}:${pad(formattedSeconds)}`
    };
  }

  function renderTimeConverter() {
    const totalMinutesElement = getElement("timeConverterTotalMinutes");
    const formattedElement = getElement("timeConverterFormatted");

    if (!totalMinutesElement || !formattedElement) return;

    const result = calculateTime();
    totalMinutesElement.textContent = formatNumber(result.totalMinutes);
    formattedElement.textContent = result.formatted;
  }

  function bindTimeConverter() {
    const fields = Object.values(FIELD_IDS)
      .map(getElement)
      .filter(Boolean);

    if (!fields.length) return;

    fields.forEach(field => {
      if (field.dataset.timeConverterBound === "true") return;
      field.dataset.timeConverterBound = "true";
      field.addEventListener("input", renderTimeConverter);
      field.addEventListener("change", renderTimeConverter);
      field.addEventListener("keyup", renderTimeConverter);
    });

    renderTimeConverter();
  }

  function scheduleBind() {
    window.setTimeout(bindTimeConverter, 0);
  }

  document.addEventListener("input", event => {
    if (event.target.closest?.(".time-converter-box")) renderTimeConverter();
  });

  document.addEventListener("change", event => {
    if (event.target.closest?.(".time-converter-box")) renderTimeConverter();
  });

  const observer = new MutationObserver(scheduleBind);

  function start() {
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleBind();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  window.harvestHubInitTimeConverter = bindTimeConverter;
  window.harvestHubUpdateTimeConverter = renderTimeConverter;
})();
