(() => {
  const CONTAINER_ID = "harvestHubNotifications";
  const OFFLINE_KEY = "network-offline";
  const visibleNotifications = new Map();

  const ERROR_PATTERNS = [
    {
      match: ["failed to fetch", "networkerror", "network error", "load failed", "fetch failed"],
      message: "Не удалось связаться с сервером. Проверьте подключение к интернету и попробуйте ещё раз."
    },
    {
      match: ["invalid login credentials", "invalid_credentials"],
      message: "Неверный email или пароль."
    },
    {
      match: ["email not confirmed", "email_not_confirmed"],
      message: "Сначала подтвердите email по ссылке из письма."
    },
    {
      match: ["user already registered", "user_already_exists", "email_exists"],
      message: "Профиль с таким email уже существует."
    },
    {
      match: ["password should be", "weak_password", "weak password"],
      message: "Пароль не соответствует требованиям безопасности."
    },
    {
      match: ["rate limit", "too many requests", "over_email_send_rate_limit"],
      message: "Слишком много попыток. Подождите и попробуйте снова."
    },
    {
      match: ["jwt expired", "invalid jwt", "session_not_found", "refresh_token_not_found"],
      message: "Сессия истекла. Войдите в аккаунт снова."
    },
    {
      match: ["state_revision_conflict"],
      message: "Данные изменились на другом устройстве. Обновите страницу и повторите действие."
    },
    {
      match: ["account_delete_blocked"],
      message: "Перед удалением аккаунта передайте владение союзным штабом и роль Р5."
    },
    {
      match: ["23505", "duplicate key", "uniqueness violation"],
      message: "Такая запись уже существует."
    },
    {
      match: ["23503", "foreign key violation"],
      message: "Не удалось изменить запись, потому что с ней связаны другие данные."
    },
    {
      match: ["42501", "permission denied", "insufficient privilege", "row-level security"],
      message: "У вас нет прав для выполнения этого действия."
    },
    {
      match: ["pgrst000", "pgrst001", "pgrst002", "pgrst003", "service unavailable", "gateway timeout"],
      message: "Сервис временно недоступен. Попробуйте ещё раз немного позже."
    }
  ];

  function getErrorDetails(error) {
    if (error && typeof error === "object") {
      return [
        error.message,
        error.code,
        error.details,
        error.hint,
        error.status
      ].filter(Boolean).join(" ");
    }
    return String(error || "");
  }

  function containsRussian(text) {
    return /[А-ЯЁа-яё]/.test(text);
  }

  function containsEnglishWords(text) {
    return /[A-Za-z]{3,}/.test(text);
  }

  function toRussianError(error, fallback = "Не удалось выполнить действие. Попробуйте ещё раз.") {
    const details = getErrorDetails(error).trim();
    const normalized = details.toLowerCase();
    const known = ERROR_PATTERNS.find(item => item.match.some(pattern => normalized.includes(pattern)));
    if (known) return known.message;

    const originalMessage = String(error?.message || error || "").trim();
    const localizedMessage = originalMessage
      .replace(/\bSupabase\b/gi, "сервер")
      .replace(/с таким email/gi, "с такой электронной почтой")
      .replace(/укажи email/gi, "укажите электронную почту")
      .replace(/\bemail\b/gi, "адрес электронной почты")
      .replace(/UTC-дня/g, "дня по всемирному времени")
      .replace(/\bUTC\b/g, "по всемирному времени");
    const messageWithoutBrand = localizedMessage.replaceAll("HarvestHub", "");
    if (localizedMessage && containsRussian(localizedMessage) && !containsEnglishWords(messageWithoutBrand)) {
      return localizedMessage;
    }
    return fallback;
  }

  function ensureContainer() {
    let container = document.getElementById(CONTAINER_ID);
    if (container) return container;

    container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.className = "site-notifications";
    container.setAttribute("aria-label", "Уведомления сайта");
    document.body.append(container);
    return container;
  }

  function remove(key) {
    const notification = visibleNotifications.get(key);
    if (!notification) return;
    notification.remove();
    visibleNotifications.delete(key);
  }

  function show(message, options = {}) {
    const text = String(message || "").trim();
    if (!text) return "";

    const type = options.type || "error";
    const key = options.key || `${type}:${text}`;
    const existing = visibleNotifications.get(key);
    if (existing) {
      existing.focus({ preventScroll: true });
      return key;
    }

    const notification = document.createElement("section");
    notification.className = `site-notification site-notification--${type}`;
    notification.dataset.notificationKey = key;
    notification.setAttribute("role", type === "error" ? "alert" : "status");
    notification.setAttribute("tabindex", "-1");

    const icon = document.createElement("span");
    icon.className = "site-notification__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = type === "error" ? "!" : "i";

    const content = document.createElement("div");
    content.className = "site-notification__content";

    const title = document.createElement("strong");
    title.textContent = options.title || (type === "error" ? "Ошибка" : "Уведомление");

    const description = document.createElement("p");
    description.textContent = text;
    content.append(title, description);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "site-notification__close";
    closeButton.setAttribute("aria-label", "Закрыть уведомление");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => remove(key));

    notification.append(icon, content, closeButton);
    ensureContainer().append(notification);
    visibleNotifications.set(key, notification);
    return key;
  }

  function showError(error, fallback, options = {}) {
    console.error(options.consoleLabel || "Ошибка HarvestHub:", error);
    if (!navigator.onLine) {
      showOffline();
      return OFFLINE_KEY;
    }
    return show(toRussianError(error, fallback), {
      ...options,
      type: "error"
    });
  }

  function showOffline() {
    show("Нет подключения к интернету. Проверьте соединение.", {
      type: "error",
      key: OFFLINE_KEY,
      title: "Нет сети"
    });
  }

  function handleOnline() {
    remove(OFFLINE_KEY);
  }

  window.addEventListener("offline", showOffline);
  window.addEventListener("online", handleOnline);
  window.addEventListener("error", event => {
    if (!event.error) return;
    showError(event.error, "На странице произошла ошибка. Обновите страницу и попробуйте ещё раз.", {
      consoleLabel: "Необработанная ошибка HarvestHub:"
    });
  });
  window.addEventListener("unhandledrejection", event => {
    showError(event.reason, "Не удалось завершить действие. Попробуйте ещё раз.", {
      consoleLabel: "Необработанная ошибка HarvestHub:"
    });
  });

  window.harvestHubNotifications = {
    show,
    error: showError,
    close: remove,
    translateError: toRussianError
  };

  if (!navigator.onLine) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", showOffline, { once: true });
    } else showOffline();
  }
})();
