import { loadAlliancePageContext, getActiveAllianceId } from "./page-context.js?v=20260718-1";

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const byId = id => document.getElementById(id);
const pad = value => String(value).padStart(2, "0");

function dateValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function addDays(value, amount) {
  const date = parseDate(value);
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

function formatDate(value) {
  if (!value) return "—";
  const date = parseDate(value);
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function formatScore(value) {
  const number = Number(value) || 0;
  if (!number) return "—";
  const unit = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]].find(([size]) => Math.abs(number) >= size);
  if (!unit) return new Intl.NumberFormat("ru-RU").format(number);
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(number / unit[0])}${unit[1]}`;
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function setMessage(id, text, type = "info") {
  const element = byId(id);
  if (!element) return;
  element.textContent = text;
  element.dataset.type = type;
}

function canReview(context) {
  return context?.membership?.role === "owner" || context?.membership?.role === "editor";
}

function fillDateOptions() {
  const select = byId("playerProfileVsProposalDate");
  if (!select) return;
  const start = weekStart();
  const today = dateValue(new Date());
  select.innerHTML = DAY_NAMES.map((day, index) => {
    const value = addDays(start, index);
    return `<option value="${value}" ${value > today ? "disabled" : ""}>${day}, ${formatDate(value)}</option>`;
  }).join("");
  const latestAvailable = [...select.options].reverse().find(option => !option.disabled);
  if (latestAvailable) select.value = latestAvailable.value;
}

function renderMyProposalStatus(items) {
  const box = byId("playerProfileVsProposalStatus");
  if (!box) return;
  const pending = (items || []).filter(item => item.status === "pending");
  box.hidden = pending.length === 0;
  box.innerHTML = pending.map(item => `<div><strong>${formatDate(item.result_date)}</strong><span>${item.is_vacation ? "Отпуск" : formatScore(item.points)} · ожидает подтверждения</span></div>`).join("");
}

async function loadMyProposals(client, allianceId) {
  const { data, error } = await client.rpc("list_my_alliance_vs_proposals", { target_alliance_id: allianceId });
  if (error) throw error;
  renderMyProposalStatus(Array.isArray(data) ? data : []);
}

function proposalValue(item, prefix) {
  return item[`${prefix}_is_vacation`] ? "Отпуск" : formatScore(item[`${prefix}_points`]);
}

function renderReviewList(items) {
  const list = byId("vsReviewList");
  const empty = byId("vsReviewEmpty");
  if (!list || !empty) return;
  empty.hidden = items.length > 0;
  list.innerHTML = items.map(item => `<article data-vs-proposal-id="${escapeHtml(item.id)}">
    <div><strong>${escapeHtml(item.nickname)}</strong><span>${escapeHtml(item.rank_name || "—")} · ${formatDate(item.result_date)}</span></div>
    <div><span>Сейчас</span><strong>${proposalValue(item, "current")}</strong></div>
    <div><span>Предложено</span><strong>${proposalValue(item, "proposed")}</strong></div>
    <div class="alliance-player-vs-review-actions"><button type="button" data-vs-review="approve">Принять</button><button type="button" class="danger-button" data-vs-review="reject">Отклонить</button></div>
  </article>`).join("");
}

async function loadReviewQueue(client, allianceId) {
  const { data, error } = await client.rpc("list_alliance_vs_proposals", { target_alliance_id: allianceId });
  if (error) throw error;
  renderReviewList(Array.isArray(data) ? data : []);
}

async function initProfileVsProposals() {
  const form = byId("playerProfileVsProposalForm");
  if (!form || form.dataset.initialized === "true") return;
  form.dataset.initialized = "true";

  const client = window.harvestHubSupabase;
  if (!client) return;
  const context = await loadAlliancePageContext(client);
  const participantId = localStorage.getItem("harvesthub_active_participant_profile_id") || context.currentParticipant?.id || "";
  const participant = context.participants.find(item => item.id === participantId) || null;
  const ownProfile = Boolean(participant?.linked_user_id && participant.linked_user_id === context.session?.user?.id);
  const allianceId = getActiveAllianceId();

  const actionRow = byId("playerProfileVsActionRow");
  if (actionRow) actionRow.hidden = !ownProfile;
  fillDateOptions();

  byId("playerProfileVsProposalButton")?.addEventListener("click", () => {
    form.hidden = !form.hidden;
    byId("playerProfileVsProposalButton").textContent = form.hidden ? "Предложить результат" : "Скрыть форму";
    setMessage("playerProfileVsProposalMessage", "");
  });

  byId("playerProfileVsProposalVacation")?.addEventListener("change", event => {
    byId("playerProfileVsProposalPoints").disabled = event.target.checked;
    byId("playerProfileVsProposalUnit").disabled = event.target.checked;
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = byId("playerProfileVsProposalSubmit");
    const vacation = byId("playerProfileVsProposalVacation").checked;
    const raw = String(byId("playerProfileVsProposalPoints").value || "").replace(",", ".");
    const number = raw ? Number(raw) : null;
    if (!vacation && (!Number.isFinite(number) || number < 0)) return setMessage("playerProfileVsProposalMessage", "Укажи корректное количество очков.", "error");

    submit.disabled = true;
    setMessage("playerProfileVsProposalMessage", "Отправляем…");
    const { error } = await client.rpc("submit_my_alliance_vs_proposal", {
      target_alliance_id: allianceId,
      target_participant_id: participant.id,
      target_result_date: byId("playerProfileVsProposalDate").value,
      target_points: vacation ? null : Math.round(number * Number(byId("playerProfileVsProposalUnit").value)),
      target_is_vacation: vacation
    });
    submit.disabled = false;
    if (error) return setMessage("playerProfileVsProposalMessage", error.message || "Не удалось отправить заявку.", "error");
    form.hidden = true;
    byId("playerProfileVsProposalButton").textContent = "Предложить результат";
    setMessage("playerProfileVsProposalMessage", "Заявка отправлена руководству.", "success");
    await loadMyProposals(client, allianceId);
  });

  if (ownProfile) await loadMyProposals(client, allianceId);
}

async function initVsReviewQueue() {
  const card = byId("vsReviewCard");
  if (!card || card.dataset.initialized === "true") return;
  card.dataset.initialized = "true";

  const client = window.harvestHubSupabase;
  if (!client) return;
  const context = await loadAlliancePageContext(client);
  const allowed = canReview(context);
  card.hidden = !allowed;
  if (!allowed) return;

  const allianceId = getActiveAllianceId();
  await loadReviewQueue(client, allianceId);
  byId("vsReviewList")?.addEventListener("click", async event => {
    const button = event.target.closest("[data-vs-review]");
    const article = button?.closest("[data-vs-proposal-id]");
    if (!button || !article) return;
    button.disabled = true;
    const { error } = await client.rpc("review_alliance_vs_proposal", {
      target_proposal_id: article.dataset.vsProposalId,
      target_decision: button.dataset.vsReview
    });
    if (error) {
      button.disabled = false;
      return setMessage("vsReviewMessage", error.message || "Не удалось обработать заявку.", "error");
    }
    setMessage("vsReviewMessage", button.dataset.vsReview === "approve" ? "Результат принят." : "Заявка отклонена.", "success");
    await loadReviewQueue(client, allianceId);
    if (button.dataset.vsReview === "approve" && typeof window.loadPage === "function") {
      window.setTimeout(() => window.loadPage("alliance/vs.html", { skipCurrentSave: true }), 250);
    }
  });
}

function startForPage(pageName = window.harvestHubNavigation?.getCurrentPage?.()) {
  if (pageName === "alliance/player-profile.html") {
    window.setTimeout(() => initProfileVsProposals().catch(error => setMessage("playerProfileVsProposalMessage", error.message || "Не удалось загрузить заявки VS.", "error")), 0);
  }
  if (pageName === "alliance/vs.html") {
    window.setTimeout(() => initVsReviewQueue().catch(error => setMessage("vsReviewMessage", error.message || "Не удалось загрузить заявки VS.", "error")), 0);
  }
}

document.addEventListener("harvesthub:page-loaded", event => startForPage(event.detail?.pageName));
startForPage();
