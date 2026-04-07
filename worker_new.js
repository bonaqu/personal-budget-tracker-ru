"use strict";

const USERS_FILE = "users.json";
const LOGIN_RE = /^[A-Za-z0-9._-]{3,32}$/;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS,HEAD",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin"
};

const GITHUB_TIMEOUT_MS = 8000;
const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_TIME_MS = 10 * 60 * 1000;
const DEFAULT_SESSION_TTL_MINUTES = 24 * 60;
const DEFAULT_MAX_DATA_BYTES = 850_000;
const DEFAULT_MAX_AUTH_BODY_BYTES = 4096;
const DEFAULT_MAX_JSON_BODY_BYTES = 1_000_000;
const DEFAULT_PBKDF2_ITERATIONS = 30_000;
const MIN_PBKDF2_ITERATIONS = 10_000;
const MAX_PBKDF2_ITERATIONS = 120_000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method === "HEAD" && (url.pathname === "/" || url.pathname === "/health")) {
      return new Response(null, { status: 200, headers: noStoreHeaders() });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonOk({ service: "personal-budget-worker", timestamp: new Date().toISOString() });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return textResponse("OK", 200);
    }

    try {
      switch (`${request.method} ${url.pathname}`) {
        case "POST /register":
          return await register(request, env);
        case "POST /login":
          return await login(request, env);
        case "GET /load":
          return await loadData(request, env);
        case "POST /save":
          return await saveData(request, env);
        case "POST /logout":
          return await logout(request, env);
        default:
          throw httpError(404, "Маршрут API не найден", "NOT_FOUND");
      }
    } catch (error) {
      if (error?.status) {
        logEvent(
          error.status >= 500 ? "error" : "warn",
          "api.request.failed",
          {
            endpoint: `${request.method} ${url.pathname}`,
            login: error.login || extractLoginHint(request),
            code: error.code || "API_ERROR",
            status: error.status
          },
          "Ошибка обработки запроса",
          "Request processing failed"
        );
        return jsonError(error.message, error.status, error.code || "API_ERROR");
      }

      logEvent(
        "error",
        "api.request.fatal",
        {
          endpoint: `${request.method} ${url.pathname}`,
          login: extractLoginHint(request),
          code: error?.code || "INTERNAL_ERROR"
        },
        "Внутренняя ошибка сервиса",
        "Unhandled internal error"
      );
      console.error(error);
      return jsonError("Внутренняя ошибка сервиса", 500, "INTERNAL_ERROR");
    }
  }
};

function noStoreHeaders(extra = {}) {
  return {
    ...CORS_HEADERS,
    "Cache-Control": "no-store",
    ...extra
  };
}

function jsonOk(data = {}, status = 200) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status,
    headers: noStoreHeaders({ "Content-Type": "application/json; charset=utf-8" })
  });
}

function jsonError(message, status = 400, code = "API_ERROR", extra = {}) {
  return new Response(JSON.stringify({ ok: false, error: message, code, ...extra }), {
    status,
    headers: noStoreHeaders({ "Content-Type": "application/json; charset=utf-8" })
  });
}

function textResponse(text, status = 200) {
  return new Response(text, {
    status,
    headers: noStoreHeaders({ "Content-Type": "text/plain; charset=utf-8" })
  });
}

function httpError(status, message, code = "API_ERROR", extra = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  Object.assign(error, extra);
  return error;
}

function sanitizeContext(context = {}) {
  const hidden = new Set([
    "password",
    "token",
    "authorization",
    "sessionTokenHash",
    "passwordHash",
    "data",
    "body"
  ]);
  return Object.fromEntries(
    Object.entries(context).filter(([key, value]) => !hidden.has(key) && value !== undefined && value !== null && value !== "")
  );
}

function logEvent(level, tag, context = {}, messageRu = "", messageEn = "") {
  const payload = {
    ts: new Date().toISOString(),
    tag,
    ...sanitizeContext(context)
  };
  const prefix = `[${tag}]`;
  const text = `${prefix} ${messageRu}${messageRu && messageEn ? " | " : ""}${messageEn}`;
  const logger = level === "error" ? console.error : (level === "warn" ? console.warn : console.log);
  logger(text, payload);
}

async function readJsonBody(request, { maxBytes = DEFAULT_MAX_JSON_BODY_BYTES } = {}) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw httpError(413, "Слишком большой размер запроса", "BODY_TOO_LARGE");
  }

  let raw = "";
  try {
    raw = await request.text();
  } catch {
    throw httpError(400, "Не удалось прочитать тело запроса", "BODY_READ_FAILED");
  }

  const byteLength = new TextEncoder().encode(raw).length;
  if (byteLength > maxBytes) {
    throw httpError(413, "Слишком большой размер запроса", "BODY_TOO_LARGE");
  }

  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw httpError(400, "Тело запроса должно быть валидным JSON", "INVALID_JSON");
  }
}

function normalizeLogin(value) {
  const login = String(value || "").trim();
  if (!login) {
    throw httpError(400, "Логин обязателен", "LOGIN_REQUIRED");
  }
  if (!LOGIN_RE.test(login)) {
    throw httpError(
      400,
      "Логин должен быть длиной 3-32 символа и содержать только латиницу, цифры, точку, дефис или подчеркивание",
      "LOGIN_INVALID"
    );
  }
  return login;
}

function normalizePassword(value) {
  const password = String(value || "");
  if (!password) {
    throw httpError(400, "Пароль обязателен", "PASSWORD_REQUIRED");
  }
  if (password.length < 6 || password.length > 128) {
    throw httpError(400, "Пароль должен быть длиной от 6 до 128 символов", "PASSWORD_LENGTH");
  }
  return password;
}

function getSessionTtlMs(env) {
  const minutes = Number(env.SESSION_TTL_MINUTES);
  if (Number.isFinite(minutes) && minutes > 0) {
    return minutes * 60 * 1000;
  }
  return DEFAULT_SESSION_TTL_MINUTES * 60 * 1000;
}

function getPbkdf2Iterations(env) {
  const configured = Math.floor(Number(env.PBKDF2_ITERATIONS));
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(MAX_PBKDF2_ITERATIONS, Math.max(MIN_PBKDF2_ITERATIONS, configured));
  }
  return DEFAULT_PBKDF2_ITERATIONS;
}

function getMaxDataBytes(env) {
  return Math.max(32_768, Number(env.MAX_DATA_BYTES) || DEFAULT_MAX_DATA_BYTES);
}

function ensureDataShape(data, env) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw httpError(400, "Данные бюджета должны быть JSON-объектом", "DATA_INVALID");
  }
  const serialized = JSON.stringify(data);
  const byteLength = new TextEncoder().encode(serialized).length;
  if (byteLength > getMaxDataBytes(env)) {
    throw httpError(413, "Слишком большой объем данных для сохранения", "DATA_TOO_LARGE");
  }
  return data;
}

function normalizeDb(raw) {
  const db = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  if (!db.users || typeof db.users !== "object" || Array.isArray(db.users)) {
    db.users = {};
  }
  db.schemaVersion = 3;
  return db;
}

function normalizeUserRecord(user) {
  const record = user && typeof user === "object" && !Array.isArray(user) ? user : {};
  return {
    ...record,
    data: record.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data : {},
    failedAttempts: Number(record.failedAttempts) || 0,
    blockedUntil: Number(record.blockedUntil) || 0,
    sessionTokenHash: typeof record.sessionTokenHash === "string" ? record.sessionTokenHash : "",
    sessionExpiresAt: Number(record.sessionExpiresAt) || 0,
    passwordSalt: typeof record.passwordSalt === "string" ? record.passwordSalt : "",
    passwordIterations: Number(record.passwordIterations) || DEFAULT_PBKDF2_ITERATIONS,
    passwordAlgo: typeof record.passwordAlgo === "string" ? record.passwordAlgo : "",
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : null,
    lastLoginAt: typeof record.lastLoginAt === "string" ? record.lastLoginAt : null
  };
}

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomHex(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return toHex(bytes);
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(hash));
}

async function pbkdf2Hex(password, saltHex, iterations = DEFAULT_PBKDF2_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const saltBytes = Uint8Array.from((saltHex.match(/.{1,2}/g) || []).map((byte) => parseInt(byte, 16)));
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  return toHex(new Uint8Array(bits));
}

async function derivePasswordHash(password, saltHex, env, iterations = getPbkdf2Iterations(env)) {
  try {
    return {
      hash: await pbkdf2Hex(password, saltHex, iterations),
      iterations
    };
  } catch (error) {
    logEvent(
      "error",
      "auth.password-hash.failed",
      {
        iterations
      },
      "Не удалось вычислить хэш пароля",
      "Failed to derive password hash"
    );
    console.error(error);
    throw httpError(500, "Не удалось безопасно обработать пароль", "PASSWORD_HASH_FAILED");
  }
}

function timingSafeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) {
    return false;
  }
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function verifyPasswordAndUpgrade(user, password, env) {
  if (user.passwordSalt && user.passwordAlgo === "pbkdf2-sha256") {
    const derived = await derivePasswordHash(
      password,
      user.passwordSalt,
      env,
      user.passwordIterations || getPbkdf2Iterations(env)
    );
    return {
      ok: timingSafeEqual(derived.hash, user.passwordHash || ""),
      upgraded: false
    };
  }

  const legacyHash = await sha256Hex(password);
  const ok = timingSafeEqual(legacyHash, user.passwordHash || "");
  if (!ok) {
    return { ok: false, upgraded: false };
  }

  const salt = randomHex(16);
  user.passwordSalt = salt;
  const derived = await derivePasswordHash(password, salt, env);
  user.passwordIterations = derived.iterations;
  user.passwordAlgo = "pbkdf2-sha256";
  user.passwordHash = derived.hash;
  return { ok: true, upgraded: true };
}

async function issueSession(user, env) {
  const token = randomHex(32);
  user.sessionTokenHash = await sha256Hex(token);
  user.sessionExpiresAt = Date.now() + getSessionTtlMs(env);
  user.lastLoginAt = new Date().toISOString();
  return token;
}

function extractBearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) {
    return "";
  }
  return header.slice(7).trim();
}

function extractAuthToken(request, body) {
  return extractBearerToken(request) || String(body?.password || "").trim();
}

async function verifySession(user, token) {
  if (!token || !user.sessionTokenHash || !user.sessionExpiresAt) {
    return false;
  }
  if (user.sessionExpiresAt <= Date.now()) {
    return false;
  }
  const tokenHash = await sha256Hex(token);
  return timingSafeEqual(tokenHash, user.sessionTokenHash);
}

async function fetchWithTimeout(url, options = {}, timeout = GITHUB_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("UPSTREAM_TIMEOUT");
      timeoutError.code = "UPSTREAM_TIMEOUT";
      throw timeoutError;
    }
    const upstreamError = new Error("UPSTREAM_UNAVAILABLE");
    upstreamError.code = "UPSTREAM_UNAVAILABLE";
    throw upstreamError;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGistState(env) {
  const response = await fetchWithTimeout(
    `https://api.github.com/gists/${env.GIST_ID}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "User-Agent": "personal-budget-worker",
        Accept: "application/vnd.github+json"
      }
    }
  );

  if (!response.ok) {
    throw httpError(503, "Не удалось прочитать хранилище пользователей", "UPSTREAM_UNAVAILABLE");
  }

  const gist = await response.json();
  const revision = gist.history?.[0]?.version || gist.updated_at || "";
  const file = gist.files?.[USERS_FILE];
  if (!file) {
    return {
      db: normalizeDb({ users: {} }),
      revision,
      updatedAt: gist.updated_at || null
    };
  }

  try {
    return {
      db: normalizeDb(JSON.parse(file.content || "{}")),
      revision,
      updatedAt: gist.updated_at || null
    };
  } catch {
    throw httpError(500, "Файл users.json поврежден и не может быть прочитан", "STORAGE_CORRUPTED");
  }
}

async function saveUsers(env, db, { expectedRevision = "", endpoint = "", login = "" } = {}) {
  if (expectedRevision) {
    const latest = await fetchGistState(env);
    if (latest.revision && latest.revision !== expectedRevision) {
      logEvent(
        "warn",
        "gist.write.conflict",
        {
          endpoint,
          login,
          expectedRevision,
          currentRevision: latest.revision
        },
        "Обнаружен конфликт записи в Gist",
        "Detected Gist write conflict"
      );
      throw httpError(409, "Данные в облаке уже изменились. Повторите действие еще раз.", "STORAGE_CONFLICT", { login });
    }
  }

  const response = await fetchWithTimeout(
    `https://api.github.com/gists/${env.GIST_ID}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "personal-budget-worker",
        Accept: "application/vnd.github+json"
      },
      body: JSON.stringify({
        files: {
          [USERS_FILE]: {
            content: JSON.stringify(db, null, 2)
          }
        }
      })
    }
  );

  if (!response.ok) {
    throw httpError(503, "Не удалось сохранить данные в хранилище", "UPSTREAM_UNAVAILABLE");
  }
}

async function requireAuthorizedUser(request, env, { body = null, loginFrom = "query" } = {}) {
  const login = loginFrom === "body"
    ? normalizeLogin(body?.login)
    : normalizeLogin(new URL(request.url).searchParams.get("login"));
  const token = extractAuthToken(request, body);
  if (!token) {
    throw httpError(403, "Нет доступа к данным аккаунта", "TOKEN_REQUIRED", { login });
  }

  const { db, revision } = await fetchGistState(env);
  const existing = db.users[login];
  if (!existing) {
    throw httpError(403, "Нет доступа к данным аккаунта", "USER_NOT_FOUND", { login });
  }

  const user = normalizeUserRecord(existing);
  const valid = await verifySession(user, token);
  if (!valid) {
    throw httpError(403, "Сессия недействительна. Войдите снова.", "INVALID_SESSION", { login });
  }

  db.users[login] = user;
  return { db, user, login, token, revision };
}

async function register(request, env) {
  const body = await readJsonBody(request, { maxBytes: DEFAULT_MAX_AUTH_BODY_BYTES });
  const login = normalizeLogin(body.login);
  const password = normalizePassword(body.password);
  const { db, revision } = await fetchGistState(env);

  if (db.users[login]) {
    throw httpError(409, "Такой логин уже существует", "LOGIN_EXISTS", { login });
  }

  const user = normalizeUserRecord({
    data: {},
    failedAttempts: 0,
    blockedUntil: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const salt = randomHex(16);
  user.passwordSalt = salt;
  const derived = await derivePasswordHash(password, salt, env);
  user.passwordIterations = derived.iterations;
  user.passwordAlgo = "pbkdf2-sha256";
  user.passwordHash = derived.hash;
  const token = await issueSession(user, env);
  db.users[login] = user;
  await saveUsers(env, db, { expectedRevision: revision, endpoint: "register", login });

  logEvent("info", "register.success", { endpoint: "register", login }, "Пользователь зарегистрирован", "User registered");
  return jsonOk({ token }, 201);
}

async function login(request, env) {
  const body = await readJsonBody(request, { maxBytes: DEFAULT_MAX_AUTH_BODY_BYTES });
  const login = normalizeLogin(body.login);
  const password = normalizePassword(body.password);
  const { db, revision } = await fetchGistState(env);
  const existing = db.users[login];

  if (!existing) {
    await delay();
    logEvent("warn", "login.invalid", { endpoint: "login", login }, "Неверный логин или пароль", "Invalid login or password");
    throw httpError(401, "Неверный логин или пароль", "INVALID_CREDENTIALS", { login });
  }

  const user = normalizeUserRecord(existing);
  const now = Date.now();
  if (user.blockedUntil > now) {
    const minutes = Math.ceil((user.blockedUntil - now) / 60000);
    logEvent("warn", "login.blocked", { endpoint: "login", login, blockedUntil: user.blockedUntil }, "Вход временно заблокирован", "Login temporarily blocked");
    throw httpError(429, `Слишком много попыток. Попробуйте через ${minutes} мин.`, "LOGIN_BLOCKED", { login });
  }

  const verification = await verifyPasswordAndUpgrade(user, password, env);
  if (!verification.ok) {
    user.failedAttempts += 1;
    if (user.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      user.blockedUntil = now + BLOCK_TIME_MS;
      user.failedAttempts = 0;
    }
    user.updatedAt = new Date().toISOString();
    db.users[login] = user;
    await saveUsers(env, db, { expectedRevision: revision, endpoint: "login", login });
    await delay();
    logEvent("warn", "login.invalid", { endpoint: "login", login }, "Неверный логин или пароль", "Invalid login or password");
    throw httpError(401, "Неверный логин или пароль", "INVALID_CREDENTIALS", { login });
  }

  user.failedAttempts = 0;
  user.blockedUntil = 0;
  user.updatedAt = new Date().toISOString();
  const token = await issueSession(user, env);
  db.users[login] = user;
  await saveUsers(env, db, { expectedRevision: revision, endpoint: "login", login });

  logEvent("info", "login.success", { endpoint: "login", login, upgraded: verification.upgraded }, "Вход выполнен", "Login succeeded");
  return jsonOk({ token });
}

async function loadData(request, env) {
  const { user, login } = await requireAuthorizedUser(request, env, { loginFrom: "query" });
  logEvent("info", "load.success", { endpoint: "load", login }, "Данные аккаунта загружены", "Account data loaded");
  return jsonOk({ data: user.data || {}, updatedAt: user.updatedAt || null });
}

async function saveData(request, env) {
  const body = await readJsonBody(request, { maxBytes: Math.max(getMaxDataBytes(env) + 16_384, DEFAULT_MAX_JSON_BODY_BYTES) });
  const data = ensureDataShape(body.data, env);
  const { db, user, login, revision } = await requireAuthorizedUser(request, env, { body, loginFrom: "body" });
  user.data = data;
  user.updatedAt = new Date().toISOString();
  db.users[login] = user;
  await saveUsers(env, db, { expectedRevision: revision, endpoint: "save", login });

  logEvent("info", "save.success", { endpoint: "save", login }, "Данные аккаунта сохранены", "Account data saved");
  return jsonOk({ updatedAt: user.updatedAt });
}

async function logout(request, env) {
  const body = await readJsonBody(request, { maxBytes: DEFAULT_MAX_AUTH_BODY_BYTES });
  const { db, user, login, revision } = await requireAuthorizedUser(request, env, { body, loginFrom: "body" });
  user.sessionTokenHash = "";
  user.sessionExpiresAt = 0;
  user.updatedAt = new Date().toISOString();
  db.users[login] = user;
  await saveUsers(env, db, { expectedRevision: revision, endpoint: "logout", login });

  logEvent("info", "logout.success", { endpoint: "logout", login }, "Сессия завершена", "Session revoked");
  return jsonOk();
}

function extractLoginHint(request) {
  try {
    const url = new URL(request.url);
    return String(url.searchParams.get("login") || "");
  } catch {
    return "";
  }
}

function delay(ms = 800) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
