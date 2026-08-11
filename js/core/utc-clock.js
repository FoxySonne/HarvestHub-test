(() => {
  const UTC_DAY_IDS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const UTC_DAY_NAMES = {
    mon: "понедельник",
    tue: "вторник",
    wed: "среда",
    thu: "четверг",
    fri: "пятница",
    sat: "суббота",
    sun: "воскресенье"
  };
  const LOCAL_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("ru-RU", { weekday: "long" });
  const LOCAL_TIME_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  });

  let currentUtcDayId = "";
  let utcClockTimerId = null;

  function padTimePart(value) {
    return String(value).padStart(2, "0");
  }

  function getHarvestHubUtcTime(date = new Date()) {
    const dayId = UTC_DAY_IDS[date.getUTCDay()];
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();

    return {
      date,
      timestamp: date.getTime(),
      iso: date.toISOString(),
      year,
      month,
      day,
      hours,
      minutes,
      seconds,
      dayIndex: date.getUTCDay(),
      dayId,
      dayName: UTC_DAY_NAMES[dayId],
      dateKey: `${year}-${padTimePart(month)}-${padTimePart(day)}`,
      timeKey: `${padTimePart(hours)}:${padTimePart(minutes)}:${padTimePart(seconds)}`
    };
  }

  function getHarvestHubUtcDayId(date = new Date()) {
    return getHarvestHubUtcTime(date).dayId;
  }

  function capitalize(value) {
    const text = String(value || "");
    return text ? text.charAt(0).toLocaleUpperCase("ru-RU") + text.slice(1) : "—";
  }

  function renderHarvestHubClock(time = window.harvestHubUtcTime || getHarvestHubUtcTime()) {
    const localWeekday = document.getElementById("localClockWeekday");
    const localClock = document.getElementById("localClockTime");
    const utcWeekday = document.getElementById("utcClockWeekday");
    const utcClock = document.getElementById("utcClockTime");
    if (!localWeekday || !localClock || !utcWeekday || !utcClock) return;

    localWeekday.textContent = capitalize(LOCAL_WEEKDAY_FORMATTER.format(time.date));
    localClock.textContent = LOCAL_TIME_FORMATTER.format(time.date);
    localClock.dateTime = time.iso;
    utcWeekday.textContent = capitalize(time.dayName);
    utcClock.textContent = `${padTimePart(time.hours)}:${padTimePart(time.minutes)}`;
    utcClock.dateTime = time.iso;
  }

  function applyHarvestHubUtcTime() {
    const time = getHarvestHubUtcTime();
    const previousDayId = currentUtcDayId;
    currentUtcDayId = time.dayId;

    document.documentElement.dataset.utcDate = time.dateKey;
    document.documentElement.dataset.utcTime = time.timeKey;
    document.documentElement.dataset.utcDay = time.dayId;

    if (document.body) {
      document.body.dataset.utcDate = time.dateKey;
      document.body.dataset.utcTime = time.timeKey;
      document.body.dataset.utcDay = time.dayId;
    }

    window.harvestHubUtcTime = time;
    renderHarvestHubClock(time);
    window.dispatchEvent(new CustomEvent("harvesthub:utc-time-change", { detail: time }));

    if (previousDayId && previousDayId !== time.dayId) {
      window.dispatchEvent(new CustomEvent("harvesthub:utc-day-change", { detail: time }));
    }

    return time;
  }

  function startHarvestHubUtcClock() {
    applyHarvestHubUtcTime();
    if (!utcClockTimerId) utcClockTimerId = window.setInterval(applyHarvestHubUtcTime, 30000);
  }

  window.getHarvestHubUtcTime = getHarvestHubUtcTime;
  window.getHarvestHubUtcDayId = getHarvestHubUtcDayId;
  window.applyHarvestHubUtcTime = applyHarvestHubUtcTime;
  window.renderHarvestHubClock = renderHarvestHubClock;
  window.startHarvestHubUtcClock = startHarvestHubUtcClock;

  startHarvestHubUtcClock();
})();
