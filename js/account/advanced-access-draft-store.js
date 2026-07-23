(() => {
  const STORAGE_KEY = "harvesthub_advanced_access_draft";
  const ADMIN_TAB_KEY = "harvesthub_advanced_access_admin_tab";
  const VALID_TABS = new Set(["requests", "search", "granted"]);

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
        requests: Array.isArray(parsed.requests) ? parsed.requests : [],
        grants: Array.isArray(parsed.grants) ? parsed.grants : []
      };
    } catch {
      return { accounts: [], requests: [], grants: [] };
    }
  }

  function writeState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("harvesthub:advanced-access-draft-change"));
    return state;
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function getAccountId(account) {
    return String(
      account?.supabaseUserId
      || account?.userId
      || account?.user_id
      || account?.id
      || normalizeEmail(account?.email)
    ).trim();
  }

  function normalizeAccount(account) {
    const email = normalizeEmail(account?.email);
    const userId = getAccountId(account);
    return {
      userId,
      email,
      nickname: String(account?.nickname || "Пользователь").trim(),
      state: String(account?.state || "").trim(),
      registeredAt: account?.registeredAt || account?.createdAt || account?.created_at || new Date().toISOString()
    };
  }

  function upsertAccount(state, account) {
    const normalized = normalizeAccount(account);
    if (!normalized.userId && !normalized.email) return null;

    const index = state.accounts.findIndex(item =>
      (normalized.userId && item.userId === normalized.userId)
      || (normalized.email && normalizeEmail(item.email) === normalized.email)
    );

    if (index >= 0) state.accounts[index] = { ...state.accounts[index], ...normalized };
    else state.accounts.push(normalized);
    return normalized;
  }

  function ensureAccount(account) {
    const state = readState();
    const normalized = upsertAccount(state, account);
    if (normalized) writeState(state);
    return normalized;
  }

  function findAccount(state, userIdOrEmail) {
    const needle = String(userIdOrEmail || "").trim();
    const email = normalizeEmail(needle);
    return state.accounts.find(item =>
      item.userId === needle
      || (email && normalizeEmail(item.email) === email)
    ) || null;
  }

  function findRequest(state, userIdOrEmail) {
    const needle = String(userIdOrEmail || "").trim();
    const email = normalizeEmail(needle);
    return state.requests.find(item =>
      item.userId === needle
      || (email && normalizeEmail(item.email) === email)
    ) || null;
  }

  function findGrant(state, userIdOrEmail) {
    const needle = String(userIdOrEmail || "").trim();
    const email = normalizeEmail(needle);
    return state.grants.find(item =>
      item.userId === needle
      || (email && normalizeEmail(item.email) === email)
    ) || null;
  }

  function requestAccess(account) {
    const state = readState();
    const normalized = upsertAccount(state, account);
    if (!normalized) throw new Error("Не удалось определить аккаунт пользователя.");
    if (findGrant(state, normalized.userId || normalized.email)) return null;

    const existingIndex = state.requests.findIndex(item =>
      item.userId === normalized.userId
      || normalizeEmail(item.email) === normalized.email
    );
    const request = {
      ...normalized,
      requestedAt: existingIndex >= 0
        ? state.requests[existingIndex].requestedAt
        : new Date().toISOString()
    };

    if (existingIndex >= 0) state.requests[existingIndex] = request;
    else state.requests.push(request);
    writeState(state);
    return request;
  }

  function deleteRequest(userIdOrEmail) {
    const state = readState();
    const before = state.requests.length;
    const needle = String(userIdOrEmail || "").trim();
    const email = normalizeEmail(needle);
    state.requests = state.requests.filter(item =>
      item.userId !== needle
      && (!email || normalizeEmail(item.email) !== email)
    );
    if (state.requests.length !== before) writeState(state);
  }

  function grantAccess(account, expiresAt = "", options = {}) {
    const state = readState();
    const normalized = upsertAccount(state, account);
    if (!normalized) throw new Error("Не удалось определить аккаунт пользователя.");

    const existingIndex = state.grants.findIndex(item =>
      item.userId === normalized.userId
      || normalizeEmail(item.email) === normalized.email
    );
    const current = existingIndex >= 0 ? state.grants[existingIndex] : null;
    const grant = {
      ...normalized,
      grantedAt: current?.grantedAt || options.grantedAt || new Date().toISOString(),
      expiresAt: String(expiresAt || ""),
      isOwner: Boolean(options.isOwner || current?.isOwner)
    };

    if (existingIndex >= 0) state.grants[existingIndex] = grant;
    else state.grants.push(grant);
    state.requests = state.requests.filter(item =>
      item.userId !== normalized.userId
      && normalizeEmail(item.email) !== normalized.email
    );
    writeState(state);
    return grant;
  }

  function ensureOwner(account) {
    const state = readState();
    const normalized = upsertAccount(state, account);
    if (!normalized) return null;
    const existing = findGrant(state, normalized.userId || normalized.email);
    if (existing?.isOwner) {
      writeState(state);
      return existing;
    }
    return grantAccess(normalized, "", {
      isOwner: true,
      grantedAt: normalized.registeredAt
    });
  }

  function revokeAccess(userIdOrEmail) {
    const state = readState();
    const grant = findGrant(state, userIdOrEmail);
    if (grant?.isOwner) throw new Error("Доступ владельца сайта нельзя удалить.");

    const needle = String(userIdOrEmail || "").trim();
    const email = normalizeEmail(needle);
    state.grants = state.grants.filter(item =>
      item.userId !== needle
      && (!email || normalizeEmail(item.email) !== email)
    );
    writeState(state);
  }

  function extendAccess(userIdOrEmail, expiresAt = "") {
    const state = readState();
    const grant = findGrant(state, userIdOrEmail);
    if (!grant) throw new Error("Пользователь с доступом не найден.");
    grant.expiresAt = String(expiresAt || "");
    writeState(state);
    return grant;
  }

  function findByEmail(email, currentAccount = null) {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail) return null;
    const state = readState();
    if (currentAccount) upsertAccount(state, currentAccount);
    const account = state.accounts.find(item => normalizeEmail(item.email) === cleanEmail);
    if (currentAccount) writeState(state);
    if (!account) return null;
    return {
      ...account,
      request: findRequest(state, account.userId || account.email),
      grant: findGrant(state, account.userId || account.email)
    };
  }

  function getRequest(accountOrId) {
    const state = readState();
    const key = typeof accountOrId === "object"
      ? getAccountId(accountOrId) || normalizeEmail(accountOrId?.email)
      : accountOrId;
    return findRequest(state, key);
  }

  function getGrant(accountOrId) {
    const state = readState();
    const key = typeof accountOrId === "object"
      ? getAccountId(accountOrId) || normalizeEmail(accountOrId?.email)
      : accountOrId;
    return findGrant(state, key);
  }

  function setAdminTab(tab) {
    const next = VALID_TABS.has(tab) ? tab : "requests";
    sessionStorage.setItem(ADMIN_TAB_KEY, next);
    return next;
  }

  function getAdminTab() {
    return setAdminTab(sessionStorage.getItem(ADMIN_TAB_KEY) || "requests");
  }

  window.harvestHubAdvancedAccessDraft = {
    ensureAccount,
    ensureOwner,
    requestAccess,
    deleteRequest,
    grantAccess,
    revokeAccess,
    extendAccess,
    findByEmail,
    getRequest,
    getGrant,
    getRequests: () => readState().requests.slice(),
    getGrants: () => readState().grants.slice(),
    getAccounts: () => readState().accounts.slice(),
    setAdminTab,
    getAdminTab
  };
})();
