"use strict";

const crypto = require("node:crypto");

const API_BASE = process.env.BUDGET_API_BASE || "https://personal-budget-api.svoy1997.workers.dev";

function fail(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function assert(condition, message, details = {}) {
  if (!condition) {
    fail(message, details);
  }
}

function makeLogin() {
  return `codexaudit${crypto.randomBytes(10).toString("hex")}`.slice(0, 32);
}

function makePassword() {
  return `Audit${crypto.randomBytes(6).toString("hex")}!`;
}

async function request(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const rawText = await response.text();
  let payload = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
    rawText,
    headers: Object.fromEntries(response.headers.entries())
  };
}

function isTransientStorageFailure(response) {
  if (!response) {
    return false;
  }
  return (
    (response.status === 409 && response.payload?.code === "STORAGE_CONFLICT") ||
    (response.status === 503 && response.payload?.code === "UPSTREAM_COMMIT_NOT_VISIBLE") ||
    (response.status === 503 && response.payload?.code === "UPSTREAM_UNAVAILABLE") ||
    (response.status === 502 && response.payload?.code === "UPSTREAM_UNAVAILABLE") ||
    (response.status === 504 && response.payload?.code === "UPSTREAM_UNAVAILABLE")
  );
}

async function requestWithStorageConflictRetry(path, options = {}, delays = [0, 500, 1400, 2400]) {
  let lastResponse = null;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) {
      await sleep(delays[attempt]);
    }
    const response = await request(path, options);
    if (!isTransientStorageFailure(response)) {
      return response;
    }
    lastResponse = response;
  }
  return lastResponse;
}

function createSampleData() {
  const now = new Date().toISOString();
  return {
    meta: { version: 3, updatedAt: now },
    profile: { theme: "dark", locale: "ru-RU", currency: "RUB" },
    settings: {
      categories: [],
      deletedPresetCategoryIds: [],
      templates: [],
      favorites: [],
      wishlist: [],
      goals: []
    },
    months: {
      "2026-04": {
        start: 1234.56,
        manualStart: true,
        updatedAt: now
      }
    },
    transactions: []
  };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const login = makeLogin();
  const password = makePassword();
  const sampleData = createSampleData();

  const summary = {
    apiBase: API_BASE,
    login,
    checks: []
  };

  async function step(name, runner) {
    const result = await runner();
    summary.checks.push({ name, ok: true });
    return result;
  }

  const health = await step("health-json", async () => {
    const response = await request("/health");
    assert(response.status === 200, "Health endpoint must return 200", response);
    assert(response.payload?.ok === true, "Health payload must contain ok=true", response);
    assert(response.payload?.service === "personal-budget-worker", "Health payload must expose worker name", response);
    return response;
  });

  await step("health-head", async () => {
    const response = await request("/health", { method: "HEAD" });
    assert(response.status === 200, "HEAD /health must return 200", response);
    return response;
  });

  const register = await step("register", async () => {
    const response = await requestWithStorageConflictRetry("/register", {
      method: "POST",
      body: { login, password }
    });
    assert(response.status === 201, "Register must return 201", response);
    assert(typeof response.payload?.token === "string" && response.payload.token.length >= 32, "Register must issue session token", response);
    return response;
  });

  const firstToken = register.payload.token;

  await step("load-requires-token", async () => {
    const response = await request(`/load?login=${encodeURIComponent(login)}`);
    assert(response.status === 403, "Load without token must be rejected", response);
    assert(response.payload?.code === "TOKEN_REQUIRED", "Worker must explain missing token", response);
    return response;
  });

  await step("save-with-bearer", async () => {
    const response = await requestWithStorageConflictRetry("/save", {
      method: "POST",
      token: firstToken,
      body: {
        login,
        password: firstToken,
        data: sampleData
      }
    });
    assert(response.status === 200, "Save must return 200", response);
    assert(response.payload?.ok === true, "Save must respond with ok=true", response);
    return response;
  });

  await step("load-with-bearer", async () => {
    const response = await request(`/load?login=${encodeURIComponent(login)}`, {
      token: firstToken
    });
    assert(response.status === 200, "Load with token must return 200", response);
    assert(sameJson(response.payload?.data, sampleData), "Loaded data must match saved payload", response);
    return response;
  });

  await step("logout", async () => {
    const response = await requestWithStorageConflictRetry("/logout", {
      method: "POST",
      token: firstToken,
      body: {
        login,
        password: firstToken
      }
    });
    assert(response.status === 200, "Logout must return 200", response);
    assert(response.payload?.ok === true, "Logout must respond with ok=true", response);
    return response;
  });

  await step("old-token-invalid-after-logout", async () => {
    const response = await request(`/load?login=${encodeURIComponent(login)}`, {
      token: firstToken
    });
    assert(response.status === 403, "Old token must stop working after logout", response);
    assert(response.payload?.code === "INVALID_SESSION", "Worker must report invalid session after logout", response);
    return response;
  });

  const loginAgain = await step("login-again", async () => {
    const response = await requestWithStorageConflictRetry("/login", {
      method: "POST",
      body: { login, password }
    });
    assert(response.status === 200, "Login must return 200", response);
    assert(typeof response.payload?.token === "string" && response.payload.token.length >= 32, "Login must issue token", response);
    return response;
  });

  const secondToken = loginAgain.payload.token;

  await step("token-rotates", async () => {
    assert(secondToken !== firstToken, "Login must rotate session token");
    return { rotated: true };
  });

  await step("load-after-relogin", async () => {
    const response = await request(`/load?login=${encodeURIComponent(login)}`, {
      token: secondToken
    });
    assert(response.status === 200, "Load after relogin must return 200", response);
    assert(sameJson(response.payload?.data, sampleData), "Saved data must persist across logout/login", response);
    return response;
  });

  await step("wrong-password", async () => {
    const response = await request("/login", {
      method: "POST",
      body: { login, password: `${password}x` }
    });
    assert(response.status === 401, "Wrong password must return 401", response);
    assert(response.payload?.code === "INVALID_CREDENTIALS", "Worker must report invalid credentials", response);
    return response;
  });

  console.log(JSON.stringify({
    ok: true,
    login,
    apiBase: API_BASE,
    checkedAt: new Date().toISOString(),
    service: health.payload?.service || null,
    checks: summary.checks
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    apiBase: API_BASE,
    message: error.message,
    details: error.details || null
  }, null, 2));
  process.exitCode = 1;
});
