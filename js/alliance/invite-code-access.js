(() => {
  function setMessage(text, type = "info") {
    const box = document.getElementById("allianceMessage");
    window.harvestHubNotifications?.renderMessage(box, text, type, {
      fallback: "Не удалось изменить пригласительный код."
    });
  }

  async function rotateInviteCode(button) {
    const allianceId = localStorage.getItem("harvesthub_active_alliance_id") || "";
    if (!allianceId) {
      setMessage("Сначала открой союзный штаб.", "error");
      return;
    }

    const confirmed = window.confirm(
      "Создать новый пригласительный код? Старый код сразу перестанет работать. Уже подключённые аккаунты сохранят доступ."
    );
    if (!confirmed) return;

    button.disabled = true;
    const previousText = button.textContent;
    button.textContent = "Меняем…";

    try {
      const client = window.harvestHubSupabase;
      if (!client) throw new Error("Не удалось подключить Supabase.");
      const { data, error } = await client.rpc("rotate_alliance_invite_code", {
        target_alliance_id: allianceId
      });
      if (error) throw error;
      if (!data) throw new Error("Сервер не вернул новый код.");

      const codeElement = document.getElementById("allianceManagementInvite");
      if (codeElement) codeElement.textContent = data;
      setMessage("Пригласительный код обновлён. Старый код больше не работает.", "success");
    } catch (error) {
      console.error("Не удалось обновить пригласительный код:", error);
      setMessage(error?.message || "Не удалось обновить пригласительный код.", "error");
    } finally {
      button.disabled = false;
      button.textContent = previousText;
    }
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-rotate-alliance-code]");
    if (!button) return;
    rotateInviteCode(button);
  });
})();
