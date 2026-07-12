(() => {
  const SUPABASE_URL = "https://dfbenhembawizjhachwz.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_df26yuskbnUu6V6kVwe4iw_Ordrp8HV";

  if (!window.supabase?.createClient) {
    console.error("Supabase SDK не загрузился");
    return;
  }

  if (!window.harvestHubSupabase) {
    window.harvestHubSupabase = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );
  }
})();
