import { loadAlliancePageContext, getActiveAllianceId } from "../alliance/page-context.js?v=20260718-1";

const byId = id => document.getElementById(id);
const pad = value => String(value).padStart(2, "0");
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const LOCATION_NAMES = {
  treatment_1: "Водоочистительный центр 1",
  treatment_2: "Водоочистительный центр 2",
  processing_1: "Водообрабатывающий завод 1",
  processing_2: "Водообрабатывающий завод 2",
  processing_3: "Водообрабатывающий завод 3",
  processing_4: "Водообрабатывающий завод 4",
  solar: "Солнечная электростанция",
  helipad: "Заброшенная вертолётная площадка",
  central: "Центральный резервуар",
  development: "Комплекс разработки",
  military: "Военный завод",
  collectors_north: "Водосборники — север",
  collectors_east: "Водосборники — восток",
  collectors_south: "Водосборники — юг",
  collectors_west: "Водосборники — запад"
};

const state = { client: null, context: null, participant: null };

function showMessage(text, type = "info") {
  const box = byId("allianceMessage");
  if (!box) return;
  box.hidden = !text;
  box.textContent = text;
  box.dataset.type = type;
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function parseDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function dateValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDate(value, withYear = true) {
  if (!value) return "—";
  const date = parseDate(value);
  return withYear
    ? `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
    : `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
}

function addDays(value, amount) {
  const date = typeof value === "string" ? parseDate(value) : new Date(value);
  date.setDate(date.getDate() + amount);
  return dateValue(date);
}

function weekStart() {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day + 1);
  return dateValue(date);
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(Number(value));
}

function formatScore(value) {
  const number = Number(value) || 0;
  if (!number) return "—";
  const unit = [[1e12, "Т"], [1e9, "В"], [1e6, "М"], [1e3, "k"]].find(([size]) => Math.abs(number) >= size);
  if (!unit) return new Intl.NumberFormat("ru-RU").format(number);
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(number / unit[0])}${unit[1]}`;
}

function timezoneLabel(offset) {
  const number = Number(offset);
  if (!Number.isFinite(number) || number === 0) return "МСК";
  return `МСК${number > 0 ? "+" : ""}${number}`;
}

function participantStatusLabel(participant) {
  if (participant.member_status === "left") return "Вышел из союза";
  if (participant.member_status === "inactive") return "Неактивен";
  if (participant.member_status === "reserve") return "Резерв";
  return "Участник союза";
}

function resolveParticipant() {
  const requestedId = localStorage.getItem("harvesthub_active_participant_profile_id") || "";
  return state.context.participants.find(item => item.id === requestedId)
    || state.context.currentParticipant
    || null;
}

function isOwnProfile() {
  return Boolean(
    state.participant?.linked_user_id
    && state.participant.linked_user_id === state.context?.session?.user?.id
  );
}

function inheritedPersonalData(participant) {
  if (!participant?.is_twin || !participant.primary_participant_id) return participant;
  const primary = state.context.participants.find(item => item.id === participant.primary_participant_id);
  return {
    ...participant,
    birthday: participant.birthday || primary?.birthday || null,
    timezone_offset: participant.timezone_offset ?? primary?.timezone_offset ?? 0
  };
}

function renderHeader(participant) {
  const personal = inheritedPersonalData(participant);
  byId("playerProfileNickname").textContent = participant.nickname || "—";
  byId("playerProfileRank").textContent = participant.rank_name || "Ранг не указан";
  byId("playerProfileStatus").textContent = participantStatusLabel(participant);
  byId("playerProfileBirthday").textContent = personal.birthday ? formatDate(personal.birthday, false) : "Не указана";
  byId("playerProfileTimezone").textContent = timezoneLabel(personal.timezone_offset);
  byId("playerProfileType").textContent = participant.is_twin ? `Твин${participant.primary_nickname ? ` игрока ${participant.primary_nickname}` : ""}` : "Основной игрок";
  byId("playerProfileLinked").textContent = participant.linked_user_id ? "Аккаунт связан" : "Не связан";
  const powerFormCard = byId("playerProfilePowerFormCard");
  if (powerFormCard) powerFormCard.hidden = !isOwnProfile();
}

function fillPowerForm(measurement) {
  const measuredOn = byId("playerProfilePowerMeasuredOn");
  if (measuredOn) measuredOn.value = dateValue(new Date());
  [1, 2, 3, 4, 5].forEach(index => {
    const input = byId(`playerProfileSquad${index}`);
    if (input) input.value = measurement?.[`squad_${index}`] ?? "";
  });
}

async function loadPower(participantId) {
  const result = await state.client
    .from("alliance_squad_power_measurements")
    .select("*")
    .eq("alliance_id", getActiveAllianceId())
    .eq("participant_id", participantId)
    .order("measured_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;

  const measurement = result.data;
  const container = byId("playerProfilePower");
  const empty = byId("playerProfilePowerEmpty");
  fillPowerForm(measurement);
  if (!measurement) {
    container.innerHTML = "";
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  byId("playerProfilePowerDate").textContent = `Последний замер: ${formatDate(measurement.measured_on)}`;
  container.innerHTML = [1, 2, 3, 4, 5].map(index => `
    <div><span>${index}-й отряд</span><strong>${formatNumber(measurement[`squad_${index}`])} млн</strong></div>`).join("");
}

async function loadVs(participantId) {
  const start = weekStart();
  const end = addDays(start, 5);
  byId("playerProfileVsPeriod").textContent = `${formatDate(start)}–${formatDate(end)}`;
  const result = await state.client
    .from("alliance_vs_results")
    .select("result_date,points,is_vacation")
    .eq("alliance_id", getActiveAllianceId())
    .eq("participant_id", participantId)
    .gte("result_date", start)
    .lte("result_date", end)
    .order("result_date");
  if (result.error) throw result.error;

  const map = new Map((result.data || []).map(item => [item.result_date, item]));
  const hasResults = map.size > 0;
  byId("playerProfileVsEmpty").hidden = hasResults;
  byId("playerProfileVs").innerHTML = DAYS.map((day, index) => {
    const entry = map.get(addDays(start, index));
    const value = entry?.is_vacation ? "О" : entry ? formatScore(entry.points) : "—";
    return `<div><span>${day}</span><strong>${value}</strong></div>`;
  }).join("");
}

function reservoirIntentLabel(value) {
  if (value === "willing") return "Желающий";
  if (value === "refused") return "Отказник";
  return "Не указано";
}

function reservoirAssignmentLabel(value) {
  if (value === "main") return "Основа";
  if (value === "reserve") return "Резерв";
  return "Не назначен";
}

async function loadReservoir(participantId) {
  const today = dateValue(new Date());
  const weekResult = await state.client
    .from("alliance_reservoir_weeks")
    .select("*")
    .eq("alliance_id", getActiveAllianceId())
    .gte("event_date", today)
    .order("event_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (weekResult.error) throw weekResult.error;

  const week = weekResult.data;
  const empty = byId("playerProfileReservoirEmpty");
  if (!week) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  byId("playerProfileReservoirDate").textContent = `Дата события: ${formatDate(week.event_date)}`;
  byId("playerProfileReservoirTime").textContent = `${pad(week.event_hour_msk ?? 14)}:00 МСК`;

  const [entryResult, assignmentResult] = await Promise.all([
    state.client.from("alliance_reservoir_participants").select("*").eq("week_id", week.id).eq("participant_id", participantId).maybeSingle(),
    state.client.from("alliance_reservoir_assignments").select("location_key").eq("week_id", week.id).eq("participant_id", participantId).limit(1).maybeSingle()
  ]);
  if (entryResult.error) throw entryResult.error;
  if (assignmentResult.error) throw assignmentResult.error;

  const entry = entryResult.data;
  byId("playerProfileReservoirMatch").textContent = entry?.time_match === true ? "Подходит" : entry?.time_match === false ? "Не подходит" : "Не указано";
  byId("playerProfileReservoirIntent").textContent = reservoirIntentLabel(entry?.intent);
  byId("playerProfileReservoirAssignment").textContent = reservoirAssignmentLabel(entry?.assignment);
  byId("playerProfileReservoirLocation").textContent = LOCATION_NAMES[assignmentResult.data?.location_key] || "Не назначена";
}

async function loadTwins(participant) {
  const twins = state.context.participants.filter(item => item.primary_participant_id === participant.id && item.member_status !== "left");
  const card = byId("playerProfileTwinsCard");
  const container = byId("playerProfileTwins");
  card.hidden = twins.length === 0;
  if (!twins.length) {
    container.innerHTML = "";
    return;
  }

  const powerResult = await state.client
    .from("alliance_squad_power_measurements")
    .select("participant_id,measured_on,squad_1")
    .eq("alliance_id", getActiveAllianceId())
    .in("participant_id", twins.map(item => item.id))
    .order("measured_on", { ascending: false });
  if (powerResult.error) throw powerResult.error;
  const latestPower = new Map();
  (powerResult.data || []).forEach(item => {
    if (!latestPower.has(item.participant_id)) latestPower.set(item.participant_id, item);
  });

  container.innerHTML = twins.map(twin => {
    const power = latestPower.get(twin.id);
    return `<article>
      <div><strong>${escapeHtml(twin.nickname)}</strong><span>${escapeHtml(twin.rank_name || "Ранг не указан")}</span></div>
      <div><span>Сила 1-го отряда</span><strong>${power ? `${formatNumber(power.squad_1)} млн` : "—"}</strong></div>
      <div><span>Последний замер</span><strong>${power ? formatDate(power.measured_on) : "—"}</strong></div>
    </article>`;
  }).join("");
}

export async function init() {
  state.client = window.harvestHubSupabase;
  try {
    state.context = await loadAlliancePageContext(state.client);
    state.participant = resolveParticipant();
    if (!state.participant) {
      showMessage("Аккаунт не связан с игроком союза.", "error");
      return;
    }

    localStorage.setItem("harvesthub_active_participant_profile_id", state.participant.id);
    renderHeader(state.participant);
    await Promise.all([
      loadPower(state.participant.id),
      loadVs(state.participant.id),
      loadReservoir(state.participant.id),
      loadTwins(state.participant)
    ]);
  } catch (error) {
    showMessage(error.message || "Не удалось загрузить профиль игрока.", "error");
  }
}