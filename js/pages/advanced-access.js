const PAGE_SIZE = 30;

const viewState = {
  tab: "requests",
  searchEmail: "",
  searchResult: null,
  requests: [],
  grants: { items: [], total: 0, page: 1, pageSize: PAGE_SIZE },
  summary: { pendingRequests: 0, activeAccessTotal: 0 },
  page: 1,
  sort: "granted-desc",
  pendingDateAction: null,
  loading: false
};

function escapeAccessHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatAccessDate(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeAccessHtml(value);
  return new Intl.DateTimeFormat("ru-RU", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }
  ).format(date);
}

function getStore() {
  return window.harvestHubAdvancedAccessStore || null;
}

function getCurrentAccount() {
  const profile = window.harvestHubAccount?.getProfile?.();
  return profile?.type === "account" ? profile : null;
}

function getRecordById(userId) {
  return [
    ...viewState.requests,
    ...viewState.grants.items,
    viewState.searchResult
  ].filter(Boolean).find(item => item.userId === userId) || null;
}

function renderEmpty(text) {
  return `<div class="advanced-access-empty">${escapeAccessHtml(text)}</div>`;
}

function renderRequestsTab() {
  if (!viewState.requests.length) return renderEmpty("Новых заявок пока нет.");
  return `
    <div class="advanced-access-table-wrap">
      <table class="advanced-access-table">
        <thead><tr><th>Email</th><th>Никнейм</th><th>Заявка отправлена</th><th>Действия</th></tr></thead>
        <tbody>${viewState.requests.map(item => `
          <tr>
            <td>${escapeAccessHtml(item.email)}</td>
            <td>${escapeAccessHtml(item.nickname)}</td>
            <td>${formatAccessDate(item.requestedAt, true)}</td>
            <td><div class="advanced-access-row-actions">
              <button type="button" data-access-grant="${escapeAccessHtml(item.userId)}">Выдать доступ</button>
              <button type="button" class="danger-button" data-access-delete-request="${escapeAccessHtml(item.userId)}">Удалить</button>
            </div></td>
          </tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function renderSearchResult() {
  const result = viewState.searchResult;
  if (!viewState.searchEmail) return renderEmpty("Введите email зарегистрированного пользователя. Список пользователей заранее не выводится.");
  if (!result) return renderEmpty("Пользователь с таким email не найден.");

  const isOwner = result.isAdmin;
  const primaryAction = result.hasAccess
    ? `<button type="button" ${isOwner ? "disabled" : `data-access-extend="${escapeAccessHtml(result.userId)}"`}>${isOwner ? "Владелец сайта" : "Продлить"}</button>`
    : `<button type="button" data-access-grant="${escapeAccessHtml(result.userId)}">Выдать доступ</button>`;
  const deleteAction = result.hasAccess
    ? `<button type="button" class="danger-button" ${isOwner ? "disabled" : `data-access-revoke="${escapeAccessHtml(result.userId)}"`}>Удалить</button>`
    : `<button type="button" class="danger-button" ${result.requestStatus === "pending" ? `data-access-delete-request="${escapeAccessHtml(result.userId)}"` : "disabled"}>Удалить</button>`;

  return `
    <article class="advanced-access-search-result">
      <div class="advanced-access-result-copy">
        <strong>${escapeAccessHtml(result.email)}</strong>
        <span>${escapeAccessHtml(result.nickname)}</span>
        <dl>
          <div><dt>Дата регистрации</dt><dd>${formatAccessDate(result.registeredAt)}</dd></div>
          <div><dt>Дата выдачи</dt><dd>${formatAccessDate(result.grantedAt)}</dd></div>
          <div><dt>Дата окончания</dt><dd>${result.hasAccess ? (result.expiresOn ? formatAccessDate(result.expiresOn) : "Бессрочно") : "—"}</dd></div>
        </dl>
      </div>
      <div class="advanced-access-row-actions">${primaryAction}${deleteAction}</div>
    </article>`;
}

function renderSearchTab() {
  return `
    <form class="advanced-access-search-form" id="advancedAccessSearchForm">
      <label class="form-group">
        <span>Email зарегистрированного пользователя</span>
        <div class="advanced-access-search-controls">
          <input type="email" id="advancedAccessSearchEmail" value="${escapeAccessHtml(viewState.searchEmail)}" placeholder="name@example.com" required autocomplete="off">
          <button type="submit">Найти</button>
        </div>
      </label>
    </form>
    <div id="advancedAccessSearchResult">${renderSearchResult()}</div>`;
}

function renderGrantedTab() {
  const { items, total, page, pageSize } = viewState.grants;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return `
    <div class="advanced-access-list-toolbar">
      <span>Доступ выдан: <strong>${total}</strong></span>
      <label>Сортировка
        <select id="advancedAccessSort">
          <option value="registered-desc" ${viewState.sort === "registered-desc" ? "selected" : ""}>Сначала новые аккаунты</option>
          <option value="registered-asc" ${viewState.sort === "registered-asc" ? "selected" : ""}>Сначала старые аккаунты</option>
          <option value="granted-desc" ${viewState.sort === "granted-desc" ? "selected" : ""}>Сначала недавно выданные</option>
          <option value="granted-asc" ${viewState.sort === "granted-asc" ? "selected" : ""}>Сначала давно выданные</option>
        </select>
      </label>
    </div>
    ${items.length ? `
      <div class="advanced-access-table-wrap">
        <table class="advanced-access-table">
          <thead><tr><th>Email</th><th>Никнейм</th><th>Регистрация</th><th>Доступ выдан</th><th>Окончание</th><th>Действия</th></tr></thead>
          <tbody>${items.map(item => `
            <tr>
              <td>${escapeAccessHtml(item.email)}</td>
              <td>${escapeAccessHtml(item.nickname)}</td>
              <td>${formatAccessDate(item.registeredAt)}</td>
              <td>${formatAccessDate(item.grantedAt)}</td>
              <td>${item.expiresOn ? formatAccessDate(item.expiresOn) : "Бессрочно"}</td>
              <td><div class="advanced-access-row-actions">
                <button type="button" ${item.isAdmin ? "disabled" : `data-access-extend="${escapeAccessHtml(item.userId)}"`}>${item.isAdmin ? "Владелец" : "Продлить"}</button>
                <button type="button" class="danger-button" ${item.isAdmin ? "disabled" : `data-access-revoke="${escapeAccessHtml(item.userId)}"`}>Удалить</button>
              </div></td>
            </tr>`).join("")}</tbody>
        </table>
      </div>` : renderEmpty("Пользователей с доступом пока нет.")}
    <div class="advanced-access-pagination" ${pages <= 1 ? "hidden" : ""}>
      <button type="button" data-access-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>Назад</button>
      <span>Страница ${page} из ${pages}</span>
      <button type="button" data-access-page="${page + 1}" ${page >= pages ? "disabled" : ""}>Дальше</button>
    </div>`;
}

function renderTabContent() {
  if (viewState.loading) return renderEmpty("Загружаем данные…");
  if (viewState.tab === "search") return renderSearchTab();
  if (viewState.tab === "granted") return renderGrantedTab();
  return renderRequestsTab();
}

function renderAdmin() {
  const container = document.getElementById("advancedAccessAdminContent");
  if (!container) return;
  const requestCount = viewState.summary.pendingRequests;
  container.innerHTML = `
    <div class="advanced-access-tabs" role="tablist" aria-label="Управление продвинутым режимом">
      <button type="button" data-access-tab="requests" class="${viewState.tab === "requests" ? "is-active" : ""}">Заявки${requestCount ? ` (${requestCount})` : ""}</button>
      <button type="button" data-access-tab="search" class="${viewState.tab === "search" ? "is-active" : ""}">Поиск</button>
      <button type="button" data-access-tab="granted" class="${viewState.tab === "granted" ? "is-active" : ""}">Доступ выдан</button>
    </div>
    <section class="advanced-access-panel">${renderTabContent()}</section>
    <div class="advanced-access-date-modal" id="advancedAccessDateModal" hidden>
      <div class="advanced-access-date-backdrop" data-access-date-close></div>
      <section class="advanced-access-date-dialog" role="dialog" aria-modal="true" aria-labelledby="advancedAccessDateTitle">
        <button type="button" class="account-delete-close" data-access-date-close aria-label="Закрыть">×</button>
        <h3 id="advancedAccessDateTitle">Выдать доступ</h3>
        <p id="advancedAccessDateUser"></p>
        <label class="form-group"><span>Дата окончания доступа</span><input type="date" id="advancedAccessExpirationDate"></label>
        <p class="cloud-login-note">Оставьте поле пустым, если доступ должен быть бессрочным.</p>
        <div class="profile-edit-actions">
          <button type="button" data-access-date-close>Отмена</button>
          <button type="button" id="advancedAccessDateConfirm">Сохранить</button>
        </div>
      </section>
    </div>`;
  bindRenderedEvents();
}

async function loadAdminData() {
  const store = getStore();
  viewState.loading = true;
  renderAdmin();
  try {
    viewState.summary = await store.getAdminSummary();
    if (viewState.tab === "requests") viewState.requests = await store.listRequests();
    if (viewState.tab === "granted") {
      viewState.grants = await store.listGrants({ page: viewState.page, pageSize: PAGE_SIZE, sort: viewState.sort });
      viewState.page = viewState.grants.page;
    }
  } finally {
    viewState.loading = false;
    renderAdmin();
  }
}

async function refreshSearchResult() {
  if (!viewState.searchEmail) {
    viewState.searchResult = null;
    return;
  }
  viewState.searchResult = await getStore().findByEmail(viewState.searchEmail);
}

function openDateDialog(action, userId) {
  const record = getRecordById(userId);
  if (!record) return;
  viewState.pendingDateAction = { action, userId };
  document.getElementById("advancedAccessDateTitle").textContent = action === "extend" ? "Продлить доступ" : "Выдать доступ";
  document.getElementById("advancedAccessDateUser").textContent = `${record.email} · ${record.nickname}`;
  document.getElementById("advancedAccessExpirationDate").value = record.expiresOn ? String(record.expiresOn).slice(0, 10) : "";
  document.getElementById("advancedAccessDateModal").hidden = false;
}

function closeDateDialog() {
  const modal = document.getElementById("advancedAccessDateModal");
  if (modal) modal.hidden = true;
  viewState.pendingDateAction = null;
}

async function afterMutation() {
  await refreshSearchResult();
  await loadAdminData();
}

function bindRenderedEvents() {
  document.querySelectorAll("[data-access-tab]").forEach(button => {
    button.addEventListener("click", async () => {
      viewState.tab = getStore().setAdminTab(button.dataset.accessTab);
      viewState.page = 1;
      await loadAdminData();
    });
  });

  document.getElementById("advancedAccessSearchForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    viewState.searchEmail = document.getElementById("advancedAccessSearchEmail").value.trim().toLowerCase();
    button.disabled = true;
    button.textContent = "Ищем…";
    try {
      await refreshSearchResult();
      renderAdmin();
    } catch (error) {
      window.alert(error.message || "Не удалось выполнить поиск.");
      renderAdmin();
    }
  });

  document.getElementById("advancedAccessSort")?.addEventListener("change", async event => {
    viewState.sort = event.target.value;
    viewState.page = 1;
    await loadAdminData();
  });

  document.querySelectorAll("[data-access-page]").forEach(button => {
    button.addEventListener("click", async () => {
      viewState.page = Number(button.dataset.accessPage) || 1;
      await loadAdminData();
    });
  });

  document.querySelectorAll("[data-access-grant]").forEach(button => button.addEventListener("click", () => openDateDialog("grant", button.dataset.accessGrant)));
  document.querySelectorAll("[data-access-extend]").forEach(button => button.addEventListener("click", () => openDateDialog("extend", button.dataset.accessExtend)));

  document.querySelectorAll("[data-access-delete-request]").forEach(button => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await getStore().deleteRequest(button.dataset.accessDeleteRequest);
        await afterMutation();
      } catch (error) {
        window.alert(error.message || "Не удалось удалить заявку.");
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-access-revoke]").forEach(button => {
    button.addEventListener("click", async () => {
      const userId = button.dataset.accessRevoke;
      const record = getRecordById(userId);
      if (!window.confirm(`Удалить доступ у ${record?.email || "пользователя"}?`)) return;
      button.disabled = true;
      try {
        await getStore().revokeAccess(userId);
        await afterMutation();
      } catch (error) {
        window.alert(error.message || "Не удалось удалить доступ.");
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-access-date-close]").forEach(button => button.addEventListener("click", closeDateDialog));
  document.getElementById("advancedAccessDateConfirm")?.addEventListener("click", async event => {
    const pending = viewState.pendingDateAction;
    if (!pending) return;
    const date = document.getElementById("advancedAccessExpirationDate").value;
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = "Сохраняем…";
    try {
      await getStore().grantAccess(pending.userId, date);
      closeDateDialog();
      await afterMutation();
    } catch (error) {
      window.alert(error.message || "Не удалось сохранить доступ.");
      event.currentTarget.disabled = false;
      event.currentTarget.textContent = "Сохранить";
    }
  });
}

async function renderAccessPage() {
  const container = document.getElementById("advancedAccessAdminContent");
  const account = getCurrentAccount();
  if (!container || !account || !getStore()) {
    if (container) container.innerHTML = renderEmpty("Для управления доступом необходимо войти в зарегистрированный аккаунт.");
    return;
  }

  let status = { isAdmin: false };
  try {
    status = await window.harvestHubAdvancedModeAccess?.refresh?.() || status;
  } catch {
    status = window.harvestHubAdvancedModeAccess?.getStatus?.() || status;
  }
  if (!status.isAdmin) {
    container.innerHTML = renderEmpty("Эта страница доступна только владельцу сайта.");
    return;
  }

  viewState.tab = getStore().getAdminTab();
  try {
    await loadAdminData();
  } catch (error) {
    container.innerHTML = renderEmpty(error.message || "Не удалось загрузить данные доступа.");
  }
}

export function init() {
  document.getElementById("advancedAccessBackToProfile")?.addEventListener("click", () => window.loadPage?.("profile.html"));
  renderAccessPage();
}