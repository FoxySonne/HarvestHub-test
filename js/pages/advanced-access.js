const PAGE_SIZE = 30;

const viewState = {
  tab: "requests",
  searchEmail: "",
  searchResult: null,
  page: 1,
  sort: "granted-desc",
  pendingDateAction: null
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

function getDraftStore() {
  return window.harvestHubAdvancedAccessDraft;
}

function getCurrentAccount() {
  const profile = window.harvestHubAccount?.getProfile?.();
  return profile?.type === "account" ? profile : null;
}

function getRecordById(userId) {
  const store = getDraftStore();
  return [
    ...store.getAccounts(),
    ...store.getRequests(),
    ...store.getGrants()
  ].find(item => item.userId === userId) || null;
}

function renderEmpty(text) {
  return `<div class="advanced-access-empty">${escapeAccessHtml(text)}</div>`;
}

function renderRequestsTab() {
  const requests = getDraftStore().getRequests()
    .sort((a, b) => new Date(a.requestedAt) - new Date(b.requestedAt));

  if (!requests.length) {
    return renderEmpty("Новых заявок пока нет.");
  }

  return `
    <div class="advanced-access-table-wrap">
      <table class="advanced-access-table">
        <thead><tr><th>Email</th><th>Никнейм</th><th>Заявка отправлена</th><th>Действия</th></tr></thead>
        <tbody>${requests.map(item => `
          <tr>
            <td>${escapeAccessHtml(item.email)}</td>
            <td>${escapeAccessHtml(item.nickname)}</td>
            <td>${formatAccessDate(item.requestedAt, true)}</td>
            <td>
              <div class="advanced-access-row-actions">
                <button type="button" data-access-grant="${escapeAccessHtml(item.userId)}">Выдать доступ</button>
                <button type="button" class="danger-button" data-access-delete-request="${escapeAccessHtml(item.userId)}">Удалить</button>
              </div>
            </td>
          </tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function renderSearchResult() {
  const result = viewState.searchResult;
  if (!viewState.searchEmail) {
    return renderEmpty("Введите email зарегистрированного пользователя. Список пользователей заранее не выводится.");
  }
  if (!result) {
    return renderEmpty("Пользователь не найден в локальном каркасе. После подключения базы поиск будет работать по всем зарегистрированным аккаунтам.");
  }

  const grant = result.grant || getDraftStore().getGrant(result.userId);
  const request = result.request || getDraftStore().getRequest(result.userId);
  const isOwner = Boolean(grant?.isOwner);
  const primaryAction = grant
    ? `<button type="button" ${isOwner ? "disabled" : `data-access-extend="${escapeAccessHtml(result.userId)}"`}>${isOwner ? "Владелец сайта" : "Продлить"}</button>`
    : `<button type="button" data-access-grant="${escapeAccessHtml(result.userId)}">Выдать доступ</button>`;
  const deleteAction = grant
    ? `<button type="button" class="danger-button" ${isOwner ? "disabled" : `data-access-revoke="${escapeAccessHtml(result.userId)}"`}>Удалить</button>`
    : `<button type="button" class="danger-button" ${request ? `data-access-delete-request="${escapeAccessHtml(result.userId)}"` : "disabled"}>Удалить</button>`;

  return `
    <article class="advanced-access-search-result">
      <div class="advanced-access-result-copy">
        <strong>${escapeAccessHtml(result.email)}</strong>
        <span>${escapeAccessHtml(result.nickname)}</span>
        <dl>
          <div><dt>Дата выдачи</dt><dd>${grant ? formatAccessDate(grant.grantedAt) : "—"}</dd></div>
          <div><dt>Дата окончания</dt><dd>${grant?.expiresAt ? formatAccessDate(grant.expiresAt) : grant ? "Бессрочно" : "—"}</dd></div>
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

function sortGrants(grants) {
  const [field, direction] = viewState.sort.split("-");
  const key = field === "registered" ? "registeredAt" : "grantedAt";
  const multiplier = direction === "asc" ? 1 : -1;
  return grants.sort((a, b) => {
    const first = new Date(a[key] || 0).getTime();
    const second = new Date(b[key] || 0).getTime();
    return (first - second) * multiplier;
  });
}

function renderGrantedTab() {
  const grants = sortGrants(getDraftStore().getGrants());
  const pages = Math.max(1, Math.ceil(grants.length / PAGE_SIZE));
  viewState.page = Math.min(Math.max(1, viewState.page), pages);
  const start = (viewState.page - 1) * PAGE_SIZE;
  const visible = grants.slice(start, start + PAGE_SIZE);

  return `
    <div class="advanced-access-list-toolbar">
      <span>Доступ выдан: <strong>${grants.length}</strong></span>
      <label>Сортировка
        <select id="advancedAccessSort">
          <option value="registered-desc" ${viewState.sort === "registered-desc" ? "selected" : ""}>Сначала новые аккаунты</option>
          <option value="registered-asc" ${viewState.sort === "registered-asc" ? "selected" : ""}>Сначала старые аккаунты</option>
          <option value="granted-desc" ${viewState.sort === "granted-desc" ? "selected" : ""}>Сначала недавно выданные</option>
          <option value="granted-asc" ${viewState.sort === "granted-asc" ? "selected" : ""}>Сначала давно выданные</option>
        </select>
      </label>
    </div>
    ${visible.length ? `
      <div class="advanced-access-table-wrap">
        <table class="advanced-access-table">
          <thead><tr><th>Email</th><th>Никнейм</th><th>Регистрация</th><th>Доступ выдан</th><th>Окончание</th><th>Действия</th></tr></thead>
          <tbody>${visible.map(item => `
            <tr>
              <td>${escapeAccessHtml(item.email)}</td>
              <td>${escapeAccessHtml(item.nickname)}</td>
              <td>${formatAccessDate(item.registeredAt)}</td>
              <td>${formatAccessDate(item.grantedAt)}</td>
              <td>${item.expiresAt ? formatAccessDate(item.expiresAt) : "Бессрочно"}</td>
              <td>
                <div class="advanced-access-row-actions">
                  <button type="button" ${item.isOwner ? "disabled" : `data-access-extend="${escapeAccessHtml(item.userId)}"`}>${item.isOwner ? "Владелец" : "Продлить"}</button>
                  <button type="button" class="danger-button" ${item.isOwner ? "disabled" : `data-access-revoke="${escapeAccessHtml(item.userId)}"`}>Удалить</button>
                </div>
              </td>
            </tr>`).join("")}</tbody>
        </table>
      </div>` : renderEmpty("Пользователей с доступом пока нет.")}
    <div class="advanced-access-pagination" ${pages <= 1 ? "hidden" : ""}>
      <button type="button" data-access-page="${viewState.page - 1}" ${viewState.page <= 1 ? "disabled" : ""}>Назад</button>
      <span>Страница ${viewState.page} из ${pages}</span>
      <button type="button" data-access-page="${viewState.page + 1}" ${viewState.page >= pages ? "disabled" : ""}>Дальше</button>
    </div>`;
}

function renderTabContent() {
  if (viewState.tab === "search") return renderSearchTab();
  if (viewState.tab === "granted") return renderGrantedTab();
  return renderRequestsTab();
}

function renderAdmin() {
  const container = document.getElementById("advancedAccessAdminContent");
  if (!container) return;
  const requestCount = getDraftStore().getRequests().length;

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

function openDateDialog(action, userId) {
  const record = getRecordById(userId);
  if (!record) return;
  const modal = document.getElementById("advancedAccessDateModal");
  const grant = getDraftStore().getGrant(userId);
  viewState.pendingDateAction = { action, userId };
  document.getElementById("advancedAccessDateTitle").textContent = action === "extend" ? "Продлить доступ" : "Выдать доступ";
  document.getElementById("advancedAccessDateUser").textContent = `${record.email} · ${record.nickname}`;
  document.getElementById("advancedAccessExpirationDate").value = grant?.expiresAt ? String(grant.expiresAt).slice(0, 10) : "";
  modal.hidden = false;
}

function closeDateDialog() {
  const modal = document.getElementById("advancedAccessDateModal");
  if (modal) modal.hidden = true;
  viewState.pendingDateAction = null;
}

function refreshSearchResult() {
  if (!viewState.searchEmail) return;
  viewState.searchResult = getDraftStore().findByEmail(viewState.searchEmail, getCurrentAccount());
}

function bindRenderedEvents() {
  document.querySelectorAll("[data-access-tab]").forEach(button => {
    button.addEventListener("click", () => {
      viewState.tab = getDraftStore().setAdminTab(button.dataset.accessTab);
      viewState.page = 1;
      renderAdmin();
    });
  });

  document.getElementById("advancedAccessSearchForm")?.addEventListener("submit", event => {
    event.preventDefault();
    viewState.searchEmail = document.getElementById("advancedAccessSearchEmail").value.trim().toLowerCase();
    refreshSearchResult();
    renderAdmin();
  });

  document.getElementById("advancedAccessSort")?.addEventListener("change", event => {
    viewState.sort = event.target.value;
    viewState.page = 1;
    renderAdmin();
  });

  document.querySelectorAll("[data-access-page]").forEach(button => {
    button.addEventListener("click", () => {
      viewState.page = Number(button.dataset.accessPage) || 1;
      renderAdmin();
    });
  });

  document.querySelectorAll("[data-access-grant]").forEach(button => {
    button.addEventListener("click", () => openDateDialog("grant", button.dataset.accessGrant));
  });
  document.querySelectorAll("[data-access-extend]").forEach(button => {
    button.addEventListener("click", () => openDateDialog("extend", button.dataset.accessExtend));
  });
  document.querySelectorAll("[data-access-delete-request]").forEach(button => {
    button.addEventListener("click", () => {
      getDraftStore().deleteRequest(button.dataset.accessDeleteRequest);
      refreshSearchResult();
      renderAdmin();
    });
  });
  document.querySelectorAll("[data-access-revoke]").forEach(button => {
    button.addEventListener("click", () => {
      const userId = button.dataset.accessRevoke;
      const record = getRecordById(userId);
      if (!window.confirm(`Удалить доступ у ${record?.email || "пользователя"}?`)) return;
      try {
        getDraftStore().revokeAccess(userId);
        refreshSearchResult();
        renderAdmin();
      } catch (error) {
        window.alert(error.message || "Не удалось удалить доступ.");
      }
    });
  });

  document.querySelectorAll("[data-access-date-close]").forEach(button => {
    button.addEventListener("click", closeDateDialog);
  });
  document.getElementById("advancedAccessDateConfirm")?.addEventListener("click", () => {
    const pending = viewState.pendingDateAction;
    if (!pending) return;
    const date = document.getElementById("advancedAccessExpirationDate").value;
    const record = getRecordById(pending.userId);
    if (!record) return closeDateDialog();

    if (pending.action === "extend") getDraftStore().extendAccess(pending.userId, date);
    else getDraftStore().grantAccess(record, date);
    closeDateDialog();
    refreshSearchResult();
    renderAdmin();
  });
}

async function renderAccessPage() {
  const container = document.getElementById("advancedAccessAdminContent");
  const account = getCurrentAccount();
  if (!container || !account || !getDraftStore()) {
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

  getDraftStore().ensureOwner(account);
  viewState.tab = getDraftStore().getAdminTab();
  renderAdmin();
}

export function init() {
  document.getElementById("advancedAccessBackToProfile")?.addEventListener("click", () => window.loadPage?.("profile.html"));
  renderAccessPage();
}
