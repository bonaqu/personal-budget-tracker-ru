const Api = {
  capabilities: {
    supportsBearerAuth: false
  },

  createError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    return Object.assign(error, details);
  },

  getMessage(error, fallback = "Произошла ошибка при обращении к API") {
    if (error instanceof Error && error.message?.trim()) {
      return error.message.trim();
    }
    return fallback;
  },

  messageForStatus(status, serverMessage = "") {
    if (serverMessage) {
      return serverMessage;
    }
    const fallback = {
      400: "Некорректный запрос к API",
      401: "Неверный логин или пароль",
      403: "Нет доступа к данным аккаунта",
      404: "API не найдено",
      408: "Сервер не ответил вовремя",
      409: "Конфликт данных. Попробуйте повторить действие",
      429: "Слишком много попыток. Попробуйте позже",
      500: "Внутренняя ошибка сервера",
      502: "Промежуточный сервис API вернул ошибку",
      503: "Сервис временно недоступен",
      504: "Сервер не ответил вовремя"
    };
    return fallback[status] || `Ошибка сервиса (${status})`;
  },

  async request(endpoint, method = "GET", body = null, { timeout = 10000, headers = {} } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const requestHeaders = { ...headers };
    const normalizedMethod = String(method || "GET").toUpperCase();
    const hasBody = body !== null && body !== undefined;

    if (hasBody && !requestHeaders["Content-Type"] && !requestHeaders["content-type"]) {
      requestHeaders["Content-Type"] = "application/json";
    }

    const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
      method: normalizedMethod,
      headers: requestHeaders,
      signal: controller.signal,
      body: hasBody ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      let payload = null;
      let serverMessage = "";
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        payload = await response.json().catch(() => null);
        if (typeof payload?.error === "string") {
          serverMessage = payload.error.trim();
        }
      } else {
        serverMessage = await response.text().then((text) => text.trim()).catch(() => "");
      }

      const error = this.createError(
        `HTTP_${response.status}`,
        this.messageForStatus(response.status, serverMessage),
        {
          endpoint,
          method: normalizedMethod,
          status: response.status,
          payload,
          serverMessage
        }
      );

      Diagnostics.report("api-request:failed", {
        endpoint,
        method: normalizedMethod,
        status: response.status,
        code: error.code,
        message: error.message
      }, response.status >= 500 ? "error" : "warning");

      throw error;
    }

    return response;
  } catch (error) {
    if (error?.code) {
      throw error;
    }

    const normalized = error?.name === "AbortError"
      ? this.createError("TIMEOUT", "Сервер не ответил вовремя", { endpoint, method })
      : error instanceof TypeError
        ? this.createError("NETWORK_UNAVAILABLE", "Нет соединения с интернетом или API недоступно", { endpoint, method })
        : this.createError("REQUEST_FAILED", this.getMessage(error), {
          endpoint,
          method,
          originalError: error instanceof Error ? error.stack : String(error)
        });

    Diagnostics.report("api-request:failed", {
      endpoint,
      method,
      code: normalized.code,
      message: normalized.message
    }, normalized.code === "REQUEST_FAILED" ? "error" : "warning");

    throw normalized;
  } finally {
    clearTimeout(timeoutId);
  }
},

  async probeConnection() {
    let lastError = null;
    try {
      const response = await this.request("/health", "GET", null, { timeout: 3000 });
      const payload = await response.json().catch(() => null);
      if (payload && typeof payload === "object" && payload.ok === true) {
        this.capabilities.supportsBearerAuth = true;
        return { ok: true, mode: "modern" };
      }
      this.capabilities.supportsBearerAuth = false;
      return { ok: true, mode: "legacy" };
    } catch (error) {
      lastError = error;
    }

    for (const probe of [
      { endpoint: "/health", method: "HEAD" },
      { endpoint: "/", method: "HEAD" }
    ]) {
      try {
        await this.request(probe.endpoint, probe.method, null, { timeout: 3000 });
        this.capabilities.supportsBearerAuth = false;
        return { ok: true, mode: "legacy" };
      } catch (error) {
        lastError = error;
      }
    }

    return {
      ok: false,
      code: lastError?.code || "NETWORK_UNAVAILABLE",
      message: this.getMessage(lastError, "Сервис авторизации недоступен")
    };
  },

  async login(login, password) {
    const response = await this.request("/login", "POST", { login, password });
    const payload = await response.json().catch(() => ({}));
    const token = payload.token || payload.data?.token || password;
    this.capabilities.supportsBearerAuth = Boolean(payload.token || payload.data?.token);
    return { ok: true, token };
  },

  async register(login, password) {
    const response = await this.request("/register", "POST", { login, password });
    const payload = await response.json().catch(() => ({}));
    const token = payload.token || payload.data?.token || password;
    this.capabilities.supportsBearerAuth = Boolean(payload.token || payload.data?.token);
    return { ok: true, token };
  },

  isRetryable(error) {
    const code = error?.code || "";
    return code === "TIMEOUT" ||
      code === "NETWORK_UNAVAILABLE" ||
      code === "REQUEST_FAILED" ||
      code === "HTTP_408" ||
      code === "HTTP_429" ||
      code === "HTTP_500" ||
      code === "HTTP_502" ||
      code === "HTTP_503" ||
      code === "HTTP_504";
  },

  async load(login, token = null) {
    const headers = this.capabilities.supportsBearerAuth && token
      ? { Authorization: `Bearer ${token}` }
      : {};
    const response = await this.request(`/load?login=${encodeURIComponent(login)}`, "GET", null, { headers });
    const payload = await response.json();
    if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "ok")) {
      return payload.data || {};
    }
    return payload;
  },

  async save(login, token, data) {
    const headers = this.capabilities.supportsBearerAuth && token
      ? { Authorization: `Bearer ${token}` }
      : {};
    const payload = {
      login,
      password: token,
      data
    };
    const delays = [0, 600, 1600];
    let lastError = null;
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt] > 0) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
      try {
        await this.request("/save", "POST", payload, { headers });
        return;
      } catch (error) {
        lastError = error;
        if (!this.isRetryable(error) || attempt === delays.length - 1) {
          throw error;
        }
      }
    }
    throw lastError || this.createError("REQUEST_FAILED", "Не удалось сохранить изменения");
  },

  async logout(login, token) {
    if (!login || !token) {
      return;
    }
    const headers = this.capabilities.supportsBearerAuth
      ? { Authorization: `Bearer ${token}` }
      : {};
    try {
      await this.request("/logout", "POST", { login, password: token }, { timeout: 5000, headers });
    } catch (error) {
      if (error?.code === "HTTP_404" || error?.code === "HTTP_405") {
        return;
      }
      throw error;
    }
  }
};
