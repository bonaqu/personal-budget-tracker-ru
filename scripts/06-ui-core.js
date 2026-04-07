const UI = {
  charts: {
    flow: null,
    category: null,
    monthBalance: null
  },
  chartResizeFrame: 0,
  chartLibraryPromise: null,
  chartWarmupScheduled: false,
  chartSizeCache: new WeakMap(),
  flowChartSignature: "",
  categoryChartSignature: "",
  appliedTheme: "",
  monthTrendCollapsed: true,
  budgetFiltersCollapsed: true,
  goalsPanelCollapsed: false,
  analyticsAdvancedView: "deep",
  calendarSelectedDate: "",
  heatmapMonth: "",
  tagsSearchQuery: "",
  selectedTagName: "",
  settingsQuickMode: "template",
  journalSectionSorts: {
    incomes: "date-desc",
    debts: "date-desc",
    recurring: "date-desc",
    expenses: "date-desc"
  },
  pickerState: {
    kind: null,
    ids: new Set(),
    context: null
  },
  syncChoiceResolver: null,
  modalFocusRestore: new Map(),
  dragState: {
    id: null,
    section: null
  },

  prefersReducedMotion() {
    return typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  },

  getFocusableElements(root) {
    if (!(root instanceof HTMLElement)) {
      return [];
    }
    return Array.from(root.querySelectorAll(
      "button:not([disabled]), [href], input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    )).filter((element) => {
      if (!(element instanceof HTMLElement) || element.hasAttribute("hidden") || element.closest("[hidden]")) {
        return false;
      }
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && element.getClientRects().length > 0;
    });
  },

  getOpenModal() {
    return document.querySelector(".modal.is-open");
  },

  focusModalPrimary(modal) {
    if (!(modal instanceof HTMLElement)) {
      return;
    }
    const focusables = this.getFocusableElements(modal);
    if (!focusables.length) {
      return;
    }
    const preferred = focusables.find((element) =>
      element.matches("input:not([type='hidden']), textarea, select, button:not(.modal__close)")
    ) || focusables[0];
    try {
      preferred.focus({ preventScroll: true });
    } catch {
      preferred.focus();
    }
  },

  trapModalFocus(event) {
    if (event.key !== "Tab") {
      return false;
    }
    const modal = this.getOpenModal();
    if (!(modal instanceof HTMLElement)) {
      return false;
    }
    const focusables = this.getFocusableElements(modal);
    if (!focusables.length) {
      event.preventDefault();
      return true;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return true;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
      return true;
    }
    return false;
  },

  isOverviewChartVisible() {
    return Store.activeTab === "overviewTab" && !this.monthTrendCollapsed;
  },

  shouldRunChartResize() {
    return Store.activeTab === "analyticsTab" || this.isOverviewChartVisible();
  },

  toggleMonthTrend(forceValue = null) {
    this.monthTrendCollapsed = forceValue === null ? !this.monthTrendCollapsed : Boolean(forceValue);
    Storage.writeText(CONFIG.MONTH_TREND_KEY, this.monthTrendCollapsed ? "1" : "0");
    this.renderMonthPlan();
    this.scheduleChartResize();
    if (Store.activeTab === "overviewTab") {
      if (this.monthTrendCollapsed && this.charts.monthBalance) {
        this.charts.monthBalance.destroy();
        this.charts.monthBalance = null;
      } else {
        this.ensureChartsReady().then(() => {
          if (this.isOverviewChartVisible()) {
            this.renderMonthBalanceChart();
          }
        }).catch(() => {});
      }
    }
  },

  ensureGoalsPanelControls() {
    const panel = Utils.$("goalsPanel");
    const head = panel?.querySelector(".panel__head");
    const toggle = Utils.$("goalPanelToggleBtn");
    if (head && toggle && toggle.parentElement !== head) {
      head.appendChild(toggle);
      toggle.classList.remove("is-hidden");
    }
  },

  toggleGoalsPanel(forceValue = null) {
    this.goalsPanelCollapsed = forceValue === null ? !this.goalsPanelCollapsed : Boolean(forceValue);
    Storage.writeText(CONFIG.GOALS_PANEL_KEY, this.goalsPanelCollapsed ? "1" : "0");
    this.renderGoalsPanelState();
  },

  renderGoalsPanelState() {
    this.ensureGoalsPanelControls();
    const panel = Utils.$("goalsPanel");
    const list = Utils.$("goalList");
    const toggle = Utils.$("goalPanelToggleBtn");
    if (panel) {
      panel.classList.toggle("is-collapsed", this.goalsPanelCollapsed);
    }
    if (list) {
      list.classList.toggle("is-collapsed", this.goalsPanelCollapsed);
      list.hidden = this.goalsPanelCollapsed;
      list.setAttribute("aria-hidden", String(this.goalsPanelCollapsed));
    }
    if (toggle) {
      toggle.textContent = this.goalsPanelCollapsed ? "Развернуть" : "Свернуть";
      toggle.setAttribute("aria-expanded", String(!this.goalsPanelCollapsed));
    }
  },

  setAnalyticsAdvancedView(view) {
    if (!["deep", "forecast", "recurring"].includes(view)) {
      return;
    }
    this.analyticsAdvancedView = view;
    if (Store.activeTab === "analyticsTab") {
      this.renderAnalyticsAdvancedContent(view);
    }
    this.renderAnalyticsAdvancedState();
  },

  renderAnalyticsAdvancedContent(view = this.analyticsAdvancedView) {
    if (view === "forecast") {
      this.renderForecast();
      return;
    }
    if (view === "recurring") {
      this.renderRecurring();
      return;
    }
    this.renderDeepStats();
  },

  renderAnalyticsAdvancedState() {
    const body = Utils.$("analyticsAdvancedBody");
    if (!body) {
      return;
    }
    body.querySelectorAll("[data-analytics-pane]").forEach((pane) => {
      const isActive = pane.dataset.analyticsPane === this.analyticsAdvancedView;
      pane.id ||= `analyticsPane${pane.dataset.analyticsPane?.charAt(0).toUpperCase()}${pane.dataset.analyticsPane?.slice(1)}`;
      pane.setAttribute("role", "tabpanel");
      pane.hidden = !isActive;
      pane.classList.toggle("is-active", isActive);
      pane.setAttribute("aria-hidden", String(!isActive));
    });
    document.querySelectorAll("[data-analytics-view]").forEach((button) => {
      const isActive = button.dataset.analyticsView === this.analyticsAdvancedView;
      const paneId = `analyticsPane${button.dataset.analyticsView?.charAt(0).toUpperCase()}${button.dataset.analyticsView?.slice(1)}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", paneId);
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.setAttribute("tabindex", isActive ? "0" : "-1");
    });
  },

  renderGoalColorValue() {
    this.renderColorFieldValue("goalColorInput", "goalColorValue");
  },

  renderTagColorValue() {
    this.renderColorFieldValue("tagColorInput", "tagColorValue");
  },

  setTagSearchQuery(value = "") {
    this.tagsSearchQuery = String(value || "").trim();
    if (Store.activeTab === "tagsTab") {
      this.renderTagStats();
      this.renderTagCatalog();
      this.renderTagGroups();
    }
  },

  setSettingsQuickMode(mode = "template") {
    const nextMode = mode === "favorite" ? "favorite" : "template";
    this.settingsQuickMode = nextMode;
    try {
      sessionStorage.setItem("settingsQuickMode", nextMode);
    } catch {}
    if (Store.activeTab === "settingsTab") {
      this.renderQuickSettings();
      UI.setSettingsStatus(nextMode === "favorite" ? "Показано избранное." : "Показаны шаблоны.", "info");
    }
  },

  getJournalSectionSortMode(section) {
    const mode = this.journalSectionSorts?.[section];
    return ["date-desc", "date-asc"].includes(mode) ? mode : "date-desc";
  },

  toggleJournalSectionSort(section) {
    if (!["incomes", "debts", "recurring", "expenses"].includes(section)) {
      return;
    }
    const currentMode = this.getJournalSectionSortMode(section);
    this.journalSectionSorts[section] = currentMode === "date-desc" ? "date-asc" : "date-desc";
    Storage.writeText(CONFIG.JOURNAL_SORT_KEY, JSON.stringify(this.journalSectionSorts));
    Store.sortSectionTransactions(section, currentMode);
  },

  renderJournalSortButtons() {
    document.querySelectorAll("[data-section-sort-btn]").forEach((button) => {
      const section = button.dataset.sectionSortBtn || "";
      const mode = this.getJournalSectionSortMode(section);
      const isAsc = mode === "date-asc";
      button.classList.toggle("is-active", true);
      button.classList.toggle("is-manual", false);
      button.title = isAsc ? "Одноразово показать старые даты сверху" : "Одноразово показать новые даты сверху";
      button.setAttribute(
        "aria-label",
        isAsc
          ? "Одноразовая сортировка по дате: старые сверху"
          : "Одноразовая сортировка по дате: новые сверху"
      );
      button.setAttribute("aria-pressed", "false");
      const icon = button.querySelector(".journal-sort-inline__icon");
      if (icon) {
        icon.textContent = isAsc ? "↑" : "↓";
      } else {
        button.textContent = isAsc ? "↑" : "↓";
      }
    });
  },

  getVisibleTagCatalog() {
    const tags = Store.getTagCatalog();
    const query = Utils.normalizeLookupKey(this.tagsSearchQuery);
    if (!query) {
      return tags;
    }
    return tags.filter((tag) => {
      const haystack = [
        tag.name,
        tag.note,
        Store.tagUsageDetails(tag.name, Store.viewMonth)?.expenseCategories?.map((item) => item.name).join(" ")
      ].filter(Boolean).join(" ");
      return Utils.normalizeLookupKey(haystack).includes(query);
    });
  },

  resolveSelectedTagName(visibleTags) {
    const current = Utils.normalizeTags(this.selectedTagName)[0] || "";
    if (current && visibleTags.some((tag) => tag.name === current)) {
      return current;
    }
    const monthGroups = Store.tagGroups(Store.viewMonth);
    const firstActive = monthGroups.find((group) => visibleTags.some((tag) => tag.name === group.tag));
    const fallback = firstActive?.tag || visibleTags[0]?.name || "";
    this.selectedTagName = fallback;
    return fallback;
  },

  syncGoalModeFields() {
    const mode = Utils.$("goalModeInput")?.value || "balance";
    const savedField = Utils.$("goalSavedField");
    const tagField = Utils.$("goalTagField");
    if (savedField) {
      savedField.classList.toggle("is-hidden", mode !== "saved");
    }
    if (tagField) {
      tagField.classList.toggle("is-hidden", mode !== "tag");
    }
  },

  handleEnterAdvance(event) {
    if (event.key !== "Enter" || event.shiftKey || event.altKey) {
      return false;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const form = target.closest("form, .entry-row");
    if (!form) {
      return false;
    }
    if (target.tagName === "TEXTAREA") {
      if (!(event.ctrlKey || event.metaKey)) {
        return false;
      }
    }

    const focusables = Array.from(form.querySelectorAll("input, select, textarea, button"))
      .filter((element) => !element.disabled && element.type !== "hidden" && element.tabIndex !== -1 && element.offsetParent !== null);
    if (!focusables.length) {
      return false;
    }
    const currentIndex = focusables.indexOf(target);
    if (currentIndex === -1) {
      return false;
    }

    event.preventDefault();
    const next = focusables[currentIndex + 1];
    if (next) {
      next.focus();
      if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) {
        next.select?.();
      }
      return true;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton instanceof HTMLElement) {
      submitButton.click();
      return true;
    }
    if (form instanceof HTMLFormElement) {
      form.requestSubmit?.();
      return true;
    }
    return false;
  },

  init() {
    this.monthTrendCollapsed = Storage.readText(CONFIG.MONTH_TREND_KEY, "1") !== "0";
    this.budgetFiltersCollapsed = Storage.readText(CONFIG.BUDGET_FILTERS_KEY, "1") !== "0";
    this.goalsPanelCollapsed = Storage.readText(CONFIG.GOALS_PANEL_KEY, "0") === "1";
    try {
      const savedSorts = JSON.parse(Storage.readText(CONFIG.JOURNAL_SORT_KEY, "{}"));
        this.journalSectionSorts = {
          incomes: ["date-desc", "date-asc"].includes(savedSorts.incomes) ? savedSorts.incomes : "date-desc",
          debts: ["date-desc", "date-asc"].includes(savedSorts.debts) ? savedSorts.debts : "date-desc",
          recurring: ["date-desc", "date-asc"].includes(savedSorts.recurring) ? savedSorts.recurring : "date-desc",
          expenses: ["date-desc", "date-asc"].includes(savedSorts.expenses) ? savedSorts.expenses : "date-desc"
        };
      } catch {
        this.journalSectionSorts = {
          incomes: "date-desc",
          debts: "date-desc",
          recurring: "date-desc",
          expenses: "date-desc"
        };
      }
    this.applySidebarState(true);
    this.bindEvents();
    this.ensureGoalsPanelControls();
    this.renderGoalsPanelState();
    this.setupAutoResize();
  },

  bindEvents() {
    const on = (id, eventName, handler) => {
      const element = Utils.$(id);
      if (element) {
        element.addEventListener(eventName, handler);
      }
    };
    const bindAuthEnter = (id, source) => {
      on(id, "keydown", (event) => {
        if (
          event.key === "Enter" &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey
        ) {
          event.preventDefault();
          App.authenticate(source, "login");
        }
      });
    };

    on("themeToggleBtn", "click", () => App.toggleTheme());
    on("sidebarToggleBtn", "click", () => this.toggleSidebar());
    on("prevMonthBtn", "click", () => App.shiftMonth(-1));
    on("nextMonthBtn", "click", () => App.shiftMonth(1));
    on("todayBtn", "click", () => App.goToCurrentMonth());
    on("monthStartInput", "change", (event) => App.updateMonthStart(event.target.value));
    on("manualStartCheck", "change", (event) => App.toggleManualMonthStart(event.target.checked));
    on("monthTrendToggleBtn", "click", () => this.toggleMonthTrend());
    on("goalPanelToggleBtn", "click", () => this.toggleGoalsPanel());
    on("editTransactionForm", "submit", (event) => {
      event.preventDefault();
      App.saveEditedTransaction();
    });
    on("categoryForm", "submit", (event) => {
      event.preventDefault();
      App.saveCategory();
    });
    on("templateForm", "submit", (event) => {
      event.preventDefault();
      App.saveTemplate();
    });
    on("goalForm", "submit", (event) => {
      event.preventDefault();
      App.saveGoal();
    });
    on("tagForm", "submit", (event) => {
      event.preventDefault();
      App.saveTag();
    });
    on("transactionTagsForm", "submit", (event) => {
      event.preventDefault();
      App.saveTransactionTags();
    });
    on("startupAuthForm", "submit", (event) => {
      event.preventDefault();
      App.authenticate("startup", "login");
    });
    on("modalAuthForm", "submit", (event) => {
      event.preventDefault();
      App.authenticate("modal", "login");
    });
    on("startupRegisterBtn", "click", () => App.authenticate("startup", "register"));
    on("modalRegisterBtn", "click", () => App.authenticate("modal", "register"));
    bindAuthEnter("startupLogin", "startup");
    bindAuthEnter("startupPassword", "startup");
    bindAuthEnter("modalLogin", "modal");
    bindAuthEnter("modalPassword", "modal");
    on("editTypeSwitch", "change", () => this.renderEditCategories());
    on("templateTypeInput", "change", () => {
      App.syncTemplateFormState();
      this.renderTemplateCategories();
    });
    on("budgetFilterToggleBtn", "click", () => this.toggleBudgetFilters());
    on("listSummary", "click", () => this.toggleBudgetFilters());
    on("filterPeriod", "change", (event) => App.updateFilter("period", event.target.value));
    on("filterType", "change", (event) => {
      App.updateFilter("type", event.target.value);
      App.updateFilter("categoryId", "all");
      this.renderFilterCategories();
    });
    on("filterCategory", "change", (event) => App.updateFilter("categoryId", event.target.value));
    on("sortSelect", "change", (event) => App.updateFilter("sort", event.target.value));
    on("searchInput", "input", (event) => App.updateFilter("search", event.target.value));
    on("tagSearchInput", "input", (event) => UI.setTagSearchQuery(event.target.value));
    on("filterDateFrom", "change", (event) => App.updateFilter("dateFrom", event.target.value));
    on("filterDateTo", "change", (event) => App.updateFilter("dateTo", event.target.value));
    on("accountBtn", "click", () => App.openAccountEntry());
    on("undoBtn", "click", () => App.undo());
    on("redoBtn", "click", () => App.redo());
    on("exportBtn", "click", () => App.exportBackup());
    on("importBtn", "click", () => Utils.$("importFileInput")?.click());
    on("importFileInput", "change", (event) => App.importBackup(event));
    on("openCategoryCreateBtn", "click", () => App.openCategoryModal());
    on("deleteCategoryBtn", "click", () => App.deleteCurrentCategory());
    on("loadTemplateBtn", "click", () => App.openPicker("templates"));
    on("loadFavoriteBtn", "click", () => App.openPicker("favorites"));
    on("settingsQuickCreateBtn", "click", () => App.createQuickItem(this.settingsQuickMode));
    on("settingsQuickTemplatesBtn", "click", () => this.setSettingsQuickMode("template"));
    on("settingsQuickFavoritesBtn", "click", () => this.setSettingsQuickMode("favorite"));
    on("createTagBtn", "click", () => App.openTagModal());
    on("deleteGoalBtn", "click", () => App.deleteCurrentGoal());
    on("deleteTagBtn", "click", () => App.deleteCurrentTag());
    on("pickerApplyBtn", "click", () => App.applyPickerSelection());
    on("accountSyncNowBtn", "click", () => App.syncNow());
    on("accountLogoutBtn", "click", () => App.logout());
    on("accountPasswordInfoBtn", "click", () => UI.toast("Смена пароля появится после обновления API.", "info"));
    on("syncChoiceKeepLocalBtn", "click", () => App.resolveSyncChoice("local"));
    on("syncChoiceUseCloudBtn", "click", () => App.resolveSyncChoice("cloud"));
    on("syncChoiceCancelBtn", "click", () => App.resolveSyncChoice("cancel"));
    on("editCategoryTriggerBtn", "click", () => App.openEditFormCategoryPicker());
    on("templateCategoryTriggerBtn", "click", () => App.openTemplateFormCategoryPicker());
    on("categoryColorInput", "input", () => this.renderCategoryColorValue());
    on("goalColorInput", "input", () => this.renderGoalColorValue());
    on("tagColorInput", "input", () => this.renderTagColorValue());
    on("goalModeInput", "change", () => this.syncGoalModeFields());

    document.querySelectorAll("[data-tab-target]").forEach((button) => {
      button.addEventListener("click", () => App.switchTab(button.dataset.tabTarget));
    });

      document.addEventListener("click", (event) => {
        const passwordToggle = event.target.closest("[data-password-toggle]");
        if (passwordToggle) {
          UI.togglePasswordVisibility(passwordToggle.dataset.passwordToggle, passwordToggle);
          return;
        }

        const analyticsViewButton = event.target.closest("[data-analytics-view]");
        if (analyticsViewButton) {
          this.setAnalyticsAdvancedView(analyticsViewButton.dataset.analyticsView);
          return;
        }

      const closeTarget = event.target.closest("[data-close-modal]");
      if (closeTarget) {
        if (closeTarget.dataset.closeModal === "syncChoiceModal") {
          App.resolveSyncChoice("cancel");
          return;
        }
        this.closeModal(closeTarget.dataset.closeModal);
      }

      const actionButton = event.target.closest("[data-action]");
      if (actionButton) {
        const { action, id, month } = actionButton.dataset;
        if (action === "edit-transaction") {
          App.openEditTransaction(id);
        }
        if (action === "delete-transaction") {
          App.deleteTransaction(id);
        }
        if (action === "edit-category") {
          App.openCategoryModal(id);
        }
        if (action === "delete-category") {
          App.deleteCategory(id);
        }
        if (action === "apply-template") {
          App.applyTemplate(id);
        }
        if (action === "open-month") {
          App.openMonth(month);
        }
        if (action === "logout") {
          App.logout();
        }
        if (action === "connect-account") {
          this.openModal("authModal");
        }
        if (action === "edit-goal") {
          App.openGoalModal(id);
        }
        if (action === "delete-goal") {
          App.deleteGoal(id);
        }
        if (action === "create-goal-inline") {
          App.openGoalModal();
        }
        if (action === "edit-tag") {
          App.openTagModal(id);
        }
        if (action === "select-tag") {
          UI.selectedTagName = actionButton.dataset.tag || "";
          UI.renderTagCatalog();
          UI.renderTagGroups();
        }
        if (action === "filter-tag") {
          App.openTagInBudget(actionButton.dataset.tag || "");
        }
        if (action === "open-tag-transaction") {
          App.openTransactionInBudget(id);
        }
        if (action === "open-payment-transaction") {
          App.openTransactionInBudget(id);
        }
        if (action === "open-recurring-budget") {
          App.openRecurringInBudget(actionButton.dataset.query || "");
        }
        if (action === "select-calendar-day") {
          const nextDate = actionButton.dataset.date || "";
          if (!nextDate || nextDate === this.calendarSelectedDate) {
            return;
          }
          actionButton.blur?.();
          this.calendarSelectedDate = nextDate;
          const paymentCalendarRoot = Utils.$("paymentCalendar");
          const calendar = Store.paymentCalendar(Store.viewMonth);
          this.updatePaymentCalendarSelection(paymentCalendarRoot, nextDate);
          this.renderPaymentCalendarDetail(paymentCalendarRoot, calendar, nextDate);
        }
        if (action === "shift-heatmap-month") {
          App.shiftHeatmapMonth(Number(actionButton.dataset.delta || 0));
        }
      }

      const journalAction = event.target.closest("[data-journal-action]");
      if (journalAction) {
        App.handleJournalAction(journalAction);
      }

      const settingAction = event.target.closest("[data-setting-action]");
      if (settingAction) {
        App.handleSettingsAction(settingAction);
      }

      const pickerToggle = event.target.closest("[data-picker-toggle]");
      if (pickerToggle) {
        App.togglePickerItem(pickerToggle.dataset.pickerToggle);
      }

      const tagSuggestion = event.target.closest("[data-tag-suggestion]");
      if (tagSuggestion) {
        App.toggleTransactionTagSuggestion(tagSuggestion.dataset.tagSuggestion);
      }
    });

    document.addEventListener("submit", (event) => {
      const form = event.target.closest("form");
      if (form?.id === "transactionForm") {
        event.preventDefault();
        App.createTransaction();
      }
    });

    document.addEventListener("change", (event) => {
      if (event.target.closest("#typeSwitch")) {
        this.renderFormCategories();
      }
      const field = event.target.closest("[data-journal-field]");
      if (field) {
        App.handleJournalField(field);
      }
      const settingField = event.target.closest("[data-setting-field]");
      if (settingField) {
        App.handleSettingsField(settingField);
      }

    });

    document.addEventListener("dragstart", (event) => {
      const row = event.target.closest("[draggable='true'][data-entry-id]");
      if (!row) {
        return;
      }
      this.dragState.id = row.dataset.entryId;
      this.dragState.section = row.dataset.section;
      row.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
      }
    });

    document.addEventListener("dragend", (event) => {
      const row = event.target.closest("[draggable='true'][data-entry-id]");
      if (row) {
        row.classList.remove("is-dragging");
      }
      document.querySelectorAll(".entry-row.is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
      this.dragState.id = null;
      this.dragState.section = null;
    });

    document.addEventListener("dragover", (event) => {
      const row = event.target.closest("[draggable='true'][data-entry-id]");
      if (!row || !this.dragState.id || row.dataset.section !== this.dragState.section) {
        return;
      }
      event.preventDefault();
      document.querySelectorAll(".entry-row.is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
      if (row.dataset.entryId !== this.dragState.id) {
        row.classList.add("is-drop-target");
      }
    });

    document.addEventListener("drop", (event) => {
      const row = event.target.closest("[draggable='true'][data-entry-id]");
      if (!row || !this.dragState.id || row.dataset.section !== this.dragState.section) {
        return;
      }
      event.preventDefault();
      row.classList.remove("is-drop-target");
      if (row.dataset.entryId !== this.dragState.id) {
        App.reorderSection(row.dataset.section, this.dragState.id, row.dataset.entryId);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (this.handleEnterAdvance(event)) {
        return;
      }
      if (this.trapModalFocus(event)) {
        return;
      }
      const analyticsTabButton = event.target instanceof HTMLElement ? event.target.closest("[data-analytics-view]") : null;
      if (analyticsTabButton && ["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
        const buttons = Array.from(document.querySelectorAll("[data-analytics-view]"));
        const currentIndex = buttons.indexOf(analyticsTabButton);
        if (currentIndex >= 0) {
          event.preventDefault();
          const nextIndex = event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
          const nextButton = buttons[nextIndex];
          if (nextButton instanceof HTMLElement) {
            this.setAnalyticsAdvancedView(nextButton.dataset.analyticsView || "deep");
            nextButton.focus();
          }
          return;
        }
      }
      const quickSwitchButton = event.target instanceof HTMLElement ? event.target.closest("[data-settings-quick]") : null;
      if (quickSwitchButton && ["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
        const buttons = Array.from(document.querySelectorAll("[data-settings-quick]"));
        const currentIndex = buttons.indexOf(quickSwitchButton);
        if (currentIndex >= 0) {
          event.preventDefault();
          const nextIndex = event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
          const nextButton = buttons[nextIndex];
          if (nextButton instanceof HTMLElement) {
            this.setSettingsQuickMode(nextButton.dataset.settingsQuick || "template");
            nextButton.focus();
          }
          return;
        }
      }
      const isTypingTarget = event.target instanceof HTMLElement && (
        event.target.closest("input, textarea, select, [contenteditable='true']")
      );
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !isTypingTarget) {
        const key = String(event.key || "").toLowerCase();
        if (key === "z" && !event.shiftKey) {
          event.preventDefault();
          App.undo();
          return;
        }
        if (key === "y" || (key === "z" && event.shiftKey)) {
          event.preventDefault();
          App.redo();
          return;
        }
      }
      if (event.key === "Escape") {
        App.resolveSyncChoice("cancel");
        this.closeModals();
        this.closeSidebar();
      }
    });

    document.addEventListener("dblclick", (event) => {
      const row = event.target.closest(".entry-row[data-entry-id][data-section]");
      if (!row || row.dataset.section === "wishlist") {
        return;
      }
      App.openEditTransaction(row.dataset.entryId);
    });

    window.setInterval(() => this.renderSyncState(), 60000);
  },
};
