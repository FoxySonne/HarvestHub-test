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
  window.startHarvestHubUtcClock = startHarvestHubUtcClock;

  startHarvestHubUtcClock();
})();
