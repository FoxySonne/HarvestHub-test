import { fetchAllianceSquadPower, saveAllianceSquadPower, setAlliancePowerSeasonStart } from "./power-api.js?v=20260718-50";
import { ACTIVE_ALLIANCE_STORAGE_KEY } from "./config.js";

const state = { client: null, data: null };
const byId = id => document.getElementById(id);

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parsePower(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 1000) / 1000 : undefined;
}

function formatPower(value) {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  }).format(Number(value));
}

function formatDelta(value) {
  const number = Number(value) || 0;
  return `${number > 0 ? "+" : ""}${formatPower(number)}`;
}

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function activeAllianceId() {
  return localStorage.getItem(ACTIVE_ALLIANCE_STORAGE_KEY) || "";
}

function showMessage(text, type = "info") {
  const box = byId("allianceMessage");
  if (!box) return;
  box.hidden = !text;
  box.textContent = text;
  box.dataset.type = type;
}

function growthPercent(latest, previous) {
  const current = Number(latest) || 0;
  const old = Number(previous) || 0;
  if (!old) return current ? 100 : 0;
  return ((current - old) / old) * 100;
}

function render() {
  const rows = Array.isArray(state.data?.participants) ? [...state.data.participants] : [];
  const search = (byId("powerSearch")?.value || "").trim().toLowerCase();
  const sort = byId("powerSort")?.value || "power";
  const filtered = rows.filter(item => !search || String(item.nickname || "").toLowerCase().includes(search));

  filtered.sort((a, b) => {
    if (sort === "nickname") return String(a.nickname).localeCompare(String(b.nickname), "ru");
    if (sort === "growth") return (Number(b.latest_power) - Number(b.previous_power)) - (Number(a.latest_power) - Number(a.previous_power));
    return Number(b.latest_power) - Number(a.latest_power) || String(a.nickname).localeCompare(String(b.nickname), "ru");
  });

  const tbody = byId("powerTableBody");
  if (tbody) {
    tbody.innerHTML = filtered.map((item, index) => {
      const previous = Number(item.latest_power) - Number(item.previous_power);
      const week = Number(item.latest_power) - Number(item.week_power);
      const month = Number(item.latest_power) - Number(item.month_power);
      const season = Number(item.latest_power) - Number(item.season_power);
      return `<tr>
        <td>${index + 1}</td>
        <td><strong>${item.nickname}</strong><small>${item.rank_name || "—"}</small></td>
        <td>${formatDate(item.latest_date)}</td>
        <td>${formatPower(item.squad_1)}</td>
        <td class="${previous > 0 ? "power-positive" : previous < 0 ? "power-negative" : ""}">${formatDelta(previous)}</td>
        <td>${formatDelta(week)}</td>
        <td>${formatDelta(month)}</td>
        <td>${formatDelta(season)}</td>
        <td>${growthPercent(item.latest_power, item.previous_power).toFixed(1).replace(".", ",")}%</td>
      </tr>`;
    }).join("");
  }

  if (byId("powerEmptyState")) byId("powerEmptyState").hidden = filtered.length > 0;
  if (byId("powerCount")) byId("powerCount").textContent = `${rows.length} участников`;

  const select = byId("powerParticipant");
  if (select) {
    const selected = select.value;
    const available = rows.filter(item => state.data?.can_manage || item.is_own);
    select.innerHTML = available.map(item => `<option value="${item.participant_id}">${item.nickname}</option>`).join("");
    if ([...select.options].some(option => option.value === selected)) select.value = selected;
    byId("powerEditorCard").hidden = available.length === 0;
  }

  const seasonInput = byId("powerSeasonStart");
  if (seasonInput) seasonInput.value = state.data?.season_start || "";
  if (byId("powerSeasonSettings")) byId("powerSeasonSettings").hidden = !state.data?.can_manage;
}

async function load() {
  const allianceId = activeAllianceId();
  if (!allianceId || !state.client) return;
  const { data, error } = await fetchAllianceSquadPower(state.client, allianceId);
  const errorBox = byId("powerSectionError");
  if (error) {
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = error.message;
    }
    return;
  }
  if (errorBox) errorBox.hidden = true;
  state.data = data || { participants: [] };
  render();
}

async function submitPower(event) {
  event.preventDefault();
  const participantId = byId("powerParticipant")?.value;
  const allianceId = activeAllianceId();
  if (!participantId || !allianceId) return;

  const fields = [1, 2, 3, 4, 5].map(index => byId(`powerSquad${index}`));
  const values = fields.map(field => parsePower(field?.value));
  const invalidIndex = values.findIndex(value => value === undefined);
  if (invalidIndex >= 0) {
    fields[invalidIndex].setCustomValidity("Укажи БМ в миллионах, например 87,72");
    fields[invalidIndex].reportValidity();
    return;
  }
  fields.forEach(field => field.setCustomValidity(""));

  const button = event.submitter;
  if (button) button.disabled = true;
  const { error } = await saveAllianceSquadPower(state.client, allianceId, {
    participantId,
    measuredOn: byId("powerDate").value,
    squad1: values[0], squad2: values[1], squad3: values[2], squad4: values[3], squad5: values[4]
  });
  if (button) button.disabled = false;
  if (error) return showMessage(error.message, "error");

  fields.forEach(field => { field.value = ""; });
  byId("powerDate").value = localDateValue();
  await load();
  showMessage("Замер силы сохранён.", "success");
}

async function saveSeason(event) {
  event.preventDefault();
  const { error } = await setAlliancePowerSeasonStart(state.client, activeAllianceId(), byId("powerSeasonStart")?.value || null);
  if (error) return showMessage(error.message, "error");
  await load();
  showMessage("Дата начала сезона сохранена.", "success");
}

function switchTab(target) {
  const showPower = target === "power";
  document.querySelectorAll("[data-alliance-tab]").forEach(button => {
    button.classList.toggle("is-active", button.dataset.allianceTab === target);
  });
  if (byId("allianceRosterSection")) byId("allianceRosterSection").hidden = showPower;
  if (byId("alliancePowerSection")) byId("alliancePowerSection").hidden = !showPower;
  if (showPower) load();
}

export function initPowerSection() {
  state.client = window.harvestHubSupabase;
  const date = byId("powerDate");
  if (date && !date.value) date.value = localDateValue();

  document.querySelectorAll("[data-alliance-tab]").forEach(button => {
    button.addEventListener("click", () => switchTab(button.dataset.allianceTab));
  });
  byId("powerForm")?.addEventListener("submit", submitPower);
  byId("powerSeasonForm")?.addEventListener("submit", saveSeason);
  byId("powerSearch")?.addEventListener("input", render);
  byId("powerSort")?.addEventListener("change", render);
}
