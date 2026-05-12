const refs = {
  feedStatus: document.getElementById("feed-status"),
  latestUpdate: document.getElementById("latest-update"),
  refreshStatus: document.getElementById("refresh-status"),
  summaryGrid: document.getElementById("summary-grid"),
  headlineGrid: document.getElementById("headline-grid"),
  bestBets: document.getElementById("best-bets"),
  walletList: document.getElementById("wallet-list"),
  marketRadar: document.getElementById("market-radar"),
  insiderTape: document.getElementById("insider-tape"),
  graphDeck: document.getElementById("graph-deck"),
  pulsePanels: document.getElementById("pulse-panels")
};

const OVERLAY_PATH = "data/overlay-feed.json";

const dateTimeFormatter = new Intl.DateTimeFormat("nb-NO", {
  dateStyle: "medium",
  timeStyle: "short"
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat("nb-NO", { numeric: "auto" });

async function fetchJSON(path, optional = false) {
  try {
    const response = await fetch(`${path}?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (optional) {
      return null;
    }
    throw error;
  }
}

async function loadDashboard() {
  try {
    const overlayFeed = await fetchJSON(OVERLAY_PATH, true);
    renderDashboard(overlayFeed);
  } catch (error) {
    console.error("Failed to load overlay feed", error);
    renderDashboard(null);
  }
}

function renderDashboard(overlayFeed) {
  if (!overlayFeed) {
    renderUnavailableState();
    return;
  }

  renderHero(overlayFeed);
  renderBestBets(overlayFeed.market);
  renderWallets(overlayFeed.wallets);
  renderMarketRadar(overlayFeed.market);
  renderInsiderTape(overlayFeed.insider);
  renderGraphDeck(overlayFeed);
  renderPulse(overlayFeed);
}

function renderUnavailableState() {
  refs.feedStatus.textContent = "0/3 feeds online";
  refs.latestUpdate.textContent = "No sync yet";
  refs.refreshStatus.textContent = "Run sync-data.sh";

  refs.summaryGrid.innerHTML = [
    summaryCard("Shared feed", "offline"),
    summaryCard("Best bets", 0),
    summaryCard("Tracked wallets", 0),
    summaryCard("Insider signals", 0)
  ].join("");

  refs.headlineGrid.innerHTML = [
    leadHeadline(
      "Overlay feed",
      "Waiting for first sync",
      "Run `./webpage/scripts/sync-data.sh` to build `data/overlay-feed.json`."
    ),
    leadHeadline(
      "Wallet command",
      "Rose + Haak appear here",
      "The shared feed will include wallet advice as soon as wallet-watcher has exported a snapshot."
    ),
    leadHeadline(
      "Desktop-ready",
      "Same contract for web and app",
      "This page now expects one app-friendly overlay feed instead of reading each bot export directly."
    )
  ].join("");

  const message = "Shared overlay feed missing. Run `./webpage/scripts/sync-data.sh` to rebuild `webpage/data/overlay-feed.json`.";
  refs.bestBets.innerHTML = renderEmpty(message);
  refs.walletList.innerHTML = renderEmpty(message);
  refs.marketRadar.innerHTML = renderEmpty(message);
  refs.insiderTape.innerHTML = renderEmpty(message);
  refs.graphDeck.innerHTML = renderEmpty(message);
  refs.pulsePanels.innerHTML = renderEmpty(message);
}

function renderHero(overlayFeed) {
  const summary = overlayFeed.summary || {};
  const syncAt = overlayFeed.sync?.generatedAt || overlayFeed.generatedAt || null;
  const feedsOnline = summary.feedsOnline ?? availableSourceCount(overlayFeed.sources);

  refs.feedStatus.textContent = `${feedsOnline}/3 feeds online`;
  refs.latestUpdate.textContent = syncAt ? formatDateTime(syncAt) : "No sync yet";
  refs.refreshStatus.textContent = syncAt
    ? `Synced ${formatRelativeTime(syncAt)}`
    : `Overlay v${overlayFeed.schemaVersion || "?"}`;

  refs.summaryGrid.innerHTML = [
    summaryCard("Best bets", summary.bestBetCount ?? safeArray(overlayFeed.market?.bestBets).length),
    summaryCard("Tracked wallets", summary.trackedWalletCount ?? overlayFeed.wallets?.summary?.walletCount ?? 0),
    summaryCard("Open positions", summary.openPositionCount ?? overlayFeed.wallets?.summary?.openPositionCount ?? 0),
    summaryCard("Actionable calls", summary.actionablePositionCount ?? overlayFeed.wallets?.summary?.actionablePositionCount ?? 0),
    summaryCard("Insider signals", summary.insiderSignalCount ?? overlayFeed.insider?.summary?.totalSignals ?? 0),
    summaryCard("Source-led", summary.sourceSignalCount ?? 0),
    summaryCard("Cross-signal", summary.crossSignalCount ?? 0),
    summaryCard("Kalshi matched", summary.kalshiMatchedCount ?? 0)
  ].join("");

  refs.headlineGrid.innerHTML = [
    renderLeadCard(overlayFeed.leads?.market, "Market leader"),
    renderLeadCard(overlayFeed.leads?.wallets, "Wallet command"),
    renderLeadCard(overlayFeed.leads?.insider, "Insider tape")
  ].join("");
}

function renderBestBets(marketSection) {
  if (!marketSection?.available) {
    refs.bestBets.innerHTML = renderEmpty("`overlay-feed.json` has no active `market-trans` payload yet.");
    return;
  }

  const signals = safeArray(marketSection.bestBets);
  refs.bestBets.innerHTML = signals.length
    ? signals.map(renderSignalCard).join("")
    : renderEmpty("No curated market bets are listed in the shared feed right now.");
}

function renderWallets(walletSection) {
  if (!walletSection?.available) {
    refs.walletList.innerHTML = renderEmpty("`overlay-feed.json` has no wallet snapshot yet. Run wallet-watcher and sync again.");
    return;
  }

  const wallets = safeArray(walletSection.wallets)
    .slice()
    .sort((lhs, rhs) => walletSortScore(rhs) - walletSortScore(lhs));

  const walletCards = wallets.length
    ? wallets.map(renderWalletCard).join("")
    : renderEmpty("No watched wallets were exported into the shared feed.");

  const placeholderNote = walletSection.synced === false
    ? renderEmpty("Showing tracked wallets from config only. Run wallet-watcher again to fill positions and live advice.")
    : "";

  refs.walletList.innerHTML = `${placeholderNote}${walletCards}`;
}

function renderMarketRadar(marketSection) {
  if (!marketSection?.available) {
    refs.marketRadar.innerHTML = renderEmpty("Market radar appears once the market section is present in the shared feed.");
    return;
  }

  const status = marketSection.status || {};
  const signals = safeArray(marketSection.radar);

  const metaHTML = `
    <div class="radar-meta">
      ${miniBadge("Active signals", status.activeSignalCount ?? 0)}
      ${miniBadge("Official watch", status.officialPostWatchCount ?? 0)}
      ${miniBadge("Suspicious wallets", status.suspiciousWalletCount ?? 0)}
      ${miniBadge("XGBoost rows", status.xgboostRowCount ?? 0)}
    </div>
  `;

  const listHTML = signals.length
    ? `<div class="compact-list">${signals.map(renderCompactSignalCard).join("")}</div>`
    : renderEmpty("No extra live market signals outside the main board right now.");

  refs.marketRadar.innerHTML = `${metaHTML}${listHTML}`;
}

function renderInsiderTape(insiderSection) {
  if (!insiderSection?.available) {
    refs.insiderTape.innerHTML = renderEmpty("Insider tape appears when `etoro-bot` has been synced into the shared feed.");
    return;
  }

  const summary = insiderSection.summary || {};
  const signals = safeArray(insiderSection.signals);

  const metaHTML = `
    <div class="radar-meta">
      ${miniBadge("Fetched", summary.totalFilingsFetched ?? 0)}
      ${miniBadge("Ranked", summary.totalSignals ?? 0)}
      ${miniBadge("Listed", summary.listedSignals ?? signals.length)}
    </div>
  `;

  const listHTML = signals.length
    ? `<div class="compact-list">${signals.map(renderInsiderCard).join("")}</div>`
    : renderEmpty("No insider signals are listed in the shared feed.");

  refs.insiderTape.innerHTML = `${metaHTML}${listHTML}`;
}

function renderGraphDeck(overlayFeed) {
  const charts = overlayFeed.charts || {};
  refs.graphDeck.innerHTML = [
    renderMarketFlowPanel(charts.marketFlow),
    renderConvictionWindowPanel(charts.marketWindow),
    renderWalletCommandPanel(charts.walletCommand),
    renderInsiderConvictionPanel(charts.insiderConviction),
    renderSourceFreshnessPanel(charts.sourceFreshness)
  ].join("");
}

function renderMarketFlowPanel(chart) {
  const items = safeArray(chart?.items);
  if (!items.length) {
    return renderGraphPanel(
      "Market flow map",
      "Net weighted flow on the highest-priority bets.",
      renderEmpty("No market flow series available in the shared feed.")
    );
  }

  const maxValue = Number(chart?.maxAbsFlowUSD) || 1;
  const rows = items.map((item) => {
    const fill = clampPercent((item.absFlowUSD / maxValue) * 100);
    const buyFill = isSellDirection(item.direction) ? 0 : fill;
    const sellFill = isSellDirection(item.direction) ? fill : 0;
    return `
      <div class="flow-row">
        <div class="flow-head">
          <div>
            <strong class="flow-label">${escapeHTML(item.shortLabel || item.title)}</strong>
            <p class="graph-meta-line">${escapeHTML(item.outcome)} · ${escapeHTML(String(item.confidence || 0))}/100 · ${escapeHTML(formatDaysToEnd(item.daysToEnd))}</p>
          </div>
          <strong class="flow-value ${isSellDirection(item.direction) ? "sell" : "buy"}">${escapeHTML(formatCompactUSD(item.flowUSD))}</strong>
        </div>
        <div class="flow-balance">
          <div class="flow-half left">
            <div class="flow-bar sell" style="--fill:${sellFill}%"></div>
          </div>
          <div class="flow-half right">
            <div class="flow-bar buy" style="--fill:${buyFill}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  return renderGraphPanel(
    "Market flow map",
    "Net weighted flow on the highest-priority bets.",
    `<div class="flow-list">${rows}</div>`
  );
}

function renderConvictionWindowPanel(chart) {
  const items = safeArray(chart?.items);
  if (!items.length) {
    return renderGraphPanel(
      "Conviction window",
      "Confidence against time-to-resolution.",
      renderEmpty("No signal window series available in the shared feed.")
    );
  }

  const width = 520;
  const height = 250;
  const padLeft = 42;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 36;
  const usableWidth = width - padLeft - padRight;
  const usableHeight = height - padTop - padBottom;
  const maxDays = Number(chart?.maxDaysToEnd) || 1;
  const maxFlow = Number(chart?.maxAbsFlowUSD) || 1;
  const yTicks = [25, 50, 75, 100];
  const xTicks = [0, Math.round(maxDays / 2), maxDays];

  const svg = `
    <svg class="plot-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Confidence against days to end">
      ${yTicks.map((tick) => {
        const y = padTop + usableHeight - (tick / 100) * usableHeight;
        return `
          <line class="plot-grid" x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}"></line>
          <text class="plot-tick" x="${padLeft - 10}" y="${y + 4}" text-anchor="end">${tick}</text>
        `;
      }).join("")}
      ${xTicks.map((tick) => {
        const x = padLeft + (tick / maxDays) * usableWidth;
        return `
          <line class="plot-grid plot-grid-vertical" x1="${x}" y1="${padTop}" x2="${x}" y2="${height - padBottom}"></line>
          <text class="plot-tick" x="${x}" y="${height - 10}" text-anchor="middle">${tick}d</text>
        `;
      }).join("")}
      <line class="plot-axis" x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}"></line>
      <line class="plot-axis" x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}"></line>
      ${items.map((item) => {
        const days = Math.max(0, Number(item.daysToEnd ?? maxDays));
        const confidence = clamp(Number(item.confidence) || 0, 0, 100);
        const x = padLeft + (days / maxDays) * usableWidth;
        const y = padTop + usableHeight - (confidence / 100) * usableHeight;
        const radius = 5 + ((Number(item.absFlowUSD) || 0) / maxFlow) * 9;
        const pointClass = isSellDirection(item.direction) ? "sell" : "buy";
        return `
          <circle class="plot-point ${pointClass}" cx="${x}" cy="${y}" r="${radius}">
            <title>${escapeHTML(item.title)} | ${escapeHTML(item.outcome)} | ${escapeHTML(String(item.confidence || 0))}/100 | ${escapeHTML(formatDaysToEnd(item.daysToEnd))}</title>
          </circle>
        `;
      }).join("")}
    </svg>
  `;

  const legend = `
    <div class="plot-legend">
      ${items.slice(0, 5).map((item) => `
        <div class="plot-legend-item">
          <span class="plot-dot ${isSellDirection(item.direction) ? "sell" : "buy"}"></span>
          <span>${escapeHTML(item.shortLabel)} · ${escapeHTML(formatTake(item.take))}</span>
        </div>
      `).join("")}
    </div>
  `;

  return renderGraphPanel(
    "Conviction window",
    "Confidence against time-to-resolution across the live board.",
    `${svg}${legend}`
  );
}

function renderWalletCommandPanel(chart) {
  const items = safeArray(chart?.items);
  if (!items.length) {
    return renderGraphPanel(
      "Wallet command board",
      "Wallet-level pressure and actionability.",
      renderEmpty("No wallet series available in the shared feed.")
    );
  }

  const maxValue = Number(chart?.maxValueUSD) || 1;
  const note = chart?.synced === false
    ? `<p class="graph-note">Showing tracked wallets from config. Live positions appear here after the next wallet-watcher export.</p>`
    : "";
  const rows = items.map((item) => {
    const fill = maxValue > 0 ? clampPercent((item.totalCurrentValue / maxValue) * 100) : 0;
    return `
      <div class="wallet-graph-row">
        <div class="wallet-graph-head">
          <strong>${escapeHTML(item.label)}</strong>
          <strong>${escapeHTML(formatCompactUSD(item.totalCurrentValue))}</strong>
        </div>
        <div class="wallet-graph-track">
          <div class="wallet-graph-fill" style="--fill:${fill}%"></div>
        </div>
        <p class="graph-meta-line">${escapeHTML(String(item.openPositionCount || 0))} open · ${escapeHTML(String(item.actionablePositionCount || 0))} actionable · ${escapeHTML(String(item.recentActivityCount || 0))} recent trades</p>
      </div>
    `;
  }).join("");

  return renderGraphPanel(
    "Wallet command board",
    "Tracked wallets sized by current value with activity context.",
    `${note}<div class="wallet-graph-list">${rows}</div>`
  );
}

function renderInsiderConvictionPanel(chart) {
  const items = safeArray(chart?.items);
  if (!items.length) {
    return renderGraphPanel(
      "Insider conviction",
      "Largest fresh insider values in the ranked tape.",
      renderEmpty("No insider conviction series available in the shared feed.")
    );
  }

  const maxValue = Number(chart?.maxAbsTradeValueUSD) || 1;
  const rows = items.map((item) => {
    const fill = clampPercent((item.absTradeValueUSD / maxValue) * 100);
    const directionClass = isSellDirection(item.direction) ? "sell" : "buy";
    return `
      <div class="insider-graph-row">
        <div class="insider-graph-head">
          <strong>${escapeHTML(item.ticker)}</strong>
          <strong class="${directionClass}">${escapeHTML(formatCompactUSD(item.tradeValueUSD))}</strong>
        </div>
        <div class="insider-graph-track">
          <div class="insider-graph-fill ${directionClass}" style="--fill:${fill}%"></div>
        </div>
        <p class="graph-meta-line">${escapeHTML(item.insiderName || "Unknown insider")} · ${escapeHTML(String(item.confidence || 0))}/100 · ${escapeHTML(formatRelativeTime(item.filedAt))}</p>
      </div>
    `;
  }).join("");

  return renderGraphPanel(
    "Insider conviction",
    "Largest fresh insider values in the ranked tape.",
    `<div class="insider-graph-list">${rows}</div>`
  );
}

function renderSourceFreshnessPanel(chart) {
  const items = safeArray(chart?.items);
  if (!items.length) {
    return renderGraphPanel(
      "Source freshness",
      "Live, placeholder, or missing across the three source feeds.",
      renderEmpty("No freshness series available in the shared feed.")
    );
  }

  const cards = items.map((item) => `
    <article class="freshness-card ${escapeHTML(item.status || "missing")}">
      <div class="freshness-head">
        <span class="freshness-dot ${escapeHTML(item.status || "missing")}"></span>
        <strong>${escapeHTML(item.label)}</strong>
      </div>
      <p class="freshness-value">${escapeHTML(item.generatedAt ? formatRelativeTime(item.generatedAt) : "No live sync")}</p>
      <p class="graph-meta-line">${escapeHTML(formatFreshnessStatus(item.status))}</p>
    </article>
  `).join("");

  return renderGraphPanel(
    "Source freshness",
    "Live, placeholder, or missing across the three source feeds.",
    `<div class="freshness-grid">${cards}</div>`
  );
}

function renderGraphPanel(title, description, body) {
  return `
    <article class="graph-panel">
      <div class="pulse-head">
        <div>
          <span class="panel-kicker">Graph deck</span>
          <h3>${escapeHTML(title)}</h3>
        </div>
      </div>
      <p class="meta-line">${escapeHTML(description)}</p>
      ${body}
    </article>
  `;
}

function renderPulse(overlayFeed) {
  const pulse = overlayFeed.pulse || {};
  refs.pulsePanels.innerHTML = [
    renderBarPanel(
      "Market mix",
      "How the current bets board is distributed in the shared feed.",
      safeArray(pulse.marketMix)
    ),
    renderBarPanel(
      "Wallet actions",
      "Current recommendation spread across Rose and Haak.",
      safeArray(pulse.walletActions)
    ),
    renderBarPanel(
      "Insider direction",
      "Fresh directional balance from the ranked insider feed.",
      safeArray(overlayFeed.insider?.directionMix)
    ),
    renderHealthPanel(safeArray(pulse.systemHealth))
  ].join("");
}

function renderLeadCard(lead, fallbackKicker) {
  if (!lead) {
    return leadHeadline(
      fallbackKicker,
      "Waiting for shared feed data",
      "This card fills in as soon as the relevant source has synced into `overlay-feed.json`."
    );
  }

  return leadHeadline(
    lead.kicker || fallbackKicker,
    lead.title || "No title",
    lead.body || "No summary"
  );
}

function leadHeadline(kicker, title, body) {
  return `
    <article class="headline-card">
      <span class="headline-kicker">${escapeHTML(kicker)}</span>
      <strong>${escapeHTML(title)}</strong>
      <p>${escapeHTML(body)}</p>
    </article>
  `;
}

function renderSignalCard(signal) {
  const marketURL = signal.marketURL || buildPolymarketURL(signal.slug, signal.eventSlug);
  const directionClass = isSellDirection(signal.direction) ? "sell" : "buy";
  const xgboostBadge = signal.xgboostStance
    ? `<span class="badge ${escapeHTML(signal.xgboostStance)}">${escapeHTML(formatStance(signal.xgboostStance))}</span>`
    : "";

  return `
    <article class="signal-card">
      <div class="card-top">
        <div class="badges">
          <span class="badge ${directionClass}">${escapeHTML(formatDirection(signal.direction))}</span>
          <span class="badge neutral">${escapeHTML(formatCategory(signal.category))}</span>
          <span class="badge neutral">${escapeHTML(formatTake(signal.take))}</span>
          ${xgboostBadge}
        </div>
        <span class="badge neutral">${escapeHTML(String(signal.confidence || 0))}/100</span>
      </div>

      <h3 class="signal-title"><a href="${escapeAttribute(marketURL)}" target="_blank" rel="noreferrer">${escapeHTML(signal.title)}</a></h3>

      <div class="signal-copy">
        <p>${escapeHTML(signal.marketBiasSummary || "Live market signal from market-trans.")}</p>
      </div>

      <div class="card-metrics">
        ${metricChip("Outcome", plainOutcome(signal.outcome))}
        ${metricChip("Price now", formatMarketPrice(signal.currentMarketPrice))}
        ${metricChip("Weighted flow", formatCompactUSD(signal.weightedFlowUSD))}
        ${metricChip("Traders", signal.uniqueTraderCount ?? 0)}
        ${metricChip("Tx", signal.uniqueTransactionCount ?? 0)}
        ${metricChip("Deadline", formatDaysToEnd(signal.daysToEnd))}
      </div>

      <div class="signal-footer">
        <span class="footer-note">${escapeHTML(formatRelativeTimeFromUnix(signal.latestTradeTimestamp))}</span>
        <a class="signal-link" href="${escapeAttribute(marketURL)}" target="_blank" rel="noreferrer">Open market</a>
      </div>
    </article>
  `;
}

function renderWalletCard(wallet) {
  const positions = safeArray(wallet.positions)
    .slice()
    .sort((lhs, rhs) => walletPositionSortScore(rhs) - walletPositionSortScore(lhs));

  return `
    <article class="wallet-card">
      <div class="wallet-head">
        <div>
          <p class="section-kicker">Watched wallet</p>
          <h3 class="wallet-title"><a href="${escapeAttribute(wallet.walletURL)}" target="_blank" rel="noreferrer">${escapeHTML(wallet.label)}</a></h3>
          <p class="wallet-subcopy">${escapeHTML(shortWallet(wallet.wallet))}</p>
        </div>
        <div class="wallet-meta">
          <span class="badge neutral">${wallet.openPositionCount || 0} open</span>
          <span class="badge ${(wallet.actionablePositionCount || 0) > 0 ? "buy" : "neutral"}">${wallet.actionablePositionCount || 0} actionable</span>
        </div>
      </div>

      <div class="wallet-summary">
        ${miniStat("Value", formatCompactUSD(wallet.totalCurrentValue))}
        ${miniStat("24h trades", wallet.recentActivityCount || 0)}
        ${miniStat("Last activity", formatRelativeTimeFromUnix(wallet.lastActivityTimestamp))}
        ${miniStat("Positions", wallet.openPositionCount || 0)}
      </div>

      <div class="positions">
        ${positions.length ? positions.map(renderWalletPosition).join("") : renderEmpty("No open positions in the latest wallet snapshot.")}
      </div>
    </article>
  `;
}

function renderWalletPosition(position) {
  const advice = position.advice;
  const actionKey = advice?.action || "neutral";
  const actionLabel = advice?.actionLabel || "No live call";
  const signalURL = getWalletSignalURL(position);
  const signalSummary = advice
    ? `${advice.relationLabel} · ${advice.signal.title} · ${advice.signal.confidence}/100`
    : "No direct live signal attached to this position.";

  return `
    <article class="wallet-position">
      <div class="card-top">
        <div class="badges">
          <span class="badge ${escapeHTML(actionKey)}">${escapeHTML(actionLabel)}</span>
          <span class="badge neutral">${escapeHTML(plainOutcome(position.outcome))}</span>
          ${advice?.xgboostStance ? `<span class="badge ${escapeHTML(advice.xgboostStance)}">${escapeHTML(formatStance(advice.xgboostStance))}</span>` : ""}
        </div>
        <span class="badge neutral">${escapeHTML(formatSignedPercent(position.percentPnL))}</span>
      </div>

      <div class="wallet-position-copy">
        <h4 class="compact-title"><a href="${escapeAttribute(position.marketURL)}" target="_blank" rel="noreferrer">${escapeHTML(position.title)}</a></h4>
        <p>${escapeHTML(signalSummary)}</p>
      </div>

      <div class="position-meta">
        ${miniBadge("Current", formatCompactUSD(position.currentValue))}
        ${miniBadge("Entry", formatMarketPrice(position.averageEntryPrice))}
        ${miniBadge("Now", formatMarketPrice(position.currentPrice))}
        ${miniBadge("Size", formatSignedNumber(position.size))}
        ${miniBadge("Deadline", formatDaysToEndFromDate(position.endDate))}
        ${advice ? miniBadge("Why", `${advice.supportingSignalCount}/${advice.opposingSignalCount}`) : ""}
      </div>

      <div class="compact-footer">
        <a class="signal-link" href="${escapeAttribute(signalURL)}" target="_blank" rel="noreferrer">Open signal</a>
      </div>
    </article>
  `;
}

function renderCompactSignalCard(signal) {
  const marketURL = signal.marketURL || buildPolymarketURL(signal.slug, signal.eventSlug);
  return `
    <article class="compact-card">
      <div class="compact-head">
        <div>
          <p class="compact-title"><a href="${escapeAttribute(marketURL)}" target="_blank" rel="noreferrer">${escapeHTML(signal.title)}</a></p>
        </div>
        <span class="badge ${isSellDirection(signal.direction) ? "sell" : "buy"}">${escapeHTML(formatDirection(signal.direction))}</span>
      </div>
      <div class="compact-copy">
        <p>${escapeHTML(plainOutcome(signal.outcome))} · ${escapeHTML(formatCategory(signal.category))} · ${escapeHTML(String(signal.confidence || 0))}/100</p>
      </div>
      <div class="compact-footer">
        ${miniBadge("Price", formatMarketPrice(signal.currentMarketPrice))}
        ${miniBadge("Flow", formatCompactUSD(signal.weightedFlowUSD))}
        ${miniBadge("Traders", signal.uniqueTraderCount || 0)}
        ${miniBadge("Seen", formatRelativeTimeFromUnix(signal.latestTradeTimestamp))}
      </div>
    </article>
  `;
}

function renderInsiderCard(signal) {
  const directionClass = isSellDirection(signal.direction) ? "sell bearish" : "buy bullish";
  const externalURL = signal.externalURL || signal.secFormURL || signal.sourceURL || "#";

  return `
    <article class="compact-card">
      <div class="compact-head">
        <div>
          <p class="compact-title"><a href="${escapeAttribute(externalURL)}" target="_blank" rel="noreferrer">${escapeHTML(signal.ticker)} · ${escapeHTML(signal.companyName)}</a></p>
        </div>
        <span class="badge ${directionClass}">${escapeHTML(isSellDirection(signal.direction) ? "Bearish" : "Bullish")}</span>
      </div>
      <div class="compact-copy">
        <p>${escapeHTML(signal.insiderName)} · ${escapeHTML(signal.insiderTitle)} · ${escapeHTML(String(signal.confidence || 0))}/100</p>
        <p>${escapeHTML(signal.summary || "")}</p>
      </div>
      <div class="compact-footer">
        ${miniBadge("Filed", formatDateTime(signal.filedAt))}
        ${miniBadge("Trade", formatCompactUSD(signal.tradeValueUSD))}
        ${miniBadge("Type", signal.transactionType || "unknown")}
        ${miniBadge("Watchlist", signal.watchlistMatch ? "Yes" : "No")}
      </div>
    </article>
  `;
}

function renderBarPanel(title, description, items) {
  if (!items.length) {
    return `
      <article class="pulse-panel">
        <div class="pulse-head">
          <div>
            <span class="panel-kicker">Pulse</span>
            <h3>${escapeHTML(title)}</h3>
          </div>
        </div>
        <p class="meta-line">${escapeHTML(description)}</p>
        ${renderEmpty("No data to chart yet.")}
      </article>
    `;
  }

  const maxValue = Math.max(...items.map((item) => Number(item.value) || 0), 1);
  return `
    <article class="pulse-panel">
      <div class="pulse-head">
        <div>
          <span class="panel-kicker">Pulse</span>
          <h3>${escapeHTML(title)}</h3>
        </div>
      </div>
      <p class="meta-line">${escapeHTML(description)}</p>
      <div class="bar-list">
        ${items.map((item) => renderBarRow(item, maxValue)).join("")}
      </div>
    </article>
  `;
}

function renderHealthPanel(rows) {
  return `
    <article class="pulse-panel">
      <div class="pulse-head">
        <div>
          <span class="panel-kicker">Pulse</span>
          <h3>System health</h3>
        </div>
      </div>
      <p class="meta-line">Quick checks across the synced overlay sources.</p>
      <div class="health-list">
        ${rows.map((row) => `
          <div class="health-row">
            <span>${escapeHTML(String(row.label || "-"))}</span>
            <strong>${escapeHTML(formatHealthValue(row.value))}</strong>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderBarRow(item, maxValue) {
  const numericValue = Number(item.value) || 0;
  const fill = Math.max(6, (numericValue / maxValue) * 100);
  return `
    <div class="bar-row">
      <div class="bar-head">
        <span class="bar-label">${escapeHTML(item.label)}</span>
        <span class="bar-value">${escapeHTML(String(item.value))}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="--fill:${fill}%"></div>
      </div>
    </div>
  `;
}

function summaryCard(label, value) {
  return `
    <article class="summary-card">
      <span class="summary-label">${escapeHTML(label)}</span>
      <strong>${escapeHTML(String(value ?? "-"))}</strong>
    </article>
  `;
}

function metricChip(label, value) {
  return `
    <div class="metric-chip">
      <span class="mini-label">${escapeHTML(label)}</span>
      <strong>${escapeHTML(String(value ?? "-"))}</strong>
    </div>
  `;
}

function miniStat(label, value) {
  return `
    <div class="mini-stat">
      <span class="mini-label">${escapeHTML(label)}</span>
      <strong>${escapeHTML(String(value ?? "-"))}</strong>
    </div>
  `;
}

function miniBadge(label, value) {
  return `<span class="mini-badge neutral">${escapeHTML(label)}: ${escapeHTML(String(value ?? "-"))}</span>`;
}

function renderEmpty(message) {
  return `<article class="empty-card"><p>${message}</p></article>`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampPercent(value) {
  return clamp(value || 0, 0, 100);
}

function availableSourceCount(sources) {
  return Object.values(sources || {}).reduce((count, source) => {
    const status = source?.synced ?? source?.available;
    return count + (status ? 1 : 0);
  }, 0);
}

function walletSortScore(wallet) {
  return (
    (wallet.actionablePositionCount || 0) * 1000 +
    (wallet.totalCurrentValue || 0) +
    ((wallet.recentActivityCount || 0) * 10)
  );
}

function walletPositionSortScore(position) {
  return (
    (position.advice?.isActionable ? 1000 : 0) +
    (position.currentValue || 0) +
    ((position.advice?.signal?.confidence || 0) * 10)
  );
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isSellDirection(value) {
  return value === "sell" || value === "bearish";
}

function getWalletSignalURL(position) {
  const signal = position.advice?.signal;
  const fallbackSignalURL = buildPolymarketURL(signal?.slug, signal?.eventSlug);
  return signal?.marketURL ||
    position.marketURL ||
    (fallbackSignalURL !== "#" ? fallbackSignalURL : "#");
}

function formatCategory(value) {
  if (!value) {
    return "Other";
  }
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatTake(value) {
  if (!value) {
    return "Watch";
  }
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDirection(value) {
  if (isSellDirection(value)) {
    return "Sell";
  }
  if (value === "buy" || value === "bullish") {
    return "Buy";
  }
  return formatTake(value);
}

function formatStance(value) {
  const map = {
    supports: "Model supports",
    skeptical: "Model skeptical",
    mixed: "Model mixed"
  };
  return map[value] || formatTake(value);
}

function plainOutcome(value) {
  if (!value) {
    return "Unknown";
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "yes") {
    return "YES";
  }
  if (normalized === "no") {
    return "NO";
  }
  return value;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return dateTimeFormatter.format(date);
}

function formatRelativeTime(value) {
  if (!value) {
    return "now";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "now";
  }
  return formatRelativeTimeFromDate(date);
}

function formatRelativeTimeFromUnix(value) {
  if (!value) {
    return "No recent trade";
  }
  return formatRelativeTimeFromDate(new Date(value * 1000));
}

function formatRelativeTimeFromDate(date) {
  const diffMs = date.getTime() - Date.now();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (Math.abs(diffMs) < hour) {
    return relativeTimeFormatter.format(Math.round(diffMs / minute), "minute");
  }
  if (Math.abs(diffMs) < day) {
    return relativeTimeFormatter.format(Math.round(diffMs / hour), "hour");
  }
  return relativeTimeFormatter.format(Math.round(diffMs / day), "day");
}

function formatCompactUSD(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(Number(value));
}

function formatMarketPrice(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  const cents = Number(value) * 100;
  const digits = Math.abs(cents - Math.round(cents)) < 0.05 ? 0 : 1;
  return `${cents.toFixed(digits)}c`;
}

function formatSignedPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  const numeric = Number(value);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(1)}%`;
}

function formatSignedNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  const numeric = Number(value);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(2)}`;
}

function formatDaysToEnd(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  const numeric = Number(value);
  if (numeric <= 0) {
    return "Today";
  }
  if (numeric === 1) {
    return "1 day";
  }
  return `${numeric} days`;
}

function formatDaysToEndFromDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  const diffDays = Math.round((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  return formatDaysToEnd(diffDays);
}

function formatHealthValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime()) && value.includes("T")) {
      return formatDateTime(value);
    }
  }
  return String(value);
}

function formatFreshnessStatus(value) {
  const map = {
    live: "Live source",
    placeholder: "Placeholder only",
    missing: "Missing source"
  };
  return map[value] || "Unknown status";
}

function shortWallet(value) {
  if (!value || value.length < 12) {
    return value || "-";
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function buildPolymarketURL(slug, eventSlug) {
  const preferred = String(eventSlug || slug || "").trim();
  if (!preferred) {
    return "#";
  }
  return `https://polymarket.com/event/${encodeURIComponent(preferred)}`;
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHTML(value || "#");
}

loadDashboard();
setInterval(loadDashboard, 60_000);
