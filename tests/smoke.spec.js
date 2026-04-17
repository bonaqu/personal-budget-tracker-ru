const { test, expect } = require("@playwright/test");

async function ensureDemoLogin(page) {
  await page.goto("/");
  const startupLogin = page.locator("#startupLogin");
  if (await startupLogin.isVisible()) {
    await startupLogin.fill("test1234");
    await page.locator("#startupPassword").fill("test1234");
    await page.locator("#startupLoginBtn").click();
  }

  await expect(page.locator("#appShell")).toBeVisible();
}

test("app shell renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
  await expect(page).not.toHaveTitle("");
  await expect(page.locator("text=Управляйте личным бюджетом без лишней рутины")).toBeVisible();
  await expect(page.locator("text=Вход и регистрация")).toBeVisible();

  const authGeometry = await page.evaluate(() => {
    const logo = document.querySelector(".brand-mark--hero");
    const field = document.querySelector(".auth-form--startup .auth-field__control");
    const login = document.querySelector("#startupLogin");
    if (!(logo instanceof HTMLElement) || !(field instanceof HTMLElement) || !(login instanceof HTMLInputElement)) {
      return null;
    }
    const before = field.getBoundingClientRect();
    login.focus();
    const after = field.getBoundingClientRect();
    const logoRect = logo.getBoundingClientRect();
    return {
      heroLogoLargeEnough: logoRect.width >= 68 && logoRect.height >= 68,
      focusStable: Math.round(before.x) === Math.round(after.x) && Math.round(before.y) === Math.round(after.y)
    };
  });

  expect(authGeometry?.heroLogoLargeEnough).toBeTruthy();
  expect(authGeometry?.focusStable).toBeTruthy();
});

test("theme toggle keeps overview, analytics, months, and settings surfaces stable", async ({ page }) => {
  await ensureDemoLogin(page);
  await expect(page.locator("#overviewTab")).toBeVisible();

  const initialTheme = await page.evaluate(() => document.body.dataset.theme || "dark");
  await page.locator("#themeToggleBtn").click();
  await page.waitForTimeout(60);

  const toggled = await page.evaluate(() => {
    const theme = document.body.dataset.theme || "";
    const summary = document.querySelector("#summaryGrid .summary-card");
    const focus = document.querySelector("#overviewCategoryLegend .budget-limit-card");
    const limits = document.querySelector("#budgetLimitList .budget-limit-card");
    const sync = document.querySelector("#syncPill");
    const allVisible = [summary, focus, limits, sync].every((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== "hidden";
    });
    return { theme, allVisible };
  });

  expect(toggled.theme).not.toBe(initialTheme);
  expect(toggled.allVisible).toBeTruthy();

  await page.locator(".sidebar [data-tab-target='analyticsTab']").click();
  await expect(page.locator("#analyticsTab")).toBeVisible();
  await expect(page.locator("#heatmapWrap")).toBeVisible();

  await page.locator(".sidebar [data-tab-target='monthsTab']").click();
  await expect(page.locator("#monthsTab")).toBeVisible();
  await expect(page.locator("#monthsTable")).toBeVisible();

  await page.locator(".sidebar [data-tab-target='settingsTab']").click();
  await expect(page.locator("#settingsTab")).toBeVisible();
  await expect(page.locator("#manageQuickList")).toBeVisible();

  await page.locator("#themeToggleBtn").click();
  await page.waitForTimeout(60);
  await expect(page.locator("body")).toHaveAttribute("data-theme", initialTheme);
});

test("analytics renders without goal collapse control and sync state stays explicit", async ({ page }) => {
  await ensureDemoLogin(page);
  await page.locator(".sidebar [data-tab-target='analyticsTab']").click();

  await expect(page.locator("text=На какие суммы вы копите")).toBeVisible();
  await expect(page.locator("text=Итоги месяца")).toBeVisible();
  await expect(page.locator("text=Доходы, расходы и чистый поток")).toBeVisible();
  await expect(page.locator("text=Календарь движения средств")).toBeVisible();
  await expect(page.locator("text=Тепловая карта по дням")).toBeVisible();
  await expect(page.locator("#goalPanelToggleBtn")).toHaveCount(0);
  await expect(page.locator("#syncPill")).toHaveAttribute("title", /(устройстве|облако|облаке|синхронизац)/i);
  await expect(page.locator("#syncMetaNote")).not.toHaveText("");

  const analyticsGeometry = await page.evaluate(() => {
    const panel = document.querySelector(".analytics-panel--heatmap");
    const inner = document.querySelector("#heatmapWrap");
    const breakdown = document.querySelector(".analytics-panel--breakdown");
    const tabs = document.querySelector(".analytics-advanced__tabs");
    const heatmapHint = document.querySelector("#heatmapWrap .heatmap-v2__hint");
    const heatmapHintBubble = document.querySelector("#heatmapWrap .heatmap-v2__hint-bubble");
    if (!panel || !inner || !breakdown || !tabs || !heatmapHint || !heatmapHintBubble) {
      return { heatmapWithinPanel: false, rowParity: false, tabsSingleLine: false, hasHeatmapHint: false, hintFullyVisible: false };
    }
    const panelRect = panel.getBoundingClientRect();
    const innerRect = inner.getBoundingClientRect();
    const breakdownRect = breakdown.getBoundingClientRect();
    const tabsRect = tabs.getBoundingClientRect();
    const hintRect = heatmapHint.getBoundingClientRect();
    return {
      heatmapWithinPanel: innerRect.bottom <= panelRect.bottom + 1,
      rowParity: Math.abs(panelRect.height - breakdownRect.height) <= 2,
      tabsSingleLine: tabs.scrollHeight <= tabsRect.height + 1,
      hasHeatmapHint: (heatmapHintBubble.textContent || "").trim().length > 0,
      hintFullyVisible:
        hintRect.right <= panelRect.right + 1 &&
        hintRect.bottom <= panelRect.bottom + 1 &&
        hintRect.width >= 22 &&
        hintRect.height >= 22
    };
  });
  expect(analyticsGeometry.heatmapWithinPanel).toBeTruthy();
  expect(analyticsGeometry.rowParity).toBeTruthy();
  expect(analyticsGeometry.tabsSingleLine).toBeTruthy();
  expect(analyticsGeometry.hasHeatmapHint).toBeTruthy();
  expect(analyticsGeometry.hintFullyVisible).toBeTruthy();

  const heatmapHintOpensOnClick = await page.evaluate(() => {
    const hint = document.querySelector("#heatmapWrap .heatmap-v2__hint");
    const bubble = document.querySelector("#heatmapWrap .heatmap-v2__hint-bubble");
    if (!(hint instanceof HTMLElement) || !(bubble instanceof HTMLElement)) {
      return false;
    }
    hint.click();
    return (
      hint.getAttribute("aria-expanded") === "true" &&
      hint.classList.contains("is-open") &&
      bubble.classList.contains("is-open") &&
      !bubble.hasAttribute("hidden")
    );
  });
  expect(heatmapHintOpensOnClick).toBeTruthy();

  const heatmapHintClosesOnOutsideClick = await page.evaluate(() => {
    const hint = document.querySelector("#heatmapWrap .heatmap-v2__hint");
    const bubble = document.querySelector("#heatmapWrap .heatmap-v2__hint-bubble");
    if (!(hint instanceof HTMLElement) || !(bubble instanceof HTMLElement)) {
      return false;
    }
    document.body.click();
    return (
      hint.getAttribute("aria-expanded") === "false" &&
      !hint.classList.contains("is-open") &&
      !bubble.classList.contains("is-open") &&
      bubble.hasAttribute("hidden")
    );
  });
  expect(heatmapHintClosesOnOutsideClick).toBeTruthy();

  await page.locator("#analyticsViewForecastBtn").click();
  const forecastBalanced = await page.evaluate(() => {
    const main = document.querySelector("#forecastPanel .forecast-v3__main");
    const metrics = document.querySelector("#forecastPanel .forecast-v3__metrics");
    const categories = document.querySelector("#forecastPanel .forecast-v3__categories");
    const content = document.querySelector("#forecastPanel .forecast-v3__content");
    if (!main || !metrics || !categories || !content) {
      return false;
    }
    const after = getComputedStyle(content, "::after");
    const metricYs = Array.from(document.querySelectorAll("#forecastPanel .forecast-v3__metric"))
      .slice(0, 4)
      .map((el) => Math.round(el.getBoundingClientRect().y));
    return (
      getComputedStyle(content).gridTemplateColumns.split(" ").length === 2 &&
      after.content === "none" &&
      document.querySelectorAll("#forecastPanel .forecast-v3__metric").length === 6 &&
      new Set(metricYs.slice(0, 2)).size === 1 &&
      new Set(metricYs.slice(2, 4)).size === 1 &&
      metricYs[0] !== metricYs[2] &&
      document.querySelectorAll("#forecastPanel .forecast-v3__hero-stat").length === 2 &&
      document.querySelectorAll("#forecastPanel .forecast-v3__categories .forecast-v3__metric").length === 0 &&
      document.querySelectorAll("#forecastPanel .forecast-v3__categories .forecast-v3__row").length <= 6 &&
      main.getBoundingClientRect().width > categories.getBoundingClientRect().width * 0.9
    );
  });
  expect(forecastBalanced).toBeTruthy();
});

test("mobile navigation uses drawer, bottom nav, and FAB quick add without touching desktop flow", async ({ page }) => {
  const accessibilityWarnings = [];
  page.on("console", (message) => {
    const text = message.text();
    if (/Blocked aria-hidden on an element because its descendant retained focus/i.test(text)) {
      accessibilityWarnings.push(text);
    }
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await ensureDemoLogin(page);

  await expect(page.locator("#mobileTopbar")).toBeVisible();
  await expect(page.locator("#mobileNavToggleBtn")).toBeVisible();
  await expect(page.locator(".mobile-bottom-nav")).toBeVisible();
  await expect(page.locator("#mobileFabBtn")).toBeVisible();
  await expect(page.locator("#mobileFabBtn svg")).toBeVisible();

  const topbarClearOfHero = await page.evaluate(() => {
    const topbar = document.querySelector("#mobileTopbar");
    const hero = document.querySelector("#overviewTab .hero-strip");
    if (!(topbar instanceof HTMLElement) || !(hero instanceof HTMLElement)) {
      return false;
    }
    const topbarRect = topbar.getBoundingClientRect();
    const heroRect = hero.getBoundingClientRect();
    return heroRect.top >= topbarRect.bottom - 1;
  });
  expect(topbarClearOfHero).toBeTruthy();

  await page.locator("#mobileNavToggleBtn").click();
  await expect(page.locator("#appShell")).toHaveClass(/is-mobile-drawer-open/);
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator("#mobileTopbar")).toBeHidden();
  await expect(page.locator("#mobileNavToggleBtn")).toBeHidden();
  await page.mouse.click(360, 220);
  await expect(page.locator("#appShell")).not.toHaveClass(/is-mobile-drawer-open/);
  await expect(page.locator("#mobileTopbar")).toBeVisible();
  await expect(page.locator("#mobileNavToggleBtn")).toBeVisible();

  await page.locator(".mobile-bottom-nav [data-tab-target='analyticsTab']").click();
  await expect(page.locator("#analyticsTab")).toBeVisible();
  await expect(page.locator("#mobileFabBtn")).toBeHidden();
  await expect(page.locator("#mobileTopbarTitle")).toHaveText("Аналитика");
  await page.locator(".mobile-bottom-nav [data-tab-target='overviewTab']").click();
  await expect(page.locator("#overviewTab")).toBeVisible();
  await expect(page.locator("#mobileFabBtn")).toBeVisible();
  await expect(page.locator("#mobileTopbarTitle")).toHaveText("Бюджет");

  const beforeCounts = await page.evaluate(() => ({
    expenses: document.querySelectorAll("#expensesList .entry-row").length,
    limitsVisible: Boolean(document.querySelector("#budgetLimitList"))
  }));

  expect(beforeCounts.limitsVisible).toBeTruthy();

  await page.locator("#mobileFabBtn").click();
  await expect(page.locator("#mobileQuickSheet")).toBeVisible();
  await expect(page.locator("#mobileFabBtn")).toBeHidden();
  await expect(page.locator(".mobile-quick-sheet__icon svg")).toHaveCount(5);
  await expect(page.locator(".mobile-quick-sheet__icon svg").first()).toBeVisible();
  await page.locator('[data-action="mobile-quick-add"][data-section="expenses"]').click();

  await expect(page.locator("#appShell")).not.toHaveClass(/is-mobile-quick-open/);
  await expect(page.locator("#overviewTab")).toBeVisible();
  await expect(page.locator("#mobileFabBtn")).toBeVisible();
  await expect(page.locator("#expensesList .entry-row")).toHaveCount(beforeCounts.expenses + 1);
  expect(accessibilityWarnings).toEqual([]);
});

test("sidebar account modal and small dialogs keep clean left-aligned heads and close by backdrop", async ({ page }) => {
  await ensureDemoLogin(page);
  await page.setViewportSize({ width: 1440, height: 940 });

  await expect(page.locator("#syncPill")).toBeVisible();
  await page.locator("#accountBtn").click();
  await expect(page.locator("#accountMenuModal")).toHaveClass(/is-open/);

  const closeGeometry = await page.evaluate(() => {
    const dialog = document.querySelector("#accountMenuModal .modal__dialog--account");
    const close = document.querySelector("#accountMenuModal .modal__close");
    const eyebrow = document.querySelector("#accountMenuModal .modal__head .eyebrow");
    const title = document.querySelector("#accountMenuModal .modal__head h3");
    const subtext = document.querySelector("#accountMenuModal .modal__subtext");
    if (!(dialog instanceof HTMLElement) || !(close instanceof HTMLElement)) {
      return null;
    }
    const eyebrowRect = eyebrow instanceof HTMLElement ? eyebrow.getBoundingClientRect() : null;
    const titleRect = title instanceof HTMLElement ? title.getBoundingClientRect() : null;
    const subtextRect = subtext instanceof HTMLElement ? subtext.getBoundingClientRect() : null;
    const dialogRect = dialog.getBoundingClientRect();
    return {
      closeHidden: getComputedStyle(close).display === "none",
      textAligned:
        Boolean(eyebrowRect && titleRect && subtextRect) &&
        Math.abs(Math.round(eyebrowRect.left) - Math.round(titleRect.left)) <= 2 &&
        Math.abs(Math.round(titleRect.left) - Math.round(subtextRect.left)) <= 2 &&
        Math.round(titleRect.left - dialogRect.left) >= 20
    };
  });

  expect(closeGeometry?.closeHidden).toBeTruthy();
  expect(closeGeometry?.textAligned).toBeTruthy();

  await page.locator("#accountMenuModal .modal__backdrop").click({ position: { x: 16, y: 16 } });
  await expect(page.locator("#accountMenuModal")).not.toHaveClass(/is-open/);

  await page.locator('.sidebar [data-tab-target="settingsTab"]').click();
  await page.locator("#openCategoryCreateBtn").click();
  await expect(page.locator("#categoryModal")).toHaveClass(/is-open/);

  const smallModalCloseGeometry = await page.evaluate(() => {
    const dialog = document.querySelector("#categoryModal .modal__dialog--sm");
    const close = document.querySelector("#categoryModal .modal__close");
    const eyebrow = document.querySelector("#categoryModal .modal__head .eyebrow");
    const title = document.querySelector("#categoryModal .modal__head h3");
    if (!(dialog instanceof HTMLElement) || !(close instanceof HTMLElement)) {
      return null;
    }
    const dialogRect = dialog.getBoundingClientRect();
    const eyebrowRect = eyebrow instanceof HTMLElement ? eyebrow.getBoundingClientRect() : null;
    const titleRect = title instanceof HTMLElement ? title.getBoundingClientRect() : null;
    return {
      closeHidden: getComputedStyle(close).display === "none",
      textAligned:
        Boolean(eyebrowRect && titleRect) &&
        Math.abs(Math.round(eyebrowRect.left) - Math.round(titleRect.left)) <= 2 &&
        Math.round(titleRect.left - dialogRect.left) >= 18
    };
  });

  expect(smallModalCloseGeometry?.closeHidden).toBeTruthy();
  expect(smallModalCloseGeometry?.textAligned).toBeTruthy();

  await page.locator("#categoryModal .modal__backdrop").click({ position: { x: 16, y: 16 } });
  await expect(page.locator("#categoryModal")).not.toHaveClass(/is-open/);

  await page.locator('.sidebar [data-tab-target="overviewTab"]').click();
  await expect(page.locator("#overviewTab")).toBeVisible();
  await page.locator("#loadIncomeTemplateBtn").click();
  await expect(page.locator("#pickerModal")).toHaveClass(/is-open/);

  const pickerGeometry = await page.evaluate(() => {
    const dialog = document.querySelector("#pickerModal .modal__dialog--sm");
    const close = document.querySelector("#pickerModal .modal__close");
    const eyebrow = document.querySelector("#pickerModal .modal__head .eyebrow");
    const title = document.querySelector("#pickerModal .modal__head h3");
    const subtext = document.querySelector("#pickerModal .modal__subtext");
    const itemTitle = document.querySelector("#pickerModal .picker-item__body strong");
    const itemMeta = document.querySelector("#pickerModal .picker-item__body small");
    if (!(dialog instanceof HTMLElement) || !(close instanceof HTMLElement)) {
      return null;
    }
    const eyebrowRect = eyebrow instanceof HTMLElement ? eyebrow.getBoundingClientRect() : null;
    const titleRect = title instanceof HTMLElement ? title.getBoundingClientRect() : null;
    const subtextRect = subtext instanceof HTMLElement ? subtext.getBoundingClientRect() : null;
    const itemTitleRect = itemTitle instanceof HTMLElement ? itemTitle.getBoundingClientRect() : null;
    const itemMetaRect = itemMeta instanceof HTMLElement ? itemMeta.getBoundingClientRect() : null;
    const dialogRect = dialog.getBoundingClientRect();
    return {
      closeHidden: getComputedStyle(close).display === "none",
      headAligned:
        Boolean(eyebrowRect && titleRect && subtextRect) &&
        Math.abs(Math.round(eyebrowRect.left) - Math.round(titleRect.left)) <= 2 &&
        Math.abs(Math.round(titleRect.left) - Math.round(subtextRect.left)) <= 2,
      pickerTextAligned:
        Boolean(itemTitleRect && itemMetaRect) &&
        Math.abs(Math.round(itemTitleRect.left) - Math.round(itemMetaRect.left)) <= 2
    };
  });

  expect(pickerGeometry?.closeHidden).toBeTruthy();
  expect(pickerGeometry?.headAligned).toBeTruthy();
  expect(pickerGeometry?.pickerTextAligned).toBeTruthy();

  await page.locator("#pickerModal .modal__backdrop").click({ position: { x: 16, y: 16 } });
  await expect(page.locator("#pickerModal")).not.toHaveClass(/is-open/);
});

test("backup status uses the same surfaced UI layer as the rest of settings", async ({ page }) => {
  await ensureDemoLogin(page);
  await page.locator('.sidebar [data-tab-target="settingsTab"]').click();
  await expect(page.locator("#settingsTab")).toBeVisible();

  const backupStatusStyle = await page.evaluate(() => {
    UI.setBackupStatus("Резервная копия загружена. Бюджет уже на месте.", "success");
    const node = document.querySelector("#backupStatus");
    if (!(node instanceof HTMLElement)) {
      return null;
    }
    const style = getComputedStyle(node);
    return {
      hidden: node.hidden,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      borderRadius: style.borderRadius,
      paddingTop: style.paddingTop
    };
  });

  expect(backupStatusStyle?.hidden).toBeFalsy();
  expect(backupStatusStyle?.backgroundColor).not.toBe("rgb(0, 0, 0)");
  expect(backupStatusStyle?.backgroundImage).not.toBe("none");
  expect(backupStatusStyle?.borderRadius).toBe("14px");
  expect(Number.parseFloat(backupStatusStyle?.paddingTop || "0")).toBeGreaterThanOrEqual(10);
});
