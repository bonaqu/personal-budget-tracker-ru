"use strict";

const { chromium } = require("@playwright/test");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const BASE_URL = process.env.BUDGET_APP_BASE || "http://127.0.0.1:4317";
const DEV_COMMAND = process.env.BUDGET_APP_DEV_COMMAND || "npm run dev";
const STARTUP_TIMEOUT_MS = 120000;

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
  return `codexui${crypto.randomBytes(10).toString("hex")}`.slice(0, 32);
}

function makePassword() {
  return `Audit${crypto.randomBytes(6).toString("hex")}!`;
}

async function ping(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await ping(url)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function startDevServer() {
  const child = spawn(DEV_COMMAND, {
    cwd: process.cwd(),
    shell: true,
    stdio: "ignore",
    windowsHide: true
  });
  return child;
}

async function ensureStartupAuth(page) {
  await page.goto("/");
  await page.waitForFunction(() => !document.body.classList.contains("app-booting"), null, { timeout: 30000 });
  if (await page.locator("#appShell").isVisible().catch(() => false)) {
    await page.evaluate(() => App.logout());
    await page.waitForSelector("#startupLogin", { state: "visible" });
  }
  await page.waitForSelector("#startupLogin", { state: "visible" });
}

async function waitForAuthenticatedApp(page, stage = "auth") {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45000) {
    const state = await page.evaluate(() => {
      const appShell = document.querySelector("#appShell");
      const startupStatus = document.querySelector("#startupAuthStatus");
      const modalStatus = document.querySelector("#modalAuthStatus");
      const syncChoice = document.querySelector("#syncChoiceModal");
      const currentLogin = typeof Auth !== "undefined" && typeof Auth.getLogin === "function"
        ? Auth.getLogin()
        : null;
      const syncStatus = typeof Sync !== "undefined" ? Sync.status || null : null;
      const syncLastError = typeof Sync !== "undefined" ? Sync.lastError || "" : "";
      const statusText = [startupStatus, modalStatus]
        .filter((node) => node instanceof HTMLElement && !node.hidden)
        .map((node) => node.textContent?.trim() || "")
        .find(Boolean) || "";
      return {
        ready: (
          appShell instanceof HTMLElement &&
          !appShell.classList.contains("is-hidden") &&
          Boolean(currentLogin)
        ),
        statusText,
        login: currentLogin,
        syncStatus,
        syncLastError,
        appHidden: appShell instanceof HTMLElement ? appShell.classList.contains("is-hidden") : true,
        startupHidden: document.querySelector("#authScreen")?.classList.contains("is-hidden") ?? false,
        syncChoiceOpen: syncChoice instanceof HTMLElement ? syncChoice.getAttribute("aria-hidden") === "false" : false,
        syncChoiceTitle: document.querySelector("#syncChoiceTitle")?.textContent?.trim() || ""
      };
    });
    if (state.ready) {
      return;
    }
    await page.waitForTimeout(250);
  }
  const finalState = await page.evaluate(() => {
    const appShell = document.querySelector("#appShell");
    const syncChoice = document.querySelector("#syncChoiceModal");
    const currentLogin = typeof Auth !== "undefined" && typeof Auth.getLogin === "function"
      ? Auth.getLogin()
      : null;
    const syncStatus = typeof Sync !== "undefined" ? Sync.status || null : null;
    const syncLastError = typeof Sync !== "undefined" ? Sync.lastError || "" : "";
    return {
      login: currentLogin,
      syncStatus,
      syncLastError,
      appHidden: appShell instanceof HTMLElement ? appShell.classList.contains("is-hidden") : true,
      startupHidden: document.querySelector("#authScreen")?.classList.contains("is-hidden") ?? false,
      startupStatusHidden: document.querySelector("#startupAuthStatus")?.hidden ?? true,
      startupStatus: document.querySelector("#startupAuthStatus")?.textContent?.trim() || "",
      modalStatusHidden: document.querySelector("#modalAuthStatus")?.hidden ?? true,
      modalStatus: document.querySelector("#modalAuthStatus")?.textContent?.trim() || "",
      syncChoiceOpen: syncChoice instanceof HTMLElement ? syncChoice.getAttribute("aria-hidden") === "false" : false,
      syncChoiceTitle: document.querySelector("#syncChoiceTitle")?.textContent?.trim() || ""
    };
  });
  fail("Authentication flow did not reach the app shell in time", { stage, ...finalState });
}

async function loginDemo(page) {
  await ensureStartupAuth(page);
  await page.locator("#startupLogin").fill("test1234");
  await page.locator("#startupPassword").fill("test1234");
  await page.locator("#startupLoginBtn").click();
  await waitForAuthenticatedApp(page, "demo-login");
}

async function logoutToStartup(page) {
  await page.evaluate(() => App.logout());
  await page.waitForSelector("#startupLogin", { state: "visible" });
}

async function registerRealAccount(page, login, password) {
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await ensureStartupAuth(page);
    await page.locator("#startupLogin").fill(login);
    await page.locator("#startupPassword").fill(password);
    await page.locator("#startupRegisterBtn").click();
    try {
      await waitForAuthenticatedApp(page, "real-register");
      return;
    } catch (error) {
      const status = String(error?.details?.startupStatus || "");
      const retryable = /уже существует|не удалось|недоступ|конфликт|повтор/i.test(status);
      if (!retryable || attempt >= maxAttempts) {
        throw error;
      }
      await page.waitForTimeout(1200);
    }
  }
}

async function loginRealAccount(page, login, password) {
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await ensureStartupAuth(page);
    await page.locator("#startupLogin").fill(login);
    await page.locator("#startupPassword").fill(password);
    await page.locator("#startupLoginBtn").click();
    try {
      await waitForAuthenticatedApp(page, "real-login");
      return;
    } catch (error) {
      const status = String(error?.details?.startupStatus || "");
      const retryable = /неверный логин или пароль|не удалось|недоступ|конфликт|повтор/i.test(status);
      if (!retryable || attempt >= maxAttempts) {
        throw error;
      }
      await page.waitForTimeout(1200);
    }
  }
}

async function injectSentinel(page, sentinel) {
  return page.evaluate(async (nextSentinel) => {
    const updateExistingExpense = (draft) => {
      const target = draft.transactions.find((item) => item.type === "expense");
      if (target) {
        target.description = nextSentinel;
        target.updatedAt = Utils.nowISO();
        return true;
      }
      return false;
    };

    Store.mutate((draft) => {
      if (updateExistingExpense(draft)) {
        return;
      }
      const month = Store.viewMonth || Utils.monthKey(new Date());
      const now = Utils.nowISO();
      draft.transactions.unshift({
        id: Utils.uid("tx"),
        type: "expense",
        flowKind: "standard",
        categoryId: "exp_food",
        amount: 777,
        description: nextSentinel,
        date: `${month}-15`,
        tags: [],
        position: 0,
        createdAt: now,
        updatedAt: now
      });
    });

    if (Auth.isAuthenticated()) {
      await Sync.processQueue(true);
    }

    return {
      login: Auth.getLogin(),
      authenticated: Auth.isAuthenticated(),
      localOnly: Auth.isLocalOnly(),
      contains: JSON.stringify(Store.data).includes(nextSentinel),
      syncStatus: Sync.status,
      lastError: Sync.lastError || ""
    };
  }, sentinel);
}

async function collectSentinelState(page, sentinel) {
  return page.evaluate((nextSentinel) => {
    const guestCache = localStorage.getItem(`${CONFIG.CACHE_PREFIX}guest`) || "";
    return {
      login: Auth.getLogin(),
      authenticated: Auth.isAuthenticated(),
      localOnly: Auth.isLocalOnly(),
      inStore: JSON.stringify(Store.data).includes(nextSentinel),
      inGuestCache: guestCache.includes(nextSentinel)
    };
  }, sentinel);
}

async function auditRealAccountUi(page) {
  await page.locator(".sidebar [data-tab-target='analyticsTab']").click();
  await page.waitForSelector("#heatmapWrap", { state: "visible" });

  await page.locator(".sidebar [data-tab-target='monthsTab']").click();
  await page.waitForSelector("#monthsTable", { state: "visible" });

  await page.locator(".sidebar [data-tab-target='settingsTab']").click();
  await page.waitForSelector("#manageQuickList", { state: "visible" });

  const backupAudit = await page.evaluate(() => {
    const debug = window.BudgetTrackerDebug;
    if (!debug?.roundtripBackupAudit || !debug?.exportBackupData || !debug?.getStoreData) {
      return { roundtripOk: false, legacyOk: false, reason: "missing-debug-api" };
    }

    const roundtrip = debug.roundtripBackupAudit();
    const current = debug.getStoreData();
    const legacy = debug.exportBackupData();
    if (legacy?.settings && typeof legacy.settings === "object") {
      delete legacy.settings.deletedPresetCategoryIds;
      if (Array.isArray(legacy.settings.categories)) {
        legacy.settings.categories = legacy.settings.categories.map((item) => {
          const next = { ...item };
          delete next.preset;
          return next;
        });
      }
    }

    const normalizedLegacy = typeof normalizeData === "function" ? normalizeData(legacy) : null;
    const legacyOk = Boolean(
      normalizedLegacy &&
      typeof isSemanticallySameData === "function" &&
      isSemanticallySameData(current, normalizedLegacy)
    );

    return {
      roundtripOk: Boolean(roundtrip?.isEqual && roundtrip?.signatureEqual),
      legacyOk
    };
  });
  assert(backupAudit.roundtripOk === true, "Backup roundtrip must remain lossless", backupAudit);
  assert(backupAudit.legacyOk === true, "Legacy backups must still normalize semantically", backupAudit);

  const initialTheme = await page.evaluate(() => document.body.dataset.theme || "dark");
  await page.locator("#themeToggleBtn").click();
  await page.waitForTimeout(80);
  const toggledTheme = await page.evaluate(() => document.body.dataset.theme || "");
  assert(toggledTheme && toggledTheme !== initialTheme, "Theme toggle must change the active theme", {
    initialTheme,
    toggledTheme
  });
  await page.locator("#themeToggleBtn").click();
  await page.waitForTimeout(80);
  const restoredTheme = await page.evaluate(() => document.body.dataset.theme || "");
  assert(restoredTheme === initialTheme, "Theme toggle must restore the original theme", {
    initialTheme,
    restoredTheme
  });

  await page.locator("#accountBtn").click();
  await page.waitForSelector("#accountMenuModal.is-open", { state: "visible" });
  await page.click("#accountMenuModal", { position: { x: 8, y: 8 } });
  await page.waitForTimeout(80);

  await page.locator(".sidebar [data-tab-target='overviewTab']").click();
  await page.waitForSelector("#summaryGrid", { state: "visible" });
}

async function main() {
  let devServer = null;
  if (!(await ping(BASE_URL))) {
    devServer = startDevServer();
    const ready = await waitForServer(BASE_URL, STARTUP_TIMEOUT_MS);
    if (!ready) {
      devServer.kill();
      fail("Local app server did not start in time", { baseUrl: BASE_URL });
    }
  }

  const realLogin = makeLogin();
  const realPassword = makePassword();
  const DEMO_SENTINEL = "DEMO_SHOULD_NOT_LEAK";
  const REAL_SENTINEL = "REAL_CLOUD_SENTINEL";

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();

  try {
    await loginDemo(page);
    const demoSeed = await injectSentinel(page, DEMO_SENTINEL);
    assert(demoSeed.localOnly === true, "Demo account must remain local-only", demoSeed);
    assert(demoSeed.contains === true, "Demo sentinel must be present before account switch", demoSeed);

    await logoutToStartup(page);
    await registerRealAccount(page, realLogin, realPassword);

    const afterRegister = await collectSentinelState(page, DEMO_SENTINEL);
    assert(afterRegister.authenticated === true, "Real account must authenticate after registration", afterRegister);
    assert(afterRegister.inStore === false, "Demo data must not leak into real account store after registration", afterRegister);
    assert(afterRegister.inGuestCache === false, "Demo data must be cleared from guest cache after registration", afterRegister);
    await auditRealAccountUi(page);

    const realSeed = await injectSentinel(page, REAL_SENTINEL);
    assert(realSeed.authenticated === true, "Real account must stay authenticated during sync", realSeed);
    assert(realSeed.contains === true, "Real sentinel must exist after cloud save", realSeed);
    assert(realSeed.lastError === "", "Cloud save must finish without sync error", realSeed);

    await logoutToStartup(page);
    await loginDemo(page);

    const demoReturn = await collectSentinelState(page, REAL_SENTINEL);
    assert(demoReturn.localOnly === true, "Demo login must remain isolated and local-only after returning", demoReturn);
    assert(demoReturn.inStore === false, "Real cloud data must not leak into demo account", demoReturn);

    await logoutToStartup(page);
    await loginRealAccount(page, realLogin, realPassword);

    const realReturn = await collectSentinelState(page, REAL_SENTINEL);
    const leakedDemoToReal = await collectSentinelState(page, DEMO_SENTINEL);
    assert(realReturn.authenticated === true, "Real account must log back in after demo session", realReturn);
    assert(realReturn.inStore === true, "Real cloud data must remain intact after demo session", realReturn);
    assert(leakedDemoToReal.inStore === false, "Demo-only changes must not reappear in real account", leakedDemoToReal);
    await auditRealAccountUi(page);

    console.log(JSON.stringify({
      ok: true,
      baseUrl: BASE_URL,
      realLogin,
      checkedAt: new Date().toISOString(),
      checks: [
        "demo-is-local-only",
        "demo-data-clears-before-real-register",
        "guest-cache-does-not-keep-demo-data",
        "real-data-persists-in-cloud",
        "real-and-demo-do-not-mix-on-return",
        "real-account-tabs-render",
        "backup-roundtrip-and-legacy-import-stay-compatible",
        "theme-toggle-roundtrip-works"
      ]
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
    if (devServer) {
      devServer.kill();
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    baseUrl: BASE_URL,
    message: error.message,
    details: error.details || null
  }, null, 2));
  process.exitCode = 1;
});
