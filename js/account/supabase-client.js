(() => {
  if (!window.supabase?.createClient) {
    console.error("Supabase SDK не загрузился.");
    return;
  }

  const config = window.HARVESTHUB_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").trim();
  const supabaseAnonKey = String(config.supabaseAnonKey || "").trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl) || !supabaseAnonKey) {
    console.error("Публичная конфигурация Supabase не заполнена.");
    return;
  }

  window.harvestHubSupabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "harvesthub_supabase_auth"
    }
  });
})();
