const Sync = {
  status: "local",
  isSyncing: false,
  lastSyncedAt: null,
  lastError: "",
  timer: null,
  retryTimer: null,
  retryAttempt: 0,

  init() {
    if (Auth.isAuthenticated()) {
      this.lastSyncedAt = Storage.loadLastSync(Auth.getLogin());
      this.lastError = "";
      this.status = navigator.onLine ? "synced" : "offline";
    } else if (Auth.isLocalOnly()) {
      this.lastSyncedAt = null;
      this.lastError = "";
      this.status = "local";
    } else {
      this.lastError = "";
      this.status = "local";
    }
    window.addEventListener("online", () => {
      if (Auth.isAuthenticated()) {
        this.retryAttempt = 0;
        this.processQueue(true);
      } else {
        this.lastError = "";
        this.status = "local";
        UI.renderSyncState();
      }
    });
    window.addEventListener("offline", () => {
      this.lastError = "Нет соединения с интернетом";
      this.status = Auth.isAuthenticated() ? "offline" : "local";
      UI.renderSyncState();
    });
  },

  clearRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  },

  scheduleRetry() {
    if (!Auth.isAuthenticated()) {
      return;
    }
    const backoff = [1500, 4000, 9000, 20000];
    this.retryAttempt = Math.min(this.retryAttempt + 1, backoff.length);
    const delay = backoff[this.retryAttempt - 1];
    this.clearRetry();
    this.retryTimer = setTimeout(() => this.processQueue(true), delay);
  },

  queueSync() {
    if (!Auth.isAuthenticated()) {
      this.lastError = "";
      this.status = "local";
      UI.renderSyncState();
      return;
    }
    Storage.savePending({
      login: Auth.getLogin(),
      token: Auth.getToken(),
      updatedAt: Utils.nowISO(),
      data: normalizeData(Store.data)
    });
    this.lastError = "";
    this.retryAttempt = 0;
    this.clearRetry();
    this.status = navigator.onLine ? "syncing" : "offline";
    UI.renderSyncState();
    clearTimeout(this.timer);
    if (navigator.onLine) {
      this.timer = setTimeout(() => this.processQueue(), 800);
    }
  },

  async processQueue(forceProbe = false) {
    if (!Auth.isAuthenticated()) {
      this.lastError = "";
      this.status = "local";
      UI.renderSyncState();
      return;
    }
    const pending = Storage.loadPending();
    if (!pending || pending.login !== Auth.getLogin()) {
      this.lastError = "";
      this.retryAttempt = 0;
      this.clearRetry();
      this.status = "synced";
      UI.renderSyncState();
      return;
    }
    if (!navigator.onLine) {
      this.lastError = "Нет соединения с интернетом";
      this.status = "offline";
      UI.renderSyncState();
      return;
    }
    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;
    this.status = "syncing";
    UI.renderSyncState();

    try {
      if (forceProbe) {
        const probe = await Api.probeConnection();
        if (!probe.ok) {
          throw Api.createError(probe.code, probe.message);
        }
      }
      await Api.save(pending.login, pending.token, pending.data);
      const latest = Storage.loadPending();
      if (latest?.updatedAt === pending.updatedAt) {
        Storage.clearPending();
      }
      Auth.touchSession();
      this.retryAttempt = 0;
      this.clearRetry();
      this.lastSyncedAt = Utils.nowISO();
      Storage.saveLastSync(Auth.getLogin(), this.lastSyncedAt);
      this.lastError = "";
      this.status = "synced";
    } catch (error) {
      this.lastError = Api.getMessage(error, "Не удалось синхронизировать изменения");
      Diagnostics.report("sync:failed", {
        code: error?.code || null,
        message: this.lastError,
        forceProbe
      }, String(error?.code || "").startsWith("HTTP_4") ? "warning" : "error");
      if (Api.isRetryable(error)) {
        this.scheduleRetry();
      }
      this.status = error?.code === "NETWORK_UNAVAILABLE" || error?.code === "TIMEOUT" ? "offline" : "error";
    } finally {
      this.isSyncing = false;
      UI.renderSyncState();
    }
  }
};

