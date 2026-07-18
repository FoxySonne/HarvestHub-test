(() => {
  const MOBILE_QUERY = "(max-width: 899px)";
  const MIN_SWIPE_DISTANCE = 64;
  const MAX_SWIPE_DURATION = 900;
  const HORIZONTAL_RATIO = 1.25;

  let gesture = null;
  let previousFocus = null;
  let renderRequestId = 0;

  function isMobile() {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function getAccountProfile() {
    return window.harvestHubAccountStorage?.getActiveProfile?.() || null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function injectProfileSwitcher() {
    if (document.getElementById("mobileProfileSwitcher")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <aside id="mobileProfileSwitcher" class="mobile-profile-switcher" role="dialog" aria-modal="true" aria-label="Быстрое переключение профилей" aria-hidden="true" tabindex="-1">
        <header class="mobile-profile-switcher-header">
          <p>Аккаунт HarvestHub</p>
          <h2>Переключить профиль</h2>
        </header>
        <div id="mobileProfileSwitcherList" class="mobile-profile-switcher-list"></div>
        <p id="mobileProfileSwitcherStatus" class="mobile-profile-switcher-status" aria-live="polite"></p>
      </aside>`);
  }

  function getPanel() {
    return document.getElementById("mobileProfileSwitcher");
  }

  function isProfileSwitcherOpen() {
    return getPanel()?.classList.contains("active") || false;
  }

  function closeProfileSwitcher({ restoreFocus = true } = {}) {
    const panel = getPanel();
    if (!panel) return;
    renderRequestId += 1;
    panel.classList.remove("active");
    panel.setAttribute("aria-hidden", "true");
    window.harvestHubMenu?.syncOverlay?.();
    if (restoreFocus && previousFocus instanceof HTMLElement) previousFocus.focus();
    previousFocus = null;
  }

  function renderProfileOptions(profiles, activeProfileId) {
    const list = document.getElementById("mobileProfileSwitcherList");
    if (!list) return;
    list.innerHTML = profiles.map(profile => {
      const active = profile.id === activeProfileId;
      return `
        <button type="button" class="mobile-profile-switcher-option${active ? " is-active" : ""}" data-mobile-profile-id="${escapeHtml(profile.id)}" ${active ? "disabled" : ""}>
          <span><strong>${escapeHtml(profile.nickname)}</strong><small>Штат ${escapeHtml(profile.state)}</small></span>
          <span class="mobile-profile-switcher-mark">${active ? "Текущий" : "Выбрать"}</span>
        </button>`;
    }).join("");
  }

  async function loadProfileOptions() {
    const requestId = ++renderRequestId;
    const list = document.getElementById("mobileProfileSwitcherList");
    const status = document.getElementById("mobileProfileSwitcherStatus");
    if (list) list.innerHTML = '<p class="mobile-profile-switcher-loading">Загружаем профили…</p>';
    if (status) status.textContent = "";

    try {
      const { profiles } = await window.harvestHubGameProfileManager.listGameProfiles();
      if (requestId !== renderRequestId || !isProfileSwitcherOpen()) return;
      const activeId = getAccountProfile()?.gameProfileId || profiles.find(profile => profile.is_active)?.id || "";
      renderProfileOptions(profiles, activeId);
    } catch (error) {
      if (requestId !== renderRequestId) return;
      if (list) list.innerHTML = "";
      if (status) status.textContent = error.message || "Не удалось загрузить профили.";
    }
  }

  async function openProfileSwitcher() {
    const profile = getAccountProfile();
    if (!isMobile() || profile?.type !== "account") return false;
    injectProfileSwitcher();
    window.harvestHubMenu?.close?.();
    previousFocus = document.activeElement;
    const panel = getPanel();
    panel.classList.add("active");
    panel.setAttribute("aria-hidden", "false");
    window.harvestHubMenu?.syncOverlay?.();
    panel.focus({ preventScroll: true });
    await loadProfileOptions();
    return true;
  }

  async function selectProfile(button) {
    const profileId = button.dataset.mobileProfileId;
    if (!profileId || button.disabled) return;
    const status = document.getElementById("mobileProfileSwitcherStatus");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (status) status.textContent = "Переключаем профиль…";
    try {
      await window.harvestHubGameProfileManager.activateGameProfile(profileId);
      closeProfileSwitcher({ restoreFocus: false });
    } catch (error) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      if (status) status.textContent = error.message || "Не удалось переключить профиль.";
    }
  }

  function hasBlockingDialog() {
    return Boolean(document.querySelector(
      ".account-modal.is-open, .account-delete-modal:not([hidden]), .is-alliance-table-fullscreen"
    ));
  }

  function blocksPanelGesture(target) {
    return Boolean(target?.closest?.(
      "[data-horizontal-scroll], .alliance-table-wrap, input, select, textarea, button, [role='dialog']"
    ));
  }

  function getGestureMode() {
    if (window.harvestHubMenu?.isOpen?.()) return "close-menu";
    if (isProfileSwitcherOpen()) return "close-profiles";
    return "open-panel";
  }

  function isAllowedDirection(mode, distanceX) {
    if (mode === "close-menu") return distanceX < 0;
    if (mode === "close-profiles") return distanceX > 0;
    return distanceX !== 0;
  }

  function getTouch(event) {
    return event.touches?.[0] || event.changedTouches?.[0] || null;
  }

  function handleTouchStart(event) {
    if (!isMobile() || event.touches?.length !== 1 || hasBlockingDialog() || blocksPanelGesture(event.target)) return;
    const touch = getTouch(event);
    if (!touch) return;

    gesture = {
      mode: getGestureMode(),
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      startedAt: Date.now(),
      horizontal: false
    };
  }

  function handleTouchMove(event) {
    if (!gesture) return;
    const touch = getTouch(event);
    if (!touch) return;
    gesture.currentX = touch.clientX;
    gesture.currentY = touch.clientY;
    const distanceX = gesture.currentX - gesture.startX;
    const distanceY = gesture.currentY - gesture.startY;
    gesture.horizontal = isAllowedDirection(gesture.mode, distanceX)
      && Math.abs(distanceX) > 12
      && Math.abs(distanceX) > Math.abs(distanceY) * HORIZONTAL_RATIO;
    if (gesture.horizontal && event.cancelable) event.preventDefault();
  }

  function handleTouchEnd(event) {
    if (!gesture) return;
    const touch = getTouch(event);
    if (touch) {
      gesture.currentX = touch.clientX;
      gesture.currentY = touch.clientY;
    }
    const distanceX = gesture.currentX - gesture.startX;
    const distanceY = gesture.currentY - gesture.startY;
    const elapsed = Date.now() - gesture.startedAt;
    const completed = gesture.horizontal
      && isAllowedDirection(gesture.mode, distanceX)
      && Math.abs(distanceX) >= MIN_SWIPE_DISTANCE
      && Math.abs(distanceX) > Math.abs(distanceY) * HORIZONTAL_RATIO
      && elapsed <= MAX_SWIPE_DURATION;
    const mode = gesture.mode;
    gesture = null;

    if (!completed) return;
    if (mode === "close-menu") {
      window.harvestHubMenu?.close?.();
      return;
    }
    if (mode === "close-profiles") {
      closeProfileSwitcher();
      return;
    }
    if (distanceX > 0) window.harvestHubMenu?.open?.();
    else openProfileSwitcher();
  }

  function init() {
    injectProfileSwitcher();
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchcancel", () => { gesture = null; }, { passive: true });

    document.getElementById("overlay")?.addEventListener("click", () => closeProfileSwitcher());
    document.getElementById("mobileProfileSwitcher")?.addEventListener("click", event => {
      const button = event.target.closest("[data-mobile-profile-id]");
      if (button) selectProfile(button);
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeProfileSwitcher();
    });
    window.addEventListener("harvesthub:left-menu-open", () => closeProfileSwitcher({ restoreFocus: false }));
    window.addEventListener("harvesthub:profile-change", () => closeProfileSwitcher({ restoreFocus: false }));
    window.addEventListener("resize", () => {
      if (!isMobile()) closeProfileSwitcher({ restoreFocus: false });
    });
  }

  window.harvestHubMobilePanels = {
    openProfileSwitcher,
    closeProfileSwitcher,
    isProfileSwitcherOpen
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
