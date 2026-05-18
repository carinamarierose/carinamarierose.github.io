const refs = {
  feedStatus: document.getElementById("feed-status"),
  latestUpdate: document.getElementById("latest-update"),
  refreshStatus: document.getElementById("refresh-status"),
  opsGrid: document.getElementById("ops-grid"),
  sourceStrip: document.getElementById("source-strip"),
  summaryGrid: document.getElementById("summary-grid"),
  headlineGrid: document.getElementById("headline-grid"),
  bestBets: document.getElementById("best-bets"),
  walletRail: document.getElementById("wallet-rail"),
  walletToolbar: document.getElementById("wallet-toolbar"),
  walletList: document.getElementById("wallet-list"),
  marketRadar: document.getElementById("market-radar"),
  insiderTape: document.getElementById("insider-tape"),
  graphDeck: document.getElementById("graph-deck"),
  pulsePanels: document.getElementById("pulse-panels"),
  intelSummaryGrid: document.getElementById("intel-summary-grid"),
  intelMarketFeed: document.getElementById("intel-market-feed"),
  intelInsiderFeed: document.getElementById("intel-insider-feed"),
  intelMixGrid: document.getElementById("intel-mix-grid"),
  xgboostTrendGrid: document.getElementById("xgboost-trend-grid"),
  xgboostSummaryGrid: document.getElementById("xgboost-summary-grid"),
  xgboostPanelGrid: document.getElementById("xgboost-panel-grid"),
  xgboostModelTop: document.getElementById("xgboost-model-top"),
  xgboostSwiftTop: document.getElementById("xgboost-swift-top"),
  pinnedToolbar: document.getElementById("pinned-toolbar"),
  pinnedSummaryGrid: document.getElementById("pinned-summary-grid"),
  pinnedGrid: document.getElementById("pinned-grid"),
  walletHistoryToolbar: document.getElementById("wallet-history-toolbar"),
  walletHistorySummaryGrid: document.getElementById("wallet-history-summary-grid"),
  walletHistoryGraphGrid: document.getElementById("wallet-history-graph-grid"),
  historySummaryGrid: document.getElementById("history-summary-grid"),
  historyGraphGrid: document.getElementById("history-graph-grid"),
  historyTape: document.getElementById("history-tape"),
  historyInsiderArchive: document.getElementById("history-insider-archive")
};
const viewTabs = Array.from(document.querySelectorAll("[data-view-target]"));
const viewPanels = Array.from(document.querySelectorAll("[data-view-panel]"));

const OVERLAY_PATH = "data/overlay-feed.json";
const PINNED_STORAGE_KEY = "stonkvision-pinned-items-v1";

const dateTimeFormatter = new Intl.DateTimeFormat("nb-NO", {
  dateStyle: "medium",
  timeStyle: "short"
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat("nb-NO", { numeric: "auto" });
const WALLET_HISTORY_SERIES_PALETTE = [
  "rgba(114, 215, 255, 0.96)",
  "rgba(80, 224, 164, 0.96)",
  "rgba(255, 191, 105, 0.95)",
  "rgba(255, 127, 114, 0.96)",
  "rgba(143, 183, 255, 0.95)",
  "rgba(255, 170, 122, 0.95)",
  "rgba(94, 234, 212, 0.95)",
  "rgba(245, 158, 11, 0.95)",
  "rgba(167, 243, 208, 0.95)",
  "rgba(253, 186, 116, 0.95)"
];
const appState = {
  overlayFeed: null,
  pinRegistry: new Map(),
  pinnedIds: loadPinnedIds(),
  walletWorkspace: {
    focus: "actionable",
    sort: "urgency"
  },
  walletHistory: {
    breakdown: "total",
    metric: "value"
  },
  graphSelections: {
    marketFlow: null,
    marketWindow: null,
    walletCommand: null,
    insiderConviction: null
  },
  intelFocusID: null
};

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
    appState.overlayFeed = null;
    appState.pinRegistry = new Map();
    renderUnavailableState();
    return;
  }

  appState.overlayFeed = overlayFeed;
  appState.pinRegistry = buildPinRegistry(overlayFeed);
  prunePinnedItems();

  renderHero(overlayFeed);
  renderBestBets(overlayFeed.market);
  renderWallets(overlayFeed.wallets);
  renderMarketRadar(overlayFeed.market);
  renderInsiderTape(overlayFeed.insider);
  renderGraphDeck(overlayFeed);
  renderPulse(overlayFeed);
  renderIntel(overlayFeed.intel);
  renderXGBoost(overlayFeed.xgboost);
  renderPinnedWorkspace(overlayFeed);
  renderWalletHistory(overlayFeed.wallets?.history);
  renderHistory(overlayFeed.history);
  applyIntelFocus();
}

function renderUnavailableState() {
  refs.feedStatus.textContent = "0/3 feeds online";
  refs.latestUpdate.textContent = "No sync yet";
  refs.refreshStatus.textContent = "Run sync-data.sh";
  refs.opsGrid.innerHTML = [
    renderOpsCard(
      "Pipeline",
      "Waiting for first sync",
      "No runtime metadata yet.",
      "Run ./webpage/scripts/sync-data.sh to build the shared feed.",
      [{ label: "Offline", className: "sell" }]
    )
  ].join("");
  refs.sourceStrip.innerHTML = `
    <article class="source-strip-card missing">
      <div class="compact-head">
        <div>
          <p class="section-kicker">Sources</p>
          <strong class="source-strip-title">No synced source state</strong>
        </div>
        <span class="badge sell">Missing</span>
      </div>
      <p class="graph-meta-line">Waiting for overlay-feed.json.</p>
    </article>
  `;

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
  refs.walletRail.innerHTML = renderEmpty(message);
  refs.walletToolbar.innerHTML = "";
  refs.walletList.innerHTML = renderEmpty(message);
  refs.marketRadar.innerHTML = renderEmpty(message);
  refs.insiderTape.innerHTML = renderEmpty(message);
  refs.graphDeck.innerHTML = renderEmpty(message);
  refs.pulsePanels.innerHTML = renderEmpty(message);
  refs.intelSummaryGrid.innerHTML = renderEmpty(message);
  refs.intelMarketFeed.innerHTML = renderEmpty(message);
  refs.intelInsiderFeed.innerHTML = renderEmpty(message);
  refs.intelMixGrid.innerHTML = renderEmpty(message);
  refs.xgboostTrendGrid.innerHTML = renderEmpty(message);
  refs.xgboostSummaryGrid.innerHTML = renderEmpty(message);
  refs.xgboostPanelGrid.innerHTML = renderEmpty(message);
  refs.xgboostModelTop.innerHTML = renderEmpty(message);
  refs.xgboostSwiftTop.innerHTML = renderEmpty(message);
  refs.pinnedToolbar.innerHTML = "";
  refs.pinnedSummaryGrid.innerHTML = renderEmpty(message);
  refs.pinnedGrid.innerHTML = renderEmpty(message);
  refs.walletHistoryToolbar.innerHTML = "";
  refs.walletHistorySummaryGrid.innerHTML = renderEmpty(message);
  refs.walletHistoryGraphGrid.innerHTML = renderEmpty(message);
  refs.historySummaryGrid.innerHTML = renderEmpty(message);
  refs.historyGraphGrid.innerHTML = renderEmpty(message);
  refs.historyTape.innerHTML = renderEmpty(message);
  refs.historyInsiderArchive.innerHTML = renderEmpty(message);
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
  refs.opsGrid.innerHTML = renderOperationalGrid(overlayFeed);
  refs.sourceStrip.innerHTML = renderSourceStrip(overlayFeed);

  refs.summaryGrid.innerHTML = [
    summaryCard("Best bets", summary.bestBetCount ?? safeArray(overlayFeed.market?.bestBets).length),
    summaryCard("Tracked wallets", summary.trackedWalletCount ?? overlayFeed.wallets?.summary?.walletCount ?? 0),
    summaryCard("Open positions", summary.openPositionCount ?? overlayFeed.wallets?.summary?.openPositionCount ?? 0),
    summaryCard("Actionable calls", summary.actionablePositionCount ?? overlayFeed.wallets?.summary?.actionablePositionCount ?? 0),
    summaryCard("Insider signals", summary.insiderSignalCount ?? overlayFeed.insider?.summary?.totalSignals ?? 0),
    summaryCard("History rows", summary.evaluatedSignalCount ?? overlayFeed.history?.market?.summary?.evaluationRowCount ?? 0),
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

function renderOperationalGrid(overlayFeed) {
  const pipeline = overlayFeed.sync?.pipeline || {};
  const runtime = pipeline.runtime || {};
  const viewSurface = detectFeedSurface(runtime);
  const sourceOverview = summarizeSourceOverview(overlayFeed.sources);
  const xgboostModel = overlayFeed.xgboost?.model || {};
  const xgboostIdentity = parseXGBoostIdentity(xgboostModel);
  const steps = safeArray(pipeline.steps);
  const completedSteps = steps.filter((item) => item.status === "live" && !item.skipped).length;
  const skippedSteps = steps.filter((item) => item.skipped).length;
  const launchAgent = runtime.launchAgent || {};
  const pipelineTitle = pipeline.scope === "partial"
    ? `${formatPipelineStatus(pipeline.status)} · Partial`
    : formatPipelineStatus(pipeline.status);
  const pipelineMeta = [
    completedSteps ? `${completedSteps}/${steps.length || completedSteps} step${completedSteps === 1 ? "" : "s"}` : null,
    skippedSteps ? `${skippedSteps} skipped` : null,
    pipeline.durationSeconds ? `${Math.round(pipeline.durationSeconds)}s` : null
  ].filter(Boolean).join(" · ");
  const surfaceMeta = [
    runtime.mode ? `Pipeline ran in ${runtime.mode} mode` : null,
    launchAgent.installed ? "LaunchAgent installed" : "LaunchAgent not installed",
    launchAgent.runsFromServiceCopy ? "Service copy active" : null
  ].filter(Boolean).join(" · ");
  const sourceMeta = [
    `${sourceOverview.liveCount} live`,
    sourceOverview.partialCount ? `${sourceOverview.partialCount} partial` : null,
    sourceOverview.cachedCount ? `${sourceOverview.cachedCount} cached` : null,
    sourceOverview.problemCount ? `${sourceOverview.problemCount} issue${sourceOverview.problemCount === 1 ? "" : "s"}` : null
  ].filter(Boolean).join(" · ");
  const xgboostMeta = [
    xgboostIdentity.trainWindowLabel !== "n/a" ? `${xgboostIdentity.trainWindowLabel} train` : null,
    xgboostIdentity.predictionHorizonLabel !== "n/a" ? `${xgboostIdentity.predictionHorizonLabel} prediction` : null,
    xgboostIdentity.scopeLabel
  ].filter(Boolean).join(" · ");

  return [
    renderOpsCard(
      "Pipeline",
      pipelineTitle,
      pipelineMeta || "No pipeline timing available.",
      pipeline.scopeReason || pipeline.statusReason || "No pipeline status reason available.",
      [{ label: formatFreshnessStatus(pipeline.status), className: sourceStatusBadgeClass(pipeline.status) }]
    ),
    renderOpsCard(
      "Feed surface",
      viewSurface.label,
      surfaceMeta || viewSurface.detail,
      viewSurface.detail,
      [{ label: viewSurface.badgeLabel, className: viewSurface.badgeClassName }]
    ),
    renderOpsCard(
      "Sources",
      sourceOverview.title,
      sourceMeta,
      sourceOverview.detail,
      sourceOverview.badges
    ),
    renderOpsCard(
      "XGBoost",
      compactXGBoostModelLabel(xgboostModel),
      xgboostMeta || "No model identity exported.",
      xgboostModel.shadowMatchLabel
        ? `${xgboostModel.shadowMatchLabel} · ${describeXGBoostPrediction(xgboostModel, xgboostIdentity)}`
        : describeXGBoostPrediction(xgboostModel, xgboostIdentity),
      [
        { label: xgboostModel.shadowMatchLabel || "No shadow state", className: xgboostModel.shadowMatchClassName || "neutral" },
        { label: xgboostIdentity.scopeBadgeLabel, className: "neutral" }
      ]
    )
  ].join("");
}

function renderSourceStrip(overlayFeed) {
  const entries = orderedSourceEntries(overlayFeed.sources);
  if (!entries.length) {
    return `
      <article class="source-strip-card missing">
        <div class="compact-head">
          <div>
            <p class="section-kicker">Sources</p>
            <strong class="source-strip-title">No source diagnostics</strong>
          </div>
          <span class="badge sell">Missing</span>
        </div>
        <p class="graph-meta-line">No source objects were exported into overlay-feed.json.</p>
      </article>
    `;
  }

  return entries.map(([key, source]) => {
    const status = effectiveSourceStatus(source);
    const reason = sourceReason(source);
    const freshness = source.generatedAt ? formatRelativeTime(source.generatedAt) : "No live sync";
    return `
      <article class="source-strip-card ${escapeHTML(status)}">
        <div class="compact-head">
          <div>
            <p class="section-kicker">${escapeHTML(sourceDisplayName(key))}</p>
            <strong class="source-strip-title">${escapeHTML(freshness)}</strong>
          </div>
          <span class="badge ${escapeHTML(sourceStatusBadgeClass(status))}">${escapeHTML(formatFreshnessStatus(status))}</span>
        </div>
        <p class="graph-meta-line">${escapeHTML(reason)}</p>
      </article>
    `;
  }).join("");
}

function renderOpsCard(kicker, title, body, detail, badges = []) {
  return `
    <article class="ops-card">
      <div class="compact-head">
        <div>
          <p class="section-kicker">${escapeHTML(kicker)}</p>
          <strong class="ops-title">${escapeHTML(title)}</strong>
        </div>
        <div class="badges">
          ${safeArray(badges).map((item) => `<span class="badge ${escapeHTML(item.className || "neutral")}">${escapeHTML(item.label)}</span>`).join("")}
        </div>
      </div>
      <p class="ops-body">${escapeHTML(body || "-")}</p>
      <p class="graph-meta-line">${escapeHTML(detail || "-")}</p>
    </article>
  `;
}

function sourceDisplayName(key) {
  const labels = {
    market: "Market",
    wallets: "Wallets",
    insider: "Insider",
    history: "History",
    pipeline: "Pipeline"
  };
  return labels[key] || String(key || "Source");
}

function orderedSourceEntries(sources) {
  const sourceMap = sources || {};
  return ["market", "wallets", "insider", "history", "pipeline"]
    .map((key) => [key, sourceMap[key]])
    .filter(([, value]) => value);
}

function sourceReason(source) {
  if (!source) {
    return "No source diagnostics available.";
  }
  if (source.statusReason) {
    return truncateText(source.statusReason, 116);
  }
  const diagnostics = safeArray(source.upstreamDiagnostics);
  const detail = diagnostics.find((item) => item.message)?.message;
  return truncateText(detail || "No source reason exported.", 116);
}

function sourceHasCache(source) {
  return safeArray(source?.upstreamDiagnostics).some((item) => item.cacheUsed || item.status === "cached");
}

function effectiveSourceStatus(source) {
  if (!source) {
    return "missing";
  }
  const status = source.status || (source.synced || source.available ? "live" : "missing");
  const reason = source.statusReason || "";
  if (status === "live" && sourceHasCache(source)) {
    return "cached";
  }
  if (status === "live" && reason.includes("Not refreshed in the latest scoped run")) {
    return "partial";
  }
  return status;
}

function sourceStatusBadgeClass(status) {
  const map = {
    live: "supports",
    partial: "mixed",
    cached: "mixed",
    degraded: "mixed",
    failed: "sell",
    placeholder: "mixed",
    missing: "sell",
    skipped: "neutral"
  };
  return map[status] || "neutral";
}

function summarizeSourceOverview(sources) {
  const entries = orderedSourceEntries(sources);
  const counts = {
    live: 0,
    partial: 0,
    cached: 0,
    degraded: 0,
    failed: 0,
    missing: 0,
    placeholder: 0
  };

  entries.forEach(([, source]) => {
    const status = effectiveSourceStatus(source);
    counts[status] = (counts[status] || 0) + 1;
  });

  const problemSources = entries.filter(([, source]) => {
    const status = effectiveSourceStatus(source);
    return ["degraded", "failed", "missing", "cached", "partial", "placeholder"].includes(status);
  });
  const leadProblem = problemSources[0];
  const hardProblemCount = (counts.degraded || 0) + (counts.failed || 0) + (counts.missing || 0) + (counts.placeholder || 0);
  const softProblemCount = (counts.partial || 0) + (counts.cached || 0);
  const problemCount = hardProblemCount + softProblemCount;
  const partialCount = counts.partial || 0;
  const cachedCount = counts.cached || 0;
  const liveCount = counts.live || 0;
  const title = hardProblemCount
    ? `${hardProblemCount} source issue${hardProblemCount === 1 ? "" : "s"}`
    : softProblemCount
      ? `${softProblemCount} source caution${softProblemCount === 1 ? "" : "s"}`
      : "All sources live";
  const detail = leadProblem
    ? `${sourceDisplayName(leadProblem[0])}: ${sourceReason(leadProblem[1])}`
    : "Market, wallets, insider, history, and pipeline all look healthy.";
  const badges = [];
  if (liveCount) {
    badges.push({ label: `${liveCount} live`, className: "supports" });
  }
  if (partialCount) {
    badges.push({ label: `${partialCount} partial`, className: "mixed" });
  }
  if (cachedCount) {
    badges.push({ label: `${cachedCount} cached`, className: "mixed" });
  }
  if (problemCount && !partialCount && !cachedCount) {
    badges.push({ label: `${problemCount} issue${problemCount === 1 ? "" : "s"}`, className: "sell" });
  }
  return {
    title,
    detail,
    liveCount,
    partialCount,
    cachedCount,
    problemCount,
    badges
  };
}

function detectFeedSurface(runtime) {
  const path = window.location.pathname || "";
  const protocol = window.location.protocol || "";
  const host = window.location.host || "";

  if (protocol === "file:") {
    if (path.includes("/Library/Application Support/StonkvisionSupervisor/")) {
      return {
        label: "Service copy",
        detail: "Rendering from the installed supervisor workspace.",
        badgeLabel: "Service",
        badgeClassName: "supports"
      };
    }
    if (path.includes("/.stonkvision-pages/") || path.includes("/carinamarierose.github.io/")) {
      return {
        label: "Published mirror",
        detail: "Rendering the local publish-target copy of Stonkvision.",
        badgeLabel: "Mirror",
        badgeClassName: "mixed"
      };
    }
    if (path.includes("/webpage/")) {
      return {
        label: "Repo workspace",
        detail: "Rendering directly from the repo's webpage folder.",
        badgeLabel: "Repo",
        badgeClassName: "neutral"
      };
    }
    return {
      label: "Local file",
      detail: truncateText(path || "Local file path", 72),
      badgeLabel: "Local",
      badgeClassName: "neutral"
    };
  }

  if (host.includes("github.io")) {
    return {
      label: "Published web",
      detail: `Serving the public mirror from ${host}.`,
      badgeLabel: "Web",
      badgeClassName: "supports"
    };
  }

  return {
    label: "Browser host",
    detail: host || runtime?.mode || "Unknown browser context",
    badgeLabel: "Web",
    badgeClassName: "neutral"
  };
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
    refs.walletRail.innerHTML = renderEmpty("Wallet command rail appears when `wallet_watcher` has exported a synced snapshot.");
    refs.walletToolbar.innerHTML = "";
    refs.walletList.innerHTML = renderEmpty("`overlay-feed.json` has no wallet snapshot yet. Run wallet-watcher and sync again.");
    return;
  }

  const wallets = displayedWallets(walletSection);

  refs.walletRail.innerHTML = renderWalletRail(walletSection);
  refs.walletToolbar.innerHTML = renderWalletToolbar(walletSection, wallets);

  const walletCards = wallets.length
    ? wallets.map(renderWalletCard).join("")
    : renderEmpty(walletWorkspaceEmptyMessage(walletSection));

  const placeholderNote = walletSection.synced === false
    ? renderEmpty("Showing tracked wallets from config only. Run wallet-watcher again to fill positions and live advice.")
    : "";

  refs.walletList.innerHTML = `${placeholderNote}${walletCards}`;
}

function renderWalletRail(walletSection) {
  return [
    renderWalletFreshnessCard(walletSection),
    renderWalletUrgentCard(walletSection.urgentAction, walletSection.synced),
    renderWalletActionMixCard(walletSection.commandGroups, walletSection.summary),
    renderWalletChangesCard(walletSection.diff, walletSection.synced)
  ].join("");
}

function renderWalletToolbar(walletSection, wallets) {
  const positionCount = wallets.reduce((sum, wallet) => sum + displayedWalletPositions(wallet).length, 0);
  const summary = walletSection?.summary || {};

  return `
    <div class="wallet-toolbar-group">
      <span class="wallet-toolbar-label">Focus</span>
      <div class="wallet-filter-row">
        ${renderWalletFilterButton("focus", "actionable", "Actionable")}
        ${renderWalletFilterButton("focus", "all", "All")}
        ${renderWalletFilterButton("focus", "changes", "Changes")}
      </div>
    </div>
    <div class="wallet-toolbar-group">
      <span class="wallet-toolbar-label">Sort</span>
      <div class="wallet-filter-row">
        ${renderWalletFilterButton("sort", "urgency", "Urgency")}
        ${renderWalletFilterButton("sort", "value", "Value")}
        ${renderWalletFilterButton("sort", "recent", "Recent")}
      </div>
    </div>
    <p class="wallet-toolbar-note">${escapeHTML(
      `Showing ${wallets.length}/${summary.walletCount || wallets.length} wallet${wallets.length === 1 ? "" : "s"} · ${positionCount} position${positionCount === 1 ? "" : "s"} · sorted by ${walletSortLabel(appState.walletWorkspace.sort)}`
    )}</p>
  `;
}

function renderWalletFilterButton(kind, value, label) {
  const isActive = kind === "focus"
    ? appState.walletWorkspace.focus === value
    : appState.walletWorkspace.sort === value;

  const dataAttribute = kind === "focus"
    ? `data-wallet-focus="${escapeAttribute(value)}"`
    : `data-wallet-sort="${escapeAttribute(value)}"`;

  return `
    <button
      class="wallet-filter-button${isActive ? " is-active" : ""}"
      type="button"
      ${dataAttribute}
      aria-pressed="${isActive ? "true" : "false"}"
    >
      ${escapeHTML(label)}
    </button>
  `;
}

function renderWalletFreshnessCard(walletSection) {
  const summary = walletSection?.summary || {};
  const activityCash = summary?.activityCash || null;
  const generatedAt = walletSection?.generatedAt || null;
  const synced = walletSection?.synced !== false;
  const ageMs = generatedAt ? Math.max(0, Date.now() - new Date(generatedAt).getTime()) : null;
  const isStale = synced && ageMs !== null && ageMs > (3 * 60 * 60 * 1000);
  const statusLabel = !synced
    ? "Placeholder"
    : isStale
      ? "Stale snapshot"
      : "Fresh snapshot";
  const statusClass = !synced
    ? "neutral"
    : isStale
      ? "skeptical"
      : "supports";
  const subtitle = !generatedAt
    ? "No wallet export timestamp is available yet."
    : isStale
      ? `Wallet snapshot is ${formatRelativeTime(generatedAt)} old. Run wallet-watcher again if this should be live.`
      : `Wallet snapshot updated ${formatRelativeTime(generatedAt)}.`;

  return `
    <article class="compact-card wallet-focus-card">
      <div class="wallet-focus-head">
        <span class="section-kicker">Wallet feed</span>
        <span class="badge ${escapeHTML(statusClass)}">${escapeHTML(statusLabel)}</span>
      </div>
      <h3 class="wallet-focus-title">Rose + Haak freshness</h3>
      <p class="wallet-focus-copy">${escapeHTML(subtitle)}</p>
      <div class="compact-footer">
        ${miniBadge("Updated", generatedAt ? formatDateTime(generatedAt) : "n/a")}
        ${miniBadge("Wallets", summary.walletCount || 0)}
        ${miniBadge("Open", summary.openPositionCount || 0)}
        ${miniBadge("Open value", formatCompactUSD(summary.totalCurrentValue))}
        ${activityCash ? miniBadge("Returned", formatCompactUSD(activityCash.returnedUSD)) : ""}
        ${activityCash ? miniBadge("Net flow", formatSignedCompactUSD(activityCash.netFlowUSD)) : ""}
      </div>
      <p class="wallet-focus-copy">Open positions only. Closed wins and idle cash are not included yet.</p>
      ${activityCash ? `<p class="wallet-focus-copy">${escapeHTML(walletActivityCashCopy(activityCash))}</p>` : ""}
    </article>
  `;
}

function walletActivityCashCopy(activityCash) {
  if (!activityCash || !activityCash.sampleCount) {
    return "No tracked wallet activity sample is available yet for returned cash.";
  }

  const oldestCopy = activityCash.oldestTimestamp
    ? formatRelativeTimeFromUnix(activityCash.oldestTimestamp)
    : null;

  const coverage = oldestCopy
    ? (activityCash.mayBeTruncated
      ? `Based on the latest ${activityCash.sampleCount} fetched wallet events, currently reaching back to ${oldestCopy}. Older closed wins may still sit outside the sample.`
      : `Based on ${activityCash.sampleCount} fetched wallet events, currently reaching back to ${oldestCopy}.`)
    : "Based on the fetched wallet activity sample.";

  return `${coverage} Returned cash includes sells, redeems, and yield. Net flow = returned cash minus tracked buys.`;
}

function renderWalletUrgentCard(urgentAction, isSynced) {
  if (!urgentAction) {
    return `
      <article class="compact-card wallet-focus-card">
        <span class="section-kicker">Most urgent</span>
        <h3 class="wallet-focus-title">No urgent wallet action</h3>
        <p class="wallet-focus-copy">${escapeHTML(
          isSynced
            ? "Current Rose/Haak positions are aligned with the latest wallet advice."
            : "Live wallet advice will appear here after the next wallet-watcher export."
        )}</p>
      </article>
    `;
  }

  const cardURL = urgentAction.marketURL || urgentAction.signalURL || urgentAction.walletURL;
  const links = [
    renderExternalAction("Open market", urgentAction.marketURL),
    sameExternalURL(urgentAction.signalURL, urgentAction.marketURL) ? "" : renderExternalAction("Open signal", urgentAction.signalURL),
    renderIntelActionForMarketURL(urgentAction.marketURL),
    renderPinAction(walletCommandPinID(urgentAction))
  ].filter(Boolean).join("");

  return `
    <article ${renderCardSurfaceAttributes("compact-card wallet-focus-card", cardURL, `Open urgent wallet action for ${urgentAction.title}`)}>
      <div class="wallet-focus-head">
        <span class="section-kicker">Most urgent</span>
        <span class="badge ${escapeHTML(urgentAction.action || "neutral")}">${escapeHTML(urgentAction.actionLabel || formatAction(urgentAction.action))}</span>
      </div>
      ${renderLinkedText("h3", "wallet-focus-title", `${urgentAction.walletLabel} · ${urgentAction.title}`, cardURL)}
      <p class="wallet-focus-copy">${escapeHTML(
        `${urgentAction.relationLabel || "Live wallet command"} · ${urgentAction.signalTitle || "No live signal"}`
      )}</p>
      <div class="compact-footer">
        ${miniBadge("Outcome", urgentAction.outcome || "-")}
        ${miniBadge("Open value", formatCompactUSD(urgentAction.currentValue))}
        ${miniBadge("Gap", formatSignedNumber(urgentAction.netScoreGap))}
        ${miniBadge("Deadline", formatDaysToEnd(urgentAction.daysToEnd))}
        ${links}
      </div>
    </article>
  `;
}

function renderWalletActionMixCard(commandGroups, summary) {
  const groups = safeArray(commandGroups);
  const rows = groups.length
    ? groups.slice(0, 4).map(renderWalletActionGroup).join("")
    : `<p class="wallet-focus-copy">No open wallet positions are available in this snapshot.</p>`;

  return `
    <article class="compact-card wallet-focus-card">
      <span class="section-kicker">Command mix</span>
      <h3 class="wallet-focus-title">What Rose + Haak should do now</h3>
      <p class="wallet-focus-copy">${escapeHTML(
        `${summary?.openPositionCount || 0} open positions · ${summary?.actionablePositionCount || 0} actionable calls`
      )}</p>
      <div class="wallet-action-stack">
        ${rows}
      </div>
    </article>
  `;
}

function renderWalletActionGroup(group) {
  const topLinks = safeArray(group.positions).map((position) =>
    renderExternalBlock(
      "wallet-inline-link",
      position.marketURL || position.signalURL,
      `<span>${escapeHTML(position.walletLabel)} · ${escapeHTML(truncateText(position.title, 42))}</span>`,
      "span"
    )
  ).join("");

  return `
    <div class="wallet-action-row">
      <div class="wallet-action-head">
        <div class="wallet-action-tag">
          <span class="badge ${escapeHTML(group.key || "neutral")}">${escapeHTML(group.label || formatAction(group.key))}</span>
          <strong class="wallet-action-count">${escapeHTML(String(group.count || 0))}</strong>
        </div>
        <span class="wallet-action-value">${escapeHTML(formatCompactUSD(group.totalCurrentValue))}</span>
      </div>
      <div class="wallet-action-list">
        ${topLinks}
        ${group.moreCount ? `<span class="wallet-inline-note">+${escapeHTML(String(group.moreCount))} more</span>` : ""}
      </div>
    </div>
  `;
}

function renderWalletChangesCard(diff, isSynced) {
  if (!diff?.hasPrevious) {
    return `
      <article class="compact-card wallet-focus-card">
        <span class="section-kicker">Since last sync</span>
        <h3 class="wallet-focus-title">Change tracking starts next pass</h3>
        <p class="wallet-focus-copy">${escapeHTML(
          isSynced
            ? "This is the first comparable wallet snapshot. The next sync will show opens, closes, flips, and value changes."
            : "Waiting for a live wallet snapshot before change tracking can begin."
        )}</p>
      </article>
    `;
  }

  const highlights = safeArray(diff.highlights);
  const changeList = highlights.length
    ? `<div class="wallet-change-list">${highlights.map(renderWalletChangeItem).join("")}</div>`
    : `<p class="wallet-focus-copy">No wallet changes detected since ${escapeHTML(formatDateTime(diff.previousGeneratedAt))}.</p>`;

  return `
    <article class="compact-card wallet-focus-card">
      <span class="section-kicker">Since last sync</span>
      <h3 class="wallet-focus-title">What changed since ${escapeHTML(formatRelativeTime(diff.previousGeneratedAt))}</h3>
      <div class="compact-footer">
        ${miniBadge("Opened", diff.newPositionCount || 0)}
        ${miniBadge("Closed", diff.closedPositionCount || 0)}
        ${miniBadge("Advice flips", diff.actionChangeCount || 0)}
        ${miniBadge("Value", formatSignedCompactUSD(diff.valueDeltaUSD))}
      </div>
      ${changeList}
    </article>
  `;
}

function renderWalletChangeItem(change) {
  return renderExternalBlock(
    "wallet-change-item",
    change.marketURL,
    `
      <strong>${escapeHTML(change.walletLabel)} · ${escapeHTML(truncateText(change.title || "Wallet change", 44))}</strong>
      <span>${escapeHTML(describeWalletChange(change))}</span>
    `,
    "div"
  );
}

function describeWalletChange(change) {
  switch (change.type) {
    case "opened":
      return `Opened ${change.outcome || "position"} · ${formatCompactUSD(change.currentValue)}`;
    case "closed":
      return `Closed ${change.outcome || "position"} · was ${formatCompactUSD(change.previousValue)}`;
    case "action_changed":
      return `Advice ${formatAction(change.previousAction)} -> ${formatAction(change.action)}${change.signalTitle ? ` · ${change.signalTitle}` : ""}`;
    case "size_changed":
      return `Size changed ${formatSignedNumber(change.sizeDelta)} · ${formatCompactUSD(change.currentValue)} now`;
    case "value_changed":
      return `${Number(change.valueDeltaUSD) >= 0 ? "Marked up" : "Marked down"} ${formatCompactUSD(Math.abs(Number(change.valueDeltaUSD) || 0))}`;
    default:
      return "Wallet snapshot updated";
  }
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
  const selectedID = getSelectedGraphID("marketFlow", items);
  const selectedItem = items.find((item) => String(item.id) === selectedID) || items[0];
  const selectedPin = appState.pinRegistry.get(marketPinID(selectedItem));
  const rows = items.map((item) => {
    const fill = clampPercent((item.absFlowUSD / maxValue) * 100);
    const buyFill = isSellDirection(item.direction) ? 0 : fill;
    const sellFill = isSellDirection(item.direction) ? fill : 0;
    return `
      <button
        class="flow-row selection-trigger${String(item.id) === selectedID ? " is-selected" : ""}"
        type="button"
        data-graph-key="marketFlow"
        data-graph-id="${escapeAttribute(item.id)}"
      >
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
      </button>
    `;
  }).join("");

  const selectionCard = renderGraphSelectionCard(selectedPin || {
    id: marketPinID(selectedItem),
    kicker: "Flow selection",
    title: selectedItem.title,
    subtitle: `${selectedItem.outcome} · ${selectedItem.confidence || 0}/100 · ${formatDaysToEnd(selectedItem.daysToEnd)}`,
    summary: `Net weighted flow ${formatCompactUSD(selectedItem.flowUSD)} on the live bets board.`,
    url: getSignalMarketURL(selectedItem),
    actionLabel: "Open market",
    badges: [
      { label: formatDirection(selectedItem.direction), className: isSellDirection(selectedItem.direction) ? "sell" : "buy" }
    ],
    metrics: [
      { label: "Flow", value: formatCompactUSD(selectedItem.flowUSD) },
      { label: "Price", value: formatMarketPrice(selectedItem.currentPrice) },
      { label: "Confidence", value: `${selectedItem.confidence || 0}/100` },
      { label: "Deadline", value: formatDaysToEnd(selectedItem.daysToEnd) }
    ]
  });

  return renderGraphPanel(
    "Market flow map",
    "Net weighted flow on the highest-priority bets.",
    `<div class="flow-list">${rows}</div>${selectionCard}`
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
  const selectedID = getSelectedGraphID("marketWindow", items);
  const selectedItem = items.find((item) => String(item.id) === selectedID) || items[0];
  const selectedPin = appState.pinRegistry.get(marketPinID(selectedItem));

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
          <circle
            class="plot-point ${pointClass}${String(item.id) === selectedID ? " is-selected" : ""}"
            cx="${x}"
            cy="${y}"
            r="${radius}"
            data-graph-key="marketWindow"
            data-graph-id="${escapeAttribute(item.id)}"
          >
            <title>${escapeHTML(item.title)} | ${escapeHTML(item.outcome)} | ${escapeHTML(String(item.confidence || 0))}/100 | ${escapeHTML(formatDaysToEnd(item.daysToEnd))}</title>
          </circle>
        `;
      }).join("")}
    </svg>
  `;

  const legend = `
    <div class="plot-legend">
      ${items.slice(0, 5).map((item) => `
        <button
          class="plot-legend-item selection-trigger${String(item.id) === selectedID ? " is-selected" : ""}"
          type="button"
          data-graph-key="marketWindow"
          data-graph-id="${escapeAttribute(item.id)}"
        >
          <span class="plot-dot ${isSellDirection(item.direction) ? "sell" : "buy"}"></span>
          <span>${escapeHTML(item.shortLabel)} · ${escapeHTML(formatTake(item.take))}</span>
        </button>
      `).join("")}
    </div>
  `;

  const selectionCard = renderGraphSelectionCard(selectedPin || {
    id: marketPinID(selectedItem),
    kicker: "Window selection",
    title: selectedItem.title,
    subtitle: `${selectedItem.outcome} · ${formatTake(selectedItem.take)} · ${selectedItem.confidence || 0}/100`,
    summary: `${formatDaysToEnd(selectedItem.daysToEnd)} to resolution with ${formatCompactUSD(selectedItem.absFlowUSD)} of absolute weighted flow.`,
    url: getSignalMarketURL(selectedItem),
    actionLabel: "Open market",
    badges: [
      { label: formatDirection(selectedItem.direction), className: isSellDirection(selectedItem.direction) ? "sell" : "buy" },
      { label: formatTake(selectedItem.horizon), className: "neutral" }
    ],
    metrics: [
      { label: "Confidence", value: `${selectedItem.confidence || 0}/100` },
      { label: "Flow", value: formatCompactUSD(selectedItem.absFlowUSD) },
      { label: "Days", value: formatDaysToEnd(selectedItem.daysToEnd) },
      { label: "Price", value: formatMarketPrice(selectedItem.currentPrice) }
    ]
  });

  return renderGraphPanel(
    "Conviction window",
    "Confidence against time-to-resolution across the live board.",
    `${svg}${legend}${selectionCard}`
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
  const selectedID = getSelectedGraphID("walletCommand", items);
  const selectedItem = items.find((item) => String(item.id) === selectedID) || items[0];
  const selectedPin = appState.pinRegistry.get(walletPinID({ wallet: selectedItem.wallet }));
  const note = chart?.synced === false
    ? `<p class="graph-note">Showing tracked wallets from config. Live positions appear here after the next wallet-watcher export.</p>`
    : "";
  const rows = items.map((item) => {
    const fill = maxValue > 0 ? clampPercent((item.totalCurrentValue / maxValue) * 100) : 0;
    return `
      <button
        class="wallet-graph-row selection-trigger${String(item.id) === selectedID ? " is-selected" : ""}"
        type="button"
        data-graph-key="walletCommand"
        data-graph-id="${escapeAttribute(item.id)}"
      >
        <div class="wallet-graph-head">
          <strong class="wallet-graph-title">${escapeHTML(item.label)}</strong>
          <strong>${escapeHTML(formatCompactUSD(item.totalCurrentValue))}</strong>
        </div>
        <div class="wallet-graph-track">
          <div class="wallet-graph-fill" style="--fill:${fill}%"></div>
        </div>
        <p class="graph-meta-line">${escapeHTML(String(item.openPositionCount || 0))} open · ${escapeHTML(String(item.actionablePositionCount || 0))} actionable · ${escapeHTML(String(item.recentActivityCount || 0))} recent trades</p>
      </button>
    `;
  }).join("");

  const selectionCard = renderGraphSelectionCard(selectedPin || {
    id: walletPinID({ wallet: selectedItem.wallet }),
    kicker: "Wallet selection",
    title: selectedItem.label,
    subtitle: `${selectedItem.openPositionCount || 0} open · ${selectedItem.actionablePositionCount || 0} actionable`,
    summary: `${selectedItem.recentActivityCount || 0} recent trades${selectedItem.lastActivityTimestamp ? ` · last activity ${formatRelativeTimeFromUnix(selectedItem.lastActivityTimestamp)}` : ""}`,
    url: normalizeExternalURL(selectedItem.walletURL),
    actionLabel: "Open wallet",
    badges: [
      { label: `${selectedItem.actionablePositionCount || 0} actionable`, className: (selectedItem.actionablePositionCount || 0) > 0 ? "buy" : "neutral" }
    ],
    metrics: [
      { label: "Open value", value: formatCompactUSD(selectedItem.totalCurrentValue) },
      { label: "Open", value: selectedItem.openPositionCount ?? 0 },
      { label: "Recent", value: selectedItem.recentActivityCount ?? 0 },
      { label: "Last", value: selectedItem.lastActivityTimestamp ? formatRelativeTimeFromUnix(selectedItem.lastActivityTimestamp) : "-" }
    ]
  });

  return renderGraphPanel(
    "Wallet command board",
    "Tracked wallets sized by current open position value with activity context.",
    `${note}<div class="wallet-graph-list">${rows}</div>${selectionCard}`
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
  const selectedID = getSelectedGraphID("insiderConviction", items);
  const selectedItem = items.find((item) => String(item.id) === selectedID) || items[0];
  const selectedPin = appState.pinRegistry.get(insiderPinID(selectedItem));
  const rows = items.map((item) => {
    const fill = clampPercent((item.absTradeValueUSD / maxValue) * 100);
    const directionClass = isSellDirection(item.direction) ? "sell" : "buy";
    return `
      <button
        class="insider-graph-row selection-trigger${String(item.id) === selectedID ? " is-selected" : ""}"
        type="button"
        data-graph-key="insiderConviction"
        data-graph-id="${escapeAttribute(item.id)}"
      >
        <div class="insider-graph-head">
          <strong class="insider-graph-title">${escapeHTML(item.ticker)}</strong>
          <strong class="${directionClass}">${escapeHTML(formatCompactUSD(item.tradeValueUSD))}</strong>
        </div>
        <div class="insider-graph-track">
          <div class="insider-graph-fill ${directionClass}" style="--fill:${fill}%"></div>
        </div>
        <p class="graph-meta-line">${escapeHTML(item.insiderName || "Unknown insider")} · ${escapeHTML(String(item.confidence || 0))}/100 · ${escapeHTML(formatRelativeTime(item.filedAt))}</p>
      </button>
    `;
  }).join("");

  const selectionCard = renderGraphSelectionCard(selectedPin || {
    id: insiderPinID(selectedItem),
    kicker: "Insider selection",
    title: `${selectedItem.ticker} · ${selectedItem.label || selectedItem.ticker}`,
    subtitle: `${selectedItem.insiderName || "Unknown insider"} · ${selectedItem.confidence || 0}/100`,
    summary: `${isSellDirection(selectedItem.direction) ? "Bearish" : "Bullish"} filing worth ${formatCompactUSD(selectedItem.tradeValueUSD)}${selectedItem.filedAt ? ` · filed ${formatRelativeTime(selectedItem.filedAt)}` : ""}`,
    url: normalizeExternalURL(selectedItem.externalURL),
    actionLabel: "Open filing",
    badges: [
      { label: isSellDirection(selectedItem.direction) ? "Bearish" : "Bullish", className: isSellDirection(selectedItem.direction) ? "sell" : "buy" }
    ],
    metrics: [
      { label: "Trade", value: formatCompactUSD(selectedItem.tradeValueUSD) },
      { label: "Confidence", value: `${selectedItem.confidence || 0}/100` },
      { label: "Filed", value: formatDateTime(selectedItem.filedAt) },
      { label: "Ticker", value: selectedItem.ticker }
    ]
  });

  return renderGraphPanel(
    "Insider conviction",
    "Largest fresh insider values in the ranked tape.",
    `<div class="insider-graph-list">${rows}</div>${selectionCard}`
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

function renderGraphSelectionCard(item) {
  if (!item) {
    return "";
  }

  const badges = safeArray(item.badges)
    .map((badge) => renderPinBadge(badge))
    .join("");
  const metrics = safeArray(item.metrics)
    .slice(0, 4)
    .map((metric) => miniStat(metric.label, metric.value))
    .join("");
  const actions = [
    renderExternalAction(item.actionLabel || "Open", item.url, "signal-link"),
    renderPinAction(item.id)
  ].filter(Boolean).join("");

  return `
    <article class="graph-selection-card">
      <div class="compact-head">
        <div>
          <p class="section-kicker">${escapeHTML(item.kicker || "Selection")}</p>
          <h4 class="graph-selection-title">${escapeHTML(item.title || "Selected item")}</h4>
        </div>
        <div class="badges">
          ${badges}
        </div>
      </div>
      <p class="graph-selection-subtitle">${escapeHTML(item.subtitle || "No detail available.")}</p>
      ${item.summary ? `<p class="graph-meta-line">${escapeHTML(item.summary)}</p>` : ""}
      <div class="wallet-summary pinned-metrics">
        ${metrics}
      </div>
      <div class="signal-footer">
        <span class="footer-note">${escapeHTML(item.scopeLabel || "Selected from graph")}</span>
        <div class="card-action-row">
          ${actions}
        </div>
      </div>
    </article>
  `;
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

function renderIntel(section) {
  if (!section?.available) {
    const message = "Intel view fills in when source-led market events or insider/watchlist filings are exported into the shared feed.";
    refs.intelSummaryGrid.innerHTML = renderEmpty(message);
    refs.intelMarketFeed.innerHTML = renderEmpty(message);
    refs.intelInsiderFeed.innerHTML = renderEmpty(message);
    refs.intelMixGrid.innerHTML = renderEmpty(message);
    return;
  }

  const summary = section.summary || {};
  const sourceLed = safeArray(section.sourceLed);
  const insiderWatch = safeArray(section.insiderWatch);

  refs.intelSummaryGrid.innerHTML = [
    summaryCard("Curated items", summary.totalItemCount ?? sourceLed.length + insiderWatch.length),
    summaryCard("Source-led", summary.sourceLedCount ?? sourceLed.length),
    summaryCard("Linked markets", summary.linkedMarketCount ?? 0),
    summaryCard("Watchlist hits", summary.watchlistMatchCount ?? 0),
    summaryCard("Providers", summary.providerCount ?? safeArray(section.providerMix).length),
    summaryCard("Raw source events", summary.rawSourceEventCount ?? 0)
  ].join("");

  refs.intelMarketFeed.innerHTML = sourceLed.length
    ? `<div class="compact-list intel-feed-list">${sourceLed.map(renderIntelMarketItem).join("")}</div>`
    : renderEmpty("No source-led market events were curated into the live Intel board on this run.");

  refs.intelInsiderFeed.innerHTML = insiderWatch.length
    ? `<div class="compact-list intel-feed-list">${insiderWatch.map(renderIntelInsiderItem).join("")}</div>`
    : renderEmpty("No filing/watchlist items were strong enough to keep visible in the Intel board.");

  refs.intelMixGrid.innerHTML = [
    renderBarPanel(
      "Source categories",
      "Which market categories the current source-led intake is pushing hardest into.",
      safeArray(section.categoryMix)
    ),
    renderBarPanel(
      "Providers",
      "Which upstream providers dominate the current curated intake.",
      safeArray(section.providerMix)
    ),
    renderBarPanel(
      "Source lanes",
      "How much of the visible intake is standard flow versus official or special lanes.",
      safeArray(section.laneMix)
    )
  ].join("");
}

function renderIntelMarketItem(item) {
  const topSignal = safeArray(item.topSignals)[0];
  const sourceURL = normalizeExternalURL(item.sourceURL);
  const topMarketURL = normalizeExternalURL(topSignal?.marketURL);
  const primaryURL = sourceURL || topMarketURL;
  const categoryBadge = item.category ? `<span class="badge neutral">${escapeHTML(formatCategory(item.category))}</span>` : "";
  const sourceTypeBadge = item.sourceType ? `<span class="badge neutral">${escapeHTML(formatIntelSourceType(item.sourceType))}</span>` : "";
  const laneBadge = item.sourceLane ? `<span class="badge mixed">${escapeHTML(formatIntelLane(item.sourceLane))}</span>` : "";
  const priorityBadge = item.priority
    ? `<span class="badge ${escapeHTML(intelPriorityClass(item.priority))}">${escapeHTML(formatIntelPriority(item.priority))}</span>`
    : "";

  return `
    <article ${renderCardSurfaceAttributes("signal-card intel-card", primaryURL, `Open Intel event ${item.title}`)} data-intel-item-id="${escapeAttribute(item.id)}">
      <div class="card-top">
        <div class="badges">
          ${categoryBadge}
          ${sourceTypeBadge}
          ${laneBadge}
        </div>
        ${priorityBadge}
      </div>

      ${renderLinkedText("h3", "signal-title", item.title || "Source-led intel", primaryURL)}

      <div class="signal-copy">
        <p>${escapeHTML(item.summary || "No source summary exported.")}</p>
        <p>${escapeHTML(item.whyItMatters || "No linked market explanation exported.")}</p>
      </div>

      <div class="card-metrics">
        ${metricChip("Source", truncateText(item.sourceName || item.provider || "-", 22))}
        ${metricChip("Seen", item.publishedAt ? formatRelativeTime(item.publishedAt) : "-")}
        ${metricChip("Markets", item.signalCount ?? 0)}
        ${metricChip("Tags", safeArray(item.tags).length || 0)}
      </div>

      ${renderIntelMarketLinks(item)}

      <div class="signal-footer">
        <span class="footer-note">${escapeHTML(intelMarketFootnote(item))}</span>
        <div class="card-action-row">
          ${renderExternalAction("Open source", sourceURL)}
          ${sameExternalURL(sourceURL, topMarketURL) ? "" : renderExternalAction("Open top market", topMarketURL)}
          ${renderPinAction(intelPinID(item))}
        </div>
      </div>
    </article>
  `;
}

function renderIntelMarketLinks(item) {
  const topSignals = safeArray(item.topSignals);
  if (!topSignals.length) {
    return "";
  }

  return `
    <div class="intel-market-links">
      ${topSignals.map((signal) => {
        const body = `
          <strong>${escapeHTML(truncateText(signal.title || "Linked market", 56))}</strong>
          <span>${escapeHTML(formatDirection(signal.direction))} ${escapeHTML(plainOutcome(signal.outcome))} · ${escapeHTML(String(signal.confidence || 0))}/100</span>
        `;
        return renderExternalBlock("intel-market-link", signal.marketURL, body);
      }).join("")}
    </div>
  `;
}

function renderIntelInsiderItem(item) {
  const externalURL = normalizeExternalURL(item.externalURL) || normalizeExternalURL(item.sourceURL);
  const watchlistBadge = item.watchlistMatch
    ? `<span class="badge mixed">Watchlist</span>`
    : `<span class="badge neutral">Intel</span>`;

  return `
    <article ${renderCardSurfaceAttributes("signal-card intel-card", externalURL, `Open filing for ${item.title}`)} data-intel-item-id="${escapeAttribute(item.id)}">
      <div class="card-top">
        <div class="badges">
          <span class="badge ${isSellDirection(item.direction) ? "sell" : "buy"}">${escapeHTML(isSellDirection(item.direction) ? "Bearish" : "Bullish")}</span>
          ${watchlistBadge}
        </div>
        <span class="badge neutral">${escapeHTML(String(item.confidence || 0))}/100</span>
      </div>

      ${renderLinkedText("h3", "signal-title", item.title || "Insider watch", externalURL)}

      <div class="signal-copy">
        <p>${escapeHTML(item.summary || "No filing summary available.")}</p>
        <p>${escapeHTML(item.whyItMatters || "No watchlist rationale exported.")}</p>
      </div>

      <div class="card-metrics">
        ${metricChip("Filed", item.filedAt ? formatRelativeTime(item.filedAt) : "-")}
        ${metricChip("Trade", formatCompactUSD(item.tradeValueUSD))}
        ${metricChip("Own", formatSignedPercent(item.ownershipChangePercent))}
        ${metricChip("Type", item.transactionType || "-")}
      </div>

      <div class="signal-footer">
        <span class="footer-note">${escapeHTML(item.watchlistMatch ? "Watchlist-linked filing" : "Curated insider tape item")}</span>
        <div class="card-action-row">
          ${renderExternalAction("Open filing", externalURL)}
          ${sameExternalURL(externalURL, item.sourceURL) ? "" : renderExternalAction("Open source", item.sourceURL)}
          ${renderPinAction(intelPinID(item))}
        </div>
      </div>
    </article>
  `;
}

function renderXGBoost(section) {
  if (!section?.available) {
    const message = "XGBoost view fills in when shadow snapshots or model-aware scan runs are available.";
    refs.xgboostTrendGrid.innerHTML = renderEmpty(message);
    refs.xgboostSummaryGrid.innerHTML = renderEmpty(message);
    refs.xgboostPanelGrid.innerHTML = renderEmpty(message);
    refs.xgboostModelTop.innerHTML = renderEmpty(message);
    refs.xgboostSwiftTop.innerHTML = renderEmpty(message);
    return;
  }

  refs.xgboostTrendGrid.innerHTML = [
    renderXGBoostPerformanceWinRatePanel(section.performance, section.coverage),
    renderXGBoostPerformanceEdgePanel(section.performance, section.coverage),
    renderXGBoostActivityTrendPanel(section.daily),
    renderXGBoostAlignmentTrendPanel(section.daily)
  ].join("");
  refs.xgboostSummaryGrid.innerHTML = renderXGBoostSummaryGrid(section);
  refs.xgboostPanelGrid.innerHTML = [
    renderXGBoostPerformanceScoreboardPanel(section.performance, section.coverage),
    renderXGBoostCoveragePanel(section.coverage),
    renderXGBoostPerformanceCallsPanel(
      "Recent resolved model calls",
      "Latest resolved XGBoost-tagged calls, scored from the model's own stance.",
      safeArray(section.performance?.recentEvaluations),
      xgboostCoverageEmptyMessage(section.coverage, "No resolved model-tagged calls yet in the current performance window.")
    ),
    renderXGBoostPerformanceCallsPanel(
      "Best model calls",
      "Strongest realized model edges from the recent resolved window.",
      safeArray(section.performance?.bestCalls),
      xgboostCoverageEmptyMessage(section.coverage, "No decisive model wins yet in the current performance window.")
    ),
    renderXGBoostPerformanceCallsPanel(
      "Worst model calls",
      "Hard misses where the model-tagged stance underperformed the market move.",
      safeArray(section.performance?.worstCalls),
      xgboostCoverageEmptyMessage(section.coverage, "No decisive model misses yet in the current performance window.")
    ),
    renderXGBoostModelPanel(section),
    renderXGBoostStatusPanel(section),
    renderXGBoostRunPanel(section),
    renderXGBoostSignalPanel(
      "Latest shadow candidates",
      "Most recent rows scored by the shadow model.",
      safeArray(section.shadow?.scoredRows),
      "No scored shadow candidates were available on the latest snapshot.",
      "Shadow row"
    ),
    renderXGBoostSignalPanel(
      "Top disagreements",
      "Where Swift and the model diverged inside the top-K window.",
      safeArray(section.shadow?.disagreements),
      "Swift and XGBoost were aligned on the latest shadow export.",
      "Disagreement"
    )
  ].join("");
  refs.xgboostModelTop.innerHTML = renderXGBoostSignalList(
    safeArray(section.shadow?.topModel),
    "No model-ranked rows were available in the latest shadow export.",
    "Model top"
  );
  refs.xgboostSwiftTop.innerHTML = renderXGBoostSignalList(
    safeArray(section.shadow?.topSwift),
    "No Swift-ranked rows were available in the latest shadow export.",
    "Swift top"
  );
}

function compactXGBoostModelLabel(model) {
  return truncateText(model?.configuredDisplayName || model?.configuredModelName || "Unknown", 24);
}

function compactXGBoostShadowLabel(model) {
  return truncateText(model?.shadowDisplayName || model?.shadowModelName || "None", 24);
}

function parseXGBoostIdentity(model) {
  const haystack = [
    model?.inputName,
    model?.configuredModelName,
    model?.shadowModelName,
    model?.configuredDisplayName
  ].filter(Boolean).join(" ");
  const trainWindowMatch = haystack.match(/(\d+d)/i);
  const horizonMatches = Array.from(haystack.matchAll(/(\d+h)/ig)).map((item) => item[1]);
  const scopeLabel = /short-term/i.test(haystack)
    ? "Short-term markets only"
    : /long-term/i.test(haystack)
      ? "Long-term markets"
      : "Scope not exported";

  return {
    trainWindowLabel: trainWindowMatch?.[1] || "n/a",
    predictionHorizonLabel: horizonMatches.length ? horizonMatches[horizonMatches.length - 1] : "n/a",
    scopeLabel,
    scopeBadgeLabel: scopeLabel.replace(" markets", "").replace(" only", "")
  };
}

function describeXGBoostPrediction(model, identity = parseXGBoostIdentity(model)) {
  const horizon = identity.predictionHorizonLabel !== "n/a" ? identity.predictionHorizonLabel : "unknown horizon";
  const semantics = formatXGBoostSemantics(model?.scoreSemantics);
  return `${horizon} ${semantics} on ${identity.scopeLabel.toLowerCase()}.`;
}

function formatXGBoostSemantics(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "n/a";
  }
  if (normalized === "probability_of_positive_edge") {
    return "probability of positive edge";
  }
  if (normalized === "predicted_realized_edge") {
    return "predicted realized edge";
  }
  return normalized.replace(/_/g, " ");
}

function renderXGBoostActivityTrendPanel(dailySection) {
  const items = safeArray(dailySection?.items);
  const hasSignal = items.some((item) => (item.scoredRows || 0) > 0 || (item.enabledRuns || 0) > 0);
  if (!items.length || !hasSignal) {
    return renderGraphPanel(
      "Activity over time",
      "Daily scored rows and enabled runs over the recent model window.",
      renderEmpty("No daily XGBoost activity was recorded in the current trend window.")
    );
  }

  const latestActiveDay = [...items].reverse().find((item) => (item.scoredRows || 0) > 0 || (item.enabledRuns || 0) > 0) || null;
  return renderGraphPanel(
    "Activity over time",
    "Daily scored rows and enabled runs over the recent model window.",
    `
      ${renderXGBoostTrendPlot(items, [
        { key: "scoredRows", label: "Scored rows", className: "activity" },
        { key: "enabledRuns", label: "Enabled runs", className: "enabled" }
      ])}
      <p class="graph-meta-line">${
        latestActiveDay
          ? escapeHTML(
              `Latest active day: ${formatHistoryDay(latestActiveDay.day)} · ${latestActiveDay.scoredRows || 0} scored row(s) · ${latestActiveDay.enabledRuns || 0} enabled run(s)`
            )
          : "No active XGBoost days in the current window."
      }</p>
    `
  );
}

function renderXGBoostAlignmentTrendPanel(dailySection) {
  const items = safeArray(dailySection?.items);
  const hasSignal = items.some((item) =>
    (item.supportCount || 0) > 0 ||
    (item.skepticalCount || 0) > 0 ||
    (item.topKDisagreementCount || 0) > 0
  );
  if (!items.length || !hasSignal) {
    return renderGraphPanel(
      "Agreement profile",
      "Daily support, skeptical, and disagreement counts from model-aware runs.",
      renderEmpty("No support/skeptical/disagreement trend was recorded in the current window.")
    );
  }

  const totals = items.reduce((accumulator, item) => {
    accumulator.support += item.supportCount || 0;
    accumulator.skeptical += item.skepticalCount || 0;
    accumulator.disagreements += item.topKDisagreementCount || 0;
    return accumulator;
  }, { support: 0, skeptical: 0, disagreements: 0 });

  return renderGraphPanel(
    "Agreement profile",
    "Daily support, skeptical, and disagreement counts from model-aware runs.",
    `
      ${renderXGBoostTrendPlot(items, [
        { key: "supportCount", label: "Supports", className: "support" },
        { key: "skepticalCount", label: "Skeptical", className: "skeptical" },
        { key: "topKDisagreementCount", label: "Top-K diff", className: "disagreement" }
      ])}
      <p class="graph-meta-line">${escapeHTML(
        `Window total: ${totals.support} support · ${totals.skeptical} skeptical · ${totals.disagreements} top-K disagreement`
      )}</p>
    `
  );
}

function renderXGBoostTrendPlot(items, seriesDefinitions) {
  const width = 560;
  const height = 240;
  const padLeft = 42;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 34;
  const usableWidth = width - padLeft - padRight;
  const usableHeight = height - padTop - padBottom;
  const maxValue = Math.max(
    1,
    ...seriesDefinitions.flatMap((series) => items.map((item) => Number(item?.[series.key]) || 0))
  );
  const xForIndex = (index) => {
    if (items.length <= 1) {
      return padLeft + usableWidth / 2;
    }
    return padLeft + (index / (items.length - 1)) * usableWidth;
  };
  const yForValue = (value) => padTop + usableHeight - ((Number(value) || 0) / maxValue) * usableHeight;
  const xTicks = items.map((item, index) => ({
    x: xForIndex(index),
    label: formatHistoryDay(item.day)
  })).filter((tick, index, all) => index === 0 || index === all.length - 1 || index === Math.floor(all.length / 2));
  const yTicks = Array.from(new Set([0, Math.ceil(maxValue / 2), maxValue])).sort((a, b) => a - b);

  const lines = seriesDefinitions.map((series) => {
    const linePoints = items.map((item, index) => `${xForIndex(index)},${yForValue(item?.[series.key])}`).join(" ");
    const circles = items.map((item, index) => `
      <circle
        class="plot-point ${escapeHTML(series.className)}"
        cx="${xForIndex(index).toFixed(1)}"
        cy="${yForValue(item?.[series.key]).toFixed(1)}"
        r="3.5"
      ></circle>
    `).join("");
    return `
      <polyline class="plot-line ${escapeHTML(series.className)}" points="${linePoints}"></polyline>
      ${circles}
    `;
  }).join("");

  const verticals = xTicks.map((tick) => `
    <line class="plot-grid plot-grid-vertical" x1="${tick.x.toFixed(1)}" y1="${padTop}" x2="${tick.x.toFixed(1)}" y2="${height - padBottom}"></line>
  `).join("");
  const horizontals = yTicks.map((tick) => {
    const y = yForValue(tick);
    return `<line class="plot-grid" x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}"></line>`;
  }).join("");

  return `
    <svg class="plot-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="XGBoost trend plot">
      ${horizontals}
      ${verticals}
      <line class="plot-axis" x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}"></line>
      <line class="plot-axis" x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}"></line>
      ${lines}
      ${xTicks.map((tick) => `
        <text class="plot-tick" x="${tick.x.toFixed(1)}" y="${height - 10}" text-anchor="middle">${escapeHTML(tick.label)}</text>
      `).join("")}
      ${yTicks.map((tick) => `
        <text class="plot-tick" x="${padLeft - 8}" y="${(yForValue(tick) + 4).toFixed(1)}" text-anchor="end">${escapeHTML(String(tick))}</text>
      `).join("")}
    </svg>
    <div class="plot-legend">
      ${seriesDefinitions.map((series) => `
        <div class="plot-legend-item">
          <span class="plot-dot ${escapeHTML(series.className)}"></span>
          <span>${escapeHTML(series.label)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSignedTrendPlot(items, valueKey, label, className, formatter) {
  const width = 560;
  const height = 240;
  const padLeft = 52;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 34;
  const usableWidth = width - padLeft - padRight;
  const usableHeight = height - padTop - padBottom;
  const values = items.map((item) => Number(item?.[valueKey]) || 0);
  let minValue = Math.min(0, ...values);
  let maxValue = Math.max(0, ...values);
  if (minValue === maxValue) {
    if (minValue === 0) {
      maxValue = 1;
    } else if (minValue > 0) {
      minValue = 0;
    } else {
      maxValue = 0;
    }
  }
  const xForIndex = (index) => {
    if (items.length <= 1) {
      return padLeft + usableWidth / 2;
    }
    return padLeft + (index / (items.length - 1)) * usableWidth;
  };
  const yForValue = (value) => {
    const ratio = (Number(value || 0) - minValue) / (maxValue - minValue);
    return padTop + usableHeight - ratio * usableHeight;
  };
  const xTicks = items.map((item, index) => ({
    x: xForIndex(index),
    label: formatHistoryDay(item.day)
  })).filter((tick, index, all) => index === 0 || index === all.length - 1 || index === Math.floor(all.length / 2));
  const yTicks = Array.from(new Set([minValue, 0, maxValue]))
    .sort((a, b) => a - b);
  const linePoints = items.map((item, index) => `${xForIndex(index)},${yForValue(item?.[valueKey])}`).join(" ");
  const zeroY = yForValue(0);

  return `
    <svg class="plot-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttribute(label)} trend plot">
      ${yTicks.map((tick) => {
        const y = yForValue(tick);
        const gridClass = tick === 0 ? "plot-grid plot-axis-zero" : "plot-grid";
        return `<line class="${gridClass}" x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}"></line>`;
      }).join("")}
      ${xTicks.map((tick) => `
        <line class="plot-grid plot-grid-vertical" x1="${tick.x.toFixed(1)}" y1="${padTop}" x2="${tick.x.toFixed(1)}" y2="${height - padBottom}"></line>
      `).join("")}
      <line class="plot-axis" x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}"></line>
      <line class="plot-axis" x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}"></line>
      <polyline class="plot-line ${escapeHTML(className)}" points="${linePoints}"></polyline>
      ${items.map((item, index) => `
        <circle
          class="plot-point ${escapeHTML(className)}"
          cx="${xForIndex(index).toFixed(1)}"
          cy="${yForValue(item?.[valueKey]).toFixed(1)}"
          r="3.5"
        ></circle>
      `).join("")}
      ${xTicks.map((tick) => `
        <text class="plot-tick" x="${tick.x.toFixed(1)}" y="${height - 10}" text-anchor="middle">${escapeHTML(tick.label)}</text>
      `).join("")}
      ${yTicks.map((tick) => `
        <text class="plot-tick" x="${padLeft - 8}" y="${(yForValue(tick) + 4).toFixed(1)}" text-anchor="end">${escapeHTML(formatter(tick))}</text>
      `).join("")}
    </svg>
    <div class="plot-legend">
      <div class="plot-legend-item">
        <span class="plot-dot ${escapeHTML(className)}"></span>
        <span>${escapeHTML(label)}</span>
      </div>
    </div>
  `;
}

function renderXGBoostSummaryGrid(section) {
  const status = section.status || {};
  const trend = section.trend || {};
  const shadow = section.shadow || {};
  const runs = section.runs || {};
  const coverage = section.coverage || {};
  const performance = section.performance || {};
  const model = section.model || {};
  const identity = parseXGBoostIdentity(model);
  const oneHour = safeArray(performance.horizons).find((item) => item.horizonHours === 1);
  const twentyFourHour = safeArray(performance.horizons).find((item) => item.horizonHours === 24);

  return [
    renderHistoryStatCard(
      "Mode",
      status.label || "Idle",
      status.title || "No status available"
    ),
    renderHistoryStatCard(
      "Configured model",
      compactXGBoostModelLabel(model),
      model.configuredMetadataName || model.task || "No configured model metadata exported"
    ),
    renderHistoryStatCard(
      "Train window",
      identity.trainWindowLabel,
      model.inputName || "No training input filename exported"
    ),
    renderHistoryStatCard(
      "Prediction horizon",
      identity.predictionHorizonLabel,
      describeXGBoostPrediction(model, identity)
    ),
    renderHistoryStatCard(
      "Market scope",
      identity.scopeLabel,
      "This is the scope the current XGBoost loop is trained against."
    ),
    renderHistoryStatCard(
      "Shadow match",
      model.shadowMatchLabel || "Unknown",
      model.shadowDisplayName || model.shadowModelName || "No shadow export metadata found"
    ),
    renderHistoryStatCard(
      "Latest shadow rows",
      shadow.rowCount || 0,
      shadow.generatedAt
        ? `${formatDateTime(shadow.generatedAt)} · top-K ${shadow.topK || 0}`
        : "No shadow file timestamp available"
    ),
    renderHistoryStatCard(
      "Enabled runs",
      trend.enabledRuns || runs.enabledRuns || 0,
      runs.latestEnabledRunAt
        ? `Latest enabled ${formatRelativeTime(runs.latestEnabledRunAt)}`
        : "No recent enabled run"
    ),
    renderHistoryStatCard(
      "Tagged history",
      coverage.taggedHistoryRowCount || 0,
      coverage.latestTaggedRunAt
        ? `Latest tagged ${formatRelativeTime(coverage.latestTaggedRunAt)}`
        : "No model-tagged history rows yet"
    ),
    renderHistoryStatCard(
      "Resolved evals",
      coverage.resolvedEvaluationCount ?? performance.totalEvaluations ?? 0,
      performance.latestEvaluationAt
        ? `Latest ${formatRelativeTime(performance.latestEvaluationAt)}`
        : "No resolved model-tagged calls yet"
    ),
    renderHistoryStatCard(
      "Categories touched",
      coverage.categoryCount || 0,
      coverage.categoryCount
        ? `${formatCategory(coverage.categories?.[0]?.category)} leads the current tagged archive`
        : "No category coverage yet"
    ),
    renderHistoryStatCard(
      "1h model win rate",
      oneHour?.decisiveWinRate !== null && oneHour?.decisiveWinRate !== undefined ? formatPercent(oneHour.decisiveWinRate) : "-",
      oneHour ? `${oneHour.wins} win / ${oneHour.losses} loss / ${oneHour.neutrals} neutral` : "No 1h resolved model calls yet"
    ),
    renderHistoryStatCard(
      "24h model win rate",
      twentyFourHour?.decisiveWinRate !== null && twentyFourHour?.decisiveWinRate !== undefined ? formatPercent(twentyFourHour.decisiveWinRate) : "-",
      twentyFourHour ? `${twentyFourHour.wins} win / ${twentyFourHour.losses} loss / ${twentyFourHour.neutrals} neutral` : "No 24h resolved model calls yet"
    )
  ].join("");
}

function renderXGBoostModelPanel(section) {
  const model = section.model || {};
  const live = section.live || {};
  const identity = parseXGBoostIdentity(model);
  const configuredLabel = model.configuredDisplayName || model.configuredModelName || "No configured model exported";
  const shadowLabel = model.shadowDisplayName || model.shadowModelName || "No shadow export found";
  const stateCopy = model.shadowMatchState === "mismatch"
    ? "The configured model and the latest shadow export disagree."
    : live.enabled
      ? "This is the configured model for the current synced run."
      : "This is the model Stonkvision expects the next synced run to use.";

  return renderGraphPanel(
    "Active model",
    "Configured model identity, training metadata, and whether the shadow export matches it.",
    `
      <div class="xgboost-status-card">
        <div class="compact-head">
          <div>
            <p class="section-kicker">Configured model</p>
            <h4 class="graph-selection-title">${escapeHTML(configuredLabel)}</h4>
          </div>
          <div class="badges">
            <span class="badge ${escapeHTML(model.shadowMatchClassName || "neutral")}">${escapeHTML(model.shadowMatchLabel || "Unknown")}</span>
            <span class="badge ${live.enabled ? "supports" : "neutral"}">${escapeHTML(live.enabled ? "Live on this run" : "Configured only")}</span>
          </div>
        </div>
        <p class="graph-selection-subtitle">${escapeHTML(`${stateCopy} ${describeXGBoostPrediction(model, identity)}`.trim())}</p>
        <p class="graph-meta-line">${escapeHTML(model.statusReason || `Shadow export: ${shadowLabel}`)}</p>
        <div class="wallet-summary pinned-metrics">
          ${miniStat("Train window", identity.trainWindowLabel)}
          ${miniStat("Prediction", identity.predictionHorizonLabel)}
          ${miniStat("Scope", identity.scopeBadgeLabel)}
          ${miniStat("Task", model.task || "n/a")}
          ${miniStat("Semantics", formatXGBoostSemantics(model.scoreSemantics))}
          ${miniStat("Train rows", model.trainingRowCount ?? "n/a")}
          ${miniStat("Input", truncateText(model.inputName || "n/a", 22))}
          ${miniStat("Shadow export", compactXGBoostShadowLabel(model))}
        </div>
      </div>
    `
  );
}

function renderXGBoostPerformanceWinRatePanel(performance, coverage) {
  const items = safeArray(performance?.daily);
  if (!items.length) {
    return renderGraphPanel(
      "Model hit rate",
      "Daily decisive win rate for resolved model-tagged calls.",
      renderEmpty(xgboostCoverageEmptyMessage(
        coverage,
        "No resolved XGBoost-tagged evaluations yet. This will start filling after model-tagged calls settle."
      ))
    );
  }

  const latest = items[items.length - 1];
  return renderGraphPanel(
    "Model hit rate",
    "Daily decisive win rate for resolved model-tagged calls.",
    `
      ${renderXGBoostTrendPlot(items, [
        { key: "decisiveWinRatePercent", label: "Win rate", className: "support" }
      ])}
      <p class="graph-meta-line">${escapeHTML(
        `Latest evaluated day: ${formatHistoryDay(latest.day)} · ${latest.decisiveTotal || 0} decisive row(s) · ${latest.decisiveWinRate !== null && latest.decisiveWinRate !== undefined ? formatPercent(latest.decisiveWinRate) : "-"}`
      )}</p>
    `
  );
}

function renderXGBoostPerformanceEdgePanel(performance, coverage) {
  const items = safeArray(performance?.daily);
  if (!items.length) {
    return renderGraphPanel(
      "Realized edge",
      "Daily average model edge on resolved XGBoost-tagged calls.",
      renderEmpty(xgboostCoverageEmptyMessage(
        coverage,
        "No resolved model edge yet. This fills once model-tagged rows get evaluated."
      ))
    );
  }

  const latest = items[items.length - 1];
  return renderGraphPanel(
    "Realized edge",
    "Daily average model edge on resolved XGBoost-tagged calls.",
    `
      ${renderSignedTrendPlot(
        items,
        "averageModelEdge",
        "Realized edge",
        "activity",
        formatSignedPoints
      )}
      <p class="graph-meta-line">${escapeHTML(
        `Latest evaluated day: ${formatHistoryDay(latest.day)} · average edge ${formatSignedPoints(latest.averageModelEdge)}`
      )}</p>
    `
  );
}

function renderXGBoostPerformanceScoreboardPanel(performance, coverage) {
  const horizons = safeArray(performance?.horizons);
  if (!horizons.length) {
    return renderGraphPanel(
      "Resolved model calls",
      "Model-side wins and losses split by evaluation horizon.",
      renderEmpty(xgboostCoverageEmptyMessage(
        coverage,
        "No resolved XGBoost-tagged calls have been recorded yet."
      ))
    );
  }

  const rows = horizons.map((item) => `
    <div class="history-score-row">
      <div class="history-score-head">
        <div>
          <strong>${escapeHTML(item.label)}</strong>
          <p class="graph-meta-line">${escapeHTML(String(item.total || 0))} resolved rows · ${escapeHTML(formatPercent(item.decisiveWinRate))} decisive win rate</p>
        </div>
        <span class="history-edge ${Number(item.averageModelEdge) >= 0 ? "positive" : "negative"}">${escapeHTML(formatSignedEdge(item.averageModelEdge))}</span>
      </div>
      ${renderHistoryOutcomeBar({ total: item.total, wins: item.wins, losses: item.losses, flats: item.neutrals })}
      <div class="compact-footer">
        ${miniBadge("Wins", item.wins || 0)}
        ${miniBadge("Losses", item.losses || 0)}
        ${miniBadge("Neutral", item.neutrals || 0)}
        ${miniBadge("Edge", formatSignedPoints(item.averageModelEdge))}
      </div>
    </div>
  `).join("");

  return renderGraphPanel(
    "Resolved model calls",
    "Model-side wins and losses split by evaluation horizon.",
    `<div class="history-score-list">${rows}</div>`
  );
}

function renderXGBoostCoveragePanel(coverage) {
  const categories = safeArray(coverage?.categories);
  if (!categories.length) {
    return renderGraphPanel(
      "Coverage by category",
      "Where the model has actually touched the history archive.",
      renderEmpty("No XGBoost-tagged history rows have been recorded yet.")
    );
  }

  const rows = categories.slice(0, 8).map((item) => `
    <div class="history-score-row">
      <div class="history-score-head">
        <div>
          <strong>${escapeHTML(formatCategory(item.category))}</strong>
          <p class="graph-meta-line">${escapeHTML(String(item.taggedRows || 0))} tagged row(s) · ${escapeHTML(String(item.resolvedEvaluations || 0))} resolved eval(s)</p>
        </div>
        <span class="history-edge ${item.resolvedEvaluations ? ((Number(item.averageModelEdge) || 0) >= 0 ? "positive" : "negative") : ""}">${escapeHTML(
          item.resolvedEvaluations ? formatSignedEdge(item.averageModelEdge) : "No edge yet"
        )}</span>
      </div>
      ${
        item.resolvedEvaluations
          ? renderHistoryOutcomeBar({
              total: item.resolvedEvaluations,
              wins: item.wins,
              losses: item.losses,
              flats: item.neutrals
            })
          : `<p class="graph-meta-line">No resolved model calls in this category yet.</p>`
      }
      <div class="compact-footer">
        ${miniBadge("Tagged", item.taggedRows || 0)}
        ${miniBadge("Resolved", item.resolvedEvaluations || 0)}
        ${miniBadge("Win rate", item.decisiveWinRate !== null && item.decisiveWinRate !== undefined ? formatPercent(item.decisiveWinRate) : "-")}
        ${miniBadge("Latest tagged", item.latestTaggedRunAt ? formatRelativeTime(item.latestTaggedRunAt) : "n/a")}
      </div>
    </div>
  `).join("");

  return renderGraphPanel(
    "Coverage by category",
    "How much model-tagged history exists in each category, even before rows resolve.",
    `<div class="history-score-list">${rows}</div>`
  );
}

function renderXGBoostPerformanceCallsPanel(title, description, items, emptyMessage) {
  if (!items.length) {
    return renderGraphPanel(title, description, renderEmpty(emptyMessage));
  }

  return renderGraphPanel(
    title,
    description,
    `<div class="history-call-list">${items.map(renderXGBoostPerformanceCallItem).join("")}</div>`
  );
}

function renderXGBoostPerformanceCallItem(item) {
  const marketURL = getSignalMarketURL(item);
  const modelLabel = normalizedModelOutcomeLabel(item.modelOutcome);
  const modelLabelClass = evaluationLabelClass(modelLabel);
  const stanceClass = item.xgboostStance || "neutral";
  const edgeClass = Number(item.modelEdge) >= 0 ? "positive" : "negative";
  const rankParts = [];
  if (item.xgboostModelRank) {
    rankParts.push(`Model #${item.xgboostModelRank}`);
  }
  if (item.xgboostSwiftRank) {
    rankParts.push(`Swift #${item.xgboostSwiftRank}`);
  }

  return `
    <article ${renderCardSurfaceAttributes("history-call-item", marketURL, `Open model evaluation for ${item.title}`)}>
      <div class="history-call-head">
        <div>
          <strong>${escapeHTML(truncateText(item.title, 56))}</strong>
          <p class="graph-meta-line">${escapeHTML(item.horizonLabel || "-")} · ${escapeHTML(plainOutcome(item.outcome))} · ${escapeHTML(formatRelativeTime(item.evaluatedAt))}</p>
        </div>
        <span class="history-move ${edgeClass}">${escapeHTML(formatSignedPoints(item.modelEdge))}</span>
      </div>
      <div class="compact-copy">
        <p>${escapeHTML(formatStance(item.xgboostStance))}${rankParts.length ? ` · ${escapeHTML(rankParts.join(" · "))}` : ""}</p>
        <p>${escapeHTML(`Signal row ended ${formatEvaluationLabel(item.label)} with raw move ${formatSignedPoints(item.favorablePriceChange)}.`)}</p>
      </div>
      <div class="compact-footer">
        <span class="badge ${escapeHTML(modelLabelClass)}">${escapeHTML(`Model ${formatEvaluationLabel(modelLabel)}`)}</span>
        <span class="badge ${escapeHTML(stanceClass)}">${escapeHTML(formatTake(item.xgboostStance))}</span>
        ${miniBadge("Signal", formatEvaluationLabel(item.label))}
        ${miniBadge("Score", formatModelScore(item.xgboostModelScore))}
        ${miniBadge("Entry", formatMarketPrice(item.entryPrice))}
        ${miniBadge("Observed", formatMarketPrice(item.observedPrice))}
        ${renderExternalAction("Open market", marketURL)}
        ${renderPinAction(historyEvaluationPinID(item))}
      </div>
    </article>
  `;
}

function renderXGBoostStatusPanel(section) {
  const status = section.status || {};
  const live = section.live || {};
  const shadow = section.shadow || {};
  const coverage = section.coverage || {};
  const model = section.model || {};

  return renderGraphPanel(
    "Shadow status",
    "Current model mode plus the latest synced shadow snapshot.",
    `
      <div class="xgboost-status-card">
        <div class="compact-head">
          <div>
            <p class="section-kicker">${escapeHTML(status.label || "XGBoost")}</p>
            <h4 class="graph-selection-title">${escapeHTML(status.title || "No model status available")}</h4>
          </div>
          <div class="badges">
            <span class="badge ${escapeHTML(status.className || "neutral")}">${escapeHTML(status.label || "Idle")}</span>
            <span class="badge ${live.enabled ? "supports" : "neutral"}">${escapeHTML(live.enabled ? "Enabled" : "Disabled")}</span>
          </div>
        </div>
        <p class="graph-selection-subtitle">${escapeHTML(status.body || "No XGBoost status body available.")}</p>
        <p class="graph-meta-line">${escapeHTML(status.detail || model.configuredDisplayName || shadow.modelName || "No active model artifact found.")}</p>
        <div class="wallet-summary pinned-metrics">
          ${miniStat("Live rows", live.rowCount ?? 0)}
          ${miniStat("Support", live.supportCount ?? 0)}
          ${miniStat("Skeptical", live.skepticalCount ?? 0)}
          ${miniStat("Shadow rows", shadow.rowCount ?? 0)}
          ${miniStat("Tagged", coverage.taggedHistoryRowCount ?? 0)}
          ${miniStat("Resolved", coverage.resolvedEvaluationCount ?? 0)}
        </div>
      </div>
    `
  );
}

function renderXGBoostRunPanel(section) {
  const runs = safeArray(section?.runs?.items);
  if (!runs.length) {
    return renderGraphPanel(
      "Recent runs",
      "Latest model-aware scan runs from the market-trans history store.",
      renderEmpty("No model-aware scan runs were found in the recent history window.")
    );
  }

  const maxRows = Number(section?.runs?.maxScoredRows) || 1;
  const rows = runs.map((item) => `
    <div class="xgboost-run-item">
      <div class="history-score-head">
        <div>
          <strong>${escapeHTML(item.startedAt ? formatRelativeTime(item.startedAt) : "Unknown run")}</strong>
          <p class="graph-meta-line">${escapeHTML(item.startedAt ? formatDateTime(item.startedAt) : "No timestamp")}</p>
        </div>
        <div class="badges">
          <span class="badge ${item.enabled ? "supports" : "neutral"}">${escapeHTML(item.enabled ? "Enabled" : "Idle")}</span>
          <span class="badge neutral">${escapeHTML(String(item.scoredRowCount || 0))} rows</span>
        </div>
      </div>
      <div class="bar-track">
        <div class="bar-fill xgboost-run-fill" style="--fill:${clampPercent(((item.scoredRowCount || 0) / maxRows) * 100)}%"></div>
      </div>
      <div class="compact-footer">
        ${miniBadge("Support", item.supportCount || 0)}
        ${miniBadge("Skeptical", item.skepticalCount || 0)}
        ${miniBadge("Top-K diff", item.topKDisagreementCount || 0)}
        ${miniBadge("Promoted", item.promotedCount || 0)}
      </div>
    </div>
  `).join("");

  return renderGraphPanel(
    "Recent runs",
    "Latest model-aware scan runs from the market-trans history store.",
    `<div class="xgboost-run-list">${rows}</div>`
  );
}

function renderXGBoostSignalPanel(title, description, items, emptyMessage, kicker) {
  return renderGraphPanel(
    title,
    description,
    renderXGBoostSignalList(items, emptyMessage, kicker)
  );
}

function renderXGBoostSignalList(items, emptyMessage, kicker) {
  if (!items.length) {
    return renderEmpty(emptyMessage);
  }

  return `<div class="compact-list xgboost-signal-list">${items.map((item) => renderXGBoostSignalItem(item, kicker)).join("")}</div>`;
}

function renderXGBoostSignalItem(item, kicker = "XGBoost row") {
  const marketURL = getSignalMarketURL(item);
  const flags = safeArray(item.flags);

  return `
    <article ${renderCardSurfaceAttributes("compact-card xgboost-signal-item", marketURL, `Open XGBoost row for ${item.title}`)}>
      <div class="compact-head">
        <div>
          ${renderLinkedText("p", "compact-title", item.title, marketURL)}
        </div>
        <span class="badge neutral">${escapeHTML(kicker)}</span>
      </div>
      <div class="compact-copy">
        <p>${escapeHTML(plainOutcome(item.outcome))} · ${escapeHTML(formatCategory(item.category))} · ${escapeHTML(String(item.confidence || 0))}/100</p>
        <p>${escapeHTML(describeXGBoostRow(item))}</p>
      </div>
      <div class="compact-footer">
        ${item.modelRank ? miniBadge("Model #", item.modelRank) : ""}
        ${item.swiftRank ? miniBadge("Swift #", item.swiftRank) : ""}
        ${miniBadge("Score", formatModelScore(item.modelScore))}
        ${miniBadge("Price", formatMarketPrice(item.currentPrice))}
        ${flags.length ? miniBadge("Flags", flags.slice(0, 2).join(", ")) : ""}
        ${renderExternalAction("Open market", marketURL)}
        ${renderPinAction(xgboostPinID(item))}
      </div>
    </article>
  `;
}

function renderPinnedWorkspace(overlayFeed) {
  const pins = appState.pinnedIds
    .map((id) => appState.pinRegistry.get(id))
    .filter(Boolean);
  const scopeCounts = pins.reduce((accumulator, pin) => {
    accumulator[pin.scope] = (accumulator[pin.scope] || 0) + 1;
    return accumulator;
  }, {});

  refs.pinnedToolbar.innerHTML = pins.length
    ? `
      <button class="workspace-button" type="button" data-clear-pins="true">Clear pinned</button>
      <p class="workspace-note">${escapeHTML(String(pins.length))} item${pins.length === 1 ? "" : "s"} saved locally in this browser.</p>
    `
    : `<p class="workspace-note">Pins are saved locally in this browser. Use any \`Pin\` action to build your own working set.</p>`;

  refs.pinnedSummaryGrid.innerHTML = [
    summaryCard("Pinned", pins.length),
    summaryCard("Market", scopeCounts.market || 0),
    summaryCard("Wallets", scopeCounts.wallet || 0),
    summaryCard("Intel", scopeCounts.intel || 0),
    summaryCard("XGBoost", scopeCounts.xgboost || 0),
    summaryCard("History", scopeCounts.history || 0),
    summaryCard("Insider", scopeCounts.insider || 0),
    summaryCard("Feeds online", overlayFeed.summary?.feedsOnline ?? availableSourceCount(overlayFeed.sources))
  ].join("");

  refs.pinnedGrid.innerHTML = pins.length
    ? pins.map(renderPinnedCard).join("")
    : renderEmpty("Use `Pin` from any major card or graph selection to build your live Stonkvision workspace.");
}

function renderPinnedCard(pin) {
  const primaryAction = pin.url ? renderExternalAction(pin.actionLabel || "Open", pin.url) : "";
  const pinAction = renderPinAction(pin.id);
  const badges = safeArray(pin.badges)
    .map((badge) => renderPinBadge(badge))
    .join("");
  const metrics = safeArray(pin.metrics)
    .slice(0, 4)
    .map((metric) => miniStat(metric.label, metric.value))
    .join("");

  return `
    <article ${renderCardSurfaceAttributes("signal-card pinned-card", pin.url, `Open pinned item ${pin.title}`)}>
      <div class="card-top">
        <div class="badges">
          <span class="badge neutral">${escapeHTML(pin.kicker || "Pinned")}</span>
          ${badges}
        </div>
        <span class="badge neutral">Pinned</span>
      </div>

      ${renderLinkedText("h3", "signal-title", pin.title, pin.url)}

      <div class="signal-copy">
        <p>${escapeHTML(pin.subtitle || "No subtitle available.")}</p>
        ${pin.summary ? `<p>${escapeHTML(pin.summary)}</p>` : ""}
      </div>

      <div class="wallet-summary pinned-metrics">
        ${metrics}
      </div>

      <div class="signal-footer">
        <span class="footer-note">${escapeHTML(pin.scopeLabel || "Pinned workspace item")}</span>
        <div class="card-action-row">
          ${primaryAction}
          ${pinAction}
        </div>
      </div>
    </article>
  `;
}

function renderPinBadge(badge) {
  if (!badge?.label) {
    return "";
  }
  return `<span class="badge ${escapeHTML(badge.className || "neutral")}">${escapeHTML(badge.label)}</span>`;
}

function buildPinRegistry(overlayFeed) {
  const registry = new Map();

  safeArray(overlayFeed.market?.bestBets).forEach((signal) => {
    addPinToRegistry(registry, createMarketPin(signal, "Market bet"));
  });
  safeArray(overlayFeed.market?.radar).forEach((signal) => {
    addPinToRegistry(registry, createMarketPin(signal, "Radar signal"));
  });

  const wallets = safeArray(overlayFeed.wallets?.wallets);
  wallets.forEach((wallet) => {
    addPinToRegistry(registry, createWalletPin(wallet));
    safeArray(wallet.positions).forEach((position) => {
      addPinToRegistry(registry, createWalletPositionPin(wallet, position));
    });
  });

  if (overlayFeed.wallets?.urgentAction) {
    addPinToRegistry(registry, createWalletCommandPin(overlayFeed.wallets.urgentAction, "Wallet command"));
  }

  safeArray(overlayFeed.wallets?.commandGroups).forEach((group) => {
    safeArray(group.positions).forEach((position) => {
      addPinToRegistry(registry, createWalletCommandPin(position, group.label || "Wallet command"));
    });
  });

  safeArray(overlayFeed.wallets?.diff?.wallets).forEach((delta) => {
    addPinToRegistry(registry, createWalletDeltaPin(delta));
  });

  safeArray(overlayFeed.insider?.signals).forEach((signal) => {
    addPinToRegistry(registry, createInsiderPin(signal));
  });
  safeArray(overlayFeed.intel?.sourceLed).forEach((item) => {
    addPinToRegistry(registry, createIntelPin(item));
  });
  safeArray(overlayFeed.intel?.insiderWatch).forEach((item) => {
    addPinToRegistry(registry, createIntelPin(item));
  });

  safeArray(overlayFeed.xgboost?.shadow?.scoredRows).forEach((item) => {
    addPinToRegistry(registry, createXGBoostPin(item, "Shadow row"));
  });
  safeArray(overlayFeed.xgboost?.shadow?.topModel).forEach((item) => {
    addPinToRegistry(registry, createXGBoostPin(item, "Model top"));
  });
  safeArray(overlayFeed.xgboost?.shadow?.topSwift).forEach((item) => {
    addPinToRegistry(registry, createXGBoostPin(item, "Swift top"));
  });
  safeArray(overlayFeed.xgboost?.shadow?.disagreements).forEach((item) => {
    addPinToRegistry(registry, createXGBoostPin(item, "Disagreement"));
  });
  safeArray(overlayFeed.xgboost?.performance?.recentEvaluations).forEach((item) => {
    addPinToRegistry(registry, createHistoryEvaluationPin(item, "Recent model call"));
  });
  safeArray(overlayFeed.xgboost?.performance?.bestCalls).forEach((item) => {
    addPinToRegistry(registry, createHistoryEvaluationPin(item, "Best model call"));
  });
  safeArray(overlayFeed.xgboost?.performance?.worstCalls).forEach((item) => {
    addPinToRegistry(registry, createHistoryEvaluationPin(item, "Worst model call"));
  });

  safeArray(overlayFeed.history?.market?.recentEvaluations).forEach((item) => {
    addPinToRegistry(registry, createHistoryEvaluationPin(item, "Recent eval"));
  });
  safeArray(overlayFeed.history?.market?.bestCalls).forEach((item) => {
    addPinToRegistry(registry, createHistoryEvaluationPin(item, "Best call"));
  });
  safeArray(overlayFeed.history?.market?.worstCalls).forEach((item) => {
    addPinToRegistry(registry, createHistoryEvaluationPin(item, "Tough miss"));
  });
  safeArray(overlayFeed.history?.insider?.archive).forEach((item) => {
    addPinToRegistry(registry, createHistoryInsiderPin(item));
  });

  return registry;
}

function addPinToRegistry(registry, pin) {
  if (!pin?.id || registry.has(pin.id)) {
    return;
  }
  registry.set(pin.id, pin);
}

function createMarketPin(signal, kicker = "Market bet") {
  return {
    id: marketPinID(signal),
    scope: "market",
    scopeLabel: "Live market",
    kicker,
    title: signal.title || "Market signal",
    subtitle: `${plainOutcome(signal.outcome)} · ${formatCategory(signal.category)} · ${signal.confidence || 0}/100`,
    summary: signal.marketBiasSummary || "Live market signal from market-trans.",
    url: getSignalMarketURL(signal),
    actionLabel: "Open market",
    badges: [
      { label: formatDirection(signal.direction), className: isSellDirection(signal.direction) ? "sell" : "buy" },
      { label: formatTake(signal.take), className: "neutral" }
    ],
    metrics: [
      { label: "Flow", value: formatCompactUSD(signal.weightedFlowUSD) },
      { label: "Price", value: formatMarketPrice(signal.currentMarketPrice) },
      { label: "Traders", value: signal.uniqueTraderCount ?? 0 },
      { label: "Deadline", value: formatDaysToEnd(signal.daysToEnd) }
    ]
  };
}

function createWalletPin(wallet) {
  return {
    id: walletPinID(wallet),
    scope: "wallet",
    scopeLabel: "Wallet snapshot",
    kicker: "Tracked wallet",
    title: wallet.label || "Watched wallet",
    subtitle: `${wallet.openPositionCount || 0} open · ${wallet.actionablePositionCount || 0} actionable · ${wallet.recentActivityCount || 0} recent`,
    summary: shortWallet(wallet.wallet),
    url: getWalletURL(wallet),
    actionLabel: "Open wallet",
    badges: [
      { label: `${wallet.actionablePositionCount || 0} actionable`, className: (wallet.actionablePositionCount || 0) > 0 ? "buy" : "neutral" }
    ],
    metrics: [
      { label: "Open value", value: formatCompactUSD(wallet.totalCurrentValue) },
      { label: "Open", value: wallet.openPositionCount ?? 0 },
      { label: "Recent", value: wallet.recentActivityCount ?? 0 },
      { label: "Last", value: formatRelativeTimeFromUnix(wallet.lastActivityTimestamp) }
    ]
  };
}

function createWalletPositionPin(wallet, position) {
  const advice = position.advice;
  return {
    id: walletPositionPinID(wallet, position),
    scope: "wallet",
    scopeLabel: "Wallet position",
    kicker: wallet.label || "Wallet position",
    title: position.title || "Tracked position",
    subtitle: `${plainOutcome(position.outcome)} · ${formatCompactUSD(position.currentValue)} · ${formatSignedPercent(position.percentPnL)}`,
    summary: advice
      ? `${advice.actionLabel} · ${advice.relationLabel} · ${advice.signal.title}`
      : "Tracked wallet position without a live linked signal.",
    url: getWalletMarketURL(position) || getWalletSignalURL(position) || getWalletURL(wallet),
    actionLabel: "Open market",
    badges: [
      { label: advice?.actionLabel || "Tracked", className: advice?.action || "neutral" },
      { label: plainOutcome(position.outcome), className: "neutral" }
    ],
    metrics: [
      { label: "Open value", value: formatCompactUSD(position.currentValue) },
      { label: "Entry", value: formatMarketPrice(position.averageEntryPrice) },
      { label: "Now", value: formatMarketPrice(position.currentPrice) },
      { label: "Deadline", value: formatDaysToEndFromDate(position.endDate) }
    ]
  };
}

function createWalletCommandPin(position, kicker = "Wallet command") {
  return {
    id: walletCommandPinID(position),
    scope: "wallet",
    scopeLabel: "Wallet command",
    kicker,
    title: `${position.walletLabel || "Wallet"} · ${position.title || "Position"}`,
    subtitle: `${position.actionLabel || formatAction(position.action)} · ${plainOutcome(position.outcome)} · ${position.signalConfidence || 0}/100`,
    summary: position.relationLabel || position.signalTitle || "Live wallet command from wallet-watcher.",
    url: normalizeExternalURL(position.marketURL) || normalizeExternalURL(position.signalURL) || normalizeExternalURL(position.walletURL),
    actionLabel: "Open market",
    badges: [
      { label: position.actionLabel || formatAction(position.action), className: position.action || "neutral" }
    ],
    metrics: [
      { label: "Open value", value: formatCompactUSD(position.currentValue) },
      { label: "Gap", value: formatSignedNumber(position.netScoreGap) },
      { label: "Support", value: position.supportingSignalCount ?? 0 },
      { label: "Oppose", value: position.opposingSignalCount ?? 0 }
    ]
  };
}

function createWalletDeltaPin(delta) {
  const topHighlight = safeArray(delta.highlights)[0];
  return {
    id: walletDeltaPinID(delta),
    scope: "wallet",
    scopeLabel: "Wallet delta",
    kicker: "Since last sync",
    title: delta.label || "Wallet delta",
    subtitle: `${formatSignedCompactUSD(delta.valueDeltaUSD)} · ${formatSignedCount(delta.openPositionDelta)} open · ${delta.actionChangeCount || 0} flips`,
    summary: topHighlight ? describeWalletChange(topHighlight) : "Wallet changed since the previous sync.",
    url: normalizeExternalURL(delta.walletURL),
    actionLabel: "Open wallet",
    badges: [
      { label: delta.hasChanges ? "Changed" : "Stable", className: delta.hasChanges ? "buy" : "neutral" }
    ],
    metrics: [
      { label: "Opened", value: delta.newPositionCount ?? 0 },
      { label: "Closed", value: delta.closedPositionCount ?? 0 },
      { label: "Flips", value: delta.actionChangeCount ?? 0 },
      { label: "Value", value: formatSignedCompactUSD(delta.valueDeltaUSD) }
    ]
  };
}

function createInsiderPin(signal) {
  return {
    id: insiderPinID(signal),
    scope: "insider",
    scopeLabel: "Live insider",
    kicker: "Insider signal",
    title: `${signal.ticker} · ${signal.companyName || signal.ticker}`,
    subtitle: `${signal.insiderName || "Unknown insider"} · ${signal.insiderTitle || "-"} · ${signal.confidence || 0}/100`,
    summary: signal.summary || "Fresh insider filing from the ranked tape.",
    url: getInsiderSignalURL(signal),
    actionLabel: "Open filing",
    badges: [
      { label: isSellDirection(signal.direction) ? "Bearish" : "Bullish", className: isSellDirection(signal.direction) ? "sell" : "buy" }
    ],
    metrics: [
      { label: "Trade", value: formatCompactUSD(signal.tradeValueUSD) },
      { label: "Filed", value: formatDateTime(signal.filedAt) },
      { label: "Type", value: signal.transactionType || "-" },
      { label: "Watchlist", value: signal.watchlistMatch ? "Yes" : "No" }
    ]
  };
}

function createIntelPin(item) {
  const primarySignal = safeArray(item?.topSignals)[0];
  const isMarketSource = item?.kind === "market_source";

  return {
    id: intelPinID(item),
    scope: "intel",
    scopeLabel: isMarketSource ? "Source-led intel" : "Curated filing",
    kicker: isMarketSource ? "Source-led intel" : "Insider watch",
    title: item.title || "Intel item",
    subtitle: item.subtitle || item.whyItMatters || "Curated intel item",
    summary: item.summary || item.whyItMatters || "Curated from the source intake layer.",
    url: normalizeExternalURL(item.sourceURL) ||
      normalizeExternalURL(item.externalURL) ||
      normalizeExternalURL(primarySignal?.marketURL),
    actionLabel: isMarketSource ? "Open source" : "Open filing",
    badges: isMarketSource
      ? [
          item.category ? { label: formatCategory(item.category), className: "neutral" } : null,
          item.sourceLane ? { label: formatIntelLane(item.sourceLane), className: "mixed" } : null
        ].filter(Boolean)
      : [
          { label: isSellDirection(item.direction) ? "Bearish" : "Bullish", className: isSellDirection(item.direction) ? "sell" : "buy" },
          item.watchlistMatch ? { label: "Watchlist", className: "mixed" } : null
        ].filter(Boolean),
    metrics: isMarketSource
      ? [
          { label: "Source", value: item.sourceName || item.provider || "-" },
          { label: "Seen", value: item.publishedAt ? formatRelativeTime(item.publishedAt) : "-" },
          { label: "Markets", value: item.signalCount ?? 0 },
          { label: "Priority", value: item.priority ? formatIntelPriority(item.priority) : "-" }
        ]
      : [
          { label: "Filed", value: item.filedAt ? formatDateTime(item.filedAt) : "-" },
          { label: "Trade", value: formatCompactUSD(item.tradeValueUSD) },
          { label: "Own", value: formatSignedPercent(item.ownershipChangePercent) },
          { label: "Type", value: item.transactionType || "-" }
        ]
  };
}

function createXGBoostPin(item, kicker = "XGBoost row") {
  return {
    id: xgboostPinID(item),
    scope: "xgboost",
    scopeLabel: "Model shadow",
    kicker,
    title: item.title || "Scored candidate",
    subtitle: `${plainOutcome(item.outcome)} · ${formatCategory(item.category)} · ${item.confidence || 0}/100`,
    summary: describeXGBoostRow(item),
    url: getSignalMarketURL(item),
    actionLabel: "Open market",
    badges: [
      { label: item.modelRank ? `Model #${item.modelRank}` : "Model row", className: "mixed" },
      item.swiftRank ? { label: `Swift #${item.swiftRank}`, className: "neutral" } : null
    ].filter(Boolean),
    metrics: [
      { label: "Score", value: formatModelScore(item.modelScore) },
      { label: "Price", value: formatMarketPrice(item.currentPrice) },
      { label: "Take", value: formatTake(item.take) },
      { label: "Flags", value: safeArray(item.flags).slice(0, 2).join(", ") || "-" }
    ]
  };
}

function createHistoryEvaluationPin(item, kicker = "History row") {
  const isModelEvaluation = Boolean(item?.xgboostStance);
  const modelLabel = normalizedModelOutcomeLabel(item?.modelOutcome);
  return {
    id: historyEvaluationPinID(item),
    scope: isModelEvaluation ? "xgboost" : "history",
    scopeLabel: isModelEvaluation ? "Model evaluation" : "Scored history",
    kicker,
    title: item.title || "Evaluated call",
    subtitle: isModelEvaluation
      ? `${item.horizonLabel || "-"} · ${plainOutcome(item.outcome)} · Model ${formatEvaluationLabel(modelLabel)}`
      : `${item.horizonLabel || "-"} · ${plainOutcome(item.outcome)} · ${formatEvaluationLabel(item.label)}`,
    summary: isModelEvaluation
      ? `${formatStance(item.xgboostStance)} · ${formatRelativeTime(item.evaluatedAt)} · edge ${formatSignedPoints(item.modelEdge)}`
      : `${formatRelativeTime(item.evaluatedAt)} · favorable ${formatSignedPoints(item.favorablePriceChange)}`,
    url: getSignalMarketURL(item),
    actionLabel: "Open market",
    badges: isModelEvaluation
      ? [
          { label: `Model ${formatEvaluationLabel(modelLabel)}`, className: evaluationLabelClass(modelLabel) },
          { label: formatTake(item.xgboostStance), className: item.xgboostStance || "neutral" }
        ]
      : [
          { label: formatEvaluationLabel(item.label), className: evaluationLabelClass(item.label) },
          { label: formatCategory(item.category), className: "neutral" }
        ],
    metrics: isModelEvaluation
      ? [
          { label: "Entry", value: formatMarketPrice(item.entryPrice) },
          { label: "Observed", value: formatMarketPrice(item.observedPrice) },
          { label: "Edge", value: formatSignedPoints(item.modelEdge) },
          { label: "Score", value: formatModelScore(item.xgboostModelScore) }
        ]
      : [
          { label: "Entry", value: formatMarketPrice(item.entryPrice) },
          { label: "Observed", value: formatMarketPrice(item.observedPrice) },
          { label: "Move", value: formatSignedPoints(item.favorablePriceChange) },
          { label: "Confidence", value: `${item.confidence || 0}/100` }
        ]
  };
}

function createHistoryInsiderPin(item) {
  return {
    id: historyInsiderPinID(item),
    scope: "insider",
    scopeLabel: "Insider archive",
    kicker: "Insider archive",
    title: `${item.ticker} · ${item.companyName || item.ticker}`,
    subtitle: `${item.insiderName || "-"} · ${item.transactionType || "-"} · ${formatDateTime(item.filedAt)}`,
    summary: item.summary || "Archived insider filing from history.",
    url: normalizeExternalURL(item.externalURL),
    actionLabel: "Open filing",
    badges: [
      { label: isSellDirection(item.direction) ? "Bearish" : "Bullish", className: isSellDirection(item.direction) ? "sell" : "buy" }
    ],
    metrics: [
      { label: "Trade", value: formatCompactUSD(item.tradeValueUSD) },
      { label: "Own", value: formatSignedPercent(item.ownershipChangePercent) },
      { label: "Filed", value: formatDateTime(item.filedAt) },
      { label: "Title", value: item.insiderTitle || "-" }
    ]
  };
}

function renderWalletHistory(historySection) {
  if (!historySection?.available) {
    const message = "Wallet history fills in after archived wallet snapshots have been exported into the shared overlay feed.";
    refs.walletHistoryToolbar.innerHTML = "";
    refs.walletHistorySummaryGrid.innerHTML = renderEmpty(message);
    refs.walletHistoryGraphGrid.innerHTML = renderEmpty(message);
    return;
  }

  const breakdown = normalizeWalletHistoryBreakdown(appState.walletHistory.breakdown);
  const metric = normalizeWalletHistoryMetric(appState.walletHistory.metric);
  const metricConfig = walletHistoryMetricConfig(metric);
  const focusSeries = walletHistorySeriesForBreakdown(historySection, breakdown);
  const visibleSeries = walletHistoryVisibleSeries(focusSeries, metricConfig.key, breakdown);
  const comparisonBreakdown = breakdown === "total" ? "wallets" : breakdown;
  const comparisonSeries = walletHistorySeriesForBreakdown(historySection, comparisonBreakdown);

  refs.walletHistoryToolbar.innerHTML = renderWalletHistoryToolbar(
    historySection,
    breakdown,
    metric,
    focusSeries.length,
    visibleSeries.length
  );
  refs.walletHistorySummaryGrid.innerHTML = renderWalletHistorySummaryGrid(
    historySection,
    breakdown,
    metricConfig,
    focusSeries,
    visibleSeries,
    comparisonBreakdown,
    comparisonSeries
  );
  refs.walletHistoryGraphGrid.innerHTML = [
    renderWalletHistoryTrendPanel(historySection, breakdown, metricConfig, focusSeries, visibleSeries),
    renderWalletHistoryLoadPanel(historySection),
    renderWalletHistoryBreakdownPanel(historySection, breakdown, metricConfig, comparisonBreakdown, comparisonSeries),
    renderWalletHistoryMoversPanel(historySection, metricConfig, comparisonBreakdown, comparisonSeries)
  ].join("");
}

function normalizeWalletHistoryBreakdown(value) {
  switch (value) {
    case "wallets":
    case "markets":
    case "categories":
      return value;
    default:
      return "total";
  }
}

function normalizeWalletHistoryMetric(value) {
  switch (value) {
    case "cost":
    case "unrealized":
    case "realized":
      return value;
    default:
      return "value";
  }
}

function walletHistoryMetricConfig(metric) {
  switch (normalizeWalletHistoryMetric(metric)) {
    case "cost":
      return {
        key: "costBasisValue",
        label: "Cost",
        formatter: formatCompactUSD,
        deltaFormatter: formatSignedCompactUSD,
        signed: false,
        description: "capital committed into the tracked wallets"
      };
    case "unrealized":
      return {
        key: "unrealizedPnL",
        label: "Unrealized",
        formatter: formatSignedCompactUSD,
        deltaFormatter: formatSignedCompactUSD,
        signed: true,
        description: "mark-to-market PnL across the archived snapshots"
      };
    case "realized":
      return {
        key: "realizedPnL",
        label: "Realized",
        formatter: formatSignedCompactUSD,
        deltaFormatter: formatSignedCompactUSD,
        signed: true,
        description: "closed PnL that has already been realized"
      };
    default:
      return {
        key: "currentValue",
        label: "Open value",
        formatter: formatCompactUSD,
        deltaFormatter: formatSignedCompactUSD,
        signed: false,
        description: "current mark-to-market value across open positions only"
      };
  }
}

function walletHistoryBreakdownLabel(value) {
  const map = {
    total: "Total",
    wallets: "Wallets",
    markets: "Markets",
    categories: "Categories"
  };
  return map[normalizeWalletHistoryBreakdown(value)] || "Total";
}

function walletHistorySeriesNoun(value) {
  switch (normalizeWalletHistoryBreakdown(value)) {
    case "wallets":
      return "wallets";
    case "markets":
      return "markets";
    case "categories":
      return "categories";
    default:
      return "series";
  }
}

function walletHistorySeriesForBreakdown(historySection, breakdown) {
  switch (normalizeWalletHistoryBreakdown(breakdown)) {
    case "wallets":
      return safeArray(historySection?.walletSeries);
    case "markets":
      return safeArray(historySection?.marketSeries);
    case "categories":
      return safeArray(historySection?.categorySeries);
    default:
      return [walletHistoryTotalSeries(historySection)].filter(Boolean);
  }
}

function walletHistoryTotalSeries(historySection) {
  const items = safeArray(historySection?.totalSeries);
  if (!items.length) {
    return null;
  }

  const latest = historySection?.latestSummary || items[items.length - 1] || {};
  return {
    key: "total",
    label: "All wallets",
    latestCurrentValue: latest.currentValue,
    latestCostBasisValue: latest.costBasisValue,
    latestUnrealizedPnL: latest.unrealizedPnL,
    latestRealizedPnL: latest.realizedPnL,
    latestOpenPositionCount: latest.openPositionCount,
    latestActionablePositionCount: latest.actionablePositionCount,
    items
  };
}

function walletHistoryLatestMetricField(metricKey) {
  const map = {
    currentValue: "latestCurrentValue",
    costBasisValue: "latestCostBasisValue",
    unrealizedPnL: "latestUnrealizedPnL",
    realizedPnL: "latestRealizedPnL"
  };
  return map[metricKey] || null;
}

function walletHistorySeriesMetricValue(series, metricKey) {
  if (!series) {
    return 0;
  }

  const latestField = walletHistoryLatestMetricField(metricKey);
  if (latestField && series[latestField] !== undefined && series[latestField] !== null) {
    return Number(series[latestField]) || 0;
  }

  const items = safeArray(series.items);
  if (!items.length) {
    return 0;
  }

  return Number(items[items.length - 1]?.[metricKey]) || 0;
}

function walletHistorySeriesSnapshotValue(series, metricKey, index) {
  const items = safeArray(series?.items);
  if (!items.length) {
    return 0;
  }

  const safeIndex = Math.min(Math.max(index, 0), items.length - 1);
  return Number(items[safeIndex]?.[metricKey]) || 0;
}

function rankWalletHistorySeries(series, metricKey) {
  return safeArray(series)
    .slice()
    .sort((lhs, rhs) => {
      const delta = Math.abs(walletHistorySeriesMetricValue(rhs, metricKey)) - Math.abs(walletHistorySeriesMetricValue(lhs, metricKey));
      if (delta !== 0) {
        return delta;
      }
      return String(lhs?.label || "").localeCompare(String(rhs?.label || ""), "nb");
    });
}

function walletHistoryVisibleSeries(series, metricKey, breakdown) {
  const ranked = rankWalletHistorySeries(series, metricKey);
  switch (normalizeWalletHistoryBreakdown(breakdown)) {
    case "markets":
      return ranked.slice(0, 8);
    case "categories":
      return ranked.slice(0, 8);
    default:
      return ranked;
  }
}

function walletHistorySeriesColor(index) {
  return WALLET_HISTORY_SERIES_PALETTE[index % WALLET_HISTORY_SERIES_PALETTE.length];
}

function renderWalletHistoryToolbar(historySection, breakdown, metric, seriesCount, visibleCount) {
  const breakdownOptions = [
    { key: "total", label: "Total" },
    { key: "wallets", label: "Wallets" },
    { key: "markets", label: "Markets" },
    { key: "categories", label: "Categories" }
  ];
  const metricOptions = [
    { key: "value", label: "Value" },
    { key: "cost", label: "Cost" },
    { key: "unrealized", label: "Unrealized" },
    { key: "realized", label: "Realized" }
  ];
  const hiddenCount = Math.max(0, seriesCount - visibleCount);
  const rangeNote = historySection.earliestAt && historySection.latestAt
    ? `${formatDateTime(historySection.earliestAt)} -> ${formatDateTime(historySection.latestAt)}`
    : "No archived range yet";
  const seriesNote = normalizeWalletHistoryBreakdown(breakdown) === "total"
    ? `${historySection.snapshotCount || safeArray(historySection.totalSeries).length || 0} snapshot(s) archived`
    : `${seriesCount} ${walletHistorySeriesNoun(breakdown)} tracked${hiddenCount ? ` · showing top ${visibleCount}` : ""}`;

  return `
    <div class="wallet-toolbar-group">
      <span class="wallet-toolbar-label">Breakdown</span>
      <div class="wallet-filter-row">
        ${breakdownOptions.map((option) => renderWalletHistoryToolbarButton(
          "wallet-history-breakdown",
          option.key,
          option.label,
          normalizeWalletHistoryBreakdown(breakdown) === option.key
        )).join("")}
      </div>
    </div>
    <div class="wallet-toolbar-group">
      <span class="wallet-toolbar-label">Metric</span>
      <div class="wallet-filter-row">
        ${metricOptions.map((option) => renderWalletHistoryToolbarButton(
          "wallet-history-metric",
          option.key,
          option.label,
          normalizeWalletHistoryMetric(metric) === option.key
        )).join("")}
      </div>
    </div>
    <p class="wallet-toolbar-note">${escapeHTML(`${seriesNote} · ${rangeNote}`)}</p>
  `;
}

function renderWalletHistoryToolbarButton(dataKey, value, label, isActive) {
  return `
    <button
      type="button"
      class="wallet-filter-button${isActive ? " is-active" : ""}"
      data-${escapeAttribute(dataKey)}="${escapeAttribute(value)}"
    >
      ${escapeHTML(label)}
    </button>
  `;
}

function renderWalletHistorySummaryGrid(
  historySection,
  breakdown,
  metricConfig,
  focusSeries,
  visibleSeries,
  comparisonBreakdown,
  comparisonSeries
) {
  const latestSummary = historySection?.latestSummary || {};
  const rankedComparison = rankWalletHistorySeries(comparisonSeries, metricConfig.key);
  const leadSeries = rankedComparison[0];
  const hiddenCount = Math.max(0, safeArray(focusSeries).length - safeArray(visibleSeries).length);
  const snapshotCount = historySection.snapshotCount || safeArray(historySection.totalSeries).length || 0;

  return [
    renderHistoryStatCard(
      "Snapshots",
      snapshotCount,
      historySection.earliestAt && historySection.latestAt
        ? `${formatDateTime(historySection.earliestAt)} -> ${formatDateTime(historySection.latestAt)}`
        : "No archived range yet"
    ),
    renderHistoryStatCard(
      "Lens",
      `${walletHistoryBreakdownLabel(breakdown)} · ${metricConfig.label}`,
      normalizeWalletHistoryBreakdown(breakdown) === "total"
        ? "All watched wallets combined"
        : `${focusSeries.length} ${walletHistorySeriesNoun(breakdown)} tracked`
    ),
    renderHistoryStatCard(
      `Latest ${metricConfig.label}`,
      metricConfig.formatter(latestSummary?.[metricConfig.key]),
      metricConfig.description
    ),
    renderHistoryStatCard(
      "Positions",
      `${latestSummary.openPositionCount || 0} open`,
      `${latestSummary.actionablePositionCount || 0} actionable in the latest snapshot`
    ),
    renderHistoryStatCard(
      "Lead series",
      leadSeries ? truncateText(leadSeries.label, 22) : "-",
      leadSeries
        ? `${metricConfig.formatter(walletHistorySeriesMetricValue(leadSeries, metricConfig.key))} · ${walletHistoryBreakdownLabel(comparisonBreakdown)}`
        : "No split series exported yet"
    ),
    renderHistoryStatCard(
      "Chart scope",
      `${visibleSeries.length}/${Math.max(visibleSeries.length, focusSeries.length || 1)}`,
      hiddenCount
        ? `${hiddenCount} lower-weight ${walletHistorySeriesNoun(breakdown)} hidden to keep the chart readable`
        : "All visible series are on the chart"
    )
  ].join("");
}

function renderWalletHistoryTrendPanel(historySection, breakdown, metricConfig, focusSeries, visibleSeries) {
  if (!visibleSeries.length) {
    return renderGraphPanel(
      "Wallet history",
      "Track capital, exposure, and PnL over time from the archived wallet snapshots.",
      renderEmpty("No wallet history rows have been archived into this lens yet.")
    );
  }

  const plotSeries = visibleSeries.map((series, index) => ({
    key: series.key || `${breakdown}-${index}`,
    label: series.label || `Series ${index + 1}`,
    color: walletHistorySeriesColor(index),
    items: safeArray(series.items).map((item) => ({
      timestampUnix: item.timestampUnix,
      timestamp: item.timestamp,
      value: Number(item?.[metricConfig.key]) || 0
    }))
  }));
  const hiddenCount = Math.max(0, focusSeries.length - visibleSeries.length);
  const description = normalizeWalletHistoryBreakdown(breakdown) === "total"
    ? `All watched wallets combined across ${historySection.snapshotCount || safeArray(historySection.totalSeries).length || 0} archived snapshots.`
    : `${walletHistoryBreakdownLabel(breakdown)} over time, ranked by latest ${metricConfig.label.toLowerCase()}${hiddenCount ? ` · showing top ${visibleSeries.length} of ${focusSeries.length}` : ""}.`;

  return renderGraphPanel(
    `${walletHistoryBreakdownLabel(breakdown)} · ${metricConfig.label}`,
    description,
    `${renderTimeSeriesPlot(plotSeries, {
      ariaLabel: `${walletHistoryBreakdownLabel(breakdown)} ${metricConfig.label} history plot`,
      valueFormatter: metricConfig.formatter,
      signed: metricConfig.signed
    })}
    <p class="graph-meta-line">${escapeHTML(
      hiddenCount
        ? `${hiddenCount} lower-weight ${walletHistorySeriesNoun(breakdown)} are hidden on the plot but still included in the summary cards below.`
        : `Latest snapshot: ${formatDateTime(historySection.latestAt || historySection.latestSummary?.timestamp)}.`
    )}</p>`
  );
}

function renderWalletHistoryLoadPanel(historySection) {
  const items = safeArray(historySection?.totalSeries);
  if (!items.length) {
    return renderGraphPanel(
      "Position load",
      "Open and actionable positions across archived wallet snapshots.",
      renderEmpty("No position-load history has been archived yet.")
    );
  }

  const latest = items[items.length - 1] || {};
  const plotSeries = [
    {
      key: "open",
      label: "Open positions",
      color: "rgba(114, 215, 255, 0.96)",
      items: items.map((item) => ({
        timestampUnix: item.timestampUnix,
        timestamp: item.timestamp,
        value: Number(item.openPositionCount) || 0
      }))
    },
    {
      key: "actionable",
      label: "Actionable",
      color: "rgba(255, 191, 105, 0.95)",
      items: items.map((item) => ({
        timestampUnix: item.timestampUnix,
        timestamp: item.timestamp,
        value: Number(item.actionablePositionCount) || 0
      }))
    }
  ];

  return renderGraphPanel(
    "Position load",
    "How many positions are open and actionable across the archived wallet snapshots.",
    `${renderTimeSeriesPlot(plotSeries, {
      ariaLabel: "Wallet position load plot",
      valueFormatter: (value) => String(Math.round(Number(value) || 0)),
      signed: false,
      integer: true
    })}
    <p class="graph-meta-line">${escapeHTML(
      `Latest snapshot: ${latest.openPositionCount || 0} open · ${latest.actionablePositionCount || 0} actionable`
    )}</p>`
  );
}

function renderWalletHistoryBreakdownPanel(historySection, breakdown, metricConfig, comparisonBreakdown, comparisonSeries) {
  const rankedSeries = rankWalletHistorySeries(comparisonSeries, metricConfig.key);
  if (!rankedSeries.length) {
    return renderGraphPanel(
      "Latest breakdown",
      "Current split across the selected wallet-history lens.",
      renderEmpty("No split series were exported for this lens.")
    );
  }

  const visibleRows = rankedSeries.slice(0, 10);
  const maxAbs = Math.max(
    1,
    ...visibleRows.map((series) => Math.abs(walletHistorySeriesMetricValue(series, metricConfig.key)))
  );
  const hiddenCount = Math.max(0, rankedSeries.length - visibleRows.length);
  const description = normalizeWalletHistoryBreakdown(breakdown) === "total"
    ? `Current ${metricConfig.label.toLowerCase()} split across Rose and Haak.`
    : `Current ${metricConfig.label.toLowerCase()} split across ${walletHistoryBreakdownLabel(comparisonBreakdown).toLowerCase()}.`;

  return renderGraphPanel(
    "Latest breakdown",
    description,
    `
      <div class="wallet-history-rank-list">
        ${visibleRows.map((series) => renderWalletHistoryRankRow({
          label: series.label,
          value: walletHistorySeriesMetricValue(series, metricConfig.key),
          displayValue: metricConfig.formatter(walletHistorySeriesMetricValue(series, metricConfig.key)),
          meta: `${series.latestOpenPositionCount || 0} open · ${series.latestActionablePositionCount || 0} actionable`,
          fill: Math.max(6, (Math.abs(walletHistorySeriesMetricValue(series, metricConfig.key)) / maxAbs) * 100)
        })).join("")}
      </div>
      <p class="graph-meta-line">${escapeHTML(
        hiddenCount
          ? `${hiddenCount} smaller ${walletHistorySeriesNoun(comparisonBreakdown)} are hidden below the fold.`
          : `Latest snapshot captured ${formatDateTime(historySection.latestAt || historySection.latestSummary?.timestamp)}.`
      )}</p>
    `
  );
}

function renderWalletHistoryMoversPanel(historySection, metricConfig, comparisonBreakdown, comparisonSeries) {
  const rankedRows = safeArray(comparisonSeries)
    .map((series) => {
      const items = safeArray(series.items);
      if (items.length < 2) {
        return null;
      }

      const latestIndex = items.length - 1;
      const latestDelta = walletHistorySeriesSnapshotValue(series, metricConfig.key, latestIndex)
        - walletHistorySeriesSnapshotValue(series, metricConfig.key, latestIndex - 1);
      const totalDelta = walletHistorySeriesSnapshotValue(series, metricConfig.key, latestIndex)
        - walletHistorySeriesSnapshotValue(series, metricConfig.key, 0);

      return {
        label: series.label,
        value: latestDelta,
        displayValue: metricConfig.deltaFormatter(latestDelta),
        meta: `Since start ${metricConfig.deltaFormatter(totalDelta)} · ${series.latestOpenPositionCount || 0} open`,
        fillValue: Math.abs(latestDelta)
      };
    })
    .filter(Boolean)
    .sort((lhs, rhs) => rhs.fillValue - lhs.fillValue || String(lhs.label || "").localeCompare(String(rhs.label || ""), "nb"));

  if (!rankedRows.length || rankedRows.every((row) => row.fillValue === 0)) {
    return renderGraphPanel(
      "Recent movers",
      `Latest-step changes across ${walletHistoryBreakdownLabel(comparisonBreakdown).toLowerCase()}.`,
      renderEmpty("No measurable movement appeared between the last two archived snapshots.")
    );
  }

  const visibleRows = rankedRows.slice(0, 10);
  const maxAbs = Math.max(1, ...visibleRows.map((row) => row.fillValue));
  const hiddenCount = Math.max(0, rankedRows.length - visibleRows.length);

  return renderGraphPanel(
    "Recent movers",
    `Latest-step changes across ${walletHistoryBreakdownLabel(comparisonBreakdown).toLowerCase()}.`,
    `
      <div class="wallet-history-rank-list">
        ${visibleRows.map((row) => renderWalletHistoryRankRow({
          label: row.label,
          value: row.value,
          displayValue: row.displayValue,
          meta: row.meta,
          fill: Math.max(6, (row.fillValue / maxAbs) * 100)
        })).join("")}
      </div>
      <p class="graph-meta-line">${escapeHTML(
        hiddenCount
          ? `${hiddenCount} lower-movement ${walletHistorySeriesNoun(comparisonBreakdown)} are omitted here.`
          : `Compared against the previous archived snapshot.`
      )}</p>
    `
  );
}

function renderWalletHistoryRankRow({ label, value, displayValue, meta, fill }) {
  const numericValue = Number(value) || 0;
  const directionClass = numericValue < 0 ? "is-negative" : numericValue > 0 ? "is-positive" : "is-flat";
  const fillClass = numericValue < 0 ? "negative" : "positive";

  return `
    <div class="wallet-history-rank-row ${directionClass}">
      <div class="wallet-history-rank-head">
        <strong>${escapeHTML(truncateText(label, 36))}</strong>
        <span class="wallet-history-rank-value">${escapeHTML(displayValue)}</span>
      </div>
      <p class="wallet-history-rank-meta">${escapeHTML(meta || "-")}</p>
      <div class="bar-track">
        <div class="bar-fill ${fillClass}" style="--fill:${fill}%"></div>
      </div>
    </div>
  `;
}

function renderTimeSeriesPlot(seriesDefinitions, options = {}) {
  const preparedSeries = safeArray(seriesDefinitions)
    .map((series, index) => ({
      key: series.key || `series-${index}`,
      label: series.label || `Series ${index + 1}`,
      color: series.color || walletHistorySeriesColor(index),
      points: safeArray(series.items)
        .map((item) => ({
          timestampUnix: Number(item.timestampUnix) || Math.round(new Date(item.timestamp || 0).getTime() / 1000),
          value: Number(item.value) || 0
        }))
        .filter((point) => Number.isFinite(point.timestampUnix) && point.timestampUnix > 0)
        .sort((lhs, rhs) => lhs.timestampUnix - rhs.timestampUnix)
    }))
    .filter((series) => series.points.length);

  if (!preparedSeries.length) {
    return renderEmpty("No time-series points are available for this chart yet.");
  }

  const width = 560;
  const height = 240;
  const padLeft = 58;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 34;
  const usableWidth = width - padLeft - padRight;
  const usableHeight = height - padTop - padBottom;
  const allPoints = preparedSeries.flatMap((series) => series.points);
  const timestamps = allPoints.map((point) => point.timestampUnix);
  const values = allPoints.map((point) => point.value);
  const minTimestamp = Math.min(...timestamps);
  const maxTimestamp = Math.max(...timestamps);
  const spanSeconds = Math.max(0, maxTimestamp - minTimestamp);
  const signed = Boolean(options.signed);
  let minValue = signed ? Math.min(0, ...values) : 0;
  let maxValue = Math.max(signed ? 0 : 1, ...values);

  if (minValue === maxValue) {
    if (minValue === 0) {
      maxValue = 1;
    } else if (minValue > 0) {
      minValue = 0;
    } else {
      maxValue = 0;
    }
  }

  const xForTimestamp = (timestampUnix) => {
    if (minTimestamp === maxTimestamp) {
      return padLeft + usableWidth / 2;
    }
    return padLeft + ((timestampUnix - minTimestamp) / (maxTimestamp - minTimestamp)) * usableWidth;
  };
  const yForValue = (value) => {
    const ratio = (Number(value || 0) - minValue) / (maxValue - minValue);
    return padTop + usableHeight - ratio * usableHeight;
  };

  const xTickCandidates = [minTimestamp, minTimestamp + spanSeconds / 2, maxTimestamp]
    .filter((value, index, all) => all.findIndex((item) => Math.abs(item - value) < 1) === index);
  const yTickCandidates = signed
    ? [minValue, 0, maxValue]
    : [minValue, minValue + (maxValue - minValue) / 2, maxValue];
  const yTicks = yTickCandidates.filter((value, index, all) => all.findIndex((item) => Math.abs(item - value) < 1e-6) === index);
  const valueFormatter = typeof options.valueFormatter === "function" ? options.valueFormatter : String;

  return `
    <svg class="plot-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttribute(options.ariaLabel || "Time series plot")}">
      ${yTicks.map((tick) => {
        const y = yForValue(tick);
        const gridClass = Math.abs(tick) < 1e-6 ? "plot-grid plot-axis-zero" : "plot-grid";
        return `<line class="${gridClass}" x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}"></line>`;
      }).join("")}
      ${xTickCandidates.map((tick) => `
        <line class="plot-grid plot-grid-vertical" x1="${xForTimestamp(tick).toFixed(1)}" y1="${padTop}" x2="${xForTimestamp(tick).toFixed(1)}" y2="${height - padBottom}"></line>
      `).join("")}
      <line class="plot-axis" x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}"></line>
      <line class="plot-axis" x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}"></line>
      ${preparedSeries.map((series) => {
        const linePoints = series.points.map((point) => `${xForTimestamp(point.timestampUnix)},${yForValue(point.value)}`).join(" ");
        return `
          <polyline
            class="plot-line series-custom"
            style="--plot-series-color:${escapeAttribute(series.color)}"
            points="${linePoints}"
          ></polyline>
          ${series.points.map((point) => `
            <circle
              class="plot-point series-custom"
              style="--plot-series-color:${escapeAttribute(series.color)}"
              cx="${xForTimestamp(point.timestampUnix).toFixed(1)}"
              cy="${yForValue(point.value).toFixed(1)}"
              r="3.5"
            ></circle>
          `).join("")}
        `;
      }).join("")}
      ${xTickCandidates.map((tick) => `
        <text class="plot-tick" x="${xForTimestamp(tick).toFixed(1)}" y="${height - 10}" text-anchor="middle">${escapeHTML(formatWalletHistoryTick(tick, spanSeconds))}</text>
      `).join("")}
      ${yTicks.map((tick) => `
        <text class="plot-tick" x="${padLeft - 8}" y="${(yForValue(tick) + 4).toFixed(1)}" text-anchor="end">${escapeHTML(valueFormatter(tick))}</text>
      `).join("")}
    </svg>
    <div class="plot-legend">
      ${preparedSeries.map((series) => `
        <div class="plot-legend-item">
          <span class="plot-dot series-custom" style="--plot-series-color:${escapeAttribute(series.color)}"></span>
          <span>${escapeHTML(series.label)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function formatWalletHistoryTick(timestampUnix, spanSeconds) {
  const date = new Date(Number(timestampUnix) * 1000);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  if (spanSeconds <= 48 * 60 * 60) {
    const hour = String(date.getHours()).padStart(2, "0");
    return `${day}/${month} ${hour}`;
  }
  return `${day}/${month}`;
}

function renderHistory(historySection) {
  if (!historySection?.available) {
    const message = "History view fills in when the SQLite evaluation stores contain scored rows.";
    refs.historySummaryGrid.innerHTML = renderEmpty(message);
    refs.historyGraphGrid.innerHTML = renderEmpty(message);
    refs.historyTape.innerHTML = renderEmpty(message);
    refs.historyInsiderArchive.innerHTML = renderEmpty(message);
    return;
  }

  const marketHistory = historySection.market || {};
  const insiderHistory = historySection.insider || {};
  refs.historySummaryGrid.innerHTML = renderHistorySummaryGrid(marketHistory, insiderHistory);
  refs.historyGraphGrid.innerHTML = [
    renderHistoryOutcomeScoreboard(marketHistory),
    renderHistoryDailyTimeline(marketHistory),
    renderHistoryCallsPanel(
      "Best 24h calls",
      "Highest favorable moves on the 24-hour evaluation horizon.",
      safeArray(marketHistory.bestCalls),
      "No scored 24-hour winners yet."
    ),
    renderHistoryCallsPanel(
      "Toughest 24h misses",
      "Largest fades on the 24-hour evaluation horizon.",
      safeArray(marketHistory.worstCalls),
      "No scored 24-hour misses yet."
    )
  ].join("");
  refs.historyTape.innerHTML = renderHistoryTape(marketHistory);
  refs.historyInsiderArchive.innerHTML = renderHistoryInsiderArchive(insiderHistory);
}

function renderHistorySummaryGrid(marketHistory, insiderHistory) {
  const summary = marketHistory?.summary || {};
  const oneHour = summary.oneHour;
  const twentyFourHour = summary.twentyFourHour;

  return [
    renderHistoryStatCard(
      "Coverage",
      summary.coverageDays ? `${summary.coverageDays}d` : "-",
      summary.firstEvaluatedAt && summary.lastEvaluatedAt
        ? `${formatDateTime(summary.firstEvaluatedAt)} -> ${formatDateTime(summary.lastEvaluatedAt)}`
        : "No evaluated range yet"
    ),
    renderHistoryStatCard(
      "Signal snapshots",
      summary.signalSnapshotCount || 0,
      `${summary.evaluationRowCount || 0} scored eval rows`
    ),
    renderHistoryStatCard(
      "1h win rate",
      oneHour ? formatPercent(oneHour.decisiveWinRate) : "-",
      oneHour ? `${oneHour.wins} win / ${oneHour.losses} loss / ${oneHour.flats} flat` : "No 1h rows yet"
    ),
    renderHistoryStatCard(
      "24h win rate",
      twentyFourHour ? formatPercent(twentyFourHour.decisiveWinRate) : "-",
      twentyFourHour ? `${twentyFourHour.wins} win / ${twentyFourHour.losses} loss / ${twentyFourHour.flats} flat` : "No 24h rows yet"
    ),
    renderHistoryStatCard(
      "Latest eval",
      summary.latestEvaluationAt ? formatRelativeTime(summary.latestEvaluationAt) : "-",
      summary.latestEvaluationAt ? formatDateTime(summary.latestEvaluationAt) : "No scored rows yet"
    ),
    renderHistoryStatCard(
      "Insider archive",
      insiderHistory?.summary?.archiveCount || 0,
      `${insiderHistory?.summary?.bullishCount || 0} bullish · ${insiderHistory?.summary?.bearishCount || 0} bearish`
    )
  ].join("");
}

function renderHistoryStatCard(label, value, detail) {
  return `
    <article class="history-stat-card">
      <span class="summary-label">${escapeHTML(label)}</span>
      <strong>${escapeHTML(String(value ?? "-"))}</strong>
      <p>${escapeHTML(detail || "-")}</p>
    </article>
  `;
}

function renderHistoryOutcomeScoreboard(marketHistory) {
  const horizons = safeArray(marketHistory?.horizons);
  if (!horizons.length) {
    return renderGraphPanel(
      "Outcome scoreboard",
      "Wins, losses, and flats across evaluated horizons.",
      renderEmpty("No scored market history rows yet.")
    );
  }

  const rows = horizons.map((item) => `
    <div class="history-score-row">
      <div class="history-score-head">
        <div>
          <strong>${escapeHTML(item.label)}</strong>
          <p class="graph-meta-line">${escapeHTML(String(item.total || 0))} eval rows · ${escapeHTML(formatPercent(item.decisiveWinRate))} decisive win rate</p>
        </div>
        <span class="history-edge ${item.averageRealizedEdge >= 0 ? "positive" : "negative"}">${escapeHTML(formatSignedEdge(item.averageRealizedEdge))}</span>
      </div>
      ${renderHistoryOutcomeBar(item)}
      <div class="compact-footer">
        ${miniBadge("Wins", item.wins || 0)}
        ${miniBadge("Losses", item.losses || 0)}
        ${miniBadge("Flats", item.flats || 0)}
        ${miniBadge("Avg move", formatSignedPoints(item.averageFavorableMove))}
      </div>
    </div>
  `).join("");

  return renderGraphPanel(
    "Outcome scoreboard",
    "Wins, losses, and flats across evaluated horizons.",
    `<div class="history-score-list">${rows}</div>`
  );
}

function renderHistoryDailyTimeline(marketHistory) {
  const days = safeArray(marketHistory?.daily);
  if (!days.length) {
    return renderGraphPanel(
      "Daily tape",
      "Recent days of scored outcomes split by horizon.",
      renderEmpty("No daily history tape yet.")
    );
  }

  const rows = days.map((day) => `
    <div class="history-day-row">
      <div class="history-day-head">
        <strong>${escapeHTML(formatHistoryDay(day.day))}</strong>
        <span>${escapeHTML(String(day.total || 0))} eval rows</span>
      </div>
      <div class="history-day-stack">
        ${safeArray(day.horizons).map((item) => `
          <div class="history-day-horizon">
            <div class="history-day-label">
              <span>${escapeHTML(item.label)}</span>
              <span>${escapeHTML(formatPercent(item.decisiveWinRate))}</span>
            </div>
            ${renderHistoryOutcomeBar(item, true)}
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");

  return renderGraphPanel(
    "Daily tape",
    "Recent days of scored outcomes split by horizon.",
    `<div class="history-day-list">${rows}</div>`
  );
}

function renderHistoryCallsPanel(title, description, items, emptyMessage) {
  if (!items.length) {
    return renderGraphPanel(title, description, renderEmpty(emptyMessage));
  }

  return renderGraphPanel(
    title,
    description,
    `<div class="history-call-list">${items.map(renderHistoryCallItem).join("")}</div>`
  );
}

function renderHistoryCallItem(item) {
  const marketURL = getSignalMarketURL(item);
  const labelClass = evaluationLabelClass(item.label);
  const moveClass = Number(item.favorablePriceChange) >= 0 ? "positive" : "negative";

  return `
    <article ${renderCardSurfaceAttributes("history-call-item", marketURL, `Open history row for ${item.title}`)}>
      <div class="history-call-head">
        <div>
          <strong>${escapeHTML(truncateText(item.title, 56))}</strong>
          <p class="graph-meta-line">${escapeHTML(item.horizonLabel || "-")} · ${escapeHTML(plainOutcome(item.outcome))} · ${escapeHTML(formatRelativeTime(item.evaluatedAt))}</p>
        </div>
        <span class="history-move ${moveClass}">${escapeHTML(formatSignedPoints(item.favorablePriceChange))}</span>
      </div>
      <div class="compact-footer">
        <span class="badge ${escapeHTML(labelClass)}">${escapeHTML(formatEvaluationLabel(item.label))}</span>
        ${miniBadge("Take", formatTake(item.take))}
        ${miniBadge("Category", formatCategory(item.category))}
        ${miniBadge("Entry", formatMarketPrice(item.entryPrice))}
        ${miniBadge("Observed", formatMarketPrice(item.observedPrice))}
        ${renderExternalAction("Open market", marketURL)}
        ${renderPinAction(historyEvaluationPinID(item))}
      </div>
    </article>
  `;
}

function renderHistoryTape(marketHistory) {
  const items = safeArray(marketHistory?.recentEvaluations);
  if (!items.length) {
    return renderEmpty("No recent scored evaluations yet.");
  }

  return `<div class="compact-list history-tape-list">${items.map(renderHistoryTapeItem).join("")}</div>`;
}

function renderHistoryTapeItem(item) {
  const marketURL = getSignalMarketURL(item);
  const labelClass = evaluationLabelClass(item.label);

  return `
    <article ${renderCardSurfaceAttributes("compact-card history-tape-item", marketURL, `Open history tape item for ${item.title}`)}>
      <div class="compact-head">
        <div>
          <p class="compact-title">${escapeHTML(item.title)}</p>
        </div>
        <span class="badge ${escapeHTML(labelClass)}">${escapeHTML(formatEvaluationLabel(item.label))}</span>
      </div>
      <div class="compact-copy">
        <p>${escapeHTML(item.horizonLabel || "-")} · ${escapeHTML(plainOutcome(item.outcome))} · ${escapeHTML(formatCategory(item.category))}</p>
        <p>${escapeHTML(formatRelativeTime(item.evaluatedAt))} · favorable ${escapeHTML(formatSignedPoints(item.favorablePriceChange))}</p>
      </div>
      <div class="compact-footer">
        ${miniBadge("Entry", formatMarketPrice(item.entryPrice))}
        ${miniBadge("Observed", formatMarketPrice(item.observedPrice))}
        ${miniBadge("Price now", formatMarketPrice(item.currentMarketPrice))}
        ${miniBadge("Confidence", `${item.confidence || 0}/100`)}
        ${renderExternalAction("Open market", marketURL)}
        ${renderPinAction(historyEvaluationPinID(item))}
      </div>
    </article>
  `;
}

function renderHistoryInsiderArchive(insiderHistory) {
  const items = safeArray(insiderHistory?.archive);
  if (!items.length) {
    return renderEmpty("No insider archive rows yet.");
  }

  return `<div class="compact-list history-archive-list">${items.map(renderHistoryInsiderArchiveItem).join("")}</div>`;
}

function renderHistoryInsiderArchiveItem(item) {
  return `
    <article ${renderCardSurfaceAttributes("compact-card history-archive-item", item.externalURL, `Open archive filing for ${item.ticker}`)}>
      <div class="compact-head">
        <div>
          <p class="compact-title">${escapeHTML(item.ticker)} · ${escapeHTML(item.companyName || "-")}</p>
        </div>
        <span class="badge ${isSellDirection(item.direction) ? "sell" : "buy"}">${escapeHTML(isSellDirection(item.direction) ? "Bearish" : "Bullish")}</span>
      </div>
      <div class="compact-copy">
        <p>${escapeHTML(item.insiderName || "-")} · ${escapeHTML(item.insiderTitle || "-")}</p>
        <p>${escapeHTML(item.summary || "No filing summary available.")}</p>
      </div>
      <div class="compact-footer">
        ${miniBadge("Filed", formatDateTime(item.filedAt))}
        ${miniBadge("Trade", formatCompactUSD(item.tradeValueUSD))}
        ${miniBadge("Own", formatSignedPercent(item.ownershipChangePercent))}
        ${miniBadge("Type", item.transactionType || "-")}
        ${renderExternalAction("Open filing", item.externalURL)}
        ${renderPinAction(historyInsiderPinID(item))}
      </div>
    </article>
  `;
}

function renderHistoryOutcomeBar(item, compact = false) {
  const total = Number(item?.total) || 0;
  if (!total) {
    return `<div class="history-outcome-bar${compact ? " compact" : ""}"></div>`;
  }

  const wins = Number(item?.wins) || 0;
  const losses = Number(item?.losses) || 0;
  const flats = Number(item?.flats) || 0;
  const segments = [
    { className: "win", percent: clampPercent((wins / total) * 100), count: wins },
    { className: "loss", percent: clampPercent((losses / total) * 100), count: losses },
    { className: "flat", percent: clampPercent((flats / total) * 100), count: flats }
  ].filter((segment) => segment.count > 0);

  return `
    <div class="history-outcome-bar${compact ? " compact" : ""}">
      ${segments.map((segment) => `
        <span
          class="history-outcome-segment ${segment.className}"
          style="--segment:${segment.percent}%"
          title="${segment.count} ${segment.className}"
        ></span>
      `).join("")}
    </div>
  `;
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
  const marketURL = getSignalMarketURL(signal);
  const directionClass = isSellDirection(signal.direction) ? "sell" : "buy";
  const xgboostBadge = signal.xgboostStance
    ? `<span class="badge ${escapeHTML(signal.xgboostStance)}">${escapeHTML(formatStance(signal.xgboostStance))}</span>`
    : "";
  const openMarketLink = renderExternalAction("Open market", marketURL);
  const intelAction = renderIntelActionForSignal(signal);

  return `
    <article ${renderCardSurfaceAttributes("signal-card", marketURL, `Open market for ${signal.title}`)}>
      <div class="card-top">
        <div class="badges">
          <span class="badge ${directionClass}">${escapeHTML(formatDirection(signal.direction))}</span>
          <span class="badge neutral">${escapeHTML(formatCategory(signal.category))}</span>
          <span class="badge neutral">${escapeHTML(formatTake(signal.take))}</span>
          ${xgboostBadge}
        </div>
        <span class="badge neutral">${escapeHTML(String(signal.confidence || 0))}/100</span>
      </div>

      ${renderLinkedText("h3", "signal-title", signal.title, marketURL)}

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
        <div class="card-action-row">
          ${openMarketLink}
          ${intelAction}
          ${renderPinAction(marketPinID(signal))}
        </div>
      </div>
    </article>
  `;
}

function renderWalletCard(wallet) {
  const positions = displayedWalletPositions(wallet);
  const deltaLine = renderWalletDeltaLine(wallet.delta);
  const activityCash = wallet.activityCash || null;

  return `
    <article ${renderCardSurfaceAttributes("wallet-card", getWalletURL(wallet), `Open wallet ${wallet.label}`)}>
      <div class="wallet-head">
        <div>
          <p class="section-kicker">Watched wallet</p>
          ${renderLinkedText("h3", "wallet-title", wallet.label, getWalletURL(wallet))}
          <p class="wallet-subcopy">${escapeHTML(shortWallet(wallet.wallet))}</p>
        </div>
        <div class="wallet-meta">
          <span class="badge neutral">${wallet.openPositionCount || 0} open</span>
          <span class="badge ${(wallet.actionablePositionCount || 0) > 0 ? "buy" : "neutral"}">${wallet.actionablePositionCount || 0} actionable</span>
        </div>
      </div>

      <div class="wallet-summary">
        ${miniStat("Open value", formatCompactUSD(wallet.totalCurrentValue))}
        ${activityCash ? miniStat("Returned", formatCompactUSD(activityCash.returnedUSD)) : ""}
        ${activityCash ? miniStat("Net flow", formatSignedCompactUSD(activityCash.netFlowUSD)) : ""}
        ${miniStat("24h trades", wallet.recentActivityCount || 0)}
        ${miniStat("Last activity", formatRelativeTimeFromUnix(wallet.lastActivityTimestamp))}
        ${miniStat("Positions", positions.length || 0)}
      </div>

      ${activityCash ? `<p class="wallet-focus-copy">${escapeHTML(walletActivityCashCopy(activityCash))}</p>` : ""}

      ${deltaLine}

      <div class="positions">
        ${positions.length ? positions.map((position) => renderWalletPosition(wallet, position)).join("") : renderEmpty("No open positions in the latest wallet snapshot.")}
      </div>

      <div class="signal-footer">
        <span class="footer-note">${escapeHTML(formatRelativeTimeFromUnix(wallet.lastActivityTimestamp))}</span>
        <div class="card-action-row">
          ${renderExternalAction("Open wallet", getWalletURL(wallet))}
          ${renderPinAction(walletPinID(wallet))}
        </div>
      </div>
    </article>
  `;
}

function renderWalletDeltaLine(delta) {
  if (!delta?.hasPrevious) {
    return "";
  }

  if (!delta.hasChanges) {
    return `
      <div class="wallet-delta-line">
        <span class="wallet-delta-label">Since last sync</span>
        <strong>Stable</strong>
        <span>${escapeHTML(formatSignedCompactUSD(delta.valueDeltaUSD))}</span>
      </div>
    `;
  }

  return `
    <div class="wallet-delta-line">
      <span class="wallet-delta-label">Since last sync</span>
      <strong>${escapeHTML(formatSignedCompactUSD(delta.valueDeltaUSD))}</strong>
      <span>${escapeHTML(formatSignedCount(delta.openPositionDelta))} positions</span>
      <span>${escapeHTML(String(delta.actionChangeCount || 0))} advice flips</span>
    </div>
  `;
}

function renderWalletPosition(wallet, position) {
  const advice = position.advice;
  const actionKey = advice?.action || "neutral";
  const actionLabel = advice?.actionLabel || "No live call";
  const marketURL = getWalletMarketURL(position);
  const signalURL = getWalletSignalURL(position);
  const cardURL = marketURL || signalURL;
  const pinID = walletPositionPinID(wallet, position);
  const signalSummary = advice
    ? `${advice.relationLabel} · ${advice.signal.title} · ${advice.signal.confidence}/100`
    : "No direct live signal attached to this position.";
  const links = [
    renderExternalAction("Open market", marketURL),
    sameExternalURL(signalURL, marketURL) ? "" : renderExternalAction("Open signal", signalURL),
    renderIntelActionForWalletPosition(position),
    renderPinAction(pinID)
  ].filter(Boolean).join("");
  const footer = links ? `<div class="compact-footer">${links}</div>` : "";

  return `
    <article ${renderCardSurfaceAttributes("wallet-position", cardURL, `Open market for ${position.title}`)}>
      <div class="card-top">
        <div class="badges">
          <span class="badge ${escapeHTML(actionKey)}">${escapeHTML(actionLabel)}</span>
          <span class="badge neutral">${escapeHTML(plainOutcome(position.outcome))}</span>
          ${advice?.xgboostStance ? `<span class="badge ${escapeHTML(advice.xgboostStance)}">${escapeHTML(formatStance(advice.xgboostStance))}</span>` : ""}
        </div>
        <span class="badge neutral">${escapeHTML(formatSignedPercent(position.percentPnL))}</span>
      </div>

      <div class="wallet-position-copy">
        ${renderLinkedText("h4", "compact-title", position.title, marketURL)}
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

      ${footer}
    </article>
  `;
}

function renderCompactSignalCard(signal) {
  const marketURL = getSignalMarketURL(signal);
  const openMarketLink = renderExternalAction("Open market", marketURL);
  const intelAction = renderIntelActionForSignal(signal);
  return `
    <article ${renderCardSurfaceAttributes("compact-card", marketURL, `Open market for ${signal.title}`)}>
      <div class="compact-head">
        <div>
          ${renderLinkedText("p", "compact-title", signal.title, marketURL)}
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
        ${openMarketLink}
        ${intelAction}
        ${renderPinAction(marketPinID(signal))}
      </div>
    </article>
  `;
}

function renderInsiderCard(signal) {
  const directionClass = isSellDirection(signal.direction) ? "sell bearish" : "buy bullish";
  const externalURL = getInsiderSignalURL(signal);
  const openFilingLink = renderExternalAction("Open filing", externalURL);
  const intelAction = renderIntelActionForInsiderSignal(signal);

  return `
    <article ${renderCardSurfaceAttributes("compact-card", externalURL, `Open filing for ${signal.ticker}`)}>
      <div class="compact-head">
        <div>
          ${renderLinkedText("p", "compact-title", `${signal.ticker} · ${signal.companyName}`, externalURL)}
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
        ${openFilingLink}
        ${intelAction}
        ${renderPinAction(insiderPinID(signal))}
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

function loadPinnedIds() {
  try {
    const raw = window.localStorage.getItem(PINNED_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function savePinnedIds() {
  try {
    window.localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(appState.pinnedIds));
  } catch {
    // Ignore storage failures and keep the in-memory state.
  }
}

function prunePinnedItems() {
  const available = new Set(appState.pinRegistry.keys());
  const nextPinnedIds = appState.pinnedIds.filter((id) => available.has(id));
  if (nextPinnedIds.length === appState.pinnedIds.length) {
    return;
  }
  appState.pinnedIds = nextPinnedIds;
  savePinnedIds();
}

function isPinned(pinID) {
  return appState.pinnedIds.includes(pinID);
}

function togglePinned(pinID) {
  if (!pinID) {
    return;
  }

  if (isPinned(pinID)) {
    appState.pinnedIds = appState.pinnedIds.filter((value) => value !== pinID);
  } else {
    appState.pinnedIds = [pinID, ...appState.pinnedIds.filter((value) => value !== pinID)];
  }

  savePinnedIds();
}

function clearPinned() {
  appState.pinnedIds = [];
  savePinnedIds();
}

function renderPinAction(pinID) {
  if (!pinID) {
    return "";
  }
  return `
    <button
      class="pin-action${isPinned(pinID) ? " is-active" : ""}"
      type="button"
      data-pin-id="${escapeAttribute(pinID)}"
      aria-pressed="${isPinned(pinID) ? "true" : "false"}"
    >
      ${escapeHTML(isPinned(pinID) ? "Unpin" : "Pin")}
    </button>
  `;
}

function getSelectedGraphID(key, items) {
  const ids = safeArray(items).map((item) => String(item.id));
  if (!ids.length) {
    appState.graphSelections[key] = null;
    return null;
  }

  const current = String(appState.graphSelections[key] || "");
  if (ids.includes(current)) {
    return current;
  }

  appState.graphSelections[key] = ids[0];
  return ids[0];
}

function setSelectedGraphID(key, id) {
  if (!key || !id) {
    return;
  }
  appState.graphSelections[key] = String(id);
}

function marketPinID(signal) {
  return signal?.id ? `market:${signal.id}` : null;
}

function walletPinID(wallet) {
  return wallet?.wallet ? `wallet:${wallet.wallet}` : null;
}

function walletPositionPinID(wallet, position) {
  if (!wallet?.wallet || !position?.slug || !position?.outcome) {
    return null;
  }
  return `wallet-position:${wallet.wallet}|${position.slug}|${position.outcome}`;
}

function walletCommandPinID(position) {
  if (!position?.wallet || !position?.title || !position?.outcome) {
    return null;
  }
  return `wallet-command:${position.wallet}|${position.title}|${position.outcome}`;
}

function walletDeltaPinID(delta) {
  return delta?.wallet ? `wallet-delta:${delta.wallet}` : null;
}

function insiderPinID(signal) {
  return signal?.id ? `insider:${signal.id}` : null;
}

function intelPinID(item) {
  return item?.id ? `intel:${item.id}` : null;
}

function xgboostPinID(item) {
  const key = item?.signalID || item?.id || `${item?.slug || "xgboost"}|${item?.outcome || "unknown"}`;
  return key ? `xgboost:${key}` : null;
}

function historyEvaluationPinID(item) {
  const key = item?.id || item?.signalID || `${item?.slug || "history"}|${item?.horizonHours || "?"}|${item?.outcome || "?"}`;
  return key ? `history:${key}` : null;
}

function historyInsiderPinID(item) {
  const key = item?.id || item?.signalID || item?.filingID || item?.ticker;
  return key ? `history-insider:${key}` : null;
}

function renderIntelAction(targetID) {
  if (!targetID) {
    return "";
  }
  return `
    <button
      class="signal-link intel-link"
      type="button"
      data-intel-id="${escapeAttribute(targetID)}"
    >
      Intel
    </button>
  `;
}

function renderIntelActionForSignal(signal) {
  return renderIntelAction(findIntelItemForSignal(signal)?.id || null);
}

function renderIntelActionForWalletPosition(position) {
  return renderIntelAction(findIntelItemForWalletPosition(position)?.id || null);
}

function renderIntelActionForMarketURL(url) {
  return renderIntelAction(findIntelItemForMarketURL(url)?.id || null);
}

function renderIntelActionForInsiderSignal(signal) {
  return renderIntelAction(findIntelItemForInsiderSignal(signal)?.id || null);
}

function findIntelItemForSignal(signal) {
  if (!signal || !appState.overlayFeed?.intel) {
    return null;
  }

  const byEventID = signal?.sourceAttribution?.eventID
    ? safeArray(appState.overlayFeed.intel.sourceLed).find((item) => item.sourceEventID === signal.sourceAttribution.eventID)
    : null;
  if (byEventID) {
    return byEventID;
  }

  const bySignalID = signal?.id
    ? safeArray(appState.overlayFeed.intel.sourceLed).find((item) =>
        safeArray(item.topSignals).some((linked) => linked.id === signal.id)
      )
    : null;
  if (bySignalID) {
    return bySignalID;
  }

  return findIntelItemForMarketURL(getSignalMarketURL(signal));
}

function findIntelItemForWalletPosition(position) {
  if (!position || !appState.overlayFeed?.intel) {
    return null;
  }

  const adviceSignal = position?.advice?.signal;
  if (adviceSignal) {
    const linked = findIntelItemForSignal(adviceSignal);
    if (linked) {
      return linked;
    }
  }

  return findIntelItemForMarketURL(getWalletMarketURL(position) || getWalletSignalURL(position));
}

function findIntelItemForInsiderSignal(signal) {
  if (!signal || !appState.overlayFeed?.intel) {
    return null;
  }

  return safeArray(appState.overlayFeed.intel.insiderWatch).find((item) =>
    item.id === `insider-watch:${signal.id}`
  ) || null;
}

function findIntelItemForMarketURL(url) {
  const normalizedURL = normalizeExternalURL(url);
  if (!normalizedURL || !appState.overlayFeed?.intel) {
    return null;
  }

  return safeArray(appState.overlayFeed.intel.sourceLed).find((item) =>
    safeArray(item.topSignals).some((linked) => sameExternalURL(linked.marketURL, normalizedURL))
  ) || null;
}

function focusIntelItem(intelID) {
  if (!intelID) {
    return;
  }

  appState.intelFocusID = intelID;
  setDashboardView("intel");
  requestAnimationFrame(() => {
    applyIntelFocus();
  });
}

function applyIntelFocus() {
  const intelID = appState.intelFocusID;
  if (!intelID) {
    return;
  }

  document.querySelectorAll(".intel-card.is-targeted").forEach((element) => {
    element.classList.remove("is-targeted");
  });

  const target = Array.from(document.querySelectorAll("[data-intel-item-id]")).find((element) =>
    element.dataset.intelItemId === intelID
  );
  appState.intelFocusID = null;
  if (!target) {
    return;
  }

  target.classList.add("is-targeted");
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => {
    target.classList.remove("is-targeted");
  }, 1800);
}

function normalizeDashboardView(value) {
  return ["overview", "intel", "xgboost", "pinned", "history"].includes(value) ? value : "overview";
}

function preferredDashboardView() {
  return normalizeDashboardView(window.location.hash.replace(/^#/, "").trim().toLowerCase());
}

function applyDashboardView(view) {
  viewTabs.forEach((tab) => {
    const isActive = tab.dataset.viewTarget === view;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  viewPanels.forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });
}

function setDashboardView(view, updateHash = true) {
  const normalized = normalizeDashboardView(view);
  applyDashboardView(normalized);

  if (!updateHash) {
    return;
  }

  try {
    window.history.replaceState(null, "", `#${normalized}`);
  } catch {
    window.location.hash = normalized;
  }
}

function installDashboardViewInteractions() {
  viewTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setDashboardView(tab.dataset.viewTarget || "overview");
    });
  });

  window.addEventListener("hashchange", () => {
    setDashboardView(preferredDashboardView(), false);
  });

  setDashboardView(preferredDashboardView(), false);
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

function normalizeWalletFocus(value) {
  return ["actionable", "all", "changes"].includes(value) ? value : "actionable";
}

function normalizeWalletSort(value) {
  return ["urgency", "value", "recent"].includes(value) ? value : "urgency";
}

function walletSortLabel(value) {
  switch (normalizeWalletSort(value)) {
    case "value":
      return "value";
    case "recent":
      return "recent activity";
    default:
      return "urgency";
  }
}

function matchesWalletWorkspaceFocus(wallet) {
  switch (normalizeWalletFocus(appState.walletWorkspace.focus)) {
    case "all":
      return true;
    case "changes":
      return Boolean(wallet?.delta?.hasChanges || wallet?.delta?.hasStructuralChanges);
    default:
      return (wallet?.actionablePositionCount || 0) > 0;
  }
}

function displayedWallets(walletSection) {
  return safeArray(walletSection?.wallets)
    .filter(matchesWalletWorkspaceFocus)
    .slice()
    .sort(compareWalletsForWorkspace);
}

function compareWalletsForWorkspace(lhs, rhs) {
  switch (normalizeWalletSort(appState.walletWorkspace.sort)) {
    case "value":
      return (rhs?.totalCurrentValue || 0) - (lhs?.totalCurrentValue || 0);
    case "recent":
      return (rhs?.lastActivityTimestamp || 0) - (lhs?.lastActivityTimestamp || 0);
    default:
      return walletSortScore(rhs) - walletSortScore(lhs);
  }
}

function displayedWalletPositions(wallet) {
  const focus = normalizeWalletFocus(appState.walletWorkspace.focus);
  const positions = safeArray(wallet?.positions).filter((position) => {
    switch (focus) {
      case "all":
      case "changes":
        return true;
      default:
        return Boolean(position?.advice?.isActionable);
    }
  });

  return positions
    .slice()
    .sort((lhs, rhs) => {
      switch (normalizeWalletSort(appState.walletWorkspace.sort)) {
        case "value":
          return (rhs?.currentValue || 0) - (lhs?.currentValue || 0);
        default:
          return walletPositionSortScore(rhs) - walletPositionSortScore(lhs);
      }
    });
}

function walletWorkspaceEmptyMessage(walletSection) {
  switch (normalizeWalletFocus(appState.walletWorkspace.focus)) {
    case "changes":
      return walletSection?.diff?.hasPrevious
        ? "No wallet changes were detected since the last synced snapshot."
        : "Change mode lights up after two comparable wallet snapshots have been synced.";
    case "all":
      return "No watched wallets were exported into the shared feed.";
    default:
      return "No Rose/Haak positions need action right now.";
  }
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isSellDirection(value) {
  return value === "sell" || value === "bearish";
}

function getSignalMarketURL(signal) {
  return normalizeExternalURL(signal?.marketURL) || buildPolymarketURL(signal?.slug, signal?.eventSlug);
}

function getWalletURL(wallet) {
  return normalizeExternalURL(wallet?.walletURL);
}

function getWalletMarketURL(position) {
  return normalizeExternalURL(position?.marketURL);
}

function getWalletSignalURL(position) {
  const signal = position.advice?.signal;
  return getSignalMarketURL(signal) || getWalletMarketURL(position);
}

function getInsiderSignalURL(signal) {
  return (
    normalizeExternalURL(signal?.externalURL) ||
    normalizeExternalURL(signal?.secFormURL) ||
    normalizeExternalURL(signal?.sourceURL)
  );
}

function renderLinkedText(tagName, className, text, url) {
  const safeURL = normalizeExternalURL(url);
  const content = safeURL
    ? `<a href="${escapeAttribute(safeURL)}" target="_blank" rel="noreferrer">${escapeHTML(text)}</a>`
    : escapeHTML(text);
  return `<${tagName} class="${escapeAttribute(className)}">${content}</${tagName}>`;
}

function renderExternalAction(label, url, className = "signal-link") {
  const safeURL = normalizeExternalURL(url);
  if (!safeURL) {
    return "";
  }
  return `<a class="${escapeAttribute(className)}" href="${escapeAttribute(safeURL)}" target="_blank" rel="noreferrer">${escapeHTML(label)}</a>`;
}

function renderCardSurfaceAttributes(className, url, label) {
  const safeURL = normalizeExternalURL(url);
  const classes = safeURL ? `${className} clickable-card` : className;
  const attributes = [`class="${escapeAttribute(classes)}"`];

  if (!safeURL) {
    return attributes.join(" ");
  }

  attributes.push(`data-card-url="${escapeAttribute(safeURL)}"`);
  attributes.push(`tabindex="0"`);
  attributes.push(`role="link"`);
  if (label) {
    attributes.push(`aria-label="${escapeAttribute(label)}"`);
  }

  return attributes.join(" ");
}

function renderExternalBlock(className, url, body, fallbackTag = "div") {
  const safeURL = normalizeExternalURL(url);
  if (safeURL) {
    return `<a class="${escapeAttribute(className)}" href="${escapeAttribute(safeURL)}" target="_blank" rel="noreferrer">${body}</a>`;
  }
  return `<${fallbackTag} class="${escapeAttribute(className)}">${body}</${fallbackTag}>`;
}

function renderSVGLink(url, body) {
  const safeURL = normalizeExternalURL(url);
  if (!safeURL) {
    return body;
  }
  return `<a href="${escapeAttribute(safeURL)}" target="_blank" rel="noreferrer">${body}</a>`;
}

function sameExternalURL(lhs, rhs) {
  const left = normalizeExternalURL(lhs);
  const right = normalizeExternalURL(rhs);
  return Boolean(left) && left === right;
}

function normalizeExternalURL(value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();
  if (!raw || raw === "#") {
    return null;
  }

  try {
    const parsed = new URL(raw, window.location.href);
    if (!["http:", "https:", "file:"].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function formatCategory(value) {
  if (!value) {
    return "Other";
  }
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatAction(value) {
  const map = {
    buy_more: "Buy more",
    hold: "Keep",
    reduce: "Reduce",
    sell: "Sell",
    switch_side: "Switch side",
    watch: "Wait",
    no_signal: "No signal"
  };
  return map[value] || formatCategory(value);
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

function formatIntelSourceType(value) {
  const map = {
    api: "API",
    web: "Web",
    rss: "RSS",
    social: "Social",
    filing: "Filing"
  };
  return map[value] || formatCategory(value);
}

function formatIntelLane(value) {
  const map = {
    official_macro: "Official macro",
    official_post: "Official post",
    official_posts: "Official posts",
    company_official: "Company official",
    standard: "Standard"
  };
  return map[value] || formatCategory(value);
}

function formatIntelPriority(value) {
  const priority = Number(value) || 0;
  return priority > 0 ? `P${priority}` : "Priority";
}

function intelPriorityClass(value) {
  const priority = Number(value) || 0;
  if (priority >= 9) {
    return "supports";
  }
  if (priority >= 7) {
    return "mixed";
  }
  return "neutral";
}

function intelMarketFootnote(item) {
  const parts = [
    item.sourceName || item.provider || "Source",
    item.publishedAt ? formatDateTime(item.publishedAt) : null,
    item.topSignals?.[0]?.sourceMatchedQuery ? `Matched "${truncateText(item.topSignals[0].sourceMatchedQuery, 20)}"` : null
  ].filter(Boolean);
  return parts.join(" · ") || "Curated source-led event";
}

function formatStance(value) {
  const map = {
    supports: "Model supports",
    skeptical: "Model skeptical",
    mixed: "Model mixed"
  };
  return map[value] || formatTake(value);
}

function normalizedModelOutcomeLabel(value) {
  return value === "neutral" ? "flat" : value;
}

function xgboostCoverageEmptyMessage(coverage, fallback) {
  const taggedRows = Number(coverage?.taggedHistoryRowCount) || 0;
  const categories = Number(coverage?.categoryCount) || 0;
  const resolved = Number(coverage?.resolvedEvaluationCount) || 0;

  if (!taggedRows || resolved > 0) {
    return fallback;
  }

  return `There ${taggedRows === 1 ? "is" : "are"} ${taggedRows} model-tagged histor${taggedRows === 1 ? "y row" : "y rows"} across ${categories || 0} categor${categories === 1 ? "y" : "ies"}, but none have resolved yet.`;
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

function formatSignedCompactUSD(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  const numeric = Number(value);
  if (numeric === 0) {
    return "$0";
  }

  const sign = numeric > 0 ? "+" : "-";
  return `${sign}${formatCompactUSD(Math.abs(numeric))}`;
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

function formatSignedCount(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  const numeric = Number(value);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric}`;
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return `${(Number(value) * 100).toFixed(0)}%`;
}

function formatDecimal(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return Number(value).toFixed(1);
}

function formatSignedEdge(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  const numeric = Number(value);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(3)} edge`;
}

function formatSignedPoints(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  const points = Number(value) * 100;
  const sign = points > 0 ? "+" : "";
  return `${sign}${points.toFixed(1)}pt`;
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

function formatModelScore(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return Number(value).toFixed(3);
}

function formatFreshnessStatus(value) {
  const map = {
    live: "Live source",
    partial: "Partial run",
    cached: "Cached upstream",
    degraded: "Degraded source",
    failed: "Failed source",
    placeholder: "Placeholder only",
    missing: "Missing source",
    skipped: "Skipped step"
  };
  return map[value] || "Unknown status";
}

function formatPipelineStatus(value) {
  const map = {
    live: "Live",
    degraded: "Degraded",
    failed: "Failed",
    missing: "Missing"
  };
  return map[value] || "Unknown";
}

function shortWallet(value) {
  if (!value || value.length < 12) {
    return value || "-";
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function truncateText(value, maxLength = 44) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length <= maxLength) {
    return normalized || "-";
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function describeXGBoostRow(item) {
  const parts = [];
  if (item.modelRank) {
    parts.push(`Model #${item.modelRank}`);
  }
  if (item.swiftRank) {
    parts.push(`Swift #${item.swiftRank}`);
  }
  if (item.rankDeltaVsSwift !== null && item.rankDeltaVsSwift !== undefined && !Number.isNaN(Number(item.rankDeltaVsSwift))) {
    const numeric = Number(item.rankDeltaVsSwift);
    const sign = numeric > 0 ? "+" : "";
    parts.push(`Delta ${sign}${numeric}`);
  }
  if (item.swiftNotificationCandidate) {
    parts.push("Swift candidate");
  }
  if (safeArray(item.flags).length) {
    parts.push(safeArray(item.flags).slice(0, 2).join(", "));
  }
  return parts.join(" · ") || "Shadow-scored market candidate.";
}

function formatHistoryDay(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "short"
  }).format(date);
}

function formatEvaluationLabel(value) {
  const map = {
    win: "Win",
    loss: "Loss",
    flat: "Flat"
  };
  return map[value] || formatTake(value);
}

function evaluationLabelClass(value) {
  switch (value) {
    case "win":
      return "buy";
    case "loss":
      return "sell";
    default:
      return "neutral";
  }
}

function buildPolymarketURL(slug, eventSlug) {
  const preferred = String(eventSlug || slug || "").trim();
  if (!preferred) {
    return null;
  }
  return normalizeExternalURL(`https://polymarket.com/event/${encodeURIComponent(preferred)}`);
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
  return escapeHTML(String(value ?? ""));
}

function openExternalURL(url) {
  const safeURL = normalizeExternalURL(url);
  if (!safeURL) {
    return;
  }
  window.open(safeURL, "_blank", "noopener,noreferrer");
}

function getEventElementTarget(event) {
  const target = event.target;
  if (target instanceof Element) {
    return target;
  }
  return target?.parentElement || null;
}

function handleClickableCardClick(event) {
  const target = getEventElementTarget(event);
  if (!target) {
    return;
  }

  const card = target.closest("[data-card-url]");
  if (!card) {
    return;
  }

  if (target.closest("a, button, input, textarea, select, summary")) {
    return;
  }

  openExternalURL(card.dataset.cardUrl);
}

function handleClickableCardKeydown(event) {
  const target = getEventElementTarget(event);
  if (!target) {
    return;
  }

  const card = target.closest("[data-card-url]");
  if (!card || target !== card) {
    return;
  }

  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  openExternalURL(card.dataset.cardUrl);
}

function installClickableCardInteractions() {
  if (window.__stonkvisionCardInteractionsInstalled) {
    return;
  }

  window.__stonkvisionCardInteractionsInstalled = true;
  document.addEventListener("click", handleClickableCardClick);
  document.addEventListener("keydown", handleClickableCardKeydown);
}

function handleDashboardActionClick(event) {
  const target = getEventElementTarget(event);
  if (!target) {
    return;
  }

  const intelTrigger = target.closest("[data-intel-id]");
  if (intelTrigger) {
    event.preventDefault();
    event.stopPropagation();
    focusIntelItem(intelTrigger.dataset.intelId);
    return;
  }

  const pinTrigger = target.closest("[data-pin-id]");
  if (pinTrigger) {
    event.preventDefault();
    event.stopPropagation();
    togglePinned(pinTrigger.dataset.pinId);
    if (appState.overlayFeed) {
      renderDashboard(appState.overlayFeed);
    }
    return;
  }

  const clearTrigger = target.closest("[data-clear-pins]");
  if (clearTrigger) {
    event.preventDefault();
    clearPinned();
    if (appState.overlayFeed) {
      renderDashboard(appState.overlayFeed);
    }
    return;
  }

  const walletFocusTrigger = target.closest("[data-wallet-focus]");
  if (walletFocusTrigger) {
    event.preventDefault();
    appState.walletWorkspace.focus = normalizeWalletFocus(walletFocusTrigger.dataset.walletFocus);
    if (appState.overlayFeed) {
      renderWallets(appState.overlayFeed.wallets);
    }
    return;
  }

  const walletSortTrigger = target.closest("[data-wallet-sort]");
  if (walletSortTrigger) {
    event.preventDefault();
    appState.walletWorkspace.sort = normalizeWalletSort(walletSortTrigger.dataset.walletSort);
    if (appState.overlayFeed) {
      renderWallets(appState.overlayFeed.wallets);
    }
    return;
  }

  const walletHistoryBreakdownTrigger = target.closest("[data-wallet-history-breakdown]");
  if (walletHistoryBreakdownTrigger) {
    event.preventDefault();
    appState.walletHistory.breakdown = normalizeWalletHistoryBreakdown(walletHistoryBreakdownTrigger.dataset.walletHistoryBreakdown);
    if (appState.overlayFeed) {
      renderWalletHistory(appState.overlayFeed.wallets?.history);
    }
    return;
  }

  const walletHistoryMetricTrigger = target.closest("[data-wallet-history-metric]");
  if (walletHistoryMetricTrigger) {
    event.preventDefault();
    appState.walletHistory.metric = normalizeWalletHistoryMetric(walletHistoryMetricTrigger.dataset.walletHistoryMetric);
    if (appState.overlayFeed) {
      renderWalletHistory(appState.overlayFeed.wallets?.history);
    }
    return;
  }

  const graphTrigger = target.closest("[data-graph-key][data-graph-id]");
  if (graphTrigger) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedGraphID(graphTrigger.dataset.graphKey, graphTrigger.dataset.graphId);
    if (appState.overlayFeed) {
      renderGraphDeck(appState.overlayFeed);
    }
  }
}

function installDashboardActionInteractions() {
  if (window.__stonkvisionDashboardActionsInstalled) {
    return;
  }

  window.__stonkvisionDashboardActionsInstalled = true;
  document.addEventListener("click", handleDashboardActionClick);
}

installClickableCardInteractions();
installDashboardActionInteractions();
installDashboardViewInteractions();
loadDashboard();
setInterval(loadDashboard, 60_000);
