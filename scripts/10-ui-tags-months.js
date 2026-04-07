Object.assign(UI, {
  renderTagStats() {
    const root = Utils.$("tagStatsGrid");
    if (!root) {
      return;
    }
    const searchInput = Utils.$("tagSearchInput");
    if (searchInput && searchInput.value !== this.tagsSearchQuery) {
      searchInput.value = this.tagsSearchQuery;
    }
    const visibleTags = this.getVisibleTagCatalog();
    const visibleNames = new Set(visibleTags.map((tag) => tag.name));
    const groups = Store.tagGroups(Store.viewMonth).filter((group) => visibleNames.has(group.tag));
    const taggedTransactions = new Set();
    groups.forEach((group) => group.items.forEach((item) => taggedTransactions.add(item.id)));
    const cards = [
      ["В каталоге", String(visibleTags.length)],
      ["Активно сейчас", String(groups.length)],
      ["С операциями", String(taggedTransactions.size)],
      ["Фокус", groups[0]?.tag || "—"]
    ];
    root.replaceChildren();
    const fragment = document.createDocumentFragment();
    cards.forEach(([label, value]) => {
      const card = Utils.createElement("article", "tag-stat-card");
      card.append(
        Utils.createElement("span", "tag-stat-card__label", label),
        Utils.createElement("strong", "tag-stat-card__value", value)
      );
      fragment.appendChild(card);
    });
    root.appendChild(fragment);
  },

  renderTagCatalog() {
    const root = Utils.$("tagCatalogList");
    if (!root) {
      return;
    }
    const tags = this.getVisibleTagCatalog();
    const groups = Store.tagGroups(Store.viewMonth);
    const selectedName = this.resolveSelectedTagName(tags);
    root.replaceChildren();
    if (!tags.length) {
      const message = this.tagsSearchQuery
        ? "По текущему запросу теги не найдены."
        : "Теги появятся после первых пометок в операциях или после ручного добавления.";
      root.appendChild(Utils.createElement("div", "empty-state empty-state--compact", message));
      return;
    }

    const fragment = document.createDocumentFragment();
    tags.forEach((tag) => {
      const currentGroup = groups.find((item) => item.tag === tag.name);
      const detail = Store.tagUsageDetails(tag.name, Store.viewMonth);
      const article = Utils.createElement("article", `tag-catalog-item${tag.name === selectedName ? " is-active" : ""}`);
      article.style.setProperty("--tag-color", tag.color);
      const select = Utils.createElement("button", "tag-catalog-item__select");
      select.type = "button";
      select.dataset.action = "select-tag";
      select.dataset.tag = tag.name;
      const main = Utils.createElement("div", "tag-catalog-item__main");
      const swatch = Utils.createElement("span", "category-item__swatch tag-catalog-item__swatch");
      swatch.style.background = tag.color;
      const info = Utils.createElement("div", "tag-catalog-item__info");
      const title = Utils.createElement("strong", "", tag.name);
      title.title = tag.name;
      const meta = Utils.createElement("div", "tag-catalog-item__meta");
      const usageText = currentGroup ? `${currentGroup.items.length} операций в месяце` : "Пока не используется в текущем месяце";
      const usage = Utils.createElement("span", "tag-catalog-item__usage", usageText);
      usage.title = usageText;
      const noteText = tag.note || "Без описания";
      const note = Utils.createElement("span", "tag-catalog-item__note", noteText);
      note.title = noteText;
      meta.append(
        usage,
        note
      );
      info.append(title, meta);
      const count = Utils.createElement("span", "tag-catalog-item__count", detail?.monthCount ? String(detail.monthCount) : "0");
      count.title = `${detail?.monthCount || 0} использований`;
      main.append(swatch, info);
      select.append(main, count);
      article.append(select);
      fragment.appendChild(article);
    });
    root.appendChild(fragment);
  },

  renderTagGroups() {
    const root = Utils.$("tagGroupList");
    const title = Utils.$("tagDetailTitle");
    const toolbar = Utils.$("tagDetailToolbar");
    if (!root) {
      return;
    }
    const visibleTags = this.getVisibleTagCatalog();
    const selectedName = this.resolveSelectedTagName(visibleTags);
    const detail = Store.tagUsageDetails(selectedName, Store.viewMonth);

    root.replaceChildren();
    if (toolbar) {
      toolbar.replaceChildren();
    }
    if (!detail) {
      if (title) {
        title.textContent = "Операции и связи";
      }
      root.appendChild(Utils.createElement("div", "empty-state empty-state--compact", this.tagsSearchQuery
        ? "Ничего не найдено по текущему запросу."
        : "Выберите тег или создайте новый, чтобы смотреть операции, категории и связи в одном месте."));
      return;
    }

    this.selectedTagName = detail.tag;
    if (title) {
      title.textContent = detail.tag;
    }

    if (toolbar) {
      const openButton = Utils.createElement("button", "chip-btn", "Показать в бюджете");
      openButton.type = "button";
      openButton.dataset.action = "filter-tag";
      openButton.dataset.tag = detail.tag;
      const editButton = Utils.createElement("button", "chip-btn", "Редактировать");
      editButton.type = "button";
      editButton.dataset.action = "edit-tag";
      editButton.dataset.id = detail.definition?.id || "";
      toolbar.append(openButton, editButton);
    }

    const shell = Utils.createElement("div", "tag-detail");
    const hero = Utils.createElement("article", "tag-detail-card tag-detail-card--hero");
    hero.style.setProperty("--tag-color", detail.definition?.color || "#58a6ff");

    const heroHead = Utils.createElement("div", "tag-detail-card__head");
    const chip = Utils.createElement("span", "tag-chip tag-chip--soft is-active tag-chip--static");
    chip.style.setProperty("--tag-color", detail.definition?.color || "#58a6ff");
    chip.textContent = detail.tag;
    const heroNote = Utils.createElement("p", "tag-detail-card__note", detail.definition?.note || "Тег помогает быстро собрать операции, шаблоны и цели в одну тему.");
    heroHead.append(chip, Utils.createElement("span", "tag-detail-card__stamp", detail.lastUsedAt ? `Последнее изменение ${Utils.timeSince(detail.lastUsedAt)}` : "Пока без истории"));
    hero.append(heroHead, heroNote);

    const metricGrid = Utils.createElement("div", "tag-detail-card__metrics");
    [
      ["Операций в месяце", String(detail.monthCount)],
      ["Всего операций", String(detail.totalCount)],
      ["Расходы", Utils.formatMoney(detail.expense)],
      ["Доходы", Utils.formatMoney(detail.income)],
      ["Шаблоны и избранное", String(detail.templatesCount + detail.favoritesCount)],
      ["Цели по тегу", String(detail.goalsCount)]
    ].forEach(([label, value]) => {
      const card = Utils.createElement("div", "tag-metric-card");
      card.append(
        Utils.createElement("span", "tag-metric-card__label", label),
        Utils.createElement("strong", "tag-metric-card__value", value)
      );
      metricGrid.appendChild(card);
    });
    hero.appendChild(metricGrid);

    const content = Utils.createElement("div", "tag-detail__content");

    const categoriesCard = Utils.createElement("article", "tag-detail-card");
    categoriesCard.append(
      Utils.createElement("p", "eyebrow", "Категории"),
      Utils.createElement("h4", "", "Куда этот тег уводит бюджет")
    );
    const categoriesList = Utils.createElement("div", "tag-detail-list");
    if (detail.expenseCategories.length) {
      const totalExpense = detail.expense || 0;
      detail.expenseCategories.slice(0, 5).forEach((item) => {
        const row = Utils.createElement("div", "tag-detail-row");
        const left = Utils.createElement("div", "tag-detail-row__main");
        const swatch = Utils.createElement("span", "tag-detail-row__swatch");
        swatch.style.background = item.color;
        const name = Utils.createElement("span", "tag-detail-row__name", item.name);
        left.append(swatch, name);
        const right = Utils.createElement("div", "tag-detail-row__meta");
        const amount = Utils.createElement("strong", "", Utils.formatMoney(item.amount));
        const share = Utils.createElement("span", "", totalExpense > 0 ? `${Utils.roundMoney((item.amount / totalExpense) * 100, 1)}%` : "0%");
        right.append(amount, share);
        row.append(left, right);
        categoriesList.appendChild(row);
      });
    } else {
      categoriesList.appendChild(Utils.createElement("div", "empty-state empty-state--compact", "В текущем месяце этот тег пока не встречается в расходах."));
    }
    categoriesCard.appendChild(categoriesList);

    const recentCard = Utils.createElement("article", "tag-detail-card");
    recentCard.append(
      Utils.createElement("p", "eyebrow", "Последние операции"),
      Utils.createElement("h4", "", "Что помечено этим тегом")
    );
    const recentList = Utils.createElement("div", "tag-detail-list tag-detail-list--scroll");
    if (detail.recentItems.length) {
      detail.recentItems.forEach((item) => {
        const row = Utils.createElement("div", "tag-detail-transaction");
        row.title = item.description || "Без описания";
        const meta = Utils.createElement("div", "tag-detail-transaction__meta");
        const transactionTitle = Utils.createElement("strong", "", item.description || "Без описания");
        transactionTitle.title = item.description || "Без описания";
        meta.append(
          transactionTitle,
          Utils.createElement("span", "", `${Utils.formatDate(item.date)} • ${(Store.getCategory(item.categoryId)?.name || "Без категории")}`)
        );
        const amount = Utils.createElement("strong", item.type === "income" ? "amount-positive" : "amount-negative", Utils.formatMoney(item.amount));
        const side = Utils.createElement("div", "tag-detail-transaction__side");
        const openButton = Utils.createElement("button", "icon-btn icon-btn--tiny tag-detail-transaction__jump", "↗");
        openButton.type = "button";
        openButton.title = "Показать эту операцию в бюджете";
        openButton.setAttribute("aria-label", "Показать эту операцию в бюджете");
        openButton.dataset.action = "open-tag-transaction";
        openButton.dataset.id = item.id;
        side.append(amount, openButton);
        row.append(meta, side);
        recentList.appendChild(row);
      });
    } else {
      recentList.appendChild(Utils.createElement("div", "empty-state empty-state--compact", "История по тегу появится после первых операций."));
    }
    recentCard.appendChild(recentList);

    content.append(categoriesCard, recentCard);
    shell.append(hero, content);
    root.appendChild(shell);
  },

  renderTransactionTagSuggestions(selectedTags = []) {
    const root = Utils.$("transactionTagsSuggestions");
    if (!root) {
      return;
    }
    const active = new Set(Utils.normalizeTags(selectedTags));
    const tags = Store.getTagCatalog();
    root.replaceChildren();
    if (!tags.length) {
      root.appendChild(Utils.createElement("div", "empty-state empty-state--compact", "Сначала создайте тег или введите его вручную."));
      return;
    }
    const fragment = document.createDocumentFragment();
    tags.forEach((tag) => {
      const chip = Utils.createElement("button", `tag-chip tag-chip--soft${active.has(tag.name) ? " is-active" : ""}`);
      chip.type = "button";
      chip.dataset.tagSuggestion = tag.name;
      chip.style.setProperty("--tag-color", tag.color);
      chip.textContent = tag.name;
      fragment.appendChild(chip);
    });
    root.appendChild(fragment);
  },

  renderMonthsOverview() {
    const root = Utils.$("monthsOverviewStats");
    const monthKeys = Store.getMonthKeys();
    if (!root) {
      return;
    }
    root.replaceChildren();
    if (!monthKeys.length) {
      return;
    }

    const statsList = monthKeys.map((monthKey) => Store.statsForMonth(monthKey));
    const profitable = statsList.filter((item) => item.totals.balance >= 0).length;
    const bestMonth = statsList.reduce((best, item) => (!best || item.totals.balance > best.totals.balance ? item : best), null);
    const selectedMonth = statsList.find((item) => item.monthKey === Store.detailMonth) || statsList[0];

    [
      {
        label: "В архиве",
        value: `${monthKeys.length} мес.`,
        note: `${profitable} месяцев в плюсе`
      },
        {
          label: "Максимальный чистый итог",
          value: bestMonth ? Utils.formatMoney(bestMonth.totals.balance) : "0 ₽",
          note: bestMonth ? Utils.monthLabel(bestMonth.monthKey) : "Пока без данных",
          title: bestMonth
            ? `Месяц, в котором доходы превысили расходы сильнее всего: ${Utils.monthLabel(bestMonth.monthKey)}`
            : "Появится после накопления истории по месяцам"
        },
        {
          label: "Главная статья расходов",
          value: selectedMonth?.topCategory ? selectedMonth.topCategory.name : "Без лидера",
          note: selectedMonth?.topCategory
            ? Utils.formatMoney(selectedMonth.topCategoryAmount)
            : "Главная статья расходов выбранного месяца",
          title: selectedMonth?.topCategory
            ? `Категория с наибольшими расходами в выбранном месяце: ${selectedMonth.topCategory.name}`
            : "Появится после первых расходов в выбранном месяце"
        }
      ].forEach((item) => {
        const card = Utils.createElement("div", "month-overview-stat");
        card.title = item.title || item.note;
        card.append(
          Utils.createElement("span", "month-overview-stat__label", item.label),
          Utils.createElement("strong", "month-overview-stat__value", item.value),
        Utils.createElement("small", "month-overview-stat__note", item.note)
      );
      root.appendChild(card);
    });
  },

  renderMonthsTable() {
    const root = Utils.$("monthsTable");
    const monthKeys = Store.getMonthKeys();
    if (!root) {
      return;
    }
    if (!monthKeys.length) {
      root.replaceChildren(Utils.createElement("div", "empty-state", "Месячная статистика появится после первых операций."));
      return;
    }

    const fragment = document.createDocumentFragment();
    monthKeys.forEach((monthKey) => {
      const stats = Store.statsForMonth(monthKey);
      const netClass = stats.totals.balance >= 0 ? "amount-positive" : "amount-negative";
      const focusLabel = stats.topCategory
        ? `${stats.topCategory.name} • ${Utils.formatMoney(stats.topCategoryAmount)}`
        : stats.topExpense
          ? stats.topExpense.description
          : "Пока без расходов";

      const button = Utils.createElement("button", `month-table__row month-table__row--compact ${Store.detailMonth === monthKey ? "is-active" : ""}`);
      button.type = "button";
      button.dataset.action = "open-month";
      button.dataset.month = monthKey;

      const headline = Utils.createElement("div", "month-table__headline");
      const title = Utils.createElement("div", "month-table__title");
      const meta = Utils.createElement("div", "month-table__meta");
      title.appendChild(Utils.createElement("strong", "", Utils.monthLabel(monthKey)));
      [
        `${stats.operations} операций`,
        `${Utils.formatPercent(Math.max(0, stats.savingsRate))} накопления`,
        `Средний чек ${Utils.formatMoney(stats.averageCheck)}`
      ].forEach((text) => meta.appendChild(Utils.createElement("span", "", text)));
      title.appendChild(meta);

        const result = Utils.createElement("div", "month-table__result");
        result.title = "Итог месяца: сколько осталось после всех доходов и расходов";
        result.append(
          Utils.createElement("span", "month-table__result-label", "Итог месяца"),
          Utils.createElement("strong", netClass, Utils.formatMoney(stats.totals.balance))
        );
      headline.append(title, result);

      const totals = Utils.createElement("div", "month-table__totals");
      [
        ["Доход", Utils.formatMoney(stats.totals.income), "amount-positive"],
        ["Расход", Utils.formatMoney(stats.totals.expense), "amount-negative"],
        ["Остаток", Utils.formatMoney(stats.finalBalance), ""]
      ].forEach(([label, value, tone]) => {
        const card = Utils.createElement("div", "month-mini-stat");
        card.append(
          Utils.createElement("span", "", label),
          Utils.createElement("strong", tone, value)
        );
        totals.appendChild(card);
      });

        const focus = Utils.createElement("div", "month-table__focus");
        focus.title = stats.topExpense ? `Главная статья расходов этого месяца: ${focusLabel}` : focusLabel;
        focus.append(
          Utils.createElement("span", "month-table__focus-label", "Главная статья расходов"),
          Utils.createElement("strong", "month-table__focus-value", Utils.truncateSingleLine(focusLabel, 54))
        );

      button.append(headline, totals, focus);
      fragment.appendChild(button);
    });
    root.replaceChildren(fragment);
  },

  renderOverviewExpenseLegend() {
    const root = Utils.$("overviewCategoryLegend");
    if (!root) {
      return;
    }
    const breakdown = Store.expenseBreakdown(Store.viewMonth).slice(0, 6);
    if (!breakdown.length) {
      root.replaceChildren(Utils.createElement("div", "empty-state empty-state--compact", "Появится после первых расходов"));
      return;
    }
    const fragment = document.createDocumentFragment();
    breakdown.forEach((item) => {
      const chip = Utils.createElement("div", "legend-chip");
      chip.title = `${item.category.name}: ${Utils.formatMoney(item.amount)}`;
      const dot = Utils.createElement("span", "legend-chip__dot");
      dot.style.background = item.category.color;
      const label = Utils.createElement("span", "legend-chip__label", item.category.name);
      const amount = Utils.createElement("strong", "", Utils.formatMoney(item.amount));
      chip.append(dot, label, amount);
      fragment.appendChild(chip);
    });
    root.replaceChildren(fragment);
  },

  renderMonthBalanceChart() {
    const canvas = Utils.$("monthBalanceChart");
    if (typeof window.Chart === "undefined" || !canvas) {
      return;
    }
    if (this.monthTrendCollapsed) {
      if (this.charts.monthBalance) {
        this.charts.monthBalance.destroy();
        this.charts.monthBalance = null;
      }
      return;
    }

    const stats = Store.statsForMonth(Store.viewMonth);
    const isCurrentMonth = Store.viewMonth === Utils.monthKey(new Date());
    const colors = Utils.themePalette();

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const gradientHeight = canvas.parentElement?.clientHeight || canvas.height || 260;
    const gradient = context.createLinearGradient(0, 0, 0, gradientHeight);
    gradient.addColorStop(0, colors.fillTop);
    gradient.addColorStop(1, colors.fillBottom);

    const labels = stats.trend.map((point) => point.day);
    const todayLinePlugin = {
      id: "monthTodayMarker",
      afterDatasetsDraw: (chart) => {
        if (!isCurrentMonth) {
          return;
        }
        const todayIndex = Math.min(new Date().getDate(), stats.daysInMonth) - 1;
        const xScale = chart.scales.x;
        const area = chart.chartArea;
        if (!xScale || !area || todayIndex < 0) {
          return;
        }
        const x = xScale.getPixelForValue(todayIndex);
        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = colors.marker;
        ctx.moveTo(x, area.top);
        ctx.lineTo(x, area.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = colors.textSoft;
        ctx.font = "600 11px Inter, sans-serif";
        ctx.fillText("Сегодня", Math.min(x + 6, area.right - 46), area.top + 14);
        ctx.restore();
      }
    };

    if (this.charts.monthBalance) {
      this.charts.monthBalance.destroy();
    }

    this.charts.monthBalance = new window.Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Чистое движение за день",
            yAxisID: "delta",
            data: stats.trend.map((point) => point.delta),
            backgroundColor: stats.trend.map((point) => point.delta >= 0 ? colors.gain : colors.loss),
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 10,
            order: 2
          },
          {
            type: "line",
            label: "Баланс",
            yAxisID: "balance",
            data: stats.trend.map((point) => point.balance),
            borderColor: colors.line,
            backgroundColor: gradient,
            fill: true,
            tension: 0.34,
            borderWidth: 2.5,
            pointBackgroundColor: colors.line,
            pointBorderWidth: 0,
            pointHoverRadius: 4,
            pointRadius: (ctx) => {
              const day = ctx.dataIndex + 1;
              return day === stats.minBalanceDay || day === stats.currentDay || day === stats.daysInMonth ? 3 : 0;
            },
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          legend: {
            labels: {
              color: colors.text,
              usePointStyle: true
            }
          },
          tooltip: {
            backgroundColor: colors.bgSolid,
            titleColor: colors.text,
            bodyColor: colors.text,
            borderColor: colors.grid,
            borderWidth: 1,
            callbacks: {
              title: (items) => `День ${items[0]?.label || ""}`,
              afterBody: (items) => {
                const point = stats.trend[items[0]?.dataIndex ?? 0];
                return [
                  `Доходы: ${Utils.formatMoney(point.income)}`,
                  `Расходы: ${Utils.formatMoney(point.expense)}`
                ];
              },
              label: (ctx) => `${ctx.dataset.label}: ${Utils.formatMoney(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: colors.textSoft,
              autoSkip: false,
              maxRotation: 0,
              callback: (value, index) => {
                const day = labels[index];
                return day === 1 || day === stats.daysInMonth || day % 5 === 0 ? day : "";
              }
            },
            grid: {
              display: false
            }
          },
          balance: {
            position: "left",
            ticks: {
              color: colors.text,
              callback: (value) => Utils.formatMoney(value)
            },
            grid: {
              color: colors.grid
            }
          },
          delta: {
            position: "right",
            display: false,
            grid: {
              display: false
            }
          }
        }
      },
      plugins: [todayLinePlugin]
    });
    this.scheduleChartResize();
  },

    renderMonthDetail() {
      const monthKey = Store.detailMonth;
      const stats = Store.statsForMonth(monthKey);
      const topCategories = Store.expenseBreakdown(monthKey).slice(0, 4);
      const title = Utils.$("monthDetailTitle");
    const root = Utils.$("monthDetail");
    const toolbar = Utils.$("monthDetailToolbar");
    if (title) {
      title.textContent = Utils.monthLabel(monthKey);
    }
    if (!root) {
      return;
    }
    if (toolbar) {
      toolbar.replaceChildren();
      toolbar.hidden = true;
    }
    root.replaceChildren();

      const metricGrid = Utils.createElement("div", "month-detail__hero");
      [
        ["Итог месяца", Utils.formatMoney(stats.totals.balance), stats.totals.balance >= 0 ? "amount-positive" : "amount-negative", "Разница между всеми доходами и расходами выбранного месяца"],
        ["Осталось к концу", Utils.formatMoney(stats.finalBalance), "", "Сумма, которая осталась к концу выбранного месяца"],
        ["Все доходы", Utils.formatMoney(stats.totals.income), "amount-positive", "Все поступления, которые пришли в выбранном месяце"],
        ["Все расходы", Utils.formatMoney(stats.totals.expense), "amount-negative", "Все списания, которые произошли в выбранном месяце"],
        ["Количество операций", String(stats.operations), "", "Сколько операций попало в выбранный месяц"],
        ["Старт месяца", Utils.formatMoney(stats.startBalance), "", "С каким балансом начался выбранный месяц"]
      ].forEach(([label, value, valueClass, title]) => {
        const card = Utils.createElement("article", "month-detail__hero-card");
        card.title = title;
        card.append(
          Utils.createElement("span", "month-detail__hero-label", label),
          Utils.createElement("strong", valueClass, value)
        );
      metricGrid.appendChild(card);
    });

    const body = Utils.createElement("div", "month-detail__body");

    const summaryCard = Utils.createElement("article", "month-detail__card month-detail__card--facts");
    summaryCard.appendChild(Utils.createElement("strong", "", "Ключевые точки"));
    const summaryList = Utils.createElement("div", "month-detail__list");
    [
      ["Накопление", Utils.formatPercent(Math.max(0, stats.savingsRate))],
      ["Средний чек", Utils.formatMoney(stats.averageCheck)],
      ["Средний расход в день", Utils.formatMoney(stats.averageExpensePerDay)],
      ["Долги", Utils.formatMoney(stats.totals.debt)],
      ["Обязательные", Utils.formatMoney(stats.totals.recurring)],
      ["Минимальный баланс", Utils.formatMoney(stats.minBalance)],
      ["Крупнейший доход", stats.topIncome ? `${stats.topIncome.description} • ${Utils.formatMoney(stats.topIncome.amount)}` : "Пока без доходов"],
      ["Крупнейший расход", stats.topExpense ? `${stats.topExpense.description} • ${Utils.formatMoney(stats.topExpense.amount)}` : "Пока без расходов"]
    ].forEach(([label, value]) => {
      const row = Utils.createElement("div", "month-detail__metric month-detail__metric--row");
      const isOperationLabel = label === "Крупнейший доход" || label === "Крупнейший расход";
      if (isOperationLabel) {
        row.title = value;
      }
      const valueNode = Utils.createElement("strong", "", value);
      if (isOperationLabel) {
        valueNode.title = value;
      }
      row.append(
        Utils.createElement("span", "", label),
        valueNode
      );
      summaryList.appendChild(row);
    });
    summaryCard.appendChild(summaryList);

    const topCard = Utils.createElement("article", "month-detail__card month-detail__card--structure");
    topCard.appendChild(Utils.createElement("strong", "", "Куда ушли деньги"));
    const topList = Utils.createElement("div", "month-detail__categories");
    if (topCategories.length) {
      const totalExpense = stats.totals.expense || 1;
      topCategories.forEach((item) => {
        const row = Utils.createElement("div", "month-detail__category");
        const head = Utils.createElement("div", "month-detail__category-head");
        const info = Utils.createElement("div", "month-detail__category-info");
        const swatch = Utils.createElement("span", "month-detail__category-swatch");
        swatch.style.background = item.category?.color || "#8b949e";
        info.append(
          swatch,
          Utils.createElement("span", "month-detail__category-name", item.category?.name || "Категория")
        );
        head.append(
          info,
          Utils.createElement("strong", "", Utils.formatMoney(item.amount))
        );

        const bar = Utils.createElement("div", "month-detail__category-bar");
        const fill = Utils.createElement("span", "month-detail__category-fill");
        fill.style.width = `${Math.max(8, (item.amount / totalExpense) * 100)}%`;
        fill.style.background = item.category?.color || "#8b949e";
        bar.appendChild(fill);

        const meta = Utils.createElement("div", "month-detail__category-meta");
        meta.appendChild(Utils.createElement("span", "", `${Utils.formatPercent((item.amount / totalExpense) * 100)} от расходов`));

        row.append(head, bar, meta);
        topList.appendChild(row);
      });
    } else {
      topList.appendChild(Utils.createElement("div", "empty-state empty-state--compact", "Расходная структура появится после первых трат."));
    }
    topCard.appendChild(topList);

    body.append(summaryCard, topCard);
    root.append(metricGrid, body);
  },

});
