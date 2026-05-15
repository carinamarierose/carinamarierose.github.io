import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const builderPath = path.join(repoRoot, "webpage", "scripts", "build-overlay-feed.mjs");
const overlayFeedPath = path.join(repoRoot, "webpage", "data", "overlay-feed.json");

function rebuildAndLoadFeed() {
  execFileSync(process.execPath, [builderPath], {
    cwd: repoRoot,
    stdio: "pipe"
  });

  return JSON.parse(readFileSync(overlayFeedPath, "utf8"));
}

function isExternalURL(value) {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function syncedSourceCount(feed) {
  return [feed.sources.market?.synced, feed.sources.wallets?.synced, feed.sources.insider?.synced]
    .filter(Boolean)
    .length;
}

function collectExternalURLs(feed) {
  return [
    ...feed.market.bestBets.flatMap((item) => [item.marketURL, ...(item.txLinks ?? [])]),
    ...feed.market.radar.flatMap((item) => [item.marketURL, ...(item.txLinks ?? [])]),
    ...feed.wallets.wallets.flatMap((wallet) => [
      wallet.walletURL,
      ...wallet.positions.flatMap((position) => [
        position.marketURL,
        position.advice?.signal.marketURL ?? null
      ])
    ]),
    ...(feed.wallets.commandGroups ?? []).flatMap((group) =>
      group.positions.flatMap((position) => [
        position.walletURL,
        position.marketURL,
        position.signalURL
      ])
    ),
    ...feed.insider.signals.flatMap((signal) => [
      signal.externalURL,
      signal.sourceURL,
      signal.secFormURL
    ]),
    ...(feed.intel?.sourceLed ?? []).flatMap((item) => [
      item.sourceURL,
      ...(item.topSignals ?? []).map((signal) => signal.marketURL)
    ]),
    ...(feed.intel?.insiderWatch ?? []).flatMap((item) => [
      item.externalURL,
      item.sourceURL
    ]),
    ...(feed.history?.market.recentEvaluations ?? []).map((item) => item.marketURL),
    ...(feed.history?.market.bestCalls ?? []).map((item) => item.marketURL),
    ...(feed.history?.market.worstCalls ?? []).map((item) => item.marketURL),
    ...(feed.history?.insider.archive ?? []).map((item) => item.externalURL),
    ...(feed.xgboost?.shadow.scoredRows ?? []).map((item) => item.marketURL),
    ...(feed.xgboost?.shadow.topModel ?? []).map((item) => item.marketURL),
    ...(feed.xgboost?.shadow.topSwift ?? []).map((item) => item.marketURL),
    ...(feed.xgboost?.shadow.disagreements ?? []).map((item) => item.marketURL),
    ...(feed.xgboost?.performance.recentEvaluations ?? []).map((item) => item.marketURL),
    ...(feed.xgboost?.performance.bestCalls ?? []).map((item) => item.marketURL),
    ...(feed.xgboost?.performance.worstCalls ?? []).map((item) => item.marketURL)
  ].filter((value) => value !== null && value !== undefined);
}

const feed = rebuildAndLoadFeed();

test("summary and sync booleans stay aligned", () => {
  assert.equal(feed.schemaVersion, 2);
  assert.equal(feed.summary.feedsOnline, syncedSourceCount(feed));
  assert.equal(feed.sync.sources.marketIntel, feed.sources.market.synced);
  assert.equal(feed.sync.sources.walletOverview, feed.sources.wallets.synced);
  assert.equal(feed.sync.sources.etoroFeed, feed.sources.insider.synced);
  assert.equal(feed.summary.trackedWalletCount, feed.wallets.summary.walletCount);
  assert.equal(feed.summary.openPositionCount, feed.wallets.summary.openPositionCount);
  assert.equal(feed.summary.actionablePositionCount, feed.wallets.summary.actionablePositionCount);
  assert.equal(feed.summary.intelItemCount, feed.intel.summary.totalItemCount);
});

test("wallet history series stay internally consistent", () => {
  const history = feed.wallets.history;
  const currentWalletsAreLive = feed.sources.wallets?.status === "live";

  assert.ok(history.available);
  assert.equal(history.totalSeries.length, history.snapshotCount);
  if (currentWalletsAreLive) {
    assert.equal(history.walletSeries.length, feed.wallets.summary.walletCount);
    assert.equal(history.latestSummary.openPositionCount, feed.wallets.summary.openPositionCount);
    assert.equal(history.latestSummary.actionablePositionCount, feed.wallets.summary.actionablePositionCount);
  } else {
    assert.ok(history.walletSeries.length >= 0);
    assert.ok(history.latestSummary.openPositionCount >= 0);
    assert.ok(history.latestSummary.actionablePositionCount >= 0);
  }
  assert.equal(
    history.mappedCategoryPositionCount + history.unmappedCategoryPositionCount,
    history.latestSummary.openPositionCount
  );

  for (const series of [...history.walletSeries, ...history.marketSeries, ...history.categorySeries]) {
    assert.equal(series.items.length, history.snapshotCount, `Series ${series.label} drifted from snapshot count`);
  }
});

test("xgboost and history totals stay internally consistent", () => {
  if (feed.history?.available) {
    assert.equal(feed.history.market.summary.oneHour?.horizonHours, 1);
    assert.equal(feed.history.market.summary.twentyFourHour?.horizonHours, 24);
    assert.equal(feed.history.insider.summary.archiveCount, feed.history.insider.archive.length);
  }

  if (feed.xgboost?.available) {
    const performance = feed.xgboost.performance;
    const model = feed.xgboost.model;
    assert.equal(
      performance.totalWins + performance.totalLosses + performance.totalNeutrals,
      performance.totalEvaluations
    );
    assert.ok(feed.xgboost.runs.enabledRuns <= feed.xgboost.runs.totalRuns);
    assert.ok(feed.xgboost.shadow.scoredRows.length <= feed.xgboost.shadow.rowCount);
    assert.ok(model && typeof model === "object");
    assert.ok(typeof model.shadowMatchState === "string" && model.shadowMatchState.length > 0);
    assert.ok(typeof model.shadowMatchLabel === "string" && model.shadowMatchLabel.length > 0);
    assert.ok(typeof model.shadowMatchClassName === "string" && model.shadowMatchClassName.length > 0);
    assert.ok(model.configuredModelName || model.shadowModelName);

    for (const horizon of performance.horizons) {
      assert.equal(horizon.total, horizon.wins + horizon.losses + horizon.neutrals);
    }
  }
});

test("all exported action links are normalized external URLs", () => {
  const urls = collectExternalURLs(feed);

  assert.ok(urls.length > 0);
  for (const url of urls) {
    assert.ok(isExternalURL(url), `Expected external URL but found ${url}`);
  }
});

test("insider source diagnostics stay structured when present", () => {
  const insider = feed.sources.insider;
  const diagnostics = insider?.upstreamDiagnostics ?? [];

  assert.ok(Array.isArray(diagnostics));
  if (!diagnostics.length) {
    return;
  }

  const nonLiveDiagnostics = diagnostics.filter((item) => item.status !== "live");
  if (nonLiveDiagnostics.length) {
    assert.ok(typeof insider.statusReason === "string" && insider.statusReason.trim().length > 0);
  }

  for (const diagnostic of diagnostics) {
    assert.ok(typeof diagnostic.id === "string" && diagnostic.id.length > 0);
    assert.ok(typeof diagnostic.sourceID === "string" && diagnostic.sourceID.length > 0);
    assert.ok(typeof diagnostic.sourceName === "string" && diagnostic.sourceName.length > 0);
    assert.ok(["live", "cached", "failed"].includes(diagnostic.status));
    assert.equal(typeof diagnostic.cacheUsed, "boolean");
    assert.equal(typeof diagnostic.cacheWasFresh, "boolean");
    assert.equal(typeof diagnostic.eventCount, "number");
    assert.equal(typeof diagnostic.attemptCount, "number");
  }
});

test("market and wallet source diagnostics stay structured when present", () => {
  for (const sourceKey of ["market", "wallets"]) {
    const source = feed.sources[sourceKey];
    const diagnostics = source?.upstreamDiagnostics ?? [];

    assert.ok(Array.isArray(diagnostics), `${sourceKey} diagnostics should always be an array`);

    if (!source?.available) {
      assert.equal(diagnostics.length, 0);
      continue;
    }

    assert.ok(typeof source.status === "string" && source.status.length > 0);
    assert.ok(typeof source.statusReason === "string" && source.statusReason.trim().length > 0);
    assert.ok(diagnostics.length > 0, `${sourceKey} should export at least one diagnostic item when available`);

    for (const diagnostic of diagnostics) {
      assert.ok(typeof diagnostic.id === "string" && diagnostic.id.length > 0);
      assert.ok(typeof diagnostic.sourceID === "string" && diagnostic.sourceID.length > 0);
      assert.ok(typeof diagnostic.sourceName === "string" && diagnostic.sourceName.length > 0);
      assert.ok(["live", "cached", "failed"].includes(diagnostic.status));
      assert.equal(typeof diagnostic.cacheUsed, "boolean");
      assert.equal(typeof diagnostic.cacheWasFresh, "boolean");
      assert.equal(typeof diagnostic.eventCount, "number");
      assert.equal(typeof diagnostic.attemptCount, "number");
    }
  }
});

test("intel section stays structured when present", () => {
  const intel = feed.intel;

  assert.ok(intel && typeof intel === "object");
  assert.equal(typeof intel.available, "boolean");
  assert.ok(intel.summary && typeof intel.summary === "object");
  assert.ok(Array.isArray(intel.sourceLed));
  assert.ok(Array.isArray(intel.insiderWatch));
  assert.ok(Array.isArray(intel.categoryMix));
  assert.ok(Array.isArray(intel.providerMix));
  assert.ok(Array.isArray(intel.laneMix));
  assert.equal(
    intel.summary.totalItemCount,
    intel.sourceLed.length + intel.insiderWatch.length
  );

  for (const item of intel.sourceLed) {
    assert.ok(typeof item.id === "string" && item.id.length > 0);
    assert.equal(item.kind, "market_source");
    assert.ok(typeof item.title === "string" && item.title.length > 0);
    assert.ok(Array.isArray(item.topSignals));
    assert.equal(typeof item.signalCount, "number");
    assert.ok(Array.isArray(item.matchedCategories));
    assert.ok(Array.isArray(item.tags));
  }

  for (const item of intel.insiderWatch) {
    assert.ok(typeof item.id === "string" && item.id.length > 0);
    assert.equal(item.kind, "insider_watch");
    assert.ok(typeof item.title === "string" && item.title.length > 0);
    assert.equal(typeof item.watchlistMatch, "boolean");
  }
});

test("pipeline health stays structured when present", () => {
  const pipeline = feed.sync?.pipeline;
  const source = feed.sources?.pipeline;

  if (!pipeline) {
    assert.equal(source ?? null, null);
    return;
  }

  assert.ok(typeof pipeline.runID === "string" && pipeline.runID.length > 0);
  assert.ok(["live", "degraded", "failed"].includes(pipeline.status));
  assert.ok(["full", "partial", undefined].includes(pipeline.scope));
  assert.ok(Array.isArray(pipeline.steps));
  assert.ok(pipeline.steps.length > 0);

  if (source) {
    assert.equal(typeof source.available, "boolean");
    assert.equal(typeof source.synced, "boolean");
    assert.ok(["live", "degraded", "failed", "missing"].includes(source.status));
  }

  if (pipeline.runtime) {
    assert.ok(["repo", "service"].includes(pipeline.runtime.mode));
    assert.equal(typeof pipeline.runtime.launchAgent?.installed, "boolean");
    assert.ok(typeof pipeline.runtime.serviceDeployment?.state === "string");
  }

  for (const step of pipeline.steps) {
    assert.ok(typeof step.id === "string" && step.id.length > 0);
    assert.ok(typeof step.title === "string" && step.title.length > 0);
    assert.ok(["live", "failed", "skipped"].includes(step.status));
    assert.equal(typeof step.required, "boolean");
    assert.equal(typeof step.skipped, "boolean");
    assert.equal(typeof step.logPath, "string");
  }
});
