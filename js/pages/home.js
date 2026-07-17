function pad(value) {
  return String(value).padStart(2, "0");
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = value;
}

function getUtcNow() {
  return typeof window.getHarvestHubUtcTime === "function"
    ? window.getHarvestHubUtcTime().date
    : new Date();
}

function formatTime(date) {
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function formatDuration(milliseconds, { showDays = false } = {}) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (showDays && days > 0) {
    return `${days}д ${pad(hours)}ч ${pad(minutes)}м`;
  }

  return `${pad(hours + days * 24)}:${pad(minutes)}:${pad(seconds)}`;
}

function getNextUtcDayStart(now) {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0
  ));
}

function getExpeditionStatus(now) {
  const day = now.getUTCDay();
  const currentStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0
  ));

  let cycle = "";
  let daysToNextUpdate = 0;

  if (day === 2 || day === 3) {
    cycle = "Вт–Ср";
    daysToNextUpdate = day === 2 ? 2 : 1;
  } else if (day === 4 || day === 5) {
    cycle = "Чт–Пт";
    daysToNextUpdate = day === 4 ? 2 : 1;
  } else {
    cycle = "Сб–Пн";
    daysToNextUpdate = day === 6 ? 3 : day === 0 ? 2 : 1;
  }

  const endsAt = new Date(currentStart.getTime() + daysToNextUpdate * 86400000);

  return {
    cycle,
    countdown: formatDuration(endsAt.getTime() - now.getTime(), { showDays: true })
  };
}

function getHorrorFaction(now) {
  const day = now.getUTCDay();

  if (day === 1 || day === 4 || day === 0) return "разбойники +20%";
  if (day === 2 || day === 5) return "силачи +20%";

  return "воздухоплаватели +20%";
}

function getHorrorStatus(now) {
  const attackStarts = [0, 6, 12, 18];
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  for (const startHour of attackStarts) {
    const start = new Date(today + startHour * 3600000);
    const end = new Date(start.getTime() + 3 * 3600000);

    if (now >= start && now < end) {
      return {
        label: "До конца атаки",
        countdown: formatDuration(end.getTime() - now.getTime())
      };
    }

    if (now < start) {
      return {
        label: "До начала атаки",
        countdown: formatDuration(start.getTime() - now.getTime())
      };
    }
  }

  const nextStart = new Date(today + 24 * 3600000);

  return {
    label: "До начала атаки",
    countdown: formatDuration(nextStart.getTime() - now.getTime())
  };
}

function updateHomeStatus() {
  const now = getUtcNow();
  const expedition = getExpeditionStatus(now);
  const horror = getHorrorStatus(now);

  setText("homeUtcTime", formatTime(now));
  setText("homeUtcDayCountdown", formatDuration(getNextUtcDayStart(now).getTime() - now.getTime()));
  setText("homeExpeditionCountdown", expedition.countdown);
  setText("homeExpeditionCycle", expedition.cycle);
  setText("homeHorrorCountdownLabel", horror.label);
  setText("homeHorrorCountdown", horror.countdown);
  setText("homeHorrorFaction", getHorrorFaction(now));
}

let homeTimerId = null;

export function init() {
  updateHomeStatus();

  if (homeTimerId) window.clearInterval(homeTimerId);
  homeTimerId = window.setInterval(updateHomeStatus, 1000);
}
