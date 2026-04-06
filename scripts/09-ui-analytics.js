Object.assign(UI, {
  renderInsights() {
    const current = Store.statsForMonth(Store.viewMonth);
    const previous = Store.statsForMonth(Store.previousMonthKey(Store.viewMonth));
    const recurringShare = current.totals.expense ? (current.totals.recurring / current.totals.expense) * 100 : 0;
    const debtShare = current.totals.expense ? (current.totals.debt / current.totals.expense) * 100 : 0;
    const deltaExpense = previous.totals.expense ? ((current.totals.expense - previous.totals.expense) / previous.totals.expense) * 100 : 0;
    const cards = [
      {
        label: "Прогноз расхода",
        value: Utils.formatMoney(current.burnRateProjection),
        description: "Оценка трат к концу месяца при текущем темпе"
      },
      {
        label: "Средний чек",
        value: Utils.formatMoney(current.averageCheck),
        description: "Средний размер расходной операции месяца"
      },
      {
        label: "Доля регулярных",
        value: Utils.formatPercent(recurringShare),
        description: "Часть расходов, похожих на подписки и повторяемые списания"
      },
      {
        label: "Изменение к прошлому месяцу",
        value: `${deltaExpense >= 0 ? "+" : ""}${Utils.formatPercent(Math.abs(deltaExpense))}`,
        description: "Насколько изменились расходы относительно прошлого месяца"
      },
      {
        label: "Доля долгов",
        value: Utils.formatPercent(debtShare),
        description: "Часть расходов, ушедших на долги, кредиты и рассрочки"
      },
      {
        label: "Концентрация категории",
        value: Utils.formatPercent(current.concentration),
        description: current.topCategory ? `Главная категория месяца: ${current.topCategory.name}` : "Появится после первых расходов"
      }
    ];

    Utils.$("insightGrid").innerHTML = cards.map((card) => `
      <article class="insight-card">
        <span>${Utils.escapeHtml(card.label)}</span>
        <strong>${Utils.escapeHtml(card.value)}</strong>
        <small>${Utils.escapeHtml(card.description)}</small>
      </article>
    `).join("");
    App.runAfterNextPaint(() => this.syncSettingsLayout(), 2);
  },

  renderCashflowStrip() {
    const root = Utils.$("cashflowStrip");
    if (!root) {
      return;
    }
    const series = Store.monthlySeries(6);
    const current = Store.statsForMonth(Store.viewMonth);
    const bestNetMonth = series.reduce((best, item) => (item.balance > (best?.balance ?? -Infinity) ? item : best), null);
    const worstExpenseMonth = series.reduce((worst, item) => (item.expense > (worst?.expense ?? -Infinity) ? item : worst), null);
    const averageMonthlyFlow = series.length
      ? Utils.roundMoney(series.reduce((sum, item) => sum + item.balance, 0) / series.length)
      : 0;

    const cards = [
        {
          label: "Самый прибыльный",
          value: bestNetMonth ? Utils.formatMoney(bestNetMonth.balance) : "0 ₽",
          note: bestNetMonth ? bestNetMonth.label : "Пока нет месяцев"
        },
        {
          label: "Самый расходный",
        value: worstExpenseMonth ? Utils.formatMoney(worstExpenseMonth.expense) : "0 ₽",
        note: worstExpenseMonth ? worstExpenseMonth.label : "Пока нет месяцев"
      },
      {
        label: "Средний поток",
        value: Utils.formatMoney(averageMonthlyFlow),
        note: `${current.operations} операций в текущем месяце`
      }
    ];

    root.innerHTML = cards.map((item) => `
      <article class="cashflow-strip__card">
        <span>${Utils.escapeHtml(item.label)}</span>
        <strong>${Utils.escapeHtml(item.value)}</strong>
        <small>${Utils.escapeHtml(item.note)}</small>
      </article>
    `).join("");
  },

  renderGoals() {
    const root = Utils.$("goalList");
    if (!root) {
      return;
    }
    const goals = (Store.data.settings.goals || [])
      .slice()
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((goal) => Store.goalProgress(goal, Store.viewMonth))
      .filter(Boolean);
    root.replaceChildren();

    const fragment = document.createDocumentFragment();
    if (!goals.length) {
      const emptyCard = Utils.createElement("article", "goal-card goal-card--empty");
      emptyCard.append(
        Utils.createElement("strong", "", "Пока нет финансовых целей"),
        Utils.createElement("p", "goal-card__note", "Добавьте цель и отслеживайте прогресс накопления прямо во вкладке аналитики.")
      );
      fragment.appendChild(emptyCard);
    }

    goals.forEach((goal) => {
      const card = Utils.createElement("article", "goal-card");
      card.style.setProperty("--goal-color", goal.color);

      const head = Utils.createElement("div", "goal-card__head");
      const titleBox = Utils.createElement("div", "goal-card__title");
      const title = Utils.createElement("strong", "", goal.name);
      const meta = Utils.createElement(
        "small",
        "",
        goal.mode === "tag"
          ? `Накопление по тегу ${goal.tag || "#тег"}`
          : goal.mode === "saved"
            ? "Ручная накопленная сумма"
            : "От остатка на конец месяца"
      );
      titleBox.append(title, meta);
      head.append(titleBox);

      const progress = Utils.createElement("div", "goal-progress");
      const progressFill = Utils.createElement("div", "goal-progress__fill");
      progressFill.style.width = `${Math.min(100, goal.progress)}%`;
      const target = Utils.createElement("strong", "goal-card__target", Utils.formatMoney(goal.target));
      progress.append(progressFill, target);

      const metrics = Utils.createElement("div", "goal-card__meta");
      metrics.append(
        Utils.createElement("span", "", `Накоплено ${Utils.formatMoney(goal.currentAmount)}`),
        Utils.createElement("span", "", `Осталось ${Utils.formatMoney(goal.remaining)}`),
        Utils.createElement("span", "", `${Utils.formatPercent(goal.progress)} выполнения`)
      );

      card.append(head, progress, metrics);
      if (goal.note) {
        card.appendChild(Utils.createElement("p", "goal-card__note", goal.note));
      }

      const actions = Utils.createElement("div", "goal-card__actions");
      const editButton = Utils.createElement("button", "chip-btn", "Изменить");
      editButton.type = "button";
      editButton.dataset.action = "edit-goal";
      editButton.dataset.id = goal.id;
      const deleteButton = Utils.createElement("button", "chip-btn", "Удалить");
      deleteButton.type = "button";
      deleteButton.dataset.action = "delete-goal";
      deleteButton.dataset.id = goal.id;
      actions.append(editButton, deleteButton);
      card.append(actions);
      fragment.appendChild(card);
    });

    const addTile = Utils.createElement("button", "goal-card goal-card--adder");
    addTile.type = "button";
    addTile.dataset.action = "create-goal-inline";
    addTile.append(
      Utils.createElement("strong", "", "+ Новая цель"),
      Utils.createElement("span", "", "Создать копилку или финансовую цель")
    );
    fragment.appendChild(addTile);

    root.appendChild(fragment);
    this.renderGoalsPanelState();
  },

  renderForecast() {
    const root = Utils.$("forecastPanel");
    if (!root) {
      return;
    }
    const forecast = Store.forecastNextMonth(Store.viewMonth);
    root.replaceChildren();

    const shell = Utils.createElement("div", "forecast-v3");
    const hero = Utils.createElement("section", "forecast-v3__hero");
    const heroMain = Utils.createElement("article", "forecast-v3__hero-main");
    heroMain.append(
      Utils.createElement("span", "forecast-v3__eyebrow", "Прогноз на конец следующего месяца"),
      Utils.createElement(
        "strong",
        `forecast-v3__hero-value ${forecast.projectedFinal >= 0 ? "amount-positive" : "amount-negative"}`,
        Utils.formatMoney(forecast.projectedFinal)
      ),
      Utils.createElement(
        "p",
        "forecast-v3__note",
        `Прогноз основан на ${forecast.sampleSize} последних месяцах, среднем доходе/расходе и ритме обязательных списаний.`
      )
    );

    const heroSide = Utils.createElement("div", "forecast-v3__hero-side");
    [
      ["Безопасно потратить", Utils.formatMoney(forecast.safeSpend)],
      ["Старт месяца", Utils.formatMoney(forecast.startingBalance)]
    ].forEach(([label, value]) => {
      const chip = Utils.createElement("article", "forecast-v3__hero-chip");
      chip.append(
        Utils.createElement("span", "forecast-v3__eyebrow", label),
        Utils.createElement("strong", "", value)
      );
      heroSide.appendChild(chip);
    });
    hero.append(heroMain, heroSide);

    const metrics = Utils.createElement("div", "forecast-v3__metrics");
    [
      ["Прогнозируемый доход", Utils.formatMoney(forecast.averageIncome)],
      ["Прогнозируемый расход", Utils.formatMoney(forecast.averageExpense)],
      ["Безопасно потратить", Utils.formatMoney(forecast.safeSpend)],
      ["Старт следующего месяца", Utils.formatMoney(forecast.startingBalance)]
    ].forEach(([label, value]) => {
      const card = Utils.createElement("article", "forecast-v3__metric");
      card.append(
        Utils.createElement("span", "forecast-v3__eyebrow", label),
        Utils.createElement("strong", "", value)
      );
      metrics.appendChild(card);
    });

    const categories = Utils.createElement("section", "forecast-v3__categories");
    const categoriesCopy = Utils.createElement("div", "forecast-v3__categories-copy");
    categoriesCopy.append(
      Utils.createElement("span", "forecast-v3__eyebrow", "Крупнейшие категории"),
      Utils.createElement("strong", "forecast-v3__title", "На что уйдет основная часть расходов"),
      Utils.createElement(
        "p",
        "forecast-v3__categories-note",
        forecast.categoryForecast.length
          ? "Категории с наибольшим вкладом в прогнозируемый расход следующего месяца."
          : "Прогноз по категориям появится, когда накопится история трат."
      )
    );

    const list = Utils.createElement("div", "forecast-v3__list");
    const totalCategoryAmount = forecast.categoryForecast.reduce((sum, item) => sum + item.amount, 0) || 1;
    if (!forecast.categoryForecast.length) {
      list.appendChild(
        Utils.createElement(
          "div",
          "empty-state empty-state--compact",
          "Прогноз по категориям появится, когда накопится история трат."
        )
      );
    } else {
      forecast.categoryForecast.forEach((item) => {
        const row = Utils.createElement("div", "forecast-v3__row");
        const main = Utils.createElement("div", "forecast-v3__row-main");
        const label = Utils.createElement("span", "forecast-v3__row-name", item.category?.name || "Категория");
        const share = Utils.createElement(
          "span",
          "forecast-v3__row-share",
          `${Utils.formatPercent((item.amount / totalCategoryAmount) * 100)} расходов`
        );
        const bar = Utils.createElement("span", "forecast-v3__bar");
        const fill = Utils.createElement("span", "forecast-v3__fill");
        fill.style.width = `${Math.max(12, Math.min(100, (item.amount / totalCategoryAmount) * 100))}%`;
        fill.style.background = item.category?.color || "var(--info)";
        bar.appendChild(fill);
        main.append(label, share, bar);
        row.append(
          main,
          Utils.createElement("strong", "", Utils.formatMoney(item.amount))
        );
        list.appendChild(row);
      });
    }
    categories.append(categoriesCopy, list);

    const content = Utils.createElement("section", "forecast-v3__content");
    content.append(metrics, categories);

    shell.append(hero, content);
    root.appendChild(shell);
  },
  renderPaymentCalendar() {
    const root = Utils.$("paymentCalendar");
    if (!root) {
      return;
    }
    const calendar = Store.paymentCalendar(Store.viewMonth);
    root.classList.add("payment-calendar--v2");
    root.replaceChildren();

    const activeDate = this.calendarSelectedDate && this.calendarSelectedDate.startsWith(Store.viewMonth)
      ? this.calendarSelectedDate
      : `${Store.viewMonth}-${String((calendar.days.find((item) => item.items.length)?.day || 1)).padStart(2, "0")}`;
    this.calendarSelectedDate = activeDate;

    const shell = Utils.createElement("div", "payment-calendar-v2__shell");
    const rail = Utils.createElement("div", "payment-calendar-v2__rail");
    const activeDays = calendar.days.filter((item) => item.items.length).length;
    const heavyDays = calendar.days.filter((item) => item.isHeavyExpense).length;

    const overview = Utils.createElement("article", "payment-calendar-v2__overview");
    const overviewMeta = Utils.createElement("div", "payment-calendar-v2__overview-meta");
    const activeMeta = Utils.createElement("div", "payment-calendar-v2__overview-stat");
    activeMeta.append(
      Utils.createElement("strong", "", String(activeDays)),
      Utils.createElement("span", "", "Активных дней")
    );
    const heavyMeta = Utils.createElement("div", "payment-calendar-v2__overview-stat");
    heavyMeta.append(
      Utils.createElement("strong", "", String(heavyDays)),
      Utils.createElement("span", "", "Крупных трат")
    );
    overview.append(
      Utils.createElement("span", "payment-calendar-v2__eyebrow", Utils.monthLabel(Store.viewMonth)),
      Utils.createElement("strong", "", "Движение денег по дням"),
      Utils.createElement(
        "p",
        "",
        activeDays
          ? "Выберите день в сетке, чтобы посмотреть движение денег и состав операций."
          : "В этом месяце пока нет активных дней с операциями."
      ),
      overviewMeta
    );
    overviewMeta.append(activeMeta, heavyMeta);

    const board = Utils.createElement("div", "payment-calendar-v2__board");
    const grid = Utils.createElement("div", "payment-calendar-v2__grid");
    calendar.days.forEach((day) => {
      const date = `${Store.viewMonth}-${String(day.day).padStart(2, "0")}`;
      const hasIncome = (day.income || 0) > 0;
      const hasExpense = (day.expense || 0) > 0;
      const button = Utils.createElement(
        "button",
        `payment-calendar-v2__day${date === activeDate ? " is-selected" : ""}${day.isHeavyExpense ? " is-heavy" : ""}${day.items.length ? " has-items" : ""}`
      );
      button.type = "button";
      button.dataset.action = "select-calendar-day";
      button.dataset.date = date;
      button.title = day.items.length
        ? `Доходы: ${Utils.formatMoney(day.income || 0)} • Расходы: ${Utils.formatMoney(day.expense || 0)}`
        : "Без операций";

      const head = Utils.createElement("div", "payment-calendar-v2__day-head");
      head.appendChild(Utils.createElement("span", "payment-calendar-v2__day-number", String(day.day)));
      if (day.items.length) {
        head.appendChild(Utils.createElement("span", "payment-calendar-v2__day-badge", String(day.items.length)));
      }

      const signals = Utils.createElement("div", "payment-calendar-v2__day-signals");
      const incomeSignal = Utils.createElement("span", `payment-calendar-v2__day-signal payment-calendar-v2__day-signal--income${hasIncome ? " is-active" : ""}`);
      const expenseSignal = Utils.createElement("span", `payment-calendar-v2__day-signal payment-calendar-v2__day-signal--expense${hasExpense ? " is-active" : ""}`);
      signals.append(incomeSignal, expenseSignal);

      const dots = Utils.createElement("div", "payment-calendar-v2__day-dots");
      day.items.slice(0, 4).forEach((item) => {
        const dot = Utils.createElement("span", "payment-calendar-v2__day-dot");
        dot.style.background = Store.getCategory(item.categoryId)?.color || "#8b949e";
        dots.appendChild(dot);
      });

      button.append(head, signals, dots);
      grid.appendChild(button);
    });

    while (grid.childElementCount % 7 !== 0) {
      grid.appendChild(Utils.createElement("div", "payment-calendar-v2__placeholder"));
    }

    board.append(grid);
    rail.append(overview, board);

    const details = this.buildPaymentCalendarDetail(calendar, activeDate);

    shell.append(rail, details);
    root.appendChild(shell);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => this.syncPaymentCalendarLayout(root));
    });
  },

  renderAnalyticsBreakdownLegend() {
    const root = Utils.$("analyticsBreakdownLegend");
    if (!root) {
      return;
    }
    const breakdown = Store.expenseBreakdown(Store.viewMonth).slice(0, 7);
    root.replaceChildren();

    if (!breakdown.length) {
      root.appendChild(Utils.createElement("div", "empty-state empty-state--compact", "Появится после первых расходов."));
      return;
    }

    const total = breakdown.reduce((sum, item) => sum + item.amount, 0) || 1;
    const fragment = document.createDocumentFragment();
    breakdown.forEach((item) => {
      const row = Utils.createElement("div", "analytics-breakdown__item");
      const info = Utils.createElement("div", "analytics-breakdown__info");
      const swatch = Utils.createElement("span", "analytics-breakdown__swatch");
      swatch.style.background = item.category?.color || "#8b949e";
      const name = Utils.createElement("span", "analytics-breakdown__name", item.category?.name || "Категория");
      info.append(swatch, name);

      const meta = Utils.createElement("div", "analytics-breakdown__meta");
      const share = Utils.createElement("span", "analytics-breakdown__share", `${((item.amount / total) * 100).toFixed(1)}%`);
      const amount = Utils.createElement("strong", "", Utils.formatMoney(item.amount));
      meta.append(share, amount);

      row.append(info, meta);
      fragment.appendChild(row);
    });

    root.appendChild(fragment);
  },

  renderHeatmap() {
    const root = Utils.$("heatmapWrap");
    if (!root) {
      return;
    }
    if (!this.heatmapMonth) {
      this.heatmapMonth = Store.viewMonth;
    }
    const monthKey = this.heatmapMonth || Store.viewMonth;
    const days = Store.heatmapDays(monthKey);
    const max = Math.max(...days.map((item) => item.amount), 0);
    const activeDays = days.filter((item) => item.amount > 0);
    const peakDay = activeDays.reduce((best, item) => (item.amount > (best?.amount || 0) ? item : best), null);
    const totalSpend = activeDays.reduce((sum, item) => sum + item.amount, 0);

    // Новый heatmap-v2 живет отдельно от старого heatmap-wrap,
    // чтобы к нему не прилипали устаревшие grid-правила из прошлых итераций UI.
    root.className = "heatmap-v2";
    root.replaceChildren();

    const overview = Utils.createElement("article", "heatmap-v2__overview");
    const overviewMeta = Utils.createElement("div", "heatmap-v2__overview-meta");
    [
      [String(activeDays.length), "Активных дней"],
      [peakDay ? `День ${peakDay.day}` : "—", peakDay ? Utils.formatMoney(peakDay.amount) : "Пока без трат"],
      [Utils.formatMoney(totalSpend), "Трат за месяц"]
    ].forEach(([value, note]) => {
      const stat = Utils.createElement("div", "heatmap-v2__overview-stat");
      stat.append(
        Utils.createElement("strong", "", value),
        Utils.createElement("span", "", note)
      );
      overviewMeta.appendChild(stat);
    });
    overview.append(
      Utils.createElement("span", "heatmap-v2__eyebrow", Utils.monthLabel(monthKey)),
      Utils.createElement("strong", "", "Интенсивность трат"),
      Utils.createElement("p", "", activeDays.length ? "Сетка показывает, в какие дни расходы были заметнее." : "После первых расходов здесь появится карта активности по дням."),
      overviewMeta
    );

    const board = Utils.createElement("div", "heatmap-v2__board");
    const boardHead = Utils.createElement("div", "heatmap-v2__board-head");
    const nav = Utils.createElement("div", "heatmap-v2__nav");
    const prevBtn = Utils.createElement("button", "icon-btn icon-btn--tiny heatmap-v2__nav-btn", "←");
    prevBtn.type = "button";
    prevBtn.dataset.action = "shift-heatmap-month";
    prevBtn.dataset.delta = "-1";
    prevBtn.title = "Предыдущий месяц";
    const nextBtn = Utils.createElement("button", "icon-btn icon-btn--tiny heatmap-v2__nav-btn", "→");
    nextBtn.type = "button";
    nextBtn.dataset.action = "shift-heatmap-month";
    nextBtn.dataset.delta = "1";
    nextBtn.title = "Следующий месяц";
    nav.append(prevBtn, nextBtn);
    boardHead.append(Utils.createElement("span", "heatmap-v2__board-caption", Utils.shortMonthLabel(monthKey)), nav);
    const grid = Utils.createElement("div", "heatmap-v2__grid");
    days.forEach((item) => {
      const cell = Utils.createElement(
        "div",
        `heatmap-v2__day${item.amount > 0 ? " has-activity" : ""}`
      );
      const intensity = max ? item.amount / max : 0;
      if (item.amount > 0) {
        cell.style.background = Utils.cssRgb("--accent-rgb", (0.11 + intensity * 0.52).toFixed(3), `rgba(88, 166, 255, ${0.11 + intensity * 0.52})`);
        cell.style.borderColor = Utils.cssRgb("--accent-rgb", 0.24, "rgba(88, 166, 255, 0.24)");
      }
      cell.title = `День ${item.day}: ${item.amount ? Utils.formatMoney(item.amount) : "0 ₽"}`;

      const dayLabel = Utils.createElement("span", "heatmap-v2__day-num", String(item.day));
      const amountLabel = Utils.createElement(
        "strong",
        "heatmap-v2__day-amount",
        item.amount ? Utils.formatMoney(item.amount) : "—"
      );
      cell.append(dayLabel, amountLabel);
      grid.appendChild(cell);
    });
    board.append(boardHead, grid);
    root.append(overview, board);
  },

  renderRecurring() {
    const root = Utils.$("recurringList");
    if (!root) {
      return;
    }
    const items = Store.recurringCandidates();
    if (!items.length) {
      root.replaceChildren(Utils.createElement("div", "empty-state", "Повторяющиеся расходы пока не обнаружены."));
      return;
    }
    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const card = Utils.createElement("article", "recurring-card");
      card.title = item.title;
      const head = Utils.createElement("div", "recurring-card__head");
      const title = Utils.createElement("strong", "", item.title);
      title.title = item.title;
      const jumpButton = Utils.createElement("button", "icon-btn icon-btn--tiny recurring-card__jump", "↗");
      jumpButton.type = "button";
      jumpButton.title = "Показать похожие операции в бюджете";
      jumpButton.setAttribute("aria-label", "Показать похожие операции в бюджете");
      jumpButton.dataset.action = "open-recurring-budget";
      jumpButton.dataset.query = item.title;
      const meta = Utils.createElement("div", "transaction-card__meta");
      meta.append(
        Utils.createElement("span", "", `${item.repeats} мес. повторения`),
        Utils.createElement("span", "", `${Utils.formatMoney(item.averageAmount)} в среднем`),
        Utils.createElement("span", "", item.category?.name || "Категория")
      );
      card.append(
        head,
        meta
      );
      head.append(title, jumpButton);
      fragment.appendChild(card);
    });
    root.replaceChildren(fragment);
  },

  renderDeepStats() {
    const root = Utils.$("deepStats");
    if (!root) {
      return;
    }
    const stats = Store.statsForMonth(Store.viewMonth);
    const activeDays = stats.trend.filter((item) => item.income > 0 || item.expense > 0).length;
    const items = [
      {
        title: "Крупнейший расход",
        value: stats.topExpense ? Utils.formatMoney(stats.topExpense.amount) : "Нет данных",
        note: stats.topExpense ? stats.topExpense.description : "Добавьте расходы"
      },
      {
        title: "Крупнейший доход",
        value: stats.topIncome ? Utils.formatMoney(stats.topIncome.amount) : "Нет данных",
        note: stats.topIncome ? stats.topIncome.description : "Добавьте доход"
      },
      {
        title: "Топ-категория",
        value: stats.topCategory ? stats.topCategory.name : "Нет данных",
        note: stats.topCategory ? `${Utils.formatMoney(stats.topCategoryAmount)} · ${Utils.formatPercent(stats.concentration)} расходов` : "Структура появится после трат"
      },
      {
        title: "Средний расход в день",
        value: Utils.formatMoney(stats.averageExpensePerDay),
        note: "Считает весь месяц, чтобы ритм трат был виден сразу"
      },
      {
        title: "Остаток на конец",
        value: Utils.formatMoney(stats.finalBalance),
        note: "Свободный остаток после всех операций выбранного месяца"
      },
      {
        title: "Активных дней",
        value: String(activeDays),
        note: activeDays
          ? `В ${activeDays} днях месяца было движение денег`
          : "В этом месяце пока не было операций"
      }
    ];
    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const card = Utils.createElement("article", "deep-stat");
      const value = Utils.createElement("div");
      value.style.marginTop = "8px";
      value.style.fontSize = "1.05rem";
      value.style.fontWeight = "800";
      value.textContent = item.value;
      const note = Utils.createElement("small", "", item.note);
      note.style.display = "block";
      note.style.marginTop = "8px";
      card.append(
        Utils.createElement("strong", "", item.title),
        value,
        note
      );
      fragment.appendChild(card);
    });
    root.replaceChildren(fragment);
  },

});
