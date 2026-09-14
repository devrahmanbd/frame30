#!/usr/bin/env node
/**
 * Load + soak driver (BUILD.md §4.4).
 *
 * `load_test_runs` used to be a table that recorded results from a harness
 * nobody had written. This is that harness: it drives a target URL at a fixed
 * concurrency for a fixed duration, computes the latency distribution, applies
 * the same verdict thresholds the infra desk uses, and prints a payload shaped
 * exactly like the `infraRecordLoadTestFn` input so a run can be filed.
 *
 * It deliberately has no dependencies and no database access — a load driver
 * that needs the app's service role is a load driver you cannot point at
 * production from a laptop.
 *
 *   node scripts/load-drive.mjs --url https://example.com/ \
 *     --concurrency 20 --duration 60 --scenario storefront_browse
 *
 * Exit code is non-zero when the verdict is `fail`, so it can gate a release.
 */

/* ------------------------------- pure stats ------------------------------- */

/** Nearest-rank percentile over an unsorted sample, in milliseconds. */
export function percentile(samples, p) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return Math.round(sorted[index]);
}

export const VERDICT_THRESHOLDS = {
  /** Any failure share above this is a fail regardless of latency. */
  failureShare: { warn: 0.005, fail: 0.02 },
  p95Ms: { warn: 800, fail: 2000 },
};

export function verdictFor({ requests, failures, p95Ms }) {
  if (requests === 0) return "fail";
  const share = failures / requests;
  const t = VERDICT_THRESHOLDS;
  if (share > t.failureShare.fail || p95Ms > t.p95Ms.fail) return "fail";
  if (share > t.failureShare.warn || p95Ms > t.p95Ms.warn) return "warn";
  return "pass";
}

/** Turns raw latencies into the exact shape `load_test_runs` stores. */
export function summarize({ scenario, targetUrl, concurrency, durationSeconds, latencies, failures, notes }) {
  const requests = latencies.length + failures;
  const p95Ms = percentile(latencies, 95);
  const rps = durationSeconds > 0 ? Math.round((requests / durationSeconds) * 100) / 100 : 0;
  return {
    scenario,
    targetUrl,
    concurrency,
    durationSeconds,
    requests,
    failures,
    p50Ms: percentile(latencies, 50),
    p95Ms,
    p99Ms: percentile(latencies, 99),
    rps,
    verdict: verdictFor({ requests, failures, p95Ms }),
    notes: notes ?? null,
  };
}

/* ---------------------------------- driver -------------------------------- */

function parseArgs(argv) {
  const out = {
    url: null,
    concurrency: 10,
    duration: 30,
    scenario: "smoke",
    method: "GET",
    notes: null,
    json: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--url") out.url = value;
    else if (key === "--concurrency") out.concurrency = Number(value);
    else if (key === "--duration") out.duration = Number(value);
    else if (key === "--scenario") out.scenario = value;
    else if (key === "--method") out.method = value;
    else if (key === "--notes") out.notes = value;
    else if (key === "--json") out.json = value;
  }
  return out;
}

async function worker(url, method, deadline, state) {
  while (Date.now() < deadline) {
    const started = performance.now();
    try {
      const res = await fetch(url, { method, redirect: "manual" });
      // Drain the body so keep-alive connections are reusable.
      await res.arrayBuffer();
      if (res.status >= 500) state.failures += 1;
      else state.latencies.push(performance.now() - started);
    } catch {
      state.failures += 1;
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error("usage: load-drive.mjs --url <url> [--concurrency n] [--duration s] [--scenario name]");
    process.exit(2);
  }
  if (!Number.isFinite(args.concurrency) || args.concurrency < 1 || args.concurrency > 500) {
    console.error("concurrency must be between 1 and 500");
    process.exit(2);
  }
  if (!Number.isFinite(args.duration) || args.duration < 1 || args.duration > 3600) {
    console.error("duration must be between 1 and 3600 seconds");
    process.exit(2);
  }

  const state = { latencies: [], failures: 0 };
  const deadline = Date.now() + args.duration * 1000;
  console.error(
    `driving ${args.url} — ${args.concurrency} workers for ${args.duration}s (scenario: ${args.scenario})`,
  );
  await Promise.all(
    Array.from({ length: args.concurrency }, () => worker(args.url, args.method, deadline, state)),
  );

  const summary = summarize({
    scenario: args.scenario,
    targetUrl: args.url,
    concurrency: args.concurrency,
    durationSeconds: args.duration,
    latencies: state.latencies,
    failures: state.failures,
    notes: args.notes,
  });

  const payload = JSON.stringify(summary, null, 2);
  if (args.json) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(args.json, `${payload}\n`);
  }
  console.log(payload);
  process.exit(summary.verdict === "fail" ? 1 : 0);
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("load-drive.mjs");
if (invokedDirectly) await main();
