const App = {
  runAfterNextPaint(callback, frames = 2) {
    if (typeof callback !== "function") {
      return;
    }
    const step = (remaining) => {
      if (remaining <= 0) {
        callback();
        return;
      }
      requestAnimationFrame(() => step(remaining - 1));
    };
    step(Math.max(0, Number(frames) || 0));
  },

  async init() {
    UI.init();
    await Auth.init();
    Sync.init();
    try {
      const savedTab = sessionStorage.getItem("activeTab");
      if (["overviewTab", "analyticsTab", "tagsTab", "monthsTab", "settingsTab"].includes(savedTab)) {
        Store.activeTab = savedTab;
      }
      const savedQuickMode = sessionStorage.getItem("settingsQuickMode");
      if (["template", "favorite"].includes(savedQuickMode)) {
        UI.settingsQuickMode = savedQuickMode;
      }
    } catch {}
    if (Utils.$("dateInput")) {
      Utils.$("dateInput").value = Utils.todayISO();
    }
    if (Utils.$("editDateInput")) {
      Utils.$("editDateInput").value = Utils.todayISO();
    }
    if (Utils.$("templateTypeInput")) {
      Utils.$("templateTypeInput").value = "expense";
    }

    if (Auth.hasSession()) {
      Store.loadLocal(Auth.getLogin());
      Store.resetHistory();
      UI.showApp();
      UI.renderApp();
      UI.finishBoot();
      if (Auth.isAuthenticated()) {
        if (navigator.onLine) {
          await Api.probeConnection();
        }
        await this.loadRemoteIntoStore({ silent: true, mergeGuest: false });
        if (Storage.loadPending()?.login === Auth.getLogin()) {
          Sync.processQueue(true);
        }
      }
    } else {
      Store.loadLocal(null);
      Store.resetHistory();
      UI.showStartupAuth();
      UI.finishBoot();
    }
  },

  switchTab(tabId) {
    if (!["overviewTab", "analyticsTab", "tagsTab", "monthsTab", "settingsTab"].includes(tabId)) {
      return;
    }
    Store.activeTab = tabId;
    try {
      sessionStorage.setItem("activeTab", tabId);
    } catch {}
    UI.renderTabs();
    UI.renderActiveTabContent(tabId);
    UI.renderHistoryState();
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
    }
  },

  openAccountEntry() {
    if (Auth.hasSession()) {
      this.renderAccountMenu();
      UI.openModal("accountMenuModal");
      return;
    }
    UI.clearAuthStatus("modal");
    UI.clearAuthFieldError(Utils.$("modalLogin"));
    UI.clearAuthFieldError(Utils.$("modalPassword"));
    UI.openModal("authModal");
  },

  renderAccountMenu() {
    const title = Utils.$("accountMenuTitle");
    const subtext = Utils.$("accountMenuSubtext");
    const state = Utils.$("accountMenuState");
    const passwordHint = Utils.$("accountPasswordHint");
    const identity = Utils.$("accountMenuIdentity");
    const meta = Utils.$("accountMenuMeta");
    const avatar = Utils.$("accountMenuAvatar");
    const status = Utils.$("accountMenuStatus");
    const login = Auth.getLogin();
    const isLocalOnly = Auth.isLocalOnly();
    const isLocalTest = isLocalOnly && isLocalTestLogin(login);
    let statusTone = "is-local";
    let statusLabel = "Локально";
    let subtextValue = "Сессия активна в текущем браузере.";
    let metaValue = "Данные доступны только в текущем браузере";
    let stateValue = "Это локальная сессия без обращения к API и без облачной синхронизации.";
    let passwordHintValue = "Для локальной сессии смена пароля недоступна.";

    if (isLocalTest) {
      subtextValue = "Демо-среда активна только в этом браузере.";
      metaValue = "Изолированная демо-среда без API и облачной синхронизации";
      stateValue = "Фейковые демо-данные живут отдельно и не попадут в настоящий аккаунт.";
    } else if (!isLocalOnly) {
      subtextValue = Auth.getExpiry()
        ? `Сессия активна до ${new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(Auth.getExpiry()))}.`
        : "Сессия активна в текущем браузере.";
      metaValue = "Облачная сессия с API-синхронизацией";
      passwordHintValue = "Смена пароля появится после поддержки отдельного endpoint в API.";
      stateValue = Sync.status === "synced"
        ? "Синхронизация активна и данные уже сохранены в аккаунте."
        : (Sync.status === "syncing"
          ? "Идет синхронизация текущих изменений."
          : (Sync.status === "offline"
            ? "Интернет недоступен. Очередь изменений будет отправлена позже."
            : (Sync.status === "error"
              ? `Есть проблема синхронизации: ${Sync.lastError || "локальные данные сохранены, но облако не обновилось."}`
              : "Облачная сессия активна, но синхронизация сейчас не выполняется.")));
    }

    if (title) {
      title.textContent = "Сессия и синхронизация";
    }
    if (subtext) {
      subtext.textContent = subtextValue;
    }
    if (identity) {
      identity.textContent = login || "Локальная сессия";
    }
    if (meta) {
      meta.textContent = metaValue;
    }
    if (avatar) {
      avatar.textContent = (login || "A").trim().charAt(0).toUpperCase() || "A";
    }
    if (state) {
      state.textContent = stateValue;
      if (!isLocalOnly) {
        if (Sync.status === "synced") {
          statusTone = "is-synced";
          statusLabel = "Синхр.";
        } else if (Sync.status === "syncing") {
          statusTone = "is-syncing";
          statusLabel = "Синхр.";
        } else if (Sync.status === "offline") {
          statusTone = "is-offline";
          statusLabel = "Оффлайн";
        } else if (Sync.status === "error") {
          statusTone = "is-error";
          statusLabel = "Ошибка";
        }
      }
    }
    if (passwordHint) {
      passwordHint.textContent = passwordHintValue;
    }
    if (status) {
      status.className = `account-menu__status ${statusTone}`;
      status.textContent = statusLabel;
    }
    Utils.$("accountSyncNowBtn")?.classList.toggle("is-hidden", isLocalOnly);
    Utils.$("accountPasswordInfoBtn")?.classList.toggle("is-hidden", isLocalOnly);
  },

  describeDataSource(data, fallbackLabel) {
    const summary = summarizeNormalizedData(normalizeData(data));
    if (!Object.values(summary).some((value) => Number(value) > 0)) {
      return `${fallbackLabel}: пусто`;
    }
    return `${fallbackLabel}: ${summary.months} мес. · ${summary.transactions} операций · ${summary.templates} шабл. · ${summary.favorites} избр. · ${summary.wishlist} хотелки`;
  },

  promptSyncChoice({ login, guestData, remoteData }) {
    const localSummary = Utils.$("syncChoiceLocalSummary");
    const cloudSummary = Utils.$("syncChoiceCloudSummary");
    const title = Utils.$("syncChoiceTitle");
    if (title) {
      title.textContent = `Данные для аккаунта ${login}`;
    }
    if (localSummary) {
      localSummary.textContent = this.describeDataSource(guestData, "Текущие локальные данные");
    }
    if (cloudSummary) {
      cloudSummary.textContent = this.describeDataSource(remoteData, "Данные в аккаунте");
    }

    return new Promise((resolve) => {
      UI.syncChoiceResolver = resolve;
      UI.openModal("syncChoiceModal");
    });
  },

  resolveSyncChoice(choice) {
    if (typeof UI.syncChoiceResolver === "function") {
      UI.syncChoiceResolver(choice);
    }
    UI.syncChoiceResolver = null;
    UI.closeModal("syncChoiceModal");
  },

  async applyAuthenticatedData(data, {
    clearGuest = false,
    syncUp = false,
    toastMessage = "",
    toastTone = "success"
  } = {}) {
    Store.setData(data, { save: true });
    Store.resetHistory();
    Auth.touchSession();
    Sync.retryAttempt = 0;
    Sync.clearRetry();
    Sync.lastError = "";
    if (clearGuest) {
      Storage.saveCache(null, defaultData());
    }
    UI.showApp();
    UI.renderApp();

    if (syncUp) {
      Sync.queueSync();
      await Sync.processQueue(true);
    } else {
      Sync.lastSyncedAt = Utils.nowISO();
      Storage.saveLastSync(Auth.getLogin(), Sync.lastSyncedAt);
      Sync.status = Auth.isAuthenticated() ? "synced" : "local";
      UI.renderSyncState();
    }

    if (toastMessage) {
      UI.toast(toastMessage, toastTone);
    }
  },

  async resolveAuthenticatedDataFlow({ mode, ignoreGuest = false }) {
    const login = Auth.getLogin();
    if (!login) {
      return;
    }
    const guestData = normalizeData(ignoreGuest ? defaultData() : Storage.loadCache(null));
    const localAccount = normalizeData(Storage.loadCache(login));
    const remoteRaw = await Api.load(login, Auth.getToken());
    const remoteData = normalizeData(remoteRaw);
    const hasGuest = hasMeaningfulData(guestData);
    const hasRemote = hasMeaningfulData(remoteData);

    if (!hasGuest) {
      const nextData = isSemanticallySameData(remoteData, localAccount)
        ? remoteData
        : mergeData(remoteRaw, localAccount);
      await this.applyAuthenticatedData(nextData, {
        clearGuest: false,
        syncUp: false,
        toastMessage: "Аккаунт подключен, облачные данные загружены"
      });
      return;
    }

    if (!hasRemote || mode === "register") {
      await this.applyAuthenticatedData(guestData, {
        clearGuest: true,
        syncUp: true,
        toastMessage: "Текущие данные подключены к аккаунту и отправлены в облако"
      });
      return;
    }

    if (isSemanticallySameData(guestData, remoteData)) {
      await this.applyAuthenticatedData(remoteData, {
        clearGuest: true,
        syncUp: false,
        toastMessage: "Аккаунт подключен. Данные уже совпадали, дубли не созданы"
      });
      return;
    }

    const choice = await this.promptSyncChoice({ login, guestData, remoteData });
    if (choice === "local") {
      await this.applyAuthenticatedData(guestData, {
        clearGuest: true,
        syncUp: true,
        toastMessage: "Оставили текущие данные и синхронизировали их с аккаунтом"
      });
      return;
    }
    if (choice === "cloud") {
      await this.applyAuthenticatedData(remoteData, {
        clearGuest: true,
        syncUp: false,
        toastMessage: "Текущие локальные данные заменены данными из аккаунта"
      });
      return;
    }

    Auth.clearSession();
    clearTimeout(Sync.timer);
    Sync.clearRetry();
    Sync.retryAttempt = 0;
    Sync.status = "local";
    Sync.lastSyncedAt = null;
    Sync.lastError = "";
    Store.setData(guestData, { save: false });
    Store.saveLocal();
    Store.resetHistory();
    UI.showApp();
    UI.renderApp();
    UI.toast("Вход отменен. Вы остались с текущими локальными данными", "info");
  },

  async authenticate(source, mode) {
    const loginField = source === "startup" ? Utils.$("startupLogin") : Utils.$("modalLogin");
    const passwordField = source === "startup" ? Utils.$("startupPassword") : Utils.$("modalPassword");
    const actionButton = source === "startup"
      ? (mode === "login" ? Utils.$("startupLoginBtn") : Utils.$("startupRegisterBtn"))
      : (mode === "login" ? Utils.$("modalLoginBtn") : Utils.$("modalRegisterBtn"));

    UI.clearAuthStatus(source);
    UI.clearAuthFieldError(loginField);
    UI.clearAuthFieldError(passwordField);

    const login = loginField.value.trim();
    const password = passwordField.value.trim();
    const previousLocalOnly = Auth.isLocalOnly();
    const afterLocalTestLogout = (() => {
      try {
        return sessionStorage.getItem(LOCAL_TEST_EXIT_FLAG) === "1";
      } catch {
        return false;
      }
    })();
    if (!login || !password) {
      if (!login) {
        UI.markAuthFieldInvalid(loginField);
      }
      if (!password) {
        UI.markAuthFieldInvalid(passwordField);
      }
      UI.shakeAuthCard(source);
      UI.setAuthStatus(source, "Введите логин и пароль.", "error");
      (login ? passwordField : loginField)?.focus?.();
      UI.toast("Введите логин и пароль", "warning");
      return;
    }

    if (mode === "login" && login === LOCAL_TEST_CREDENTIALS.login && password === LOCAL_TEST_CREDENTIALS.password) {
      Storage.saveCache(login, buildLocalTestData());
      await Auth.setSession(login, "", { localOnly: true });
      try {
        sessionStorage.removeItem(LOCAL_TEST_EXIT_FLAG);
      } catch {}
      Store.loadLocal(login);
      Store.resetHistory();
      clearTimeout(Sync.timer);
      Sync.clearRetry();
      Sync.retryAttempt = 0;
      Sync.status = "local";
      Sync.lastSyncedAt = null;
      Sync.lastError = "";
      UI.showApp();
      UI.renderApp();
      if (source === "modal") {
        UI.closeModal("authModal");
      }
      passwordField.value = "";
      UI.syncAuthFieldState(passwordField);
      UI.clearAuthStatus(source);
      return;
    }

    UI.setAuthButtonLoading(actionButton, true, mode);
    UI.setAuthStatus(source, mode === "login" ? "Проверяем данные..." : "Создаем аккаунт...", "info");

    try {
      const probe = await Api.probeConnection();
      if (!probe.ok) {
        throw Api.createError(probe.code, probe.message);
      }
      let response;
      if (mode === "login") {
        response = await Api.login(login, password);
      } else {
        response = await Api.register(login, password);
      }
      await Auth.setSession(login, response.token);

      if (previousLocalOnly) {
        Storage.clearPending();
      }

      const appShell = Utils.$("appShell");
      const appShellHidden = !appShell || appShell.classList.contains("is-hidden");
      if (previousLocalOnly || appShellHidden) {
        Store.loadLocal(login);
      }

      await this.resolveAuthenticatedDataFlow({ mode, ignoreGuest: previousLocalOnly || afterLocalTestLogout });
      try {
        sessionStorage.removeItem(LOCAL_TEST_EXIT_FLAG);
      } catch {}

      if (source === "modal") {
        UI.closeModal("authModal");
      }

      if (source === "startup") {
        Utils.$("startupPassword").value = "";
        UI.syncAuthFieldState(Utils.$("startupPassword"));
      } else {
        Utils.$("modalPassword").value = "";
        UI.syncAuthFieldState(Utils.$("modalPassword"));
      }
      UI.clearAuthStatus(source);
    } catch (error) {
      if (Auth.hasSession()) {
        UI.showApp();
        UI.renderDataState();
      }
      UI.markAuthFieldInvalid(passwordField);
      UI.shakeAuthCard(source);
      const message = Api.getMessage(error, mode === "login" ? "Не удалось войти" : "Не удалось создать аккаунт");
      UI.setAuthStatus(source, message, "error");
      Diagnostics.report("auth:failed", {
        source,
        mode,
        code: error?.code || null,
        message,
        online: navigator.onLine
      }, String(error?.code || "").startsWith("HTTP_4") ? "warning" : "error");
      UI.toast(message, "error");
    } finally {
      UI.setAuthButtonLoading(actionButton, false, mode);
    }
  },

  async loadRemoteIntoStore({ silent = false, mergeGuest = false } = {}) {
    const login = Auth.getLogin();
    if (!login) {
      return;
    }
    const localAccount = Storage.loadCache(login);
    const guestCache = mergeGuest ? Storage.loadCache(null) : defaultData();
    const working = mergeGuest ? mergeData(localAccount, guestCache) : localAccount;
    Store.setData(working, { save: true });
    UI.renderApp();

    try {
      const remoteRaw = await Api.load(login, Auth.getToken());
      const remoteData = normalizeData(remoteRaw);
      const merged = isSemanticallySameData(remoteData, working)
        ? remoteData
        : mergeData(remoteData, working);
      Store.setData(merged, { save: true });
      Store.resetHistory();
      Auth.touchSession();
      Sync.retryAttempt = 0;
      Sync.clearRetry();
      Sync.lastSyncedAt = Utils.nowISO();
      Sync.lastError = "";
      Storage.saveLastSync(login, Sync.lastSyncedAt);
      Sync.status = "synced";
      UI.showApp();
      UI.renderApp();
      if (mergeGuest) {
        Storage.saveCache(null, defaultData());
      }
      if (!silent) {
        UI.toast("Аккаунт подключен, данные загружены", "success");
      }

      if (!isSemanticallySameData(remoteData, merged)) {
        Sync.queueSync();
      }
    } catch (error) {
      const message = Api.getMessage(error, "Не удалось загрузить данные аккаунта");
      Sync.lastError = message;
      Sync.status = error?.code === "NETWORK_UNAVAILABLE" || error?.code === "TIMEOUT" ? "offline" : "error";
      Diagnostics.report("remote-load:failed", {
        code: error?.code || null,
        message,
        silent,
        mergeGuest
      }, String(error?.code || "").startsWith("HTTP_4") ? "warning" : "error");
      UI.renderSyncState();
      UI.showApp();
      UI.renderApp();
      if (!silent) {
        const toastType = Sync.status === "offline" ? "warning" : "error";
        UI.toast(`${message}. Работаем из локального кэша`, toastType);
      }
    }
  },

  handleSessionExpired({ login, token = "", localOnly = false, isLocalTest = false } = {}) {
    UI.closeModal("accountMenuModal");
    if (!localOnly && login && token && navigator.onLine) {
      Api.logout(login, token).catch(() => {});
    }
    clearTimeout(Sync.timer);
    Sync.clearRetry();
    Sync.retryAttempt = 0;
    Sync.status = "local";
    Sync.lastSyncedAt = null;
    Sync.lastError = "";

    if (!isLocalTest) {
      Storage.saveCache(null, normalizeData(Store.data));
    } else if (login) {
      Storage.remove(Storage.cacheKey(login));
    }

    if (isLocalTest) {
      try {
        sessionStorage.setItem(LOCAL_TEST_EXIT_FLAG, "1");
      } catch {}
    } else {
      try {
        sessionStorage.removeItem(LOCAL_TEST_EXIT_FLAG);
      } catch {}
    }

    Store.loadLocal(null);
    Store.resetHistory();
    UI.showStartupAuth();
    UI.toast("Сессия завершена после 30 минут бездействия. Войдите снова.", "warning");
  },

  logout() {
    UI.closeModal("accountMenuModal");
    const previousLogin = Auth.getLogin();
    const previousToken = Auth.getToken();
    const wasLocalTest = Auth.isLocalOnly() && isLocalTestLogin(previousLogin);
    if (Auth.isAuthenticated() && previousLogin && previousToken && navigator.onLine) {
      Api.logout(previousLogin, previousToken).catch(() => {});
    }
    Auth.clearSession();
    clearTimeout(Sync.timer);
    Sync.clearRetry();
    Sync.retryAttempt = 0;
    Sync.status = "local";
    Sync.lastSyncedAt = null;
    Sync.lastError = "";
    if (wasLocalTest) {
      Storage.remove(Storage.cacheKey(previousLogin));
      try {
        sessionStorage.setItem(LOCAL_TEST_EXIT_FLAG, "1");
      } catch {}
    } else {
      try {
        sessionStorage.removeItem(LOCAL_TEST_EXIT_FLAG);
      } catch {}
    }
    Store.loadLocal(null);
    Store.resetHistory();
    UI.showStartupAuth();
    UI.toast("Сессия завершена.", "info");
  },

  syncNow() {
    UI.closeModal("accountMenuModal");
    if (!Auth.isAuthenticated()) {
      UI.toast("Сначала подключите аккаунт", "warning");
      return;
    }
    Sync.queueSync();
    Sync.processQueue(true);
    UI.toast("Запустили синхронизацию аккаунта", "info");
  },

  undo() {
    const changed = Store.undo();
    if (!changed) {
      UI.toast("Больше нечего отменять", "info");
    }
  },

  redo() {
    const changed = Store.redo();
    if (!changed) {
      UI.toast("Больше нечего возвращать", "info");
    }
  },

  toggleTheme() {
    const nextTheme = Store.data.profile.theme === "dark" ? "light" : "dark";
    if (Store.data.profile.theme === nextTheme) {
      return;
    }
    Store.data.profile.theme = nextTheme;
    Store.data.meta.updatedAt = Utils.nowISO();
    Store.saveLocal();
    if (Auth.isAuthenticated()) {
      Sync.queueSync();
    }
    UI.applyTheme();
    if (Store.activeTab === "analyticsTab") {
      UI.ensureChartsReady().then(() => {
        if (Store.activeTab === "analyticsTab") {
          UI.renderCharts();
        }
      }).catch(() => {});
      return;
    }
    if (Store.activeTab === "overviewTab" && !UI.monthTrendCollapsed) {
      UI.ensureChartsReady().then(() => {
        if (Store.activeTab === "overviewTab" && !UI.monthTrendCollapsed) {
          UI.renderMonthBalanceChart();
        }
      }).catch(() => {});
    }
  },

  shiftMonth(delta) {
    const [year, month] = Store.viewMonth.split("-").map(Number);
    const next = new Date(year, month - 1 + delta, 1);
    Store.viewMonth = Utils.monthKey(next);
    Store.detailMonth = Store.viewMonth;
    UI.heatmapMonth = Store.viewMonth;
    UI.renderApp();
  },

  goToCurrentMonth() {
    Store.viewMonth = Utils.monthKey(new Date());
    Store.detailMonth = Store.viewMonth;
    UI.heatmapMonth = Store.viewMonth;
    UI.renderApp();
  },

  updateMonthStart(value) {
    Store.saveMonthMeta(Store.viewMonth, {
      start: Math.max(0, Utils.roundMoney(Utils.safeNumber(value)))
    });
    UI.renderApp();
  },

  toggleManualMonthStart(enabled) {
    const current = Store.getMonthMeta(Store.viewMonth);
    const stats = Store.statsForMonth(Store.viewMonth);
    Store.saveMonthMeta(Store.viewMonth, {
      manualStart: Boolean(enabled),
      start: enabled && !(current.start > 0) ? stats.startBalance : current.start
    });
    UI.renderApp();
  },

  openMonth(monthKey) {
    Store.detailMonth = monthKey;
    if (Store.activeTab === "monthsTab") {
      document.querySelectorAll("[data-action='open-month'][data-month]").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.month === monthKey);
      });
      UI.runPanelTransition(Utils.$("monthDetail"), () => {
        UI.renderMonthDetail();
      });
      return;
    }
    UI.renderApp();
  },

  shiftHeatmapMonth(delta) {
    if (!delta) {
      return;
    }
    const base = UI.heatmapMonth || Store.viewMonth;
    const [year, month] = base.split("-").map(Number);
    UI.heatmapMonth = Utils.monthKey(new Date(year, month - 1 + delta, 1));
    UI.runPanelTransition(Utils.$("heatmapWrap"), () => {
      UI.renderHeatmap();
      UI.syncAnalyticsPairLayouts();
    });
  },

  setBudgetFiltersCollapsed(collapsed) {
    const nextValue = Boolean(collapsed);
    UI.budgetFiltersCollapsed = nextValue;
    Storage.writeText(CONFIG.BUDGET_FILTERS_KEY, nextValue ? "1" : "0");
  },

  applyBudgetNavigationState({
    month = Store.viewMonth,
    filters = {},
    collapsed = true
  } = {}) {
    Store.viewMonth = month;
    Object.assign(Store.filters, {
      period: "all",
      type: "all",
      categoryId: "all",
      sort: "date-desc",
      search: "",
      dateFrom: "",
      dateTo: "",
      ...filters
    });
    this.setBudgetFiltersCollapsed(collapsed);
  },

  focusBudgetFilterShell({ selectSearch = true } = {}) {
    const filterShell = Utils.$("budgetFilterShell");
    const searchInput = Utils.$("searchInput");
    filterShell?.scrollIntoView({ behavior: this.prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    filterShell?.classList.add("is-target");
    setTimeout(() => filterShell?.classList.remove("is-target"), 1800);
    if (selectSearch && searchInput) {
      try {
        searchInput.focus({ preventScroll: true });
      } catch {
        searchInput.focus();
      }
      searchInput.select?.();
    }
  },

  highlightBudgetRow(transactionId) {
    const row = document.querySelector(`.entry-row[data-entry-id="${transactionId}"]`);
    if (!row) {
      return;
    }
    row.scrollIntoView({ behavior: this.prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    row.classList.add("is-budget-target");
    setTimeout(() => row.classList.remove("is-budget-target"), 1800);
  },

  openTagInBudget(tag) {
    const normalizedTag = Utils.normalizeTags(tag)[0] || String(tag || "").trim();
    if (!normalizedTag) {
      return;
    }
    this.applyBudgetNavigationState({
      filters: {
        period: "all",
        type: "all",
        search: normalizedTag
      },
      collapsed: false
    });
    this.switchTab("overviewTab");
    this.runAfterNextPaint(() => this.focusBudgetFilterShell(), 3);
  },

  openRecurringInBudget(query) {
    const normalizedQuery = String(query || "").trim();
    if (!normalizedQuery) {
      return;
    }
    this.applyBudgetNavigationState({
      filters: {
        period: "all",
        type: "expense",
        search: normalizedQuery
      },
      collapsed: false
    });
    this.switchTab("overviewTab");
    this.runAfterNextPaint(() => this.focusBudgetFilterShell(), 3);
  },

  openTransactionInBudget(transactionId) {
    const transaction = Store.data.transactions.find((item) => item.id === transactionId);
    if (!transaction) {
      return;
    }
    this.applyBudgetNavigationState({
      month: transaction.date.slice(0, 7),
      filters: {
        period: "month",
        type: "all"
      },
      collapsed: true
    });
    this.switchTab("overviewTab");
    this.runAfterNextPaint(() => this.highlightBudgetRow(transactionId), 3);
  },

  updateFilter(field, value) {
    Store.filters[field] = value;
    if ((field === "search" && String(value || "").trim()) || (field === "dateFrom" && value) || (field === "dateTo" && value)) {
      this.setBudgetFiltersCollapsed(false);
    }
    if (field === "period" || field === "type" || field === "categoryId" || field === "sort" || field === "search" || field === "dateFrom" || field === "dateTo") {
      UI.renderTransactions();
      UI.renderBudgetFilters();
    }
  },

  openPicker(kind, context = null) {
    UI.pickerState.kind = kind;
    UI.pickerState.context = context;
    UI.pickerState.ids = kind === "category" && context?.selectedId ? new Set([context.selectedId]) : new Set();
    UI.renderPicker();
    UI.openModal("pickerModal");
  },

  openEditFormCategoryPicker() {
    const type = document.querySelector('input[name="editTransactionType"]:checked')?.value || "expense";
    this.openPicker("category", {
      target: "edit-form",
      type,
      selectedId: Utils.$("editCategoryInput")?.value || ""
    });
  },

  openTemplateFormCategoryPicker() {
    const type = Utils.$("templateTypeInput")?.value || "expense";
    this.openPicker("category", {
      target: "template-form",
      type,
      selectedId: Utils.$("templateCategoryInput")?.value || ""
    });
  },

  togglePickerItem(itemId) {
    if (!UI.pickerState.kind) {
      return;
    }
    if (UI.pickerState.kind === "category") {
      UI.pickerState.ids = new Set([itemId]);
      UI.renderPicker();
      return;
    }
    if (UI.pickerState.ids.has(itemId)) {
      UI.pickerState.ids.delete(itemId);
    } else {
      UI.pickerState.ids.add(itemId);
    }
    UI.renderPicker();
  },

  applyPickerSelection() {
    const ids = Array.from(UI.pickerState.ids);
    if (!ids.length) {
      UI.toast("Сначала выберите хотя бы один элемент", "warning");
      return;
    }
    if (UI.pickerState.kind === "category") {
      const selectedId = ids[0];
      const context = UI.pickerState.context || {};
      if (!Store.getCategory(selectedId)) {
        UI.toast("Категория не найдена", "warning");
        return;
      }
      if (context.target === "transaction-row" && context.transactionId) {
        Store.updateTransactionInline(context.transactionId, { categoryId: selectedId });
      } else if (context.target === "template-setting" && context.id) {
        const current = Store.data.settings.templates.find((item) => item.id === context.id);
        if (current) {
          Store.saveTemplate({
            id: current.id,
            kind: "template",
            desc: current.desc,
            amount: current.amount,
            type: current.type,
            categoryId: selectedId,
            flowKind: current.flowKind || "recurring",
            tags: current.tags
          });
        }
      } else if (context.target === "favorite-setting" && context.id) {
        const current = Store.data.settings.favorites.find((item) => item.id === context.id);
        if (current) {
          Store.saveTemplate({
            id: current.id,
            kind: "favorite",
            desc: current.desc,
            amount: current.amount,
            type: "expense",
            categoryId: selectedId,
            flowKind: current.flowKind || "standard",
            tags: current.tags
          });
        }
      } else if (context.target === "edit-form") {
        Utils.$("editCategoryInput").value = selectedId;
        UI.setCategoryTrigger("editCategoryTriggerBtn", selectedId, "Категория");
      } else if (context.target === "template-form") {
        Utils.$("templateCategoryInput").value = selectedId;
        UI.setCategoryTrigger("templateCategoryTriggerBtn", selectedId, "Категория");
      } else if (context.target === "create-form") {
        Utils.$("categoryInput").value = selectedId;
      }
      UI.closeModal("pickerModal");
      return;
    }
    if (UI.pickerState.kind === "favorites") {
      Store.applyFavoriteSelection(ids);
      UI.toast("Избранные операции добавлены", "success");
    } else {
      Store.applyTemplateSelection(ids);
      UI.toast("Шаблоны загружены в обязательные платежи", "success");
    }
    UI.closeModal("pickerModal");
  },

  createQuickItem(kind) {
    this.openTemplateModal(null, kind === "favorite" ? "favorite" : "template");
  },

  handleJournalAction(button) {
    const action = button.dataset.journalAction;
    const id = button.dataset.id;
    const section = button.dataset.section;
    const sortSection = button.dataset.sectionSortBtn;
    if (action === "toggle-section-sort" && sortSection) {
      UI.toggleJournalSectionSort(sortSection);
      return;
    }
    if (action === "add-row" && section) {
      Store.addSectionRow(section);
      UI.toast("Новая строка добавлена", "info");
      return;
    }
    if (action === "delete" && id) {
      this.deleteTransaction(id);
      return;
    }
    if (action === "favorite" && id) {
      const isFavorite = Store.isFavoriteTransaction(id);
      const changed = isFavorite
        ? Store.removeFavoriteFromTransaction(id)
        : Store.addFavoriteFromTransaction(id);
      UI.toast(
        isFavorite
          ? (changed ? "Операция удалена из избранного" : "Операция уже была удалена из избранного")
          : (changed ? "Операция добавлена в избранное" : "Такая операция уже есть в избранном"),
        changed ? "success" : "info"
      );
      return;
    }
    if (action === "edit-tags" && id) {
      this.openTransactionTagsModal(id);
      return;
    }
    if (action === "open-category-picker" && id) {
      const transaction = Store.data.transactions.find((item) => item.id === id);
      if (!transaction) {
        return;
      }
      this.openPicker("category", {
        target: "transaction-row",
        transactionId: id,
        type: transaction.type,
        selectedId: transaction.categoryId
      });
      return;
    }
    if (action === "delete-wish" && id) {
      Store.deleteWishlistItem(id);
      UI.toast("Хотелка удалена", "info");
      return;
    }
    if (action === "fulfill-wish" && id) {
      Store.fulfillWishlistItem(id);
      UI.toast("Хотелка перенесена в расходы", "success");
    }
  },

  handleJournalField(field) {
    const row = field.closest("[data-entry-id]");
    if (!row) {
      return;
    }
    const itemId = row.dataset.entryId;
    const section = row.dataset.section;
    const kind = field.dataset.journalField;
    if (section === "wishlist") {
      if (kind === "wish-desc") {
        Store.updateWishlistItem(itemId, { desc: field.dataset.fulltext || field.value });
      }
      if (kind === "wish-amount") {
        Store.updateWishlistItem(itemId, { amount: Math.max(0, Utils.roundMoney(Utils.safeNumber(field.value))) });
      }
      return;
    }

    const transaction = Store.data.transactions.find((item) => item.id === itemId);
    if (!transaction) {
      return;
    }

    if (kind === "day") {
      const [year, month] = transaction.date.slice(0, 7).split("-").map(Number);
      const day = Utils.clampDay(year, month - 1, field.value);
      const nextDate = `${transaction.date.slice(0, 8)}${String(day).padStart(2, "0")}`;
      field.value = String(day);
      Store.updateTransactionInline(itemId, { date: nextDate });
      return;
    }
    if (kind === "amount") {
      Store.updateTransactionInline(itemId, { amount: Math.max(0, Utils.roundMoney(Utils.safeNumber(field.value))) });
      return;
    }
    if (kind === "description") {
      Store.updateTransactionInline(itemId, { description: field.dataset.fulltext || field.value });
      return;
    }
    if (kind === "categoryId" && Store.getCategory(field.value)) {
      Store.updateTransactionInline(itemId, { categoryId: field.value });
    }
  },

  handleSettingsAction(button) {
    const action = button.dataset.settingAction;
    const id = button.dataset.id;
    const tagName = button.dataset.tag;
    if (action === "edit-template" && id) {
      this.openTemplateModal(id, "template");
      return;
    }
    if (action === "edit-favorite" && id) {
      this.openTemplateModal(id, "favorite");
      return;
    }
    if (action === "edit-template-tags" && id) {
      this.openTransactionTagsModal(id, "template");
      return;
    }
    if (action === "edit-favorite-tags" && id) {
      this.openTransactionTagsModal(id, "favorite");
      return;
    }
    if ((action === "toggle-template-tag" || action === "toggle-favorite-tag") && id && tagName) {
      this.toggleQuickItemTag(action === "toggle-favorite-tag" ? "favorite" : "template", id, tagName);
      return;
    }
    if (action === "delete-template" && id) {
      Store.deleteTemplate(id, "template");
      UI.setSettingsStatus("Шаблон удален.", "info");
      UI.toast("Шаблон удален", "info");
      return;
    }
    if (action === "delete-favorite" && id) {
      Store.deleteTemplate(id, "favorite");
      UI.setSettingsStatus("Элемент избранного удален.", "info");
      UI.toast("Избранное удалено", "info");
      return;
    }
    if (action === "pick-template-category" && id) {
      const current = Store.data.settings.templates.find((item) => item.id === id);
      if (!current) {
        return;
      }
      this.openPicker("category", {
        target: "template-setting",
        id,
        type: current.type,
        selectedId: current.categoryId
      });
      return;
    }
    if (action === "pick-favorite-category" && id) {
      const current = Store.data.settings.favorites.find((item) => item.id === id);
      if (!current) {
        return;
      }
      this.openPicker("category", {
        target: "favorite-setting",
        id,
        type: "expense",
        selectedId: current.categoryId
      });
    }
  },

  toggleQuickItemTag(kind, id, tagName) {
    const normalizedTag = Utils.normalizeTags(tagName)[0] || "";
    if (!normalizedTag) {
      return;
    }
    const list = kind === "favorite" ? Store.data.settings.favorites : Store.data.settings.templates;
    const current = list.find((item) => item.id === id);
    if (!current) {
      return;
    }
    const nextTags = new Set(Utils.normalizeTags(current.tags));
    if (nextTags.has(normalizedTag)) {
      nextTags.delete(normalizedTag);
    } else {
      nextTags.add(normalizedTag);
      Store.ensureTagCatalogEntries([normalizedTag]);
    }
    Store.saveTemplate({
      id: current.id,
      kind,
      desc: current.desc,
      amount: current.amount,
      type: current.type,
      categoryId: current.categoryId,
      flowKind: current.flowKind || (kind === "favorite" ? "standard" : "recurring"),
      tags: Array.from(nextTags)
    });
  },

  handleSettingsField(field) {
    const id = field.dataset.id;
    if (!id) {
      return;
    }
    const kind = field.dataset.settingField;
    if (kind === "template-desc" || kind === "template-amount" || kind === "template-category" || kind === "template-tags") {
      const current = Store.data.settings.templates.find((item) => item.id === id);
      if (!current) {
        return;
      }
      Store.saveTemplate({
        id,
        kind: "template",
        desc: kind === "template-desc" ? (Utils.wrapText(field.dataset.fulltext || field.value) || "Новый шаблон") : current.desc,
        amount: kind === "template-amount" ? Math.max(0, Utils.roundMoney(Utils.safeNumber(field.value))) : current.amount,
        type: current.type,
        categoryId: kind === "template-category" ? field.value : current.categoryId,
        flowKind: current.flowKind || "recurring",
        tags: kind === "template-tags" ? Utils.normalizeTags(field.value) : current.tags
      });
      return;
    }
    if (kind === "favorite-desc" || kind === "favorite-amount" || kind === "favorite-category" || kind === "favorite-tags") {
      const current = Store.data.settings.favorites.find((item) => item.id === id);
      if (!current) {
        return;
      }
      Store.saveTemplate({
        id,
        kind: "favorite",
        desc: kind === "favorite-desc" ? (Utils.wrapText(field.dataset.fulltext || field.value) || "Новая покупка") : current.desc,
        amount: kind === "favorite-amount" ? Math.max(0, Utils.roundMoney(Utils.safeNumber(field.value))) : current.amount,
        type: "expense",
        categoryId: kind === "favorite-category" ? field.value : current.categoryId,
        flowKind: "standard",
        tags: kind === "favorite-tags" ? Utils.normalizeTags(field.value) : current.tags
      });
    }
  },

  reorderSection(section, draggedId, targetId) {
    Store.reorderSection(section, draggedId, targetId);
  },

  buildTransactionPayload(prefix = "") {
    const isEdit = prefix === "edit";
    if (!isEdit) {
      UI.mountTransactionForm();
    }
    const type = document.querySelector(`input[name="${isEdit ? "editTransactionType" : "transactionType"}"]:checked`)?.value || "expense";
    const amount = Utils.parseAmount(Utils.$(isEdit ? "editAmountInput" : "amountInput").value);
    const categoryId = Utils.$(isEdit ? "editCategoryInput" : "categoryInput").value;
    const flowKind = type === "income" ? "standard" : Utils.$(isEdit ? "editFlowKindInput" : "flowKindInput").value;
    const date = Utils.$(isEdit ? "editDateInput" : "dateInput").value;
    const description = Utils.wrapText(Utils.$(isEdit ? "editDescriptionInput" : "descriptionInput").value);
    const tags = Utils.normalizeTags(Utils.$(isEdit ? "editTagsInput" : "tagsInput")?.value || "");

    if (!amount) {
      throw new Error("Введите корректную сумму");
    }
    if (!Utils.isISODate(date)) {
      throw new Error("Укажите корректную дату");
    }
    if (!Store.getCategory(categoryId)) {
      throw new Error("Выберите категорию");
    }

    return {
      type,
      flowKind,
      amount,
      categoryId,
      date,
      description,
      tags
    };
  },

  createTransaction() {
    try {
      const form = UI.mountTransactionForm();
      const payload = this.buildTransactionPayload();
      Store.ensureTagCatalogEntries(payload.tags);
      Store.addTransaction(payload);
      form?.reset();
      Utils.$("dateInput").value = Utils.todayISO();
      document.querySelector('input[name="transactionType"][value="expense"]').checked = true;
      UI.renderFormCategories();
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      UI.toast("Операция сохранена", "success");
    } catch (error) {
      UI.toast(error.message, "warning");
    }
  },

  openEditTransaction(transactionId) {
    const transaction = Store.data.transactions.find((item) => item.id === transactionId);
    if (!transaction) {
      return;
    }
    Utils.$("editTransactionId").value = transaction.id;
    const radio = document.querySelector(`input[name="editTransactionType"][value="${transaction.type}"]`);
    if (radio) {
      radio.checked = true;
    }
    Utils.$("editAmountInput").value = transaction.amount;
    Utils.$("editDateInput").value = transaction.date;
    Utils.$("editDescriptionInput").value = transaction.description;
    Utils.$("editFlowKindInput").value = transaction.flowKind;
    if (Utils.$("editTagsInput")) {
      Utils.$("editTagsInput").value = Utils.formatTags(transaction.tags);
    }
    UI.renderEditCategories(transaction.categoryId, transaction.type);
    UI.openModal("transactionModal");
  },

  saveEditedTransaction() {
    try {
      const id = Utils.$("editTransactionId").value;
      const payload = this.buildTransactionPayload("edit");
      Store.ensureTagCatalogEntries(payload.tags);
      Store.updateTransaction(id, payload);
      UI.closeModal("transactionModal");
      UI.toast("Изменения сохранены", "success");
    } catch (error) {
      UI.toast(error.message, "warning");
    }
  },

  deleteTransaction(transactionId) {
    Store.deleteTransaction(transactionId);
    UI.toast("Операция удалена", "info");
  },

  openCategoryModal(categoryId = null) {
    const category = categoryId ? Store.getCategory(categoryId) : null;
    Utils.$("categoryModalTitle").textContent = category ? "Редактирование категории" : "Новая категория";
    Utils.$("categoryIdInput").value = category?.id || "";
    Utils.$("categoryNameInput").value = category?.name || "";
    Utils.$("categoryColorInput").value = category?.color || "#58a6ff";
    Utils.$("categoryLimitInput").value = category?.limit || "";
    document.querySelectorAll('input[name="categoryType"]').forEach((input) => {
      input.checked = input.value === (category?.type || "expense");
    });
    UI.renderCategoryColorValue();
    Utils.$("deleteCategoryBtn").classList.toggle("is-hidden", !category);
    UI.openModal("categoryModal");
  },

  saveCategory() {
    const id = Utils.$("categoryIdInput").value.trim();
    const name = Utils.wrapText(Utils.$("categoryNameInput").value).slice(0, 48);
    const type = document.querySelector('input[name="categoryType"]:checked')?.value || "expense";
    const color = Utils.$("categoryColorInput").value;
    const limit = Math.max(0, Utils.roundMoney(Utils.safeNumber(Utils.$("categoryLimitInput").value)));
    if (!name) {
      UI.toast("Введите название категории", "warning");
      return;
    }
    const duplicate = Store.getCategories(type).some((category) => category.name.toLowerCase() === name.toLowerCase() && category.id !== id);
    if (duplicate) {
      UI.toast("Категория с таким названием уже есть", "warning");
      return;
    }
    Store.saveCategory({ id, name, type, color, limit });
    UI.closeModal("categoryModal");
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  },

  deleteCurrentCategory() {
    const id = Utils.$("categoryIdInput").value;
    this.deleteCategory(id);
    UI.closeModal("categoryModal");
  },

  deleteCategory(categoryId) {
    try {
      Store.deleteCategory(categoryId);
    } catch (error) {
      UI.toast(error.message, "warning");
    }
  },

  openGoalModal(goalId = null) {
    const goal = goalId ? (Store.data.settings.goals || []).find((item) => item.id === goalId) : null;
    Utils.$("goalModalTitle").textContent = goal ? "Редактирование цели" : "Новая цель";
    Utils.$("goalIdInput").value = goal?.id || "";
    Utils.$("goalNameInput").value = goal?.name || "";
    Utils.$("goalTargetInput").value = goal?.target || "";
    Utils.$("goalModeInput").value = goal?.mode || "balance";
    Utils.$("goalSavedInput").value = goal?.saved || "";
    Utils.$("goalTagInput").value = goal?.tag || "";
    Utils.$("goalColorInput").value = goal?.color || "#58a6ff";
    Utils.$("goalNoteInput").value = goal?.note || "";
    Utils.$("deleteGoalBtn").classList.toggle("is-hidden", !goal);
    UI.renderGoalColorValue();
    UI.syncGoalModeFields();
    UI.openModal("goalModal");
  },

  saveGoal() {
    const id = Utils.$("goalIdInput").value.trim();
    const name = Utils.wrapText(Utils.$("goalNameInput").value).slice(0, 64);
    const target = Math.max(0, Utils.roundMoney(Utils.safeNumber(Utils.$("goalTargetInput").value)));
    const mode = Utils.$("goalModeInput").value;
    const saved = Math.max(0, Utils.roundMoney(Utils.safeNumber(Utils.$("goalSavedInput").value)));
    const tag = Utils.normalizeTags(Utils.$("goalTagInput").value)[0] || "";
    const color = Utils.$("goalColorInput").value;
    const note = Utils.wrapText(Utils.$("goalNoteInput").value).slice(0, 180);
    if (!name || !target) {
      UI.toast("Заполните цель корректно", "warning");
      return;
    }
    if (mode === "tag" && !tag) {
      UI.toast("Для режима по тегу укажите тег", "warning");
      return;
    }
    Store.ensureTagCatalogEntries(tag ? [tag] : []);
    Store.saveGoal({ id, name, target, mode, saved, tag, color, note });
    UI.closeModal("goalModal");
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
    UI.toast("Цель сохранена", "success");
  },

  deleteCurrentGoal() {
    const id = Utils.$("goalIdInput").value.trim();
    if (!id) {
      return;
    }
    this.deleteGoal(id);
    UI.closeModal("goalModal");
  },

  deleteGoal(goalId) {
    Store.deleteGoal(goalId);
    UI.toast("Цель удалена", "info");
  },

  openTagModal(tagId = null) {
    const tag = tagId ? Store.getTagDefinition(tagId) : null;
    Utils.$("tagModalTitle").textContent = tag ? "Редактирование тега" : "Новый тег";
    Utils.$("tagIdInput").value = tag?.id || "";
    Utils.$("tagNameInput").value = tag?.name || "";
    Utils.$("tagColorInput").value = tag?.color || "#58a6ff";
    Utils.$("tagNoteInput").value = tag?.note || "";
    Utils.$("deleteTagBtn").classList.toggle("is-hidden", !tag);
    UI.renderTagColorValue();
    UI.openModal("tagModal");
  },

  saveTag() {
    const id = Utils.$("tagIdInput").value.trim();
    const name = Utils.normalizeTags(Utils.$("tagNameInput").value)[0] || "";
    const color = Utils.$("tagColorInput").value;
    const note = Utils.wrapText(Utils.$("tagNoteInput").value).slice(0, 180);
    if (!name) {
      UI.toast("Введите корректный тег", "warning");
      return;
    }
    const duplicate = Store.getTagCatalog().some((item) => item.name === name && item.id !== id);
    if (duplicate) {
      UI.toast("Такой тег уже существует", "warning");
      return;
    }
    Store.saveTagDefinition({ id, name, color, note });
    UI.selectedTagName = name;
    UI.closeModal("tagModal");
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
    UI.toast("Тег сохранен", "success");
  },

  deleteCurrentTag() {
    const id = Utils.$("tagIdInput").value.trim();
    const name = Utils.$("tagNameInput").value;
    if (!id && !name) {
      return;
    }
    Store.deleteTagDefinition(id, name);
    if ((UI.selectedTagName || "") === (Utils.normalizeTags(name)[0] || "")) {
      UI.selectedTagName = "";
    }
    UI.closeModal("tagModal");
    UI.toast("Тег удален", "info");
  },

  openTransactionTagsModal(targetId, targetKind = "transaction") {
    const kind = ["transaction", "template", "favorite"].includes(targetKind) ? targetKind : "transaction";
    const target = kind === "transaction"
      ? Store.data.transactions.find((item) => item.id === targetId)
      : kind === "template"
        ? Store.data.settings.templates.find((item) => item.id === targetId)
        : Store.data.settings.favorites.find((item) => item.id === targetId);
    if (!target) {
      return;
    }
    const eyebrow = Utils.$("transactionTagsModal")?.querySelector(".eyebrow");
    if (eyebrow) {
      eyebrow.textContent = kind === "transaction"
        ? "Теги операции"
        : kind === "template"
          ? "Теги шаблона"
          : "Теги избранного";
    }
    Utils.$("transactionTagsIdInput").value = target.id;
    Utils.$("transactionTagsTargetKindInput").value = kind;
    Utils.$("transactionTagsInput").value = Utils.formatTags(target.tags);
    Utils.$("transactionTagsModalTitle").textContent = kind === "transaction"
      ? (target.description || "Настройка тегов")
      : kind === "template"
        ? (target.desc || "Теги шаблона")
        : (target.desc || "Теги избранного");
    Utils.$("transactionTagsModalSubtext").textContent = kind === "transaction"
      ? "Можно выбрать существующие теги или ввести новые вручную."
      : kind === "template"
        ? "Добавляйте теги к шаблону, чтобы быстро собирать обязательные платежи по темам."
        : "Добавляйте теги к избранным покупкам, чтобы быстро группировать текущие расходы.";
    UI.renderTransactionTagSuggestions(target.tags);
    UI.openModal("transactionTagsModal");
  },

  toggleTransactionTagSuggestion(tagName) {
    const input = Utils.$("transactionTagsInput");
    if (!input) {
      return;
    }
    const current = new Set(Utils.normalizeTags(input.value));
    const normalized = Utils.normalizeTags(tagName)[0] || "";
    if (!normalized) {
      return;
    }
    if (current.has(normalized)) {
      current.delete(normalized);
    } else {
      current.add(normalized);
    }
    input.value = Array.from(current).join(", ");
    UI.renderTransactionTagSuggestions(Array.from(current));
  },

  saveTransactionTags() {
    const transactionId = Utils.$("transactionTagsIdInput").value.trim();
    const targetKind = Utils.$("transactionTagsTargetKindInput")?.value || "transaction";
    const tags = Utils.normalizeTags(Utils.$("transactionTagsInput").value);
    if (!transactionId) {
      return;
    }
    Store.ensureTagCatalogEntries(tags);
    if (targetKind === "template" || targetKind === "favorite") {
      const list = targetKind === "template" ? Store.data.settings.templates : Store.data.settings.favorites;
      const current = list.find((item) => item.id === transactionId);
      if (!current) {
        return;
      }
      Store.saveTemplate({
        id: current.id,
        kind: targetKind,
        desc: current.desc,
        amount: current.amount,
        type: targetKind === "favorite" ? "expense" : current.type,
        categoryId: current.categoryId,
        flowKind: targetKind === "favorite" ? "standard" : (current.flowKind || "recurring"),
        tags
      });
    } else {
      Store.updateTransactionInline(transactionId, { tags });
    }
    UI.closeModal("transactionTagsModal");
    UI.toast(
      targetKind === "template"
        ? "Теги шаблона сохранены"
        : targetKind === "favorite"
          ? "Теги избранного сохранены"
          : "Теги операции сохранены",
      "success"
    );
  },

  syncTemplateFormState(kind = Utils.$("templateKindInput")?.value || "template") {
    const isFavorite = kind === "favorite";
    const typeField = Utils.$("templateTypeField");
    const flowField = Utils.$("templateFlowKindField");
    const typeInput = Utils.$("templateTypeInput");
    const flowInput = Utils.$("templateFlowKindInput");
    const tagsHintText = Utils.$("templateTagsHintText");
    if (typeField) {
      typeField.classList.toggle("is-hidden", isFavorite);
    }
    if (flowField) {
      flowField.classList.toggle("is-hidden", isFavorite);
    }
    if (typeInput) {
      if (isFavorite) {
        typeInput.value = "expense";
      }
      typeInput.disabled = isFavorite;
    }
    if (flowInput) {
      if (isFavorite) {
        flowInput.value = "standard";
      }
      flowInput.disabled = isFavorite;
    }
    if (tagsHintText) {
      tagsHintText.textContent = isFavorite
        ? "После сохранения используйте кнопку «Теги» у карточки избранного, чтобы быстро добавить или убрать метки."
        : "После сохранения используйте кнопку «Теги» у карточки шаблона, чтобы быстро добавить или убрать метки.";
    }
  },

  openTemplateModal(itemId = null, kind = "template") {
    const safeKind = kind === "favorite" ? "favorite" : "template";
    const list = safeKind === "favorite" ? Store.data.settings.favorites : Store.data.settings.templates;
    const current = itemId ? list.find((item) => item.id === itemId) : null;
    const eyebrow = Utils.$("templateModal")?.querySelector(".eyebrow");
    Utils.$("templateForm").reset();
    Utils.$("templateIdInput").value = current?.id || "";
    Utils.$("templateKindInput").value = safeKind;
    if (eyebrow) {
      eyebrow.textContent = safeKind === "favorite" ? "Избранное" : "Шаблон";
    }
    Utils.$("templateModalTitle").textContent = safeKind === "favorite"
      ? (current ? "Редактирование избранного" : "Новая строка избранного")
      : (current ? "Редактирование шаблона" : "Новый шаблон");
    Utils.$("templateSubmitBtn").textContent = safeKind === "favorite"
      ? (current ? "Сохранить избранное" : "Добавить в избранное")
      : "Сохранить шаблон";
    Utils.$("templateDescInput").value = current?.desc || "";
    Utils.$("templateAmountInput").value = current?.amount || "";
    Utils.$("templateTypeInput").value = safeKind === "favorite" ? "expense" : (current?.type || "expense");
    Utils.$("templateFlowKindInput").value = safeKind === "favorite" ? "standard" : (current?.flowKind || "recurring");
    Utils.$("templateCategoryInput").value = current?.categoryId || "";
    this.syncTemplateFormState(safeKind);
    UI.renderTemplateCategories(current?.categoryId || null);
    UI.openModal("templateModal");
  },

  saveTemplate() {
    const id = Utils.$("templateIdInput").value.trim();
    const kind = Utils.$("templateKindInput").value === "favorite" ? "favorite" : "template";
    const list = kind === "favorite" ? Store.data.settings.favorites : Store.data.settings.templates;
    const current = id ? list.find((item) => item.id === id) : null;
    const desc = Utils.wrapText(Utils.$("templateDescInput").value).slice(0, 180);
    const amount = Utils.parseAmount(Utils.$("templateAmountInput").value);
    const type = kind === "favorite" ? "expense" : Utils.$("templateTypeInput").value;
    const categoryId = Utils.$("templateCategoryInput").value;
    const flowKind = kind === "favorite"
      ? "standard"
      : type === "income"
        ? "standard"
        : Utils.$("templateFlowKindInput").value;
    if (!desc || !amount || !Store.getCategory(categoryId)) {
      UI.toast("Заполните шаблон корректно", "warning");
      return;
    }
    Store.saveTemplate({
      id: id || undefined,
      kind,
      desc,
      amount,
      type,
      categoryId,
      flowKind,
      tags: current?.tags || []
    });
    UI.closeModal("templateModal");
    UI.toast(kind === "favorite" ? "Избранное сохранено" : "Шаблон сохранен", "success");
  },

  applyTemplate(templateId) {
    Store.applyTemplate(templateId);
    UI.toast("Шаблон применен на сегодняшнюю дату", "success");
  },

  exportBackup() {
    UI.clearBackupStatus();
    const backup = Store.exportLegacyBackup();
    const sourceSummary = summarizeNormalizedData(Store.data);
    const roundtripSummary = summarizeNormalizedData(normalizeData(backup));
    const roundtripDiff = diffDataSummaries(sourceSummary, roundtripSummary);
    Diagnostics.report("export-backup:roundtrip", {
      source: sourceSummary,
      roundtrip: roundtripSummary,
      diff: roundtripDiff
    });
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const profile = Auth.getLogin() || "local";
    link.download = `budget_${profile}_backup_${Utils.todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    UI.setBackupStatus("Бэкап экспортирован.", "success");
    UI.toast("Бэкап экспортирован", "success");
  },

  getBackupErrorMessage(error) {
    if (error instanceof SyntaxError) {
      return "Файл бэкапа содержит некорректный JSON.";
    }
    return error instanceof Error ? error.message : "Не удалось прочитать бэкап.";
  },

  importBackup(event) {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }
    UI.clearBackupStatus();
    const reader = new FileReader();
    reader.onerror = () => {
      Diagnostics.report("import-backup:file-read-error", {
        name: file.name,
        size: file.size
      }, "error");
      UI.setBackupStatus("Не удалось прочитать файл бэкапа.", "error");
      UI.toast("Не удалось прочитать файл бэкапа", "error");
      event.target.value = "";
    };
    reader.onload = () => {
      try {
        if (typeof reader.result !== "string") {
          throw new Error("Файл бэкапа прочитан в неподдерживаемом формате.");
        }
        const parsed = JSON.parse(reader.result);
        const audit = validateBackupPayload(parsed);
        Diagnostics.report("import-backup:file-selected", {
          file: {
            name: file.name,
            size: file.size
          },
          audit
        });
        Store.importBackup(parsed);
        UI.setBackupStatus("Бэкап импортирован.", "success");
        UI.toast("Бэкап импортирован", "success");
      } catch (error) {
        const message = this.getBackupErrorMessage(error);
        Diagnostics.report("import-backup:failed", {
          file: {
            name: file.name,
            size: file.size
          },
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : null
        }, "warning");
        UI.setBackupStatus(message, "error");
        UI.toast(message, "error");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }
};

const Diagnostics = {
  installed: false,
  events: [],
  maxEvents: 40,
  errorCount: 0,

  report(label, payload, level = "info") {
    const method = typeof console[level] === "function" ? level : "info";
    this.events.push({
      label,
      level,
      payload,
      at: Utils.nowISO()
    });
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
    if (level === "error") {
      this.errorCount += 1;
    }
    console.groupCollapsed(`[Budget Audit] ${label}`);
    console[method](payload);
    console.groupEnd();
  },

  install() {
    if (this.installed) {
      return;
    }
    this.installed = true;

    window.addEventListener("error", (event) => {
      this.report("runtime-error", {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack || null
      }, "error");
    });

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason instanceof Error
        ? { message: event.reason.message, stack: event.reason.stack }
        : { reason: event.reason };
      this.report("unhandled-rejection", reason, "error");
    });
  },

  auditStartup() {
    this.report("startup-state", {
      auth: {
        isAuthenticated: Auth.isAuthenticated(),
        login: Auth.getLogin() || null
      },
      syncStatus: Sync.status,
      data: summarizeNormalizedData(Store.data)
    });
  },

  snapshot() {
    return {
      errorCount: this.errorCount,
      online: navigator.onLine,
      session: {
        authenticated: Auth.isAuthenticated(),
        login: Auth.getLogin() || null
      },
      sync: {
        status: Sync.status,
        lastSyncedAt: Sync.lastSyncedAt,
        lastError: Sync.lastError || null
      },
      events: this.events.slice()
    };
  }
};

window.BudgetTrackerDebug = {
  normalizeData,
  mergeDataPreview: (remote, local) => normalizeData(mergeData(remote, local)),
  validateBackupPayload,
  summarizeNormalizedData,
  comparableDataSignature,
  isSemanticallySameData,
  hasMeaningfulData,
  roundtripBackupAudit: () => {
    const backup = Store.exportLegacyBackup();
    const sourceSummary = summarizeNormalizedData(Store.data);
    const roundtripSummary = summarizeNormalizedData(normalizeData(backup));
    const diff = diffDataSummaries(sourceSummary, roundtripSummary);
    const sourceComparable = JSON.parse(comparableDataSignature(Store.data));
    const roundtripComparable = JSON.parse(comparableDataSignature(backup));
    return {
      backup,
      sourceSummary,
      roundtripSummary,
      diff,
      isEqual: Object.values(diff).every((value) => Number(value || 0) === 0),
      signatureEqual: JSON.stringify(sourceComparable) === JSON.stringify(roundtripComparable),
      firstSignatureDiff: findFirstDiffPath(sourceComparable, roundtripComparable)
    };
  },
  exportBackupData: () => Store.exportLegacyBackup(),
  importBackupData: (data) => Store.importBackup(data),
  getStoreData: () => Utils.clone(Store.data),
  statsForMonth: (monthKey) => Utils.clone(Store.statsForMonth(monthKey)),
  getCategories: (type = "all") => Utils.clone(Store.getCategories(type)),
  setViewMonth: (monthKey) => {
    Store.viewMonth = monthKey;
    Store.detailMonth = monthKey;
    UI.heatmapMonth = monthKey;
    UI.renderApp();
  },
  toggleTheme: () => App.toggleTheme(),
  renderApp: () => UI.renderApp(),
  saveCategory: (payload) => Store.saveCategory(payload),
  deleteCategory: (categoryId) => Store.deleteCategory(categoryId),
  undo: () => Store.undo(),
  redo: () => Store.redo(),
  canUndo: () => Store.canUndo(),
  canRedo: () => Store.canRedo(),
  getDiagnostics: () => Diagnostics.snapshot()
};

document.addEventListener("DOMContentLoaded", () => {
  Diagnostics.install();
  App.init().catch((error) => {
    document.body?.classList.remove("app-booting");
    document.body?.classList.add("app-ready");
    Diagnostics.report("app-init:failed", {
      code: error?.code || null,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null
    }, "error");
    console.error(error);
    UI.toast("Приложение запустилось с ограничениями", "warning");
  }).finally(() => {
    Diagnostics.auditStartup();
  });
});
