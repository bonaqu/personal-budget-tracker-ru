const Storage = {
  read(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },

  readText(key, fallback = "") {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : raw;
    } catch {
      return fallback;
    }
  },

  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  writeText(key, value) {
    try {
      localStorage.setItem(key, String(value));
      return true;
    } catch {
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },

  cacheKey(login) {
    return `${CONFIG.CACHE_PREFIX}${login || "guest"}`;
  },

  loadCache(login) {
    if (isLocalTestLogin(login)) {
      // Demo-account is a fully isolated seeded sandbox.
      // We always load a fresh demo snapshot so user data can never bleed into it.
      return buildLocalTestData();
    }
    const data = normalizeData(this.read(this.cacheKey(login), defaultData()));
    return data;
  },

  saveCache(login, data) {
    this.write(this.cacheKey(login), normalizeData(data));
  },

  loadSession() {
    const session = this.read(CONFIG.SESSION_KEY, null);
    if (!session?.login || !session?.expiresAt || !session?.lastActivityAt) {
      this.remove(CONFIG.SESSION_KEY);
      return null;
    }
    if (!session?.localOnly && !session?.token) {
      this.remove(CONFIG.SESSION_KEY);
      return null;
    }
    const expiresAt = new Date(session.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      this.remove(CONFIG.SESSION_KEY);
      return null;
    }
    return session;
  },

  saveSession(session) {
    this.write(CONFIG.SESSION_KEY, session);
    return session;
  },

  clearSession() {
    this.remove(CONFIG.SESSION_KEY);
  },

  loadPending() {
    return this.read(CONFIG.QUEUE_KEY, null);
  },

  savePending(payload) {
    this.write(CONFIG.QUEUE_KEY, payload);
  },

  clearPending() {
    this.remove(CONFIG.QUEUE_KEY);
  },

  loadLastSync(login) {
    return this.read(`${CONFIG.LAST_SYNC_PREFIX}${login}`, null);
  },

  saveLastSync(login, value) {
    this.write(`${CONFIG.LAST_SYNC_PREFIX}${login}`, value);
  }
};

const Auth = {
  session: null,
  activityBound: false,
  activityTimer: null,
  lastPersistAt: 0,

  getIdleTimeoutMs() {
    return Math.max(1, Number(CONFIG.SESSION_IDLE_MINUTES) || 30) * 60 * 1000;
  },

  isSessionExpired(session = this.session) {
    if (!session?.expiresAt) {
      return true;
    }
    const expiresAt = Date.parse(session.expiresAt);
    return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
  },

  bindActivityTracking() {
    if (this.activityBound || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const passiveListener = { passive: true };
    const markActivity = () => this.recordActivity();
    const markImmediate = () => this.recordActivity(true);

    ["pointerdown", "mousedown", "touchstart", "wheel"].forEach((eventName) => {
      window.addEventListener(eventName, markActivity, passiveListener);
    });
    window.addEventListener("keydown", markActivity);
    window.addEventListener("focus", markImmediate);
    window.addEventListener("pagehide", () => this.persistSession(true));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.persistSession(true);
        return;
      }
      if (this.isSessionExpired()) {
        this.handleSessionExpired();
        return;
      }
      markImmediate();
    });

    this.activityBound = true;
  },

  persistSession(force = false) {
    if (!this.session) {
      return;
    }
    const now = Date.now();
    if (!force && now - this.lastPersistAt < CONFIG.SESSION_ACTIVITY_THROTTLE_MS) {
      return;
    }
    Storage.saveSession(this.session);
    this.lastPersistAt = now;
  },

  scheduleExpiryCheck() {
    clearTimeout(this.activityTimer);
    if (!this.session) {
      this.activityTimer = null;
      return;
    }
    const expiresAt = Date.parse(this.session.expiresAt);
    const delay = !Number.isFinite(expiresAt)
      ? 250
      : Math.max(250, expiresAt - Date.now());
    this.activityTimer = setTimeout(() => this.handleSessionExpired(), delay + 50);
  },

  async init() {
    this.bindActivityTracking();
    const session = Storage.loadSession();
    if (!session) {
      this.session = null;
      return;
    }
    this.session = session;
    this.lastPersistAt = 0;
    this.scheduleExpiryCheck();
  },

  isAuthenticated() {
    return Boolean(this.session?.login && this.session?.token && !this.session?.localOnly);
  },

  hasSession() {
    return Boolean(this.session?.login);
  },

  isLocalOnly() {
    return Boolean(this.session?.login && this.session?.localOnly);
  },

  getLogin() {
    return this.session?.login || null;
  },

  getToken() {
    return this.session?.token || null;
  },

  getExpiry() {
    return this.session?.expiresAt || null;
  },

  async setSession(login, token, { localOnly = false } = {}) {
    const now = Date.now();
    this.session = {
      login,
      token,
      localOnly,
      lastActivityAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.getIdleTimeoutMs()).toISOString()
    };
    this.persistSession(true);
    this.syncPendingToken();
    this.scheduleExpiryCheck();
  },

  syncPendingToken() {
    if (!this.session?.login || !this.session?.token || this.session?.localOnly) {
      return;
    }
    const pending = Storage.loadPending();
    if (!pending || pending.login !== this.session.login) {
      return;
    }
    pending.token = this.session.token;
    Storage.savePending(pending);
  },

  touchSession(forcePersist = false) {
    if (!this.session) {
      return;
    }
    const now = Date.now();
    this.session.lastActivityAt = new Date(now).toISOString();
    this.session.expiresAt = new Date(now + this.getIdleTimeoutMs()).toISOString();
    this.persistSession(forcePersist);
    this.scheduleExpiryCheck();
  },

  recordActivity(force = false) {
    if (!this.session) {
      return;
    }
    if (this.isSessionExpired()) {
      this.handleSessionExpired();
      return;
    }
    const lastActivityAt = Date.parse(this.session.lastActivityAt || 0);
    if (!force && Number.isFinite(lastActivityAt) && Date.now() - lastActivityAt < CONFIG.SESSION_ACTIVITY_THROTTLE_MS) {
      return;
    }
    this.touchSession(force);
  },

  handleSessionExpired() {
    if (!this.session) {
      return;
    }
    if (!this.isSessionExpired()) {
      this.scheduleExpiryCheck();
      return;
    }
    const login = this.getLogin();
    const token = this.getToken();
    const localOnly = this.isLocalOnly();
    this.clearSession({ preservePending: true });
    if (typeof App !== "undefined" && typeof App.handleSessionExpired === "function") {
      App.handleSessionExpired({
        login,
        token,
        localOnly,
        isLocalTest: localOnly && isLocalTestLogin(login)
      });
    }
  },

  clearSession({ preservePending = false } = {}) {
    const login = this.getLogin();
    this.session = null;
    clearTimeout(this.activityTimer);
    this.activityTimer = null;
    Storage.clearSession();
    if (!preservePending) {
      const pending = Storage.loadPending();
      if (pending?.login === login) {
        Storage.clearPending();
      }
    }
  }
};

