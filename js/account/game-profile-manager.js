(() => {
  async function syncCloudProfile(user) {
    if (!user) return null;

    const nickname = user.user_metadata?.nickname || user.email?.split("@")[0] || "Пользователь";
    const state = user.user_metadata?.state || "";

    return window.harvestHubAccountStorage.saveProfile({
      id: `account:${user.id}`,
      type: "account",
      supabaseUserId: user.id,
      nickname,
      state,
      email: user.email || "",
      createdAt: new Date().toISOString()
    });
  }

  window.harvestHubGameProfileManager = { syncCloudProfile };
})();
