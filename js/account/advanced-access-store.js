(() => {
  const ADMIN_TAB_KEY = "harvesthub_advanced_access_admin_tab";
  const VALID_TABS = new Set(["requests", "search", "granted"]);

  function getClient() {
    const client = window.harvestHubSupabase;
    if (!client) throw new Error("Supabase пока недоступен.");
    return client;
  }

  async function callRpc(name, args) {
    const { data, error } = await getClient().rpc(name, args);
    if (error) throw error;
    return data;
  }

  function normalizeAccount(row) {
    if (!row) return null;
    return {
      userId: String(row.user_id || ""),
      email: String(row.email || ""),
      nickname: String(row.nickname || "Пользователь"),
      state: String(row.state || ""),
      registeredAt: row.registered_at || row.created_at || null,
      requestedAt: row.requested_at || null,
      requestStatus: row.request_status || null,
      hasAccess: Boolean(row.has_access),
      isAdmin: Boolean(row.is_admin),
      grantedAt: row.granted_at || null,
      expiresOn: row.expires_on || null,
      isExpired: Boolean(row.is_expired),
      grantSource: row.grant_source || null
    };
  }

  async function requestAccess() {
    return callRpc("request_advanced_mode_access");
  }

  async function getAdminSummary() {
    const data = await callRpc("get_advanced_mode_admin_summary");
    return {
      pendingRequests: Number(data?.pending_requests) || 0,
      activeAccessTotal: Number(data?.active_access_total) || 0
    };
  }

  async function listRequests() {
    const data = await callRpc("list_advanced_mode_requests");
    return Array.isArray(data) ? data.map(normalizeAccount) : [];
  }

  async function findByEmail(email) {
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail) return null;
    return normalizeAccount(await callRpc("find_advanced_mode_account_by_email", {
      search_email: cleanEmail
    }));
  }

  async function listGrants({ page = 1, pageSize = 30, sort = "granted-desc" } = {}) {
    const [sortKey, sortDirection] = String(sort || "granted-desc").split("-");
    const data = await callRpc("list_advanced_mode_grants", {
      page_number: Math.max(1, Number(page) || 1),
      page_size: Math.min(100, Math.max(1, Number(pageSize) || 30)),
      sort_key: sortKey === "registered" ? "registered" : "granted",
      sort_direction: sortDirection === "asc" ? "asc" : "desc"
    });
    return {
      items: Array.isArray(data?.items) ? data.items.map(normalizeAccount) : [],
      total: Number(data?.total) || 0,
      page: Number(data?.page) || 1,
      pageSize: Number(data?.page_size) || pageSize
    };
  }

  async function grantAccess(userId, expiresOn = "") {
    return callRpc("grant_advanced_mode_access", {
      target_user_id: userId,
      access_expires_on: expiresOn || null
    });
  }

  async function deleteRequest(userId) {
    return callRpc("delete_advanced_mode_request", { target_user_id: userId });
  }

  async function revokeAccess(userId) {
    return callRpc("revoke_advanced_mode_access", { target_user_id: userId });
  }

  function setAdminTab(tab) {
    const next = VALID_TABS.has(tab) ? tab : "requests";
    sessionStorage.setItem(ADMIN_TAB_KEY, next);
    return next;
  }

  function getAdminTab() {
    return setAdminTab(sessionStorage.getItem(ADMIN_TAB_KEY) || "requests");
  }

  window.harvestHubAdvancedAccessStore = {
    requestAccess,
    getAdminSummary,
    listRequests,
    findByEmail,
    listGrants,
    grantAccess,
    deleteRequest,
    revokeAccess,
    setAdminTab,
    getAdminTab
  };
})();