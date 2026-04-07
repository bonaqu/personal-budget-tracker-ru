Object.assign(UI, {
  getBudgetCategoryFallback(type = "expense") {
    return type === "income" ? "Категория дохода" : "Категория расхода";
  },

  resolveBudgetCategorySelection(type, currentValue = "", selectedId = null) {
    const categories = Store.getCategories(type);
    const preferredId = selectedId || currentValue || "";
    const nextId = categories.some((category) => category.id === preferredId)
      ? preferredId
      : (categories[0]?.id || "");
    return { categories, nextId };
  },

  syncBudgetCategoryField({ inputId, triggerId = "", type = "expense", selectedId = null, flowKindInputId = "" }) {
    const input = Utils.$(inputId);
    if (!input) {
      return { categories: [], nextId: "" };
    }
    const { categories, nextId } = this.resolveBudgetCategorySelection(type, input.value, selectedId);
    input.value = nextId;
    if (triggerId) {
      this.setCategoryTrigger(triggerId, nextId, this.getBudgetCategoryFallback(type));
    }
    if (flowKindInputId) {
      const flowKindInput = Utils.$(flowKindInputId);
      if (flowKindInput) {
        flowKindInput.disabled = type === "income";
        if (type === "income") {
          flowKindInput.value = "standard";
        }
      }
    }
    return { categories, nextId };
  },

  setBudgetText(target, text) {
    const node = typeof target === "string" ? Utils.$(target) : target;
    if (node) {
      node.textContent = text;
    }
    return node;
  },

  setBudgetAmountState(target, value) {
    const node = typeof target === "string" ? Utils.$(target) : target;
    if (node) {
      node.textContent = Utils.formatMoney(value);
      node.className = value >= 0 ? "amount-positive" : "amount-negative";
    }
    return node;
  },

  setBudgetHelp(target, text) {
    const node = typeof target === "string" ? Utils.$(target) : target;
    Utils.setHelpText(node, text);
  },

  renderFormCategories() {
    const type = document.querySelector('input[name="transactionType"]:checked')?.value || "expense";
    const input = Utils.$("categoryInput");
    const currentCategory = Store.getCategory(input?.value || "");
    const selectedId = currentCategory?.type === type ? input.value : null;
    this.syncBudgetCategoryField({
      inputId: "categoryInput",
      type,
      selectedId,
      flowKindInputId: "flowKindInput"
    });
  },

  renderEditCategories(selectedId = null, selectedType = null) {
    const type = selectedType || document.querySelector('input[name="editTransactionType"]:checked')?.value || "expense";
    this.syncBudgetCategoryField({
      inputId: "editCategoryInput",
      triggerId: "editCategoryTriggerBtn",
      type,
      selectedId,
      flowKindInputId: "editFlowKindInput"
    });
  },

  renderTemplateCategories(selectedId = null) {
    const typeInput = Utils.$("templateTypeInput");
    if (!typeInput) {
      return;
    }
    this.syncBudgetCategoryField({
      inputId: "templateCategoryInput",
      triggerId: "templateCategoryTriggerBtn",
      type: typeInput.value,
      selectedId,
      flowKindInputId: "templateFlowKindInput"
    });
  },

  renderFilterCategories() {
    const filterCategory = Utils.$("filterCategory");
    if (!filterCategory) {
      return;
    }
    const type = Store.filters.type === "all" ? "all" : Store.filters.type;
    const options = ['<option value="all">Все категории</option>']
      .concat(
        Store.getCategories(type).map((category) => `<option value="${category.id}"${Store.filters.categoryId === category.id ? " selected" : ""}>${Utils.escapeHtml(category.name)}</option>`)
      )
      .join("");
    filterCategory.innerHTML = options;
  },

  renderBudgetFilters() {
    const shell = Utils.$("budgetFilterShell");
    const body = Utils.$("budgetFilterBody");
    const toggle = Utils.$("budgetFilterToggleBtn");
    const summary = Utils.$("listSummary");
    if (!shell || !body || !toggle) {
      return;
    }
    const hasActiveFilters = Boolean(
      Store.filters.search ||
      Store.filters.categoryId !== "all" ||
      Store.filters.type !== "all" ||
      Store.filters.period !== "month" ||
      Store.filters.sort !== "date-desc" ||
      Store.filters.dateFrom ||
      Store.filters.dateTo
    );
    const collapsed = this.budgetFiltersCollapsed;
    shell.classList.toggle("is-collapsed", collapsed);
    shell.classList.toggle("has-active-filters", hasActiveFilters);
    toggle.textContent = collapsed ? "Фильтры" : "Скрыть";
    toggle.setAttribute("aria-expanded", String(!collapsed));
    if (summary) {
      summary.setAttribute("aria-expanded", String(!collapsed));
      summary.title = collapsed ? "Открыть поиск и фильтры" : "Свернуть поиск и фильтры";
    }
  },

  renderSummary() {
    const allTime = Store.allTimeStats();
    const active = Store.statsForMonth(Store.viewMonth);
    const isCurrentMonth = Store.viewMonth === Utils.monthKey(new Date());
    const monthLabelLower = Utils.monthLabel(Store.viewMonth).toLowerCase();
    const balanceTooltip = `Общий баланс показывает итог за всю историю: все доходы минус все расходы по всем месяцам. Он не равен остатку текущего месяца. Чтобы понять, сколько денег остается в выбранном месяце, смотрите карточку "Остаток на конец".`;
    const incomeTooltip = `Доходы месяца — сумма всех поступлений только за ${Utils.monthLabel(Store.viewMonth).toLowerCase()}. Основание расчета: операции раздела "Доходы" выбранного месяца.`;
    const expenseTooltip = `Расходы месяца — сумма всех списаний выбранного месяца, включая долги, обязательные платежи и текущие расходы. Хотелки сюда не попадают, пока вы не перенесете их в расход.`;
    const netTooltip = `Чистый поток — это доходы месяца минус расходы месяца. Положительное значение означает месяц в плюсе, отрицательное — расходов было больше, чем доходов.`;
    const savingsTooltip = `Норма накопления показывает, какая доля дохода осталась после расходов в выбранном месяце. Формула: (доходы - расходы) / доходы * 100%.`;
    const nodes = {
      activeMonthLabel: Utils.$("activeMonthLabel"),
      historyBalanceInline: Utils.$("historyBalanceInline"),
      historyOpsInline: Utils.$("historyOpsInline"),
      monthNetInline: Utils.$("monthNetInline"),
      monthFinalInline: Utils.$("monthFinalInline"),
      incomeTotal: Utils.$("incomeTotal"),
      expenseTotal: Utils.$("expenseTotal"),
      netTotal: Utils.$("netTotal"),
      savingsRate: Utils.$("savingsRate"),
      heroCaption: Utils.$("heroCaption"),
      incomeHint: Utils.$("incomeHint"),
      expenseHint: Utils.$("expenseHint"),
      netHint: Utils.$("netHint"),
      savingsHint: Utils.$("savingsHint"),
      todayBtn: Utils.$("todayBtn")
    };

    this.setBudgetText(nodes.activeMonthLabel, Utils.monthLabel(Store.viewMonth));
    this.setBudgetText(nodes.historyBalanceInline, Utils.formatMoney(allTime.balance));
    this.setBudgetText(nodes.historyOpsInline, String(Store.data.transactions.length));
    this.setBudgetText(nodes.monthNetInline, Utils.formatMoney(active.totals.balance));
    this.setBudgetText(nodes.monthFinalInline, Utils.formatMoney(active.finalBalance));
    this.setBudgetText(nodes.incomeTotal, Utils.formatMoney(active.totals.income));
    this.setBudgetText(nodes.expenseTotal, Utils.formatMoney(active.totals.expense));
    this.setBudgetText(nodes.netTotal, Utils.formatMoney(active.totals.balance));
    this.setBudgetText(nodes.savingsRate, Utils.formatPercent(Math.max(0, active.savingsRate)));
    this.setBudgetText(nodes.heroCaption, `${active.operations} операций в ${monthLabelLower} · остаток на конец ${Utils.formatMoney(active.finalBalance)}.`);
    this.setBudgetText(nodes.incomeHint, active.totals.income ? "Все поступления выбранного месяца" : "Доходов пока нет");
    this.setBudgetText(nodes.expenseHint, active.totals.expense ? "Списания выбранного месяца" : "Расходов пока нет");
    this.setBudgetText(nodes.netHint, active.totals.balance >= 0 ? "Месяц пока в плюсе" : "Расходы опережают доходы");
    this.setBudgetText(nodes.savingsHint, active.totals.income ? "Сколько от дохода осталось после трат" : "Появится после первого дохода");

    [
      [nodes.historyBalanceInline, balanceTooltip],
      [nodes.historyOpsInline, `Всего операций в системе: ${Store.data.transactions.length}. Это число учитывает все месяцы, а не только текущий.`],
      [nodes.monthNetInline, netTooltip],
      [nodes.monthFinalInline, "Остаток на конец — итоговая сумма выбранного месяца после всех доходов и расходов. Именно она переходит в следующий месяц как авто-старт."],
      [nodes.incomeTotal, incomeTooltip],
      [nodes.incomeHint, incomeTooltip],
      [nodes.expenseTotal, expenseTooltip],
      [nodes.expenseHint, expenseTooltip],
      [nodes.netTotal, netTooltip],
      [nodes.netHint, netTooltip],
      [nodes.savingsRate, savingsTooltip],
      [nodes.savingsHint, savingsTooltip]
    ].forEach(([target, text]) => this.setBudgetHelp(target, text));

    if (nodes.todayBtn) {
      nodes.todayBtn.classList.toggle("is-hidden", isCurrentMonth);
    }
  },

  renderMonthPlan() {
    const stats = Store.statsForMonth(Store.viewMonth);
    const meta = Store.getMonthMeta(Store.viewMonth);
    const input = Utils.$("monthStartInput");
    const manualCheck = Utils.$("manualStartCheck");
    const badge = Utils.$("monthStartModeBadge");
    const hint = Utils.$("monthStartHint");
    const startResolved = Utils.$("monthStartResolved");
    const startResolvedHint = Utils.$("monthStartResolvedHint");
    const freeCash = Utils.$("monthFreeCash");
    const freeCashHint = Utils.$("monthFreeCashHint");
    const finalBalance = Utils.$("monthFinalBalance");
    const finalBalanceHint = Utils.$("monthFinalBalanceHint");
    const minBalance = Utils.$("monthMinBalance");
    const minBalanceHint = Utils.$("monthMinBalanceHint");
    const startTooltip = `Начальный остаток — точка, с которой стартует расчет месяца. В авто-режиме он подтягивается из остатка на конец предыдущего месяца, а в ручном режиме берется из вашего ввода.`;
    const freeTooltip = `Свободно — расчетный остаток после всех операций выбранного месяца. Он учитывает начальный остаток и все доходы/расходы месяца.`;
    const finalTooltip = `Остаток на конец — итоговая сумма после всех операций месяца. Именно это значение переносится как авто-старт на следующий месяц.`;
    const minTooltip = `Минимум в месяце — самая низкая точка баланса внутри месяца по дневному тренду. Помогает увидеть, где был самый сильный провал по деньгам.`;
    if (!input || !manualCheck || !badge || !hint) {
      return;
    }

    input.disabled = !meta.manualStart;
    input.placeholder = `Авто: ${Utils.formatMoney(stats.startBalance)}`;
    input.value = meta.manualStart ? (meta.start === 0 ? "0" : String(meta.start || "")) : "";
    manualCheck.checked = Boolean(meta.manualStart);
    badge.textContent = meta.manualStart ? "Ручной старт" : "Авто-старт";
    hint.textContent = meta.manualStart
      ? `Ручной остаток: ${Utils.formatMoney(meta.start || 0)}`
      : stats.previousMonthKey && (Store.data.months[stats.previousMonthKey] || Store.getTransactions("month", stats.previousMonthKey).length)
        ? `Авто из ${Utils.monthLabel(stats.previousMonthKey).toLowerCase()}: ${Utils.formatMoney(stats.startBalance)}`
        : `Авто: ${Utils.formatMoney(stats.startBalance)}`;

    this.setBudgetText(startResolved, Utils.formatMoney(stats.startBalance));
    this.setBudgetText(startResolvedHint, meta.manualStart ? "Фиксирован вручную" : "Подхвачен автоматически");
    this.setBudgetAmountState(freeCash, stats.freeCash);
    this.setBudgetText(freeCashHint, stats.freeCash >= 0 ? "После всех операций месяца" : "Нужно перекрыть дефицит");
    this.setBudgetAmountState(finalBalance, stats.finalBalance);
    this.setBudgetText(finalBalanceHint, "Переносится на следующий месяц");
    this.setBudgetAmountState(minBalance, stats.minBalance);
    this.setBudgetText(minBalanceHint, stats.minBalanceDay ? `Минимум приходится на ${stats.minBalanceDay} число` : "Без просадки ниже стартовой точки");

    [
      [input, startTooltip],
      [hint, startTooltip],
      [startResolved, startTooltip],
      [startResolvedHint, startTooltip],
      [freeCash, freeTooltip],
      [freeCashHint, freeTooltip],
      [finalBalance, finalTooltip],
      [finalBalanceHint, finalTooltip],
      [minBalance, minTooltip],
      [minBalanceHint, minTooltip],
      [Utils.$("monthBalanceChart"), "График показывает движение баланса по дням месяца: синяя линия — накопленный баланс, столбцы — чистое движение денег за день, пунктир — сегодняшний день."]
    ].forEach(([target, text]) => this.setBudgetHelp(target, text));
    const panel = document.querySelector(".month-plan-panel");
    const shell = Utils.$("monthTrendShell");
    const toggleBtn = Utils.$("monthTrendToggleBtn");
    const previewValue = Utils.$("monthTrendPreviewValue");
    const previewMin = Utils.$("monthTrendPreviewMin");
    const previewFinal = Utils.$("monthTrendPreviewFinal");
    if (panel) {
      panel.classList.toggle("is-chart-collapsed", this.monthTrendCollapsed);
    }
    if (shell) {
      shell.classList.toggle("is-collapsed", this.monthTrendCollapsed);
    }
    if (toggleBtn) {
      toggleBtn.textContent = this.monthTrendCollapsed ? "Развернуть график" : "Свернуть график";
      toggleBtn.setAttribute("aria-expanded", String(!this.monthTrendCollapsed));
    }
    if (previewValue) {
      previewValue.textContent = stats.finalBalance >= stats.startBalance
        ? "Баланс держится выше старта"
        : "Баланс проседает относительно старта";
    }
    if (previewMin) {
      previewMin.textContent = Utils.formatMoney(stats.minBalance);
    }
    if (previewFinal) {
      previewFinal.textContent = Utils.formatMoney(stats.finalBalance);
    }
  },

  renderJournal() {
    const sections = {
      incomes: "incomesList",
      debts: "debtsList",
      recurring: "recurringBudgetList",
      expenses: "expensesList",
      wishlist: "wishList"
    };

    Object.entries(sections).forEach(([section, elementId]) => {
      const root = Utils.$(elementId);
      if (!root) {
        return;
      }
        const items = Store.getSectionTransactions(section, Store.viewMonth);
      const meta = SECTION_META[section];
      if (!items.length) {
        root.innerHTML = `<div class="empty-state empty-state--compact">${meta.emptyText}</div>`;
        return;
      }
      root.innerHTML = items.map((item, index) => {
        if (section === "wishlist") {
          return this.renderWishlistRow(item);
        }
        return this.renderJournalRow(section, item, { isFirst: index === 0 });
      }).join("");
    });

    const summary = Utils.$("journalMonthSummary");
    if (summary) {
      const stats = Store.statsForMonth(Store.viewMonth);
      summary.textContent = `${stats.operations} операций • ${Utils.formatMoney(stats.totals.income)} / ${Utils.formatMoney(stats.totals.expense)}`;
    }
    this.renderJournalSortButtons();
  },

  renderJournalRow(section, transaction, options = {}) {
    const isFirst = Boolean(options.isFirst);
    const day = Number(transaction.date.slice(-2));
    const category = Store.getCategory(transaction.categoryId);
    const favoriteState = section === "expenses" && Store.isFavoriteTransaction(transaction.id) ? " is-active" : "";
    const tagsState = transaction.tags?.length ? " is-active" : "";
    const isDebtSection = section === "debts";
    const fullDescription = transaction.description || "";
    const previewDescription = Utils.truncateSingleLine(fullDescription, 62);
    const hasSort = ["incomes", "debts", "recurring", "expenses"].includes(section) && isFirst;
      const sortMode = hasSort ? this.getJournalSectionSortMode(section) : "date-desc";
      const sortIcon = sortMode === "date-asc" ? "↑" : "↓";
      const sortLabel = sortMode === "date-asc"
        ? "Одноразовая сортировка по дате: старые сверху"
        : "Одноразовая сортировка по дате: новые сверху";
      const sortTitle = sortMode === "date-asc"
        ? "Одноразово показать старые даты сверху"
        : "Одноразово показать новые даты сверху";
      const dayLabel = hasSort
        ? `<span class="entry-field__label entry-field__label--sort">
            <span class="entry-field__label-text">День</span>
            <button class="journal-sort-inline" type="button" data-journal-action="toggle-section-sort" data-section-sort-btn="${section}" aria-label="${sortLabel}" aria-pressed="false" title="${sortTitle}">
              <span class="journal-sort-inline__icon">${sortIcon}</span>
            </button>
          </span>`
        : `<span class="entry-field__label">День</span>`;

    return `
      <article class="entry-row entry-row--${section}" data-entry-id="${transaction.id}" data-section="${section}" draggable="true">
        <label class="entry-field entry-field--day">
          ${dayLabel}
          <div class="entry-field__control">
            <input data-journal-field="day" type="number" min="1" max="31" value="${day}">
          </div>
        </label>

        <label class="entry-field entry-field--amount">
          <span class="entry-field__label">Сумма</span>
          <div class="entry-field__control">
            <input data-journal-field="amount" type="number" step="0.01" min="0" value="${transaction.amount ? transaction.amount : ""}" placeholder="0">
          </div>
        </label>

        <label class="entry-field entry-field--desc">
          <span class="entry-field__label">Описание</span>
          <div class="entry-field__control entry-field__control--textarea">
            <textarea
            class="compact-textarea"
            data-journal-field="description"
            data-compact="true"
            data-compact-limit="62"
            data-expanded-rows="4"
            data-fulltext="${Utils.escapeHtml(fullDescription)}"
            rows="1"
            placeholder="Опишите операцию"
            title="${Utils.escapeHtml(fullDescription)}"
            >${Utils.escapeHtml(previewDescription)}</textarea>
          </div>
        </label>

        <label class="entry-field entry-field--category">
          <span class="entry-field__label">Категория</span>
          <div class="entry-field__control">
            ${isDebtSection
              ? `<div class="category-trigger category-trigger--static" title="${Utils.escapeHtml(category?.name || "Долги")}">
                  <span class="category-trigger__swatch" style="background:${category?.color || "#ff7b72"}"></span>
                  <span class="category-trigger__label">${Utils.escapeHtml(category?.name || "Долги")}</span>
                </div>`
              : `<button
                  class="category-trigger"
                  type="button"
                  data-journal-action="open-category-picker"
                  data-id="${transaction.id}"
                  aria-label="Выбрать категорию"
                  aria-haspopup="dialog"
                  title="${Utils.escapeHtml(category?.name || "Без категории")}"
                >
                  <span class="category-trigger__swatch" style="background:${category?.color || "#8b949e"}"></span>
                  <span class="category-trigger__label">${Utils.escapeHtml(category?.name || "Без категории")}</span>
                </button>`}
          </div>
        </label>

        <div class="entry-field entry-field--actions entry-actions">
          <span class="entry-field__label entry-field__label--ghost" aria-hidden="true">Действия</span>
          <div class="entry-field__control entry-field__control--actions">
            <div class="entry-actions__buttons">
            <button class="icon-btn icon-btn--tiny icon-btn--row${tagsState}" type="button" data-journal-action="edit-tags" data-id="${transaction.id}" aria-label="Теги операции" title="${Utils.escapeHtml(transaction.tags?.length ? Utils.formatTags(transaction.tags) : "Без тегов")}">${Utils.icon("tag")}</button>
            ${section === "expenses" ? `<button class="icon-btn icon-btn--tiny icon-btn--row${favoriteState}" type="button" data-journal-action="favorite" data-id="${transaction.id}" aria-label="${favoriteState ? "Убрать из избранного" : "Добавить в избранное"}" title="${favoriteState ? "Убрать из избранного" : "Добавить в избранное"}">${Utils.icon("star")}</button>` : ""}
            <button class="icon-btn icon-btn--tiny icon-btn--row" type="button" data-journal-action="delete" data-id="${transaction.id}" aria-label="Удалить">${Utils.icon("close")}</button>
            </div>
          </div>
        </div>
      </article>
    `;
  },

  renderWishlistRow(item) {
    const fullDescription = item.desc || "";
    const previewDescription = Utils.truncateSingleLine(fullDescription, 54);
    return `
      <article class="entry-row entry-row--wishlist" data-entry-id="${item.id}" data-section="wishlist" draggable="true">
        <label class="entry-field entry-field--desc">
          <span class="entry-field__label">Цель</span>
          <div class="entry-field__control entry-field__control--textarea">
            <textarea
            class="compact-textarea"
            data-journal-field="wish-desc"
            data-compact="true"
            data-compact-limit="54"
            data-expanded-rows="3"
            data-fulltext="${Utils.escapeHtml(fullDescription)}"
            rows="1"
            placeholder="Название хотелки"
            title="${Utils.escapeHtml(fullDescription)}"
            >${Utils.escapeHtml(previewDescription)}</textarea>
          </div>
        </label>

        <label class="entry-field entry-field--amount">
          <span class="entry-field__label">Цена</span>
          <div class="entry-field__control">
            <input data-journal-field="wish-amount" type="number" step="0.01" min="0" value="${item.amount ? item.amount : ""}" placeholder="0">
          </div>
        </label>

        <div class="entry-field entry-field--actions entry-actions">
          <span class="entry-field__label entry-field__label--ghost" aria-hidden="true">Действия</span>
          <div class="entry-field__control entry-field__control--actions">
            <div class="entry-actions__buttons">
            <button class="icon-btn icon-btn--tiny icon-btn--row icon-btn--buy" type="button" data-journal-action="fulfill-wish" data-id="${item.id}" aria-label="Купить">${Utils.icon("cart")}</button>
            <button class="icon-btn icon-btn--tiny icon-btn--row" type="button" data-journal-action="delete-wish" data-id="${item.id}" aria-label="Удалить">${Utils.icon("close")}</button>
            </div>
          </div>
        </div>
      </article>
    `;
  },

  renderQuickSettings() {
    const root = Utils.$("manageQuickList");
    const title = Utils.$("settingsQuickTitle");
    const createButton = Utils.$("settingsQuickCreateBtn");
    const statsRoot = Utils.$("settingsQuickStats");
    const templateSwitch = Utils.$("settingsQuickTemplatesBtn");
    const favoriteSwitch = Utils.$("settingsQuickFavoritesBtn");
    const switchRoot = document.querySelector(".settings-quick-switch");
    if (root) {
      const mode = this.settingsQuickMode === "favorite" ? "favorite" : "template";
      const items = mode === "favorite" ? Store.data.settings.favorites : Store.data.settings.templates;
      const titleText = mode === "favorite" ? "Быстрые текущие расходы" : "Обязательные платежи";
      const createText = mode === "favorite" ? "Новая строка" : "Новый шаблон";
      const isTemplate = mode === "template";
      if (switchRoot) {
        switchRoot.setAttribute("role", "group");
        switchRoot.setAttribute("aria-describedby", "settingsQuickStatus");
      }

      if (title) {
        title.textContent = titleText;
      }
      if (createButton) {
        createButton.textContent = createText;
        createButton.setAttribute("aria-controls", "manageQuickList");
        createButton.setAttribute("aria-describedby", "settingsQuickStatus");
        createButton.setAttribute("aria-label", createText);
      }
      if (templateSwitch) {
        templateSwitch.classList.toggle("is-active", isTemplate);
        templateSwitch.setAttribute("aria-pressed", isTemplate ? "true" : "false");
        templateSwitch.setAttribute("aria-label", "Показать шаблоны");
        templateSwitch.setAttribute("aria-controls", "manageQuickList");
      }
      if (favoriteSwitch) {
        favoriteSwitch.classList.toggle("is-active", !isTemplate);
        favoriteSwitch.setAttribute("aria-pressed", !isTemplate ? "true" : "false");
        favoriteSwitch.setAttribute("aria-label", "Показать избранное");
        favoriteSwitch.setAttribute("aria-controls", "manageQuickList");
      }

      if (statsRoot) {
        const taggedCount = items.filter((item) => Utils.normalizeTags(item.tags).length).length;
        const categoriesUsed = new Set(items.map((item) => item.categoryId).filter(Boolean)).size;
        const modeSpecific = mode === "favorite"
          ? items.filter((item) => Utils.parseAmount(item.amount) > 0).length
          : items.filter((item) => item.flowKind === "recurring" || item.flowKind === "debt").length;
        const modeSpecificLabel = mode === "favorite" ? "С суммой" : "Регулярные и долги";
        statsRoot.innerHTML = `
          <article class="settings-mini-stat">
            <span class="settings-mini-stat__label">Всего</span>
            <strong class="settings-mini-stat__value">${items.length}</strong>
          </article>
          <article class="settings-mini-stat">
            <span class="settings-mini-stat__label">С тегами</span>
            <strong class="settings-mini-stat__value">${taggedCount}</strong>
          </article>
          <article class="settings-mini-stat">
            <span class="settings-mini-stat__label">${modeSpecificLabel}</span>
            <strong class="settings-mini-stat__value">${modeSpecific}</strong>
          </article>
          <article class="settings-mini-stat">
            <span class="settings-mini-stat__label">Категорий</span>
            <strong class="settings-mini-stat__value">${categoriesUsed}</strong>
          </article>
        `;
      }

      root.setAttribute("role", "list");
      root.setAttribute("aria-labelledby", "settingsQuickTitle");
      root.setAttribute("aria-describedby", "settingsQuickStatus");

      const editAction = mode === "favorite" ? "edit-favorite" : "edit-template";
      const tagAction = mode === "favorite" ? "edit-favorite-tags" : "edit-template-tags";
      const deleteAction = mode === "favorite" ? "delete-favorite" : "delete-template";
      const emptyText = mode === "favorite" ? "Избранного пока нет" : "Шаблонов пока нет";

      root.innerHTML = items.length
        ? items.map((item) => {
          const category = Store.getCategory(item.categoryId);
          const tagPreview = Utils.normalizeTags(item.tags);
          const metaType = mode === "favorite"
            ? "Быстрый расход"
            : item.flowKind === "recurring"
              ? "Регулярный платеж"
              : item.flowKind === "debt"
                ? "Долг / кредит"
                : item.type === "income"
                  ? "Доход"
                  : "Расход";
          return `
          <article class="quick-card${mode === "favorite" ? " quick-card--favorite" : ""}" data-item-id="${item.id}" data-kind="${mode}" role="listitem">
            <div class="quick-card__top">
              <div class="quick-card__main">
                <span class="quick-card__swatch" style="background:${category?.color || "#8b949e"}"></span>
                <div class="quick-card__body">
                  <strong title="${Utils.escapeHtml(item.desc || "Без названия")}">${Utils.escapeHtml(item.desc || "Без названия")}</strong>
                  <div class="transaction-card__meta">
                    <span>${Utils.formatMoney(item.amount)}</span>
                    <span>${Utils.escapeHtml(category?.name || "Без категории")}</span>
                    <span>${metaType}</span>
                  </div>
                </div>
              </div>
              <div class="quick-card__actions">
                <button class="chip-btn" type="button" data-setting-action="${editAction}" data-id="${item.id}">Редактировать</button>
                <button class="chip-btn" type="button" data-setting-action="${tagAction}" data-id="${item.id}">Теги</button>
                <button class="chip-btn" type="button" data-setting-action="${deleteAction}" data-id="${item.id}">Удалить</button>
              </div>
            </div>
            <div class="quick-card__tags">
              ${tagPreview.length
                ? tagPreview.map((tag) => {
                  const tagMeta = Store.getTagDefinition(tag);
                  return `<button class="tag-chip tag-chip--soft quick-card__tag" type="button" data-setting-action="${tagAction}" data-id="${item.id}" style="--tag-color:${tagMeta?.color || "#58a6ff"}">${Utils.escapeHtml(tag)}</button>`;
                }).join("")
                : '<span class="quick-card__empty">Теги не заданы</span>'}
            </div>
          </article>
        `;
        }).join("")
        : `<div class="empty-state empty-state--compact" role="status">${emptyText}</div>`;
    }

    const exportBtn = Utils.$("exportBtn");
    const importBtn = Utils.$("importBtn");
    const backupNote = Utils.$("backupNote");
    const exportHelp = "Экспорт создает JSON-бэкап текущих данных аккаунта или локального режима. Нужен для ручного сохранения, переноса данных и восстановления после ошибок.";
    const importHelp = "Импорт загружает JSON-бэкап в приложение и заменяет текущие локальные данные на содержимое файла. Удобно для восстановления, переноса или первичной загрузки архива.";
    Utils.setHelpText(exportBtn, exportHelp);
    Utils.setHelpText(importBtn, importHelp);
    Utils.setHelpText(backupNote, "Бэкап совместим с форматом старой версии: settings, wishlist и месячные блоки YYYY-MM.");
    App.runAfterNextPaint(() => this.syncSettingsLayout(), 2);

  },

  syncSettingsLayout() {
    const tab = Utils.$("settingsTab");
    const layout = tab?.querySelector?.(".settings-layout");
    const categoriesPanel = layout?.querySelector?.(".settings-panel--categories");
    const backupPanel = layout?.querySelector?.(".settings-panel--backup");
    const quickPanel = layout?.querySelector?.(".settings-panel--quick");
    if (!layout || !categoriesPanel || !backupPanel || !quickPanel) {
      return;
    }

    if (typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches) {
      layout.style.removeProperty("grid-template-rows");
      categoriesPanel.style.removeProperty("height");
      categoriesPanel.style.removeProperty("min-height");
      categoriesPanel.style.removeProperty("max-height");
      quickPanel.style.removeProperty("height");
      quickPanel.style.removeProperty("min-height");
      quickPanel.style.removeProperty("max-height");
      return;
    }

    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1280px)").matches) {
      const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0);
      const stackedCategoryHeight = Math.max(320, Math.min(Math.round(viewportHeight * 0.5), 520));
      const stackedQuickHeight = Math.max(400, Math.min(Math.round(viewportHeight * 0.62), 620));
      layout.style.removeProperty("grid-template-rows");
      categoriesPanel.style.setProperty("height", `${stackedCategoryHeight}px`, "important");
      categoriesPanel.style.setProperty("min-height", `${stackedCategoryHeight}px`, "important");
      categoriesPanel.style.setProperty("max-height", `${stackedCategoryHeight}px`, "important");
      quickPanel.style.setProperty("height", `${stackedQuickHeight}px`, "important");
      quickPanel.style.setProperty("min-height", `${stackedQuickHeight}px`, "important");
      quickPanel.style.setProperty("max-height", `${stackedQuickHeight}px`, "important");
      return;
    }

    const layoutStyles = getComputedStyle(layout);
    const rowGap = parseFloat(layoutStyles.rowGap || layoutStyles.gap || "0") || 0;
    const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0);
    const targetCategoriesHeight = viewportHeight <= 860
      ? Math.max(470, Math.min(Math.round(viewportHeight * 0.64), 560))
      : Math.max(460, Math.min(Math.round(viewportHeight * 0.58), 620));
    categoriesPanel.style.setProperty("height", `${targetCategoriesHeight}px`, "important");
    categoriesPanel.style.setProperty("min-height", `${targetCategoriesHeight}px`, "important");
    categoriesPanel.style.setProperty("max-height", `${targetCategoriesHeight}px`, "important");
    const categoriesHeight = targetCategoriesHeight;
    const backupHeight = Math.max(0, backupPanel.getBoundingClientRect().height);
    if (!categoriesHeight || !backupHeight) {
      return;
    }

    const quickHeight = categoriesHeight + backupHeight + rowGap;
    layout.style.setProperty("grid-template-rows", `${categoriesHeight}px ${backupHeight}px`, "important");
    quickPanel.style.setProperty("height", `${quickHeight}px`, "important");
    quickPanel.style.setProperty("min-height", `${quickHeight}px`, "important");
    quickPanel.style.setProperty("max-height", `${quickHeight}px`, "important");
  },

  renderTransactions() {
    const root = Utils.$("transactionsList");
    if (!root) {
      return;
    }

    const searchInput = Utils.$("searchInput");
    const filterPeriod = Utils.$("filterPeriod");
    const filterType = Utils.$("filterType");
    const sortSelect = Utils.$("sortSelect");
    const filterDateFrom = Utils.$("filterDateFrom");
    const filterDateTo = Utils.$("filterDateTo");
    if (searchInput) searchInput.value = Store.filters.search || "";
    if (filterPeriod) filterPeriod.value = Store.filters.period || "month";
    if (filterType) filterType.value = Store.filters.type || "all";
    if (sortSelect) sortSelect.value = Store.filters.sort || "date-desc";
    if (filterDateFrom) filterDateFrom.value = Store.filters.dateFrom || "";
    if (filterDateTo) filterDateTo.value = Store.filters.dateTo || "";

    const hasActiveFilters = Boolean(
      Store.filters.search ||
      Store.filters.categoryId !== "all" ||
      Store.filters.type !== "all" ||
      Store.filters.period !== "month" ||
      Store.filters.sort !== "date-desc" ||
      Store.filters.dateFrom ||
      Store.filters.dateTo
    );

    const transactions = Store.getFilteredTransactions();
    const totals = Store.totalsFor(transactions);
    const listSummary = Utils.$("listSummary");
    if (listSummary) {
      listSummary.textContent = hasActiveFilters
        ? transactions.length
          ? `${transactions.length} операций · ${Utils.formatMoney(totals.balance)} · ${Store.filters.period === "all" ? "вся история" : "активный месяц"}`
          : "Нет операций под текущие фильтры"
        : "Фильтры не активны. Ниже показан полный бюджет месяца по разделам.";
    }

    root.classList.toggle("is-hidden", !hasActiveFilters);
    if (!hasActiveFilters) {
      root.replaceChildren();
      return;
    }

    if (!transactions.length) {
      root.replaceChildren(Utils.createElement("div", "empty-state", "Ничего не найдено. Измените фильтры или добавьте новую операцию."));
      return;
    }

    // Здесь принципиально не используем innerHTML для пользовательских данных:
    // описание, категория, дата и теги попадают в DOM только через textContent.
    const fragment = document.createDocumentFragment();
    transactions.forEach((transaction) => {
      const category = Store.getCategory(transaction.categoryId);
      const amountClass = transaction.type === "income" ? "amount-positive" : "amount-negative";
      const flowLabel = transaction.type === "income"
        ? "Доход"
        : transaction.flowKind === "debt"
          ? "Долг / кредит"
          : transaction.flowKind === "recurring"
            ? "Регулярный платеж"
            : "Расход";

      const card = Utils.createElement("article", "transaction-card");
      card.title = transaction.description || flowLabel;

      const main = Utils.createElement("div");
      const title = Utils.createElement("strong", "", transaction.description || flowLabel);
      title.title = transaction.description || flowLabel;
      const meta = Utils.createElement("div", "transaction-card__meta");
      meta.append(
        Utils.createElement("span", "", Utils.formatDate(transaction.date)),
        Utils.createElement("span", "", flowLabel),
        Utils.createElement("span", "", Utils.timeSince(transaction.updatedAt))
      );
      if (transaction.tags?.length) {
        meta.appendChild(Utils.createElement("span", "", Utils.formatTags(transaction.tags)));
      }
      main.append(title, meta);

      const tagPill = Utils.createElement("div", "tag-pill");
      const tagDot = Utils.createElement("span", "tag-pill__dot");
      tagDot.style.background = category?.color || "#8b949e";
      tagPill.append(tagDot, Utils.createElement("span", "", category?.name || "Без категории"));

      const amount = Utils.createElement("strong", amountClass, `${transaction.type === "income" ? "+" : "-"}${Utils.formatMoney(transaction.amount)}`);

      const actions = Utils.createElement("div", "transaction-card__actions");
      const editButton = Utils.createElement("button", "chip-btn", "Изменить");
      editButton.type = "button";
      editButton.dataset.action = "edit-transaction";
      editButton.dataset.id = transaction.id;
      const deleteButton = Utils.createElement("button", "chip-btn", "Удалить");
      deleteButton.type = "button";
      deleteButton.dataset.action = "delete-transaction";
      deleteButton.dataset.id = transaction.id;
      actions.append(editButton, deleteButton);

      card.append(main, tagPill, amount, actions);
      fragment.appendChild(card);
    });

    root.replaceChildren(fragment);
  },

  renderCategories() {
    const root = Utils.$("categoriesEditor");
    const statsRoot = Utils.$("settingsCategoryStats");
    const categories = Store.getCategories();
    if (statsRoot) {
      const expenseCount = categories.filter((category) => category.type === "expense").length;
      const incomeCount = categories.length - expenseCount;
      const limitedCount = categories.filter((category) => Utils.parseAmount(category.limit) > 0).length;
      statsRoot.innerHTML = `
        <article class="settings-mini-stat">
          <span class="settings-mini-stat__label">Всего</span>
          <strong class="settings-mini-stat__value">${categories.length}</strong>
        </article>
        <article class="settings-mini-stat">
          <span class="settings-mini-stat__label">Расходы</span>
          <strong class="settings-mini-stat__value">${expenseCount}</strong>
        </article>
        <article class="settings-mini-stat">
          <span class="settings-mini-stat__label">Доходы</span>
          <strong class="settings-mini-stat__value">${incomeCount}</strong>
        </article>
        <article class="settings-mini-stat">
          <span class="settings-mini-stat__label">С лимитом</span>
          <strong class="settings-mini-stat__value">${limitedCount}</strong>
        </article>
      `;
    }
    if (!root) {
      return;
    }
    root.innerHTML = categories.map((category) => `
      <article class="category-item">
        <div class="category-item__top">
          <div class="category-item__main">
            <span class="category-item__swatch" style="background:${category.color}"></span>
            <div>
              <strong>${Utils.escapeHtml(category.name)}</strong>
              <div class="transaction-card__meta">
                <span>${category.type === "income" ? "Доход" : "Расход"}</span>
                <span>${category.limit ? `Лимит: ${Utils.formatMoney(category.limit)}` : "Лимит не задан"}</span>
                <span>${category.preset ? "Встроенная" : "Пользовательская"}</span>
              </div>
            </div>
          </div>
          <div class="category-item__actions">
            <button class="chip-btn" type="button" data-action="edit-category" data-id="${category.id}">Редактировать</button>
            <button class="chip-btn" type="button" data-action="delete-category" data-id="${category.id}">Удалить</button>
          </div>
        </div>
      </article>
    `).join("");
  },
});
