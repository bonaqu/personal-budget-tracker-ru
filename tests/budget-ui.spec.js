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
  await page.locator(".sidebar [data-tab-target='overviewTab']").click();
  await expect(page.locator("#overviewTab")).toBeVisible();
}

async function seedStressBudgetRow(page) {
  await page.evaluate(() => {
    const row = document.querySelector(".journal-section .entry-row:not(.entry-row--wishlist)");
    if (!(row instanceof HTMLElement)) {
      return;
    }
    const transaction = Store.data.transactions.find((item) => item.id === row.dataset.entryId);
    if (!transaction) {
      return;
    }
    transaction.description = "Очень длинное описание тестовой операции для проверки того, как бюджетная строка ведет себя на разных разрешениях экрана без наложения, лишней высоты и разъезжающихся контролов.";
    UI.renderJournal();
  });
}

async function collectBudgetMetrics(page) {
  return page.evaluate(() => {
    const sampleAlignment = (row, selectors) => {
      if (!(row instanceof HTMLElement)) {
        return null;
      }
      const fieldRects = selectors
        .map((selector) => row.querySelector(selector))
        .filter((node) => node instanceof HTMLElement)
        .map((node) => node.getBoundingClientRect());
      const controlRects = selectors
        .map((selector) => row.querySelector(`${selector} .entry-field__control`))
        .filter((node) => node instanceof HTMLElement)
        .map((node) => node.getBoundingClientRect());
      if (!fieldRects.length || !controlRects.length) {
        return null;
      }
      const drift = (rects, key) => {
        const values = rects.map((rect) => Math.round(rect[key]));
        return Math.max(...values) - Math.min(...values);
      };
      return {
        fieldTopDrift: drift(fieldRects, "top"),
        fieldHeightDrift: drift(fieldRects, "height"),
        controlTopDrift: drift(controlRects, "top"),
        controlHeightDrift: drift(controlRects, "height")
      };
    };

    const rows = Array.from(document.querySelectorAll(".journal-section .entry-row"));
    const regularRows = rows.filter((row) => !row.classList.contains("entry-row--wishlist"));
    const wishlistRows = rows.filter((row) => row.classList.contains("entry-row--wishlist"));
    const dayControls = Array.from(document.querySelectorAll(".entry-day-control"));
    const dayInputs = Array.from(document.querySelectorAll(".entry-day-control > input[data-journal-field='day']"));
    const amountInputs = Array.from(document.querySelectorAll(".entry-field--amount input[data-journal-field='amount']"));
    const monthStartInput = document.querySelector("#monthStartInput");
    const monthStartWrap = document.querySelector(".field-affix-control--month-balance");
    const monthStartButton = monthStartWrap?.querySelector(".field-affix-control__button");
    const heroHeadline = document.querySelector(".hero-strip__headline");
    const main = document.querySelector(".budget-workspace__main");
    const side = document.querySelector(".budget-workspace__side");
    const journal = document.querySelector(".budget-workspace__journal");
    const dayControlWidths = dayControls.map((control) => control.getBoundingClientRect().width);
    const snapshotCards = Array.from(document.querySelectorAll('[data-budget-side-page="snapshot"] .summary-card'));
    const journalSections = {
      incomes: document.querySelector("#incomesList"),
      debts: document.querySelector("#debtsList"),
      recurring: document.querySelector("#recurringBudgetList"),
      expenses: document.querySelector("#expensesList"),
      wishlist: document.querySelector("#wishList")
    };

    return {
      summaryCardCount: document.querySelectorAll("#summaryGrid .summary-card").length,
      limitIndicatorCount: document.querySelectorAll(".entry-field__control--category.has-limit").length,
      regularRowHeights: regularRows.slice(0, 8).map((row) => Math.round(row.getBoundingClientRect().height)),
      wishlistRowHeights: wishlistRows.slice(0, 4).map((row) => Math.round(row.getBoundingClientRect().height)),
      hasDayPicker: Boolean(document.querySelector(".entry-day-picker")),
      dayInputType: dayInputs[0]?.getAttribute("type") || "",
      amountInputType: amountInputs[0]?.getAttribute("type") || "",
      monthStartInputType: monthStartInput?.getAttribute("type") || "",
      monthStartControl: monthStartWrap instanceof HTMLElement ? {
        wrapHeight: Math.round(monthStartWrap.getBoundingClientRect().height),
        inputHeight: monthStartInput instanceof HTMLElement ? Math.round(monthStartInput.getBoundingClientRect().height) : 0,
        buttonHeight: monthStartButton instanceof HTMLElement ? Math.round(monthStartButton.getBoundingClientRect().height) : 0
      } : null,
      templateActionCount: document.querySelectorAll("[data-journal-action='template']").length,
      minDayControlWidth: dayControlWidths.length ? Math.min(...dayControlWidths) : 0,
      snapshotCardHeights: snapshotCards.map((card) => Math.round(card.getBoundingClientRect().height)),
      snapshotCardOverflow: snapshotCards.map((card) => ({
        overflow: Math.max(0, Math.round(card.scrollHeight - card.clientHeight)),
        textOverflow: Array.from(card.querySelectorAll("span, small")).some((node) =>
          node instanceof HTMLElement && node.scrollHeight - node.clientHeight > 2
        )
      })),
      monthBalanceLegend: (() => {
        const root = document.querySelector("#monthBalanceLegend");
        if (!(root instanceof HTMLElement)) {
          return null;
        }
        const items = Array.from(root.querySelectorAll(".month-balance-legend__item"));
        return {
          count: items.length,
          labels: items.map((item) => item.querySelector(".month-balance-legend__label")?.textContent?.trim() || ""),
          dotsAreRound: items.every((item) => {
            const dot = item.querySelector(".month-balance-legend__dot");
            if (!(dot instanceof HTMLElement)) {
              return false;
            }
            const rect = dot.getBoundingClientRect();
            return Math.abs(rect.width - rect.height) <= 1;
          }),
          verticalCenterDelta: items.map((item) => {
            const dot = item.querySelector(".month-balance-legend__dot");
            const label = item.querySelector(".month-balance-legend__label");
            if (!(dot instanceof HTMLElement) || !(label instanceof HTMLElement)) {
              return 999;
            }
            const dotRect = dot.getBoundingClientRect();
            const labelRect = label.getBoundingClientRect();
            const dotCenter = dotRect.top + dotRect.height / 2;
            const labelCenter = labelRect.top + labelRect.height / 2;
            return Math.abs(Math.round(dotCenter - labelCenter));
          })
        };
      })(),
      heroHeadlineVisible: heroHeadline instanceof HTMLElement
        ? (() => {
            const rect = heroHeadline.getBoundingClientRect();
            const style = getComputedStyle(heroHeadline);
            return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.opacity !== "0";
          })()
        : false,
      sectionVisibility: Object.fromEntries(
        Object.entries(journalSections).map(([key, root]) => {
          const rows = Array.from(root?.querySelectorAll?.(".entry-row") || []);
          const visibleRows = rows.filter((row) => {
            if (!(row instanceof HTMLElement)) {
              return false;
            }
            const rect = row.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && getComputedStyle(row).visibility !== "hidden";
          });
          return [key, {
            count: rows.length,
            visible: visibleRows.length
          }];
        })
      ),
      budgetLayout: (() => {
        const mainRect = main?.getBoundingClientRect();
        const sideRect = side?.getBoundingClientRect();
        const journalRect = journal?.getBoundingClientRect();
        if (!mainRect || !sideRect || !journalRect) {
          return null;
        }
        return {
          sideHeightDelta: Math.abs(Math.round(sideRect.height) - Math.round(mainRect.height)),
          journalGap: Math.round(journalRect.top - mainRect.bottom)
        };
      })(),
      modalOpenCount: document.querySelectorAll(".modal.is-open").length,
      dragChecks: (() => {
        const blockedSelector = ".entry-field, input, textarea, select, option, button, a, summary, [contenteditable='true'], [data-journal-action], [data-action], [data-setting-action], [data-picker-toggle]";
        const row = document.querySelector(".journal-section .entry-row");
        if (!(row instanceof HTMLElement)) {
          return null;
        }
        const isBlocked = (element) => element instanceof HTMLElement && Boolean(
          element.closest(blockedSelector) || element.closest(".compact-textarea.is-editing")
        );
        return {
          field: isBlocked(row.querySelector(".entry-field")),
          dayInput: isBlocked(row.querySelector("[data-journal-field='day']")),
          desc: isBlocked(row.querySelector("[data-journal-field='description']")),
          category: isBlocked(row.querySelector(".category-trigger")),
          deleteButton: isBlocked(row.querySelector("[data-journal-action='delete']")),
          rowGap: isBlocked(row)
        };
      })(),
      rowAlignment: {
        regular: regularRows.slice(0, 5).map((row) => sampleAlignment(row, [
          ".entry-field--day",
          ".entry-field--amount",
          ".entry-field--desc",
          ".entry-field--category",
          ".entry-field--actions"
        ])).filter(Boolean),
        wishlist: wishlistRows.slice(0, 3).map((row) => sampleAlignment(row, [
          ".entry-field--desc",
          ".entry-field--amount",
          ".entry-field--actions"
        ])).filter(Boolean)
      },
      firstRegularRow: (() => {
        const row = regularRows[0];
        if (!(row instanceof HTMLElement)) {
          return null;
        }
        const partHeight = (selector) => {
          const node = row.querySelector(selector);
          return node instanceof HTMLElement ? Math.round(node.getBoundingClientRect().height) : null;
        };
        return {
          rowHeight: Math.round(row.getBoundingClientRect().height),
          texts: {
            descLabel: row.querySelector(".entry-field--desc .entry-field__label")?.textContent?.trim() || "",
            categoryLabel: row.querySelector(".entry-field--category .entry-field__label")?.textContent?.trim() || "",
            deleteLabel: row.querySelector('[data-journal-action="delete"]')?.getAttribute("aria-label") || ""
          },
          fieldHeights: {
            day: partHeight(".entry-field--day"),
            amount: partHeight(".entry-field--amount"),
            desc: partHeight(".entry-field--desc"),
            category: partHeight(".entry-field--category"),
            actions: partHeight(".entry-field--actions")
          },
          topDeltas: (() => {
            const dayControl = row.querySelector(".entry-field--day .entry-field__control");
            const actionControl = row.querySelector(".entry-field--actions .entry-field__control");
            const actionButtons = row.querySelector(".entry-actions__buttons");
            if (!(dayControl instanceof HTMLElement) || !(actionControl instanceof HTMLElement)) {
              return null;
            }
            const actionGap = actionButtons instanceof HTMLElement
              ? Math.max(0, Math.round(actionControl.getBoundingClientRect().width - actionButtons.getBoundingClientRect().width))
              : null;
            return {
              actionToDay: Math.round(actionControl.getBoundingClientRect().top - dayControl.getBoundingClientRect().top),
              actionGap
            };
          })()
        };
      })()
    };
  });
}

test("budget rows stay compact and readable across widths", async ({ page }) => {
  await ensureDemoLogin(page);
  await seedStressBudgetRow(page);

  for (const viewport of [
    { width: 1440, height: 940, regularMax: 72, wishlistMax: 60, actionDeltaMax: 2, alignmentDriftMax: 2 },
    { width: 1180, height: 860, regularMax: 72, wishlistMax: 60, actionDeltaMax: 2, alignmentDriftMax: 2 },
    { width: 980, height: 860, regularMax: 108, wishlistMax: 64, actionDeltaMax: 2, alignmentDriftMax: 2 },
    { width: 800, height: 800, regularMax: 140, wishlistMax: 64, actionDeltaMax: 2, alignmentDriftMax: null },
    { width: 860, height: 860, regularMax: 84, wishlistMax: 64, actionDeltaMax: 2, alignmentDriftMax: 2 },
    { width: 1500, height: 900, regularMax: 72, wishlistMax: 60, actionDeltaMax: 2, alignmentDriftMax: 2 }
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(20);
    const earlyMetrics = await collectBudgetMetrics(page);
    expect(earlyMetrics.heroHeadlineVisible).toBeTruthy();
    Object.values(earlyMetrics.sectionVisibility).forEach((section) => {
      expect(section.count).toBeGreaterThan(0);
      expect(section.visible).toBe(section.count);
    });
    await page.waitForTimeout(140);
    if (viewport.width > 1280) {
      await page.waitForFunction(() => {
        const main = document.querySelector(".budget-workspace__main");
        const side = document.querySelector(".budget-workspace__side");
        if (!(main instanceof HTMLElement) || !(side instanceof HTMLElement)) {
          return false;
        }
        return main.getBoundingClientRect().height > 0 && side.getBoundingClientRect().height > 0;
      }, { timeout: 3000 });
      await page.waitForTimeout(220);
    }

    const metrics = await collectBudgetMetrics(page);
    expect(metrics.hasDayPicker).toBeTruthy();
    expect(metrics.dayInputType).toBe("text");
    expect(metrics.amountInputType).toBe("text");
    expect(metrics.monthStartInputType).toBe("text");
    expect(metrics.templateActionCount).toBeGreaterThan(0);
    expect(metrics.heroHeadlineVisible).toBeTruthy();
    expect(metrics.summaryCardCount).toBe(6);
    expect(metrics.limitIndicatorCount).toBeGreaterThan(0);
    expect(metrics.minDayControlWidth).toBeGreaterThanOrEqual(46);
    if (viewport.width <= 820) {
      expect(metrics.minDayControlWidth).toBeLessThanOrEqual(90);
    } else {
      expect(metrics.minDayControlWidth).toBeLessThanOrEqual(58);
    }
    expect(metrics.monthStartControl).not.toBeNull();
    expect(Math.abs((metrics.monthStartControl?.wrapHeight ?? 0) - (metrics.monthStartControl?.inputHeight ?? 0))).toBeLessThanOrEqual(4);
    expect(Math.abs((metrics.monthStartControl?.wrapHeight ?? 0) - (metrics.monthStartControl?.buttonHeight ?? 0))).toBeLessThanOrEqual(4);
    if (viewport.width === 1440 && metrics.monthBalanceLegend) {
      expect(metrics.monthBalanceLegend).not.toBeNull();
      expect(metrics.monthBalanceLegend?.count).toBe(2);
      expect(metrics.monthBalanceLegend?.labels).toEqual(["Баланс", "Чистое движение за день"]);
      expect(metrics.monthBalanceLegend?.dotsAreRound).toBeTruthy();
      metrics.monthBalanceLegend?.verticalCenterDelta.forEach((delta) => {
        expect(delta).toBeLessThanOrEqual(1);
      });
    }
    if (viewport.width > 1280 && metrics.snapshotCardHeights.length) {
      expect(Math.max(...metrics.snapshotCardHeights)).toBeLessThanOrEqual(190);
      expect(Math.min(...metrics.snapshotCardHeights)).toBeGreaterThanOrEqual(108);
      expect(Math.max(...metrics.snapshotCardHeights) - Math.min(...metrics.snapshotCardHeights)).toBeLessThanOrEqual(6);
      metrics.snapshotCardOverflow.forEach((card) => {
        expect(card.overflow).toBeLessThanOrEqual(2);
        expect(card.textOverflow).toBeFalsy();
      });
    }
    if (viewport.width > 1280 && metrics.budgetLayout) {
      expect(metrics.budgetLayout.journalGap).toBeLessThanOrEqual(24);
      expect(metrics.budgetLayout.sideHeightDelta).toBeLessThanOrEqual(10);
    }
    expect(Math.max(...metrics.regularRowHeights)).toBeLessThanOrEqual(viewport.regularMax);
    if (metrics.wishlistRowHeights.length) {
      expect(Math.max(...metrics.wishlistRowHeights)).toBeLessThanOrEqual(viewport.wishlistMax);
    }
    expect(Math.abs(metrics.firstRegularRow?.topDeltas?.actionToDay ?? 0)).toBeLessThanOrEqual(viewport.actionDeltaMax);
    expect(metrics.firstRegularRow?.topDeltas?.actionGap ?? 0).toBeLessThanOrEqual(10);
    expect(metrics.firstRegularRow?.texts?.descLabel).toBe("Описание");
    expect(metrics.firstRegularRow?.texts?.categoryLabel).toBe("Категория");
    expect(metrics.firstRegularRow?.texts?.deleteLabel).toBe("Удалить");
    Object.values(metrics.sectionVisibility).forEach((section) => {
      expect(section.count).toBeGreaterThan(0);
      expect(section.visible).toBe(section.count);
    });
    if (typeof viewport.alignmentDriftMax === "number") {
      [...metrics.rowAlignment.regular, ...metrics.rowAlignment.wishlist].forEach((alignment) => {
        expect(alignment.fieldTopDrift).toBeLessThanOrEqual(viewport.alignmentDriftMax);
        expect(alignment.fieldHeightDrift).toBeLessThanOrEqual(viewport.alignmentDriftMax);
        expect(alignment.controlTopDrift).toBeLessThanOrEqual(viewport.alignmentDriftMax);
        expect(alignment.controlHeightDrift).toBeLessThanOrEqual(viewport.alignmentDriftMax);
      });
    }
  }
});

test("budget mobile layout stays stable across common phone widths", async ({ page }) => {
  await ensureDemoLogin(page);

  for (const viewport of [
    { width: 320, height: 740 },
    { width: 360, height: 760 },
    { width: 360, height: 800 },
    { width: 393, height: 852 },
    { width: 412, height: 915 },
    { width: 430, height: 932 },
    { width: 480, height: 1066 },
    { width: 700, height: 800 },
    { width: 720, height: 800 },
    { width: 750, height: 800 }
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(80);

    const metrics = await page.evaluate(() => {
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const focusRoot = document.querySelector("#overviewCategoryLegend");
      const focusCards = Array.from(document.querySelectorAll("#overviewCategoryLegend .budget-limit-card"));
      const limitCards = Array.from(document.querySelectorAll("#budgetLimitList .budget-limit-card"));
      const summaryCards = Array.from(document.querySelectorAll("#summaryGrid .summary-card"));
      const firstFocus = focusCards[0];
      const firstLimit = limitCards[0];
      const focusRect = firstFocus instanceof HTMLElement ? firstFocus.getBoundingClientRect() : null;
      const limitRect = firstLimit instanceof HTMLElement ? firstLimit.getBoundingClientRect() : null;
      const focusRootRect = focusRoot instanceof HTMLElement ? focusRoot.getBoundingClientRect() : null;
      const scrollWidth = Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth
      );

      return {
        horizontalOverflow: Math.max(0, Math.round(scrollWidth - window.innerWidth)),
        bottomNavVisible: isVisible(document.querySelector(".mobile-bottom-nav")),
        fabVisible: isVisible(document.querySelector("#mobileFabBtn")),
        summaryCount: summaryCards.length,
        focusCount: focusCards.length,
        limitCount: limitCards.length,
        focusHeights: focusCards.slice(0, 6).map((card) => Math.round(card.getBoundingClientRect().height)),
        focusOverflow: focusCards.some((card) => card.scrollWidth - card.clientWidth > 2),
        focusLimitDelta: focusRect && limitRect
          ? Math.abs(Math.round(focusRect.height) - Math.round(limitRect.height))
          : 999,
        focusRightGap: focusRect && focusRootRect
          ? Math.round(focusRootRect.right - focusRect.right)
          : 0
      };
    });

    expect(metrics.horizontalOverflow).toBeLessThanOrEqual(2);
    expect(metrics.bottomNavVisible).toBeTruthy();
    expect(metrics.fabVisible).toBeTruthy();
    expect(metrics.summaryCount).toBe(6);
    expect(metrics.focusCount).toBeGreaterThan(0);
    expect(metrics.focusCount).toBeLessThanOrEqual(5);
    expect(metrics.limitCount).toBeGreaterThan(0);
    expect(metrics.limitCount).toBeLessThanOrEqual(5);
    expect(metrics.focusOverflow).toBeFalsy();
    expect(metrics.focusLimitDelta).toBeLessThanOrEqual(10);
    expect(metrics.focusRightGap).toBeGreaterThanOrEqual(12);
    metrics.focusHeights.forEach((height) => {
      expect(height).toBeLessThanOrEqual(122);
    });
  }
});

test("budget rows keep the stacked readable layout on 700-750 narrow widths", async ({ page }) => {
  await ensureDemoLogin(page);
  await seedStressBudgetRow(page);

  for (const viewport of [
    { width: 700, height: 800 },
    { width: 720, height: 800 },
    { width: 750, height: 800 }
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(120);

    const metrics = await page.evaluate(() => {
      const row = document.querySelector(".journal-section .entry-row:not(.entry-row--wishlist)");
      if (!(row instanceof HTMLElement)) {
        return null;
      }
      const day = row.querySelector(".entry-field--day .entry-field__control");
      const amount = row.querySelector(".entry-field--amount .entry-field__control");
      const desc = row.querySelector(".entry-field--desc");
      const category = row.querySelector(".entry-field--category");
      const actions = row.querySelector(".entry-field--actions .entry-field__control");
      if (!(day instanceof HTMLElement) || !(amount instanceof HTMLElement) || !(desc instanceof HTMLElement) || !(category instanceof HTMLElement) || !(actions instanceof HTMLElement)) {
        return null;
      }

      const rowRect = row.getBoundingClientRect();
      const dayRect = day.getBoundingClientRect();
      const amountRect = amount.getBoundingClientRect();
      const descRect = desc.getBoundingClientRect();
      const categoryRect = category.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();

      return {
        rowHeight: Math.round(rowRect.height),
        topRowDrift: Math.max(dayRect.top, amountRect.top, actionsRect.top) - Math.min(dayRect.top, amountRect.top, actionsRect.top),
        descBelowTopRow: descRect.top >= Math.max(dayRect.bottom, amountRect.bottom, actionsRect.bottom) - 1,
        categoryBelowDesc: categoryRect.top >= descRect.bottom - 1,
        descNearFullWidth: Math.round(descRect.width) >= Math.round(rowRect.width) - 18,
        categoryNearFullWidth: Math.round(categoryRect.width) >= Math.round(rowRect.width) - 18
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics?.rowHeight ?? 0).toBeLessThanOrEqual(156);
    expect(metrics?.topRowDrift ?? 99).toBeLessThanOrEqual(2);
    expect(metrics?.descBelowTopRow ?? false).toBeTruthy();
    expect(metrics?.categoryBelowDesc ?? false).toBeTruthy();
    expect(metrics?.descNearFullWidth ?? false).toBeTruthy();
    expect(metrics?.categoryNearFullWidth ?? false).toBeTruthy();
  }
});

test("budget rows do not open the edit modal and drag is blocked on active areas", async ({ page }) => {
  await ensureDemoLogin(page);
  await page.setViewportSize({ width: 1440, height: 940 });

  const firstRow = page.locator(".journal-section .entry-row").first();
  await firstRow.click({ position: { x: 8, y: 8 } });

  const metrics = await collectBudgetMetrics(page);
  expect(metrics.modalOpenCount).toBe(0);
  expect(metrics.dragChecks).not.toBeNull();
  expect(metrics.dragChecks.field).toBeTruthy();
  expect(metrics.dragChecks.dayInput).toBeTruthy();
  expect(metrics.dragChecks.desc).toBeTruthy();
  expect(metrics.dragChecks.category).toBeTruthy();
  expect(metrics.dragChecks.deleteButton).toBeTruthy();
  expect(metrics.dragChecks.rowGap).toBeFalsy();
});

test("budget day and amount fields stay manual, left-aligned, and template buckets are exposed", async ({ page }) => {
  await ensureDemoLogin(page);
  await page.setViewportSize({ width: 1440, height: 940 });

  const budgetState = await page.evaluate(() => {
    const firstRow = document.querySelector(".journal-section .entry-row:not(.entry-row--wishlist)");
    const dayInput = firstRow?.querySelector('[data-journal-field="day"]');
    const dayButton = firstRow?.querySelector('[data-journal-action="pick-day"]');
    const dayPad = document.querySelector("#budgetDayPad");
    const amountInput = firstRow?.querySelector('[data-journal-field="amount"]');
    const amountPadButton = firstRow?.querySelector('[data-journal-action="open-amount-keypad"]');
    const categoryTrigger = firstRow?.querySelector(".category-trigger");
    const categoryLabel = firstRow?.querySelector(".category-trigger__label");
    const descInput = firstRow?.querySelector('[data-journal-field="description"]');
    const monthStartInput = document.querySelector("#monthStartInput");
    const monthStartPadButton = document.querySelector('[data-journal-action="open-amount-keypad"][data-numpad-target-id="monthStartInput"]');
    const loadIncomeTemplateBtn = document.querySelector("#loadIncomeTemplateBtn");
    const loadDebtTemplateBtn = document.querySelector("#loadDebtTemplateBtn");
    const loadRecurringTemplateBtn = document.querySelector("#loadTemplateBtn");
    const settingsQuickButtons = Array.from(document.querySelectorAll("[data-settings-quick]")).map((button) => button.textContent.trim());

    return {
      dayInputType: dayInput?.getAttribute("type") || "",
      amountInputType: amountInput?.getAttribute("type") || "",
      monthStartInputType: monthStartInput?.getAttribute("type") || "",
      dayInputTextAlign: dayInput ? getComputedStyle(dayInput).textAlign : "",
      amountInputTextAlign: amountInput ? getComputedStyle(amountInput).textAlign : "",
      descInputTextAlign: descInput ? getComputedStyle(descInput).textAlign : "",
      categoryTextAlign: categoryLabel ? getComputedStyle(categoryLabel).textAlign : "",
      monthStartTextAlign: monthStartInput ? getComputedStyle(monthStartInput).textAlign : "",
      dayControlWidth: dayInput?.closest(".entry-day-control") instanceof HTMLElement
        ? Math.round(dayInput.closest(".entry-day-control").getBoundingClientRect().width)
        : 0,
      dayButtonWidth: dayButton ? Math.round(dayButton.getBoundingClientRect().width) : 0,
      dayButtonHeight: dayButton ? Math.round(dayButton.getBoundingClientRect().height) : 0,
      hasDayButton: Boolean(dayButton),
      hasDayPad: Boolean(dayPad),
      hasAmountPadButton: Boolean(amountPadButton),
      hasMonthStartPadButton: Boolean(monthStartPadButton),
      loadIncomeTemplateLabel: loadIncomeTemplateBtn?.textContent?.trim() || "",
      loadDebtTemplateLabel: loadDebtTemplateBtn?.textContent?.trim() || "",
      loadRecurringTemplateLabel: loadRecurringTemplateBtn?.textContent?.trim() || "",
      settingsQuickButtons
    };
  });

  expect(budgetState.dayInputType).toBe("text");
  expect(budgetState.amountInputType).toBe("text");
  expect(budgetState.monthStartInputType).toBe("text");
  expect(budgetState.dayInputTextAlign).toBe("left");
  expect(budgetState.amountInputTextAlign).toBe("left");
  expect(budgetState.descInputTextAlign).toBe("left");
  expect(budgetState.categoryTextAlign).toBe("left");
  expect(budgetState.monthStartTextAlign).toBe("left");
  expect(budgetState.dayControlWidth).toBeGreaterThanOrEqual(46);
  expect(budgetState.dayControlWidth).toBeLessThanOrEqual(72);
  expect(budgetState.dayButtonWidth).toBeGreaterThanOrEqual(16);
  expect(budgetState.dayButtonWidth).toBeLessThanOrEqual(20);
  expect(budgetState.dayButtonHeight).toBeGreaterThanOrEqual(28);
  expect(budgetState.hasDayButton).toBeTruthy();
  expect(budgetState.hasDayPad).toBeTruthy();
  expect(budgetState.hasAmountPadButton).toBeTruthy();
  expect(budgetState.hasMonthStartPadButton).toBeTruthy();
  expect(budgetState.loadIncomeTemplateLabel).toBe("Из шаблона доходов");
  expect(budgetState.loadDebtTemplateLabel).toBe("Из шаблона долговых обязательств");
  expect(budgetState.loadRecurringTemplateLabel).toBe("Из шаблона регулярных платежей");
  expect(budgetState.settingsQuickButtons).toEqual([
    "Шаблоны регулярных платежей",
    "Шаблоны доходов",
    "Шаблоны долговых обязательств",
    "Избранное"
  ]);

  const firstDayInput = page.locator('.journal-section .entry-row:not(.entry-row--wishlist) [data-journal-field="day"]').first();
  await firstDayInput.click({ position: { x: 8, y: 16 } });
  await expect(firstDayInput).toBeFocused();
  await firstDayInput.fill("17");
  await firstDayInput.press("Tab");
  await expect(firstDayInput).toHaveValue("17");

  const firstAmountInput = page.locator('.journal-section .entry-row:not(.entry-row--wishlist) [data-journal-field="amount"]').first();
  await firstAmountInput.fill("1234,56");
  await firstAmountInput.press("Tab");
  await expect(firstAmountInput).toHaveValue("1234.56");

  const firstAmountPadButton = page.locator('.journal-section .entry-row:not(.entry-row--wishlist) [data-journal-action="open-amount-keypad"]').first();
  await firstAmountPadButton.click();
  await expect(page.locator("#budgetAmountPad")).toBeVisible();
  await page.locator('[data-budget-numpad-action="clear"]').click();
  await page.locator('[data-budget-numpad-key="1"]').click();
  await page.locator('[data-budget-numpad-key="2"]').click();
  await page.locator('[data-budget-numpad-key="3"]').click();
  await page.locator('[data-budget-numpad-key=","]').click();
  await page.locator('[data-budget-numpad-key="4"]').click();
  await page.locator('[data-budget-numpad-action="backspace"]').click();
  await page.locator('[data-budget-numpad-key="5"]').click();
  await page.mouse.click(20, 20);
  await expect(page.locator("#budgetAmountPad")).toBeHidden();
  await expect(firstAmountInput).toHaveValue("123.5");

  const monthStartInput = page.locator("#monthStartInput");
  const monthStartPadButton = page.locator('[data-journal-action="open-amount-keypad"][data-numpad-target-id="monthStartInput"]');
  await page.locator("#manualStartCheck").check();
  await monthStartPadButton.click();
  await expect(page.locator("#budgetAmountPad")).toBeVisible();
  await page.locator('[data-budget-numpad-action="clear"]').click();
  await page.locator('[data-budget-numpad-key="6"]').click();
  await page.locator('[data-budget-numpad-key="7"]').click();
  await page.locator('[data-budget-numpad-key="8"]').click();
  await page.locator('[data-budget-numpad-key="9"]').click();
  await page.locator('[data-budget-numpad-key="0"]').click();
  await page.locator('[data-budget-numpad-key=","]').click();
  await page.locator('[data-budget-numpad-key="1"]').click();
  await page.locator('[data-budget-numpad-key="2"]').click();
  await page.mouse.click(20, 20);
  await expect(page.locator("#budgetAmountPad")).toBeHidden();
  await expect(monthStartInput).toHaveValue("67890.12");

  await page.locator('.journal-section .entry-row:not(.entry-row--wishlist) [data-journal-action="pick-day"]').first().click();
  await expect(page.locator("#budgetDayPad")).toBeVisible();
  await expect(page.locator("#budgetDayPadTodayBtn")).toHaveText("Сегодня");
  await expect(page.locator(".budget-daypad__day").first()).toHaveCSS("height", "21px");
  await page.locator('[data-budget-day-value="21"]').click();
  await expect(page.locator("#budgetDayPad")).toBeHidden();
  await expect(firstDayInput).toHaveValue("21");

  const firstDescInput = page.locator('.journal-section .entry-row:not(.entry-row--wishlist) [data-journal-field="description"]').first();
  const secondDayInput = page.locator('.journal-section .entry-row:not(.entry-row--wishlist) [data-journal-field="day"]').nth(1);

  await firstDayInput.focus();
  await firstDayInput.press("Enter");
  await expect(firstAmountInput).toBeFocused();
  await firstAmountInput.press("Enter");
  await expect(firstDescInput).toBeFocused();
  await firstDescInput.press("Enter");
  await expect(secondDayInput).toBeFocused();
});

test("settings quick scenarios show newest items at the top", async ({ page }) => {
  await ensureDemoLogin(page);
  await page.setViewportSize({ width: 1720, height: 980 });

  const labels = await page.evaluate(() => {
    const incomeCategoryId = Store.getCategories("income")[0]?.id || "inc_other";
    const expenseCategoryId = Store.getCategories("expense")[0]?.id || "exp_other";
    const recurringCategoryId = Store.getDefaultCategoryId("recurring");

    for (let index = 0; index < 8; index += 1) {
      Store.saveTemplate({
        kind: "template",
        bucket: "income",
        desc: `__income_${index}__`,
        amount: 1100 + index,
        type: "income",
        categoryId: incomeCategoryId,
        flowKind: "standard"
      });
      Store.saveTemplate({
        kind: "favorite",
        desc: `__favorite_${index}__`,
        amount: 2200 + index,
        type: "expense",
        categoryId: expenseCategoryId,
        flowKind: "standard"
      });
    }
    Store.saveTemplate({
      kind: "template",
      bucket: "recurring",
      desc: "__recurring_latest__",
      amount: 3300,
      type: "expense",
      categoryId: recurringCategoryId,
      flowKind: "recurring"
    });
    UI.renderQuickSettings();
    return true;
  });

  expect(labels).toBeTruthy();
  await page.locator('.sidebar [data-tab-target="settingsTab"]').click();

  const getQuickLayoutMetrics = async () => page.locator("#manageQuickList").evaluate((root) => {
    const panel = document.querySelector(".settings-panel--quick");
    const switchRoot = panel?.querySelector(".settings-quick-switch");
    const settingsTab = document.querySelector("#settingsTab");
    const first = root.querySelector(".quick-card, .empty-state");
    if (!(root instanceof HTMLElement) || !(panel instanceof HTMLElement) || !(switchRoot instanceof HTMLElement)) {
      return null;
    }
    return {
      rootScrollTop: root.scrollTop,
      panelScrollTop: panel.scrollTop,
      tabScrollTop: settingsTab instanceof HTMLElement ? settingsTab.scrollTop : 0,
      firstOffset: first instanceof HTMLElement
        ? Math.round(first.getBoundingClientRect().top - root.getBoundingClientRect().top)
        : null,
      switchOffset: Math.round(switchRoot.getBoundingClientRect().top - panel.getBoundingClientRect().top),
      cardWidths: Array.from(root.querySelectorAll(".quick-card"))
        .slice(0, 4)
        .map((card) => Math.round(card.getBoundingClientRect().width))
    };
  });

  await page.locator("#settingsQuickIncomeBtn").click();
  await expect(page.locator("#manageQuickList .quick-card").first()).toContainText("__income_7__");
  const incomeMetrics = await getQuickLayoutMetrics();
  expect(incomeMetrics?.rootScrollTop).toBe(0);
  expect(incomeMetrics?.panelScrollTop).toBe(0);
  expect(incomeMetrics?.tabScrollTop).toBe(0);
  expect(incomeMetrics?.firstOffset).toBeLessThanOrEqual(14);
  await page.evaluate(() => {
    const root = document.querySelector("#manageQuickList");
    if (root instanceof HTMLElement) {
      root.scrollTop = 9999;
    }
  });

  await page.locator("#settingsQuickTemplatesBtn").click();
  await expect(page.locator("#manageQuickList .quick-card").first()).toContainText("__recurring_latest__");
  const recurringMetrics = await getQuickLayoutMetrics();
  expect(recurringMetrics?.rootScrollTop).toBe(0);
  expect(recurringMetrics?.panelScrollTop).toBe(0);
  expect(recurringMetrics?.tabScrollTop).toBe(0);
  expect(recurringMetrics?.firstOffset).toBeLessThanOrEqual(14);
  expect(Math.abs((recurringMetrics?.switchOffset ?? 0) - (incomeMetrics?.switchOffset ?? 0))).toBeLessThanOrEqual(2);
  expect(Math.max(...(recurringMetrics?.cardWidths || [0])) - Math.min(...(recurringMetrics?.cardWidths || [0]))).toBeLessThanOrEqual(2);

  await page.locator("#settingsQuickFavoritesBtn").click();
  await expect(page.locator("#manageQuickList .quick-card").first()).toContainText("__favorite_7__");
  const favoriteMetrics = await getQuickLayoutMetrics();
  expect(favoriteMetrics?.rootScrollTop).toBe(0);
  expect(favoriteMetrics?.panelScrollTop).toBe(0);
  expect(favoriteMetrics?.tabScrollTop).toBe(0);
  expect(favoriteMetrics?.firstOffset).toBeLessThanOrEqual(14);
  expect(Math.abs((favoriteMetrics?.switchOffset ?? 0) - (incomeMetrics?.switchOffset ?? 0))).toBeLessThanOrEqual(2);
  expect(Math.max(...(favoriteMetrics?.cardWidths || [0])) - Math.min(...(favoriteMetrics?.cardWidths || [0]))).toBeLessThanOrEqual(2);

  await page.locator("#settingsQuickIncomeBtn").click();
  await expect(page.locator("#manageQuickList .quick-card").first()).toContainText("__income_7__");
  const incomeAgainMetrics = await getQuickLayoutMetrics();
  expect(incomeAgainMetrics?.rootScrollTop).toBe(0);
  expect(incomeAgainMetrics?.panelScrollTop).toBe(0);
  expect(incomeAgainMetrics?.tabScrollTop).toBe(0);
  expect(incomeAgainMetrics?.firstOffset).toBeLessThanOrEqual(14);
  expect(Math.abs((incomeAgainMetrics?.switchOffset ?? 0) - (incomeMetrics?.switchOffset ?? 0))).toBeLessThanOrEqual(2);
  expect(Math.max(...(incomeAgainMetrics?.cardWidths || [0])) - Math.min(...(incomeAgainMetrics?.cardWidths || [0]))).toBeLessThanOrEqual(2);
  await page.locator("#settingsQuickTemplatesBtn").click();
  await expect(page.locator("#manageQuickList .quick-card").first()).toContainText("__recurring_latest__");
  const recurringAgainMetrics = await getQuickLayoutMetrics();
  expect(recurringAgainMetrics?.rootScrollTop).toBe(0);
  expect(recurringAgainMetrics?.panelScrollTop).toBe(0);
  expect(recurringAgainMetrics?.tabScrollTop).toBe(0);
  expect(recurringAgainMetrics?.firstOffset).toBeLessThanOrEqual(14);
  expect(Math.abs((recurringAgainMetrics?.switchOffset ?? 0) - (incomeMetrics?.switchOffset ?? 0))).toBeLessThanOrEqual(2);
  expect(Math.max(...(recurringAgainMetrics?.cardWidths || [0])) - Math.min(...(recurringAgainMetrics?.cardWidths || [0]))).toBeLessThanOrEqual(2);
});

test("budget side panel becomes a pager on wide desktop", async ({ page }) => {
  await ensureDemoLogin(page);
  await page.setViewportSize({ width: 1440, height: 940 });
  await page.waitForTimeout(520);

  const waitForStablePagerHeight = async () => {
    await page.waitForFunction(() => {
      const panel = document.querySelector(".budget-side-panel");
      if (!(panel instanceof HTMLElement)) {
        return false;
      }
      const currentHeight = panel.getBoundingClientRect().height;
      const previousHeight = Number(panel.dataset.testStableHeight || 0);
      panel.dataset.testStableHeight = String(currentHeight);
      return previousHeight > 0 && Math.abs(previousHeight - currentHeight) <= 0.75;
    }, { timeout: 4000 });
  };

  const pagerState = async () => page.evaluate(() => {
    const panel = document.querySelector(".budget-side-panel");
    const pager = document.querySelector("#budgetSidePager");
    const activeSections = Array.from(document.querySelectorAll(".budget-side-panel [data-budget-side-page].is-active"));
    const snapshot = document.querySelector('.budget-side-panel [data-budget-side-page="snapshot"]');
    const activeSection = activeSections[0];
    const activeSectionStyle = activeSection ? getComputedStyle(activeSection) : null;
    const panelRect = panel?.getBoundingClientRect();
    const activeRect = activeSection?.getBoundingClientRect();
    const visibleSummaryCards = Array.from(snapshot?.querySelectorAll?.(".summary-card") || []).filter((card) => {
      if (!(card instanceof HTMLElement) || !(snapshot instanceof HTMLElement)) {
        return false;
      }
      const cardRect = card.getBoundingClientRect();
      const snapshotRect = snapshot.getBoundingClientRect();
      return cardRect.top >= snapshotRect.top - 1 && cardRect.bottom <= snapshotRect.bottom + 1;
    }).length;
    return {
      isPaged: panel?.classList.contains("is-paged") || false,
      pagerHidden: pager?.hasAttribute("hidden") ?? true,
      activeCount: activeSections.length,
      visibleSummaryCards,
      panelHeight: Math.round(panel?.getBoundingClientRect().height || 0),
      activeSectionHeight: Math.round(activeSection?.getBoundingClientRect().height || 0),
      activeSectionBorderTop: activeSectionStyle?.borderTopWidth || "",
      activeSectionHasShadow: Boolean(activeSectionStyle?.boxShadow && activeSectionStyle.boxShadow !== "none"),
      activeBottomOverflow: panelRect && activeRect ? Math.max(0, Math.round(activeRect.bottom - panelRect.bottom)) : 0
    };
  });

  await waitForStablePagerHeight();
  let state = await pagerState();
  expect(state.isPaged).toBeTruthy();
  expect(state.pagerHidden).toBeFalsy();
  expect(state.activeCount).toBe(1);
  expect(state.visibleSummaryCards).toBe(6);
  expect(state.activeSectionBorderTop).toBe("0px");
  expect(state.activeSectionHasShadow).toBeFalsy();
  expect(state.activeBottomOverflow).toBeLessThanOrEqual(1);
  const initialPanelHeight = state.panelHeight;

  await page.locator("#budgetSideNextBtn").click();
  await page.waitForTimeout(360);
  await waitForStablePagerHeight();
  state = await pagerState();
  expect(state.activeCount).toBe(1);
  expect(Math.abs(state.panelHeight - initialPanelHeight)).toBeLessThanOrEqual(2);
  expect(state.activeSectionBorderTop).toBe("0px");
  expect(state.activeSectionHasShadow).toBeFalsy();
  expect(state.activeBottomOverflow).toBeLessThanOrEqual(1);

  await page.locator("#budgetSideNextBtn").click();
  await page.waitForTimeout(360);
  await waitForStablePagerHeight();
  state = await pagerState();
  expect(state.activeCount).toBe(1);
  expect(Math.abs(state.panelHeight - initialPanelHeight)).toBeLessThanOrEqual(2);
  expect(state.activeSectionBorderTop).toBe("0px");
  expect(state.activeSectionHasShadow).toBeFalsy();
  expect(state.activeBottomOverflow).toBeLessThanOrEqual(1);
});

test("budget side section titles keep the same top rhythm on narrow layout", async ({ page }) => {
  await ensureDemoLogin(page);
  await page.setViewportSize({ width: 800, height: 800 });
  await page.waitForTimeout(320);

  const metrics = await page.evaluate(() => {
    const readInset = (sectionSel, titleSel) => {
      const section = document.querySelector(sectionSel);
      const title = document.querySelector(titleSel);
      if (!(section instanceof HTMLElement) || !(title instanceof HTMLElement)) {
        return null;
      }
      const sectionRect = section.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      return {
        inset: Number((titleRect.top - sectionRect.top).toFixed(2)),
        titleHeight: Number(titleRect.height.toFixed(2))
      };
    };
    return {
      snapshot: readInset(".budget-side-panel__section--snapshot", ".budget-side-panel__section--snapshot .budget-side-panel__title"),
      focus: readInset(".budget-side-panel__section--focus", ".budget-side-panel__section--focus .budget-side-panel__title"),
      limits: readInset(".budget-side-panel__section--limits", ".budget-side-panel__section--limits .budget-side-panel__title")
    };
  });

  expect(metrics.snapshot).not.toBeNull();
  expect(metrics.focus).not.toBeNull();
  expect(metrics.limits).not.toBeNull();
  expect(Math.abs((metrics.snapshot?.inset ?? 0) - (metrics.focus?.inset ?? 0))).toBeLessThanOrEqual(2);
  expect(Math.abs((metrics.snapshot?.inset ?? 0) - (metrics.limits?.inset ?? 0))).toBeLessThanOrEqual(2);
});

test("budget narrow-desktop layout keeps the hero period compact and fits focus-limits cards", async ({ page }) => {
  await ensureDemoLogin(page);
  await page.setViewportSize({ width: 800, height: 800 });
  await page.waitForTimeout(320);

  const metrics = await page.evaluate(() => {
    const header = document.querySelector(".hero-strip--compact .hero-strip__header-row");
    const period = document.querySelector(".hero-strip--compact .hero-strip__period");
    const focusList = document.querySelector("#overviewCategoryLegend");
    const limitList = document.querySelector("#budgetLimitList");
    const sidePanel = document.querySelector(".budget-side-panel");
    return {
      headerColumns: header instanceof HTMLElement ? getComputedStyle(header).gridTemplateColumns : "",
      period: period instanceof HTMLElement ? {
        width: Math.round(period.getBoundingClientRect().width),
        display: getComputedStyle(period).display
      } : null,
      sideColumns: sidePanel instanceof HTMLElement ? getComputedStyle(sidePanel).gridTemplateColumns : "",
      focus: focusList instanceof HTMLElement ? {
        clientHeight: Math.round(focusList.clientHeight),
        scrollHeight: Math.round(focusList.scrollHeight),
        count: focusList.children.length,
        overflowY: getComputedStyle(focusList).overflowY
      } : null,
      limits: limitList instanceof HTMLElement ? {
        clientHeight: Math.round(limitList.clientHeight),
        scrollHeight: Math.round(limitList.scrollHeight),
        count: limitList.children.length,
        overflowY: getComputedStyle(limitList).overflowY
      } : null
    };
  });

  expect(metrics.headerColumns).not.toBe("637px");
  expect(metrics.period).not.toBeNull();
  expect(metrics.period?.display).toBe("flex");
  expect(metrics.period?.width ?? 0).toBeLessThanOrEqual(140);
  expect(metrics.sideColumns).toBeTruthy();
  expect(metrics.sideColumns).not.toContain(" ");
  expect(metrics.focus).not.toBeNull();
  expect(metrics.limits).not.toBeNull();
  expect(metrics.focus?.count).toBe(5);
  expect(metrics.limits?.count).toBe(5);
  expect((metrics.focus?.scrollHeight ?? 0) - (metrics.focus?.clientHeight ?? 0)).toBeLessThanOrEqual(1);
  expect((metrics.limits?.scrollHeight ?? 0) - (metrics.limits?.clientHeight ?? 0)).toBeLessThanOrEqual(1);
  expect(metrics.focus?.overflowY).toBe("hidden");
  expect(metrics.limits?.overflowY).toBe("hidden");
});
