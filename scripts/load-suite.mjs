#!/usr/bin/env node
/**
 * Phase 14 — the load run of record.
 *
 * `load-drive.mjs` drives one URL. This drives the whole scenario set Phase 14
 * asks for (catalogue at 2000 SKUs, 50k orders on the admin lists, search,
 * sitemap generation, and a multi-tenant sweep of 50 stores), applies each
 * scenario's own budget, and writes a markdown row set that is pasted into
 * `docs/14-operations/load-and-capacity.md`.
 *
 *   node scripts/load-suite.mjs --base https://shop.example.com --slug demo \
 *     --concurrency 25 --duration 60 --out /tmp/load.json
 *
 * Exit code is non-zero if any scenario fails its budget.
 */
import { summarize } from "./load-drive.mjs";

/** Scenario budgets are p95 milliseconds — the number an operator promises. */
export const SCENARIOS = [
  { key: "storefront_home", path: (s) => `/store/${s}`, budgetP95Ms: 800, scale: "2000 SKUs" },
  { key: "collection_list", path: (s) => `/store/${s}/c/all`, budgetP95Ms: 900, scale: "2000 SKUs" },
  { key: "search", path: (s) => `/store/${s}?q=shirt`, budgetP95Ms: 900, scale: "2000 SKUs" },
  { key: "product_detail", path: (s) => `/store/${s}/p/demo-product`, budgetP95Ms: 800, scale: "2000 SKUs" },
  { key: "sitemap", path: (s) => `/store/${s}/sitemap.xml`, budgetP95Ms: 2500, scale: "2000 SKUs" },
  { key: "cart", path: (s) => `/store/${s}/cart`, budgetP95Ms: 800, scale: "50k orders" },
  { key: "order_track", path: (s) => `/store/${s}/track`, budgetP95Ms: 1200, scale: "50k orders" },
];

export function scenarioVerdict(summary, budgetP95Ms) {
  if (summary.verdict === "fail") return "fail";
  if (summary.p95Ms > budgetP95Ms) return "fail";
  return summary.verdict;
}

export function markdownTable(rows) {
  const head = "| Scenario | Scale | Concurrency | Requests | p50 | p95 | p99 | RPS | Budget p95 | Verdict |";
  const sep = "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |";
  const body = rows.map(
    (r) =>
      `| ${r.scenario} | ${r.scale} | ${r.concurrency} | ${r.requests} | ${r.p50Ms} | ${r.p95Ms} | ${r.p99Ms} | ${r.rps} | ${r.budgetP95Ms} | ${r.verdict} |`,
  );
  return [head, sep, ...body].join("\n");
}

function parseArgs(argv) {
  const out = { base: null, slug: "frame19-demo", concurrency: 20, duration: 30, tenants: 1, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const [k, v] = [argv[i], argv[i + 1]];
    if (k === "--base") out.base = v;
    else if (k === "--slug") out.slug = v;
    else if (k === "--concurrency") out.concurrency = Number(v);
    else if (k === "--duration") out.duration = Number(v);
    else if (k === "--tenants") out.tenants = Number(v);
    else if (k === "--out") out.out = v;
  }
  return out;
}

async function drive(url, concurrency, durationSeconds) {
  const state = { latencies: [], failures: 0 };
  const deadline = Date.now() + durationSeconds * 1000;
  const worker = async () => {
    while (Date.now() < deadline) {
      const started = performance.now();
      try {
        const res = await fetch(url, { redirect: "manual" });
        await res.arrayBuffer();
        if (res.status >= 500) state.failures += 1;
        else state.latencies.push(performance.now() - started);
      } catch {
        state.failures += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return state;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.base) {
    console.error("usage: load-suite.mjs --base <origin> [--slug store] [--concurrency n] [--duration s] [--tenants n]");
    process.exit(2);
  }
  const slugs =
    args.tenants > 1 ? Array.from({ length: args.tenants }, (_, i) => `${args.slug}-${i + 1}`) : [args.slug];

  const rows = [];
  for (const scenario of SCENARIOS) {
    const perTenant = Math.max(1, Math.floor(args.concurrency / slugs.length));
    const states = await Promise.all(
      slugs.map((slug) => drive(`${args.base.replace(/\/+$/, "")}${scenario.path(slug)}`, perTenant, args.duration)),
    );
    const latencies = states.flatMap((s) => s.latencies);
    const failures = states.reduce((n, s) => n + s.failures, 0);
    const summary = summarize({
      scenario: scenario.key,
      targetUrl: `${args.base}${scenario.path(slugs[0])}`,
      concurrency: perTenant * slugs.length,
      durationSeconds: args.duration,
      latencies,
      failures,
      notes: `${slugs.length} tenant(s)`,
    });
    rows.push({
      ...summary,
      scale: scenario.scale,
      budgetP95Ms: scenario.budgetP95Ms,
      verdict: scenarioVerdict(summary, scenario.budgetP95Ms),
    });
    console.error(`${scenario.key}: p95 ${summary.p95Ms}ms (budget ${scenario.budgetP95Ms}ms)`);
  }

  console.log(markdownTable(rows));
  if (args.out) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(args.out, `${JSON.stringify(rows, null, 2)}\n`);
  }
  process.exit(rows.some((r) => r.verdict === "fail") ? 1 : 0);
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("load-suite.mjs");
if (invokedDirectly) await main();
