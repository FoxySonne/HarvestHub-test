from pathlib import Path


def replace_once(path, old, new, label):
    file = Path(path)
    source = file.read_text(encoding="utf-8")
    if new in source:
        return
    if old not in source:
        raise SystemExit(f"Expected fragment not found: {label} ({path})")
    file.write_text(source.replace(old, new, 1), encoding="utf-8")


replace_once(
    "js/alliance/view.js",
    "function escapeHtml(value) {",
    "export function escapeHtml(value) {",
    "shared HTML escaping export",
)

replace_once(
    "js/alliance/power-section.js",
    'import { fetchAllianceSquadPower, saveAllianceSquadPower, setAlliancePowerSeasonStart } from "./power-api.js?v=20260718-50";\nimport { ACTIVE_ALLIANCE_STORAGE_KEY } from "./config.js";',
    'import { fetchAllianceSquadPower, saveAllianceSquadPower, saveAllianceSquadPowerBatch, setAlliancePowerSeasonStart } from "./power-api.js?v=20260726-power-batch-1";\nimport { ACTIVE_ALLIANCE_STORAGE_KEY } from "./config.js";\nimport { escapeHtml } from "./view.js?v=20260726-power-batch-1";',
    "power API imports",
)

replace_once(
    "js/alliance/power-section.js",
    '''  body.innerHTML = rows.map(item => `<tr data-bulk-participant="${item.participant_id}">
    <td><strong>${item.nickname}</strong><small>${item.rank_name || "—"}</small></td>''',
    '''  body.innerHTML = rows.map(item => `<tr data-bulk-participant="${escapeHtml(item.participant_id)}">
    <td><strong>${escapeHtml(item.nickname)}</strong><small>${escapeHtml(item.rank_name || "—")}</small></td>''',
    "bulk table escaping",
)

replace_once(
    "js/alliance/power-section.js",
    '''        <td><strong>${item.nickname}</strong><small>${item.rank_name || "—"}</small></td>''',
    '''        <td><strong>${escapeHtml(item.nickname)}</strong><small>${escapeHtml(item.rank_name || "—")}</small></td>''',
    "statistics escaping",
)

replace_once(
    "js/alliance/power-section.js",
    '''    select.innerHTML = rows.map(item => `<option value="${item.participant_id}">${item.nickname}</option>`).join("");
    if ([...select.options].some(option => option.value === selected)) select.value = selected;''',
    '''    select.innerHTML = rows.map(item => `<option value="${escapeHtml(item.participant_id)}">${escapeHtml(item.nickname)}</option>`).join("");
    const lockedParticipantId = select.dataset.lockedParticipantId || "";
    if (lockedParticipantId && [...select.options].some(option => option.value === lockedParticipantId)) {
      select.value = lockedParticipantId;
      select.disabled = true;
    } else if ([...select.options].some(option => option.value === selected)) {
      select.value = selected;
    }''',
    "locked participant selection",
)

old_submit = '''async function submitPower(event) {
  event.preventDefault();
  const participantId = byId("powerParticipant")?.value;
  const allianceId = activeAllianceId();
  if (!participantId || !allianceId) return;
  const fields = [1, 2, 3, 4, 5].map(index => byId(`powerSquad${index}`));
  const values = fields.map(field => parsePower(field?.value));
  const invalidIndex = values.findIndex(value => value === undefined);
  if (invalidIndex >= 0) {
    fields[invalidIndex]?.setCustomValidity("Укажи БМ в миллионах, например 87,72");
    fields[invalidIndex]?.reportValidity();
    return;
  }
  fields.forEach(field => field?.setCustomValidity(""));
  const button = event.submitter;
  if (button) button.disabled = true;
  const { error } = await saveAllianceSquadPower(state.client, allianceId, {
    participantId,
    measuredOn: byId("powerDate")?.value,
    squad1: values[0], squad2: values[1], squad3: values[2], squad4: values[3], squad5: values[4]
  });
  if (button) button.disabled = false;
  if (error) return showMessage(error.message, "error");
  resetEditor();
  await load();
  showMessage("Замер силы сохранён.", "success");
}'''
new_submit = '''async function submitPower(event) {
  event.preventDefault();
  const participantId = byId("powerParticipant")?.value;
  const allianceId = activeAllianceId();
  if (!participantId || !allianceId) return;
  const fields = [1, 2, 3, 4, 5].map(index => byId(`powerSquad${index}`));
  const values = fields.map(field => parsePower(field?.value));
  const invalidIndex = values.findIndex(value => value === undefined);
  if (invalidIndex >= 0) {
    fields[invalidIndex]?.setCustomValidity("Укажи БМ в миллионах, например 87,72");
    fields[invalidIndex]?.reportValidity();
    return;
  }
  fields.forEach(field => field?.setCustomValidity(""));
  if (values.every(value => value === null)) {
    fields[0]?.setCustomValidity("Укажи силу хотя бы одного отряда");
    fields[0]?.reportValidity();
    return;
  }

  const button = event.submitter;
  if (button) button.disabled = true;
  try {
    const { error } = await saveAllianceSquadPower(state.client, allianceId, {
      participantId,
      measuredOn: byId("powerDate")?.value,
      squad1: values[0], squad2: values[1], squad3: values[2], squad4: values[3], squad5: values[4]
    });
    if (error) throw error;
    resetEditor();
    await load();
    showMessage("Замер силы сохранён.", "success");
  } catch (error) {
    showMessage(error?.message || "Не удалось сохранить замер силы.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}'''
replace_once("js/alliance/power-section.js", old_submit, new_submit, "single power save")

old_bulk = '''async function saveBulk() {
  const date = byId("powerBulkDate")?.value || localDateValue();
  const rows = [...document.querySelectorAll("[data-bulk-participant]")];
  const payloads = [];
  for (const row of rows) {
    const values = [1, 2, 3, 4, 5].map(index => parsePower(row.querySelector(`[data-bulk-squad="${index}"]`)?.value));
    if (values.some(value => value === undefined)) return showMessage("Проверь значения в общей таблице.", "error");
    if (values.every(value => value === null)) continue;
    payloads.push({ participantId: row.dataset.bulkParticipant, values });
  }
  if (!payloads.length) return showMessage("Заполни хотя бы одну строку.", "error");
  const button = byId("powerBulkSave");
  if (button) button.disabled = true;
  for (const item of payloads) {
    const { error } = await saveAllianceSquadPower(state.client, activeAllianceId(), {
      participantId: item.participantId,
      measuredOn: date,
      squad1: item.values[0], squad2: item.values[1], squad3: item.values[2], squad4: item.values[3], squad5: item.values[4]
    });
    if (error) {
      if (button) button.disabled = false;
      return showMessage(error.message, "error");
    }
  }
  if (button) button.disabled = false;
  const bulkCard = byId("powerBulkCard");
  if (bulkCard) bulkCard.hidden = true;
  await load();
  showMessage("Заполненные замеры сохранены.", "success");
}'''
new_bulk = '''async function saveBulk() {
  const date = byId("powerBulkDate")?.value || localDateValue();
  const rows = [...document.querySelectorAll("[data-bulk-participant]")];
  const payloads = [];
  for (const row of rows) {
    const values = [1, 2, 3, 4, 5].map(index => parsePower(row.querySelector(`[data-bulk-squad="${index}"]`)?.value));
    if (values.some(value => value === undefined)) return showMessage("Проверь значения в общей таблице.", "error");
    if (values.every(value => value === null)) continue;
    payloads.push({
      participant_id: row.dataset.bulkParticipant,
      measured_on: date,
      squad_1: values[0], squad_2: values[1], squad_3: values[2], squad_4: values[3], squad_5: values[4]
    });
  }
  if (!payloads.length) return showMessage("Заполни хотя бы одну строку.", "error");

  const button = byId("powerBulkSave");
  if (button) button.disabled = true;
  try {
    const { error } = await saveAllianceSquadPowerBatch(state.client, activeAllianceId(), payloads);
    if (error) throw error;
    const bulkCard = byId("powerBulkCard");
    if (bulkCard) bulkCard.hidden = true;
    await load();
    showMessage(`Сохранено замеров: ${payloads.length}.`, "success");
  } catch (error) {
    showMessage(error?.message || "Не удалось сохранить общую таблицу силы.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}'''
replace_once("js/alliance/power-section.js", old_bulk, new_bulk, "atomic bulk power save")

replace_once(
    "js/alliance/power-section.js",
    '''  if (date && !date.value) date.value = localDateValue();
  if (bulkDate) bulkDate.value = localDateValue();''',
    '''  const today = localDateValue();
  if (date) {
    if (!date.value) date.value = today;
    date.max = today;
  }
  if (bulkDate) {
    bulkDate.value = today;
    bulkDate.max = today;
  }''',
    "date limits",
)

replace_once(
    "js/pages/alliance-power.js",
    '''  const lockSelect = () => {
    if (![...select.options].some(option => option.value === participantId)) return;
    select.value = participantId;
    select.disabled = true;
  };
  lockSelect();
  new MutationObserver(lockSelect).observe(select, { childList: true });''',
    '''  select.dataset.lockedParticipantId = participantId;
  if ([...select.options].some(option => option.value === participantId)) {
    select.value = participantId;
    select.disabled = true;
  }''',
    "remove persistent observer",
)

replace_once(
    "js/pages/alliance-power.js",
    'import { initPowerSection } from "../alliance/power-section.js?v=20260725-null-guard-1";',
    'import { initPowerSection } from "../alliance/power-section.js?v=20260726-power-batch-1";',
    "power page cache version",
)

replace_once(
    "pages/alliance/power.html",
    '<input id="powerSquad1" type="text" inputmode="decimal" data-no-persist="true" required>',
    '<input id="powerSquad1" type="text" inputmode="decimal" data-no-persist="true">',
    "partial squad input",
)
