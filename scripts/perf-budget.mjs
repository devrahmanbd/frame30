#!/usr/bin/env node
/**
 * Phase 7.3 — Core Web Vitals transfer budget gate.
 *
 * Reads the Vite client manifest produced by `bun run build`, walks the import
 * graph of every storefront route entry, gzips each asset, and fails the run
 * when a route's CSS or JS exceeds the platform budget. The numbers come from
 * src/lib/web-vitals.ts so CI and the app can never disagree.
 *
 * It also carries the two admin surfaces that are allowed to be heavy but not
 * unbounded — the SEO desk and the article editor — and a source-level
 * assertion that the SEO analysis worker is constructed lazily, on the first
 * debounced keystroke, rather than on mount. A worker spun up on mount costs a
 * thread and a module graph on every editor open, which is exactly the kind of
 * regression a byte budget alone will not catch.
 *
 * Usage: node scripts/perf-budget.mjs [--dist dist] [--json]
 */
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

// Kept in sync with ASSET_BUDGET in src/lib/web-vitals.ts (asserted by test).
const ASSET_BUDGET = { cssGzBytes: 60 * 1024, jsGzBytes: 100 * 1024 };

/** Storefront routes the budget applies to — the pages shoppers actually load. */
const ROUTES = [
  "src/routes/store.$slug.index.tsx",
  "src/routes/store.$slug.p.$productSlug.tsx",
  "src/routes/store.$slug.search.tsx",
  "src/routes/store.$slug.checkout.tsx",
  "src/routes/store.$slug.pages.$pageSlug.tsx",
];

/**
 * Admin routes are behind a login on a desktop, so they get a bigger JS
 * allowance than the storefront — but a ceiling all the same. These match the
 * numbers enforced by scripts/seo-weight-gate.mjs; both gates must agree.
 */
/**
 * Phase 10.5 — marketing routes. Public, mobile-first, and the first thing a
 * prospective merchant loads on a 3G connection in Dhaka, so they get a
 * tighter JS ceiling than admin and only a little more than the storefront
 * (GSAP-driven motion is the delta, and it must stay code-split).
 */
const MARKETING_BUDGET = {
  "src/routes/index.tsx": { jsGzBytes: 140 * 1024, cssGzBytes: 60 * 1024 },
  "src/routes/pricing.tsx": { jsGzBytes: 140 * 1024, cssGzBytes: 60 * 1024 },
  "src/routes/features.tsx": { jsGzBytes: 140 * 1024, cssGzBytes: 60 * 1024 },
  "src/routes/contact.tsx": { jsGzBytes: 120 * 1024, cssGzBytes: 60 * 1024 },
  "src/routes/blog.index.tsx": { jsGzBytes: 140 * 1024, cssGzBytes: 60 * 1024 },
};

const ADMIN_BUDGET = {
  "src/routes/_authenticated/admin/marketing/seo.tsx": { jsGzBytes: 280 * 1024 },
  "src/routes/_authenticated/admin/marketing/articles.tsx": { jsGzBytes: 320 * 1024 },
};

/** Source contract: the analysis worker may only be created on first keystroke. */
const WORKER_HOOK = "src/hooks/use-seo-analysis.ts";
const WORKER_MODULE = /seo-analysis\.worker/;

const distRoot = arg("dist", "dist");
const failures = [];
const warnings = [];

/* -------------------------------------------------------------------------- */
/* Source contract: lazy worker construction                                  */
/* -------------------------------------------------------------------------- */

function checkLazyWorker() {
  if (!existsSync(WORKER_HOOK)) {
    failures.push(`${WORKER_HOOK}: missing — the analysis hook is a required surface`);
    return;
  }
  const src = readFileSync(WORKER_HOOK, "utf8");

  // 1. The worker module must never be a static import: that would pull the
  //    whole analysis graph into the editor chunk even when it is never used.
  const staticImports = [...src.matchAll(/(?:^|\n)\s*import\s[^;]*?["']([^"']+)["']/g)].map((m) => m[1]);
  for (const spec of staticImports) {
    if (WORKER_MODULE.test(spec) && !spec.includes("worker-contract")) {
      failures.push(`${WORKER_HOOK}: statically imports ${spec}; the worker must be referenced via new URL()`);
    }
  }

  // 2. `new Worker(` must exist exactly once and sit inside a function.
  const constructions = [...src.matchAll(/new Worker\(/g)];
  if (constructions.length !== 1) {
    failures.push(`${WORKER_HOOK}: expected exactly one \`new Worker(\`, found ${constructions.length}`);
  }
  for (const match of constructions) {
    if (depthAt(src, match.index) === 0) {
      failures.push(`${WORKER_HOOK}: worker constructed at module scope`);
    }
  }

  // 3. Every call site of the factory must live inside the debounced scheduler,
  //    and the scheduler itself must only be reachable through a timer.
  const scheduler = blockAfter(src, /const schedule = \(\) => \{/);
  // `function createWorker(): Worker | null` matches the same text as a call,
  // so the declaration is excluded explicitly rather than by luck.
  const callSites = [...src.matchAll(/createWorker\(\)/g)].filter(
    (m) => !/function\s+$/.test(src.slice(Math.max(0, m.index - 12), m.index)),
  );
  if (callSites.length === 0) failures.push(`${WORKER_HOOK}: no worker factory call site found`);
  if (!scheduler) {
    failures.push(`${WORKER_HOOK}: no debounced \`schedule\` block; cannot prove lazy construction`);
  } else {
    for (const site of callSites) {
      if (site.index < scheduler.start || site.index > scheduler.end) {
        failures.push(`${WORKER_HOOK}: createWorker() called outside the debounced scheduler (offset ${site.index})`);
      }
    }
  }
  if (!/setTimeout\(\s*schedule\s*,/.test(src)) {
    failures.push(`${WORKER_HOOK}: \`schedule\` is not deferred behind setTimeout — the worker would spin up on mount`);
  }
  // 4. The first paint must not wait on the worker at all.
  if (!/analyseSeo\(/.test(src)) {
    failures.push(`${WORKER_HOOK}: no inline fallback; a blocked worker would leave the panel empty`);
  }
}

/** Brace depth at an offset, ignoring nothing — good enough for a source gate. */
function depthAt(src, offset) {
  let depth = 0;
  for (let i = 0; i < offset; i += 1) {
    const c = src[i];
    if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
  }
  return depth;
}

/** Span of the balanced block opened by the first match of `re`. */
function blockAfter(src, re) {
  const match = re.exec(src);
  if (!match) return null;
  let i = src.indexOf("{", match.index);
  if (i === -1) return null;
  const start = i;
  let depth = 0;
  for (; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return { start, end: i };
    }
  }
  return null;
}

checkLazyWorker();

function findManifest(root) {
  const candidates = [
    join(root, "client", ".vite", "manifest.json"),
    join(root, ".vite", "manifest.json"),
    join(root, "manifest.json"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  // Fall back to a shallow search: output layout differs per adapter.
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (name === "manifest.json") return p;
      if (statSync(p).isDirectory() && stack.length < 200) stack.push(p);
    }
  }
  return null;
}

const manifestPath = findManifest(distRoot);
if (!manifestPath) {
  if (failures.length) {
    console.error("perf-budget FAILED:");
    for (const f of failures) console.error(`  • ${f}`);
    process.exit(1);
  }
  console.error(`perf-budget: no Vite manifest under ${distRoot}. Run \`bun run build\` first.`);
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const assetRoot = manifestPath.replace(/[\\/]\.vite[\\/]manifest\.json$/, "").replace(/[\\/]manifest\.json$/, "");

const gzCache = new Map();
function gzBytes(file) {
  if (gzCache.has(file)) return gzCache.get(file);
  const path = join(assetRoot, file);
  const size = existsSync(path) ? gzipSync(readFileSync(path)).length : 0;
  gzCache.set(file, size);
  return size;
}

function walk(key, seen) {
  const entry = manifest[key];
  if (!entry || seen.has(key)) return { js: 0, css: 0 };
  seen.add(key);
  let js = entry.file && entry.file.endsWith(".js") ? gzBytes(entry.file) : 0;
  let css = (entry.css ?? []).reduce((sum, f) => sum + gzBytes(f), 0);
  for (const dep of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) {
    const child = walk(dep, seen);
    js += child.js;
    css += child.css;
  }
  return { js, css };
}

const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry) ?? null;
const rows = [];

for (const route of ROUTES) {
  const key = Object.keys(manifest).find((k) => k === route || k.endsWith(route));
  if (!key) continue;
  const seen = new Set();
  const shell = entryKey ? walk(entryKey, seen) : { js: 0, css: 0 };
  const page = walk(key, seen);
  const js = shell.js + page.js;
  const css = shell.css + page.css;
  rows.push({ route, js, css });
  if (css > ASSET_BUDGET.cssGzBytes) {
    failures.push(`${route}: CSS ${(css / 1024).toFixed(1)}KB gz > ${(ASSET_BUDGET.cssGzBytes / 1024).toFixed(0)}KB`);
  }
  if (js > ASSET_BUDGET.jsGzBytes) {
    failures.push(`${route}: JS ${(js / 1024).toFixed(1)}KB gz > ${(ASSET_BUDGET.jsGzBytes / 1024).toFixed(0)}KB`);
  }
}

for (const [route, budget] of Object.entries(ADMIN_BUDGET)) {
  const key = Object.keys(manifest).find((k) => k === route || k.endsWith(route));
  if (!key) {
    warnings.push(`${route}: no chunk in the manifest (route removed, or the build split it differently)`);
    continue;
  }
  const seen = new Set();
  const { js, css } = walk(key, seen);
  rows.push({ route, js, css, admin: true });
  if (js > budget.jsGzBytes) {
    failures.push(`${route}: JS ${(js / 1024).toFixed(1)}KB gz > ${(budget.jsGzBytes / 1024).toFixed(0)}KB (admin budget)`);
  }
}

// Marketing routes carry the shared client shell too — a visitor pays for it
// on the first paint of `/`, so it is counted, exactly as it is for a store.
for (const [route, budget] of Object.entries(MARKETING_BUDGET)) {
  const key = Object.keys(manifest).find((k) => k === route || k.endsWith(route));
  if (!key) {
    warnings.push(`${route}: no chunk in the manifest (marketing route removed or renamed)`);
    continue;
  }
  const seen = new Set();
  const shell = entryKey ? walk(entryKey, seen) : { js: 0, css: 0 };
  const page = walk(key, seen);
  const js = shell.js + page.js;
  const css = shell.css + page.css;
  rows.push({ route, js, css, marketing: true });
  if (js > budget.jsGzBytes) {
    failures.push(
      `${route}: JS ${(js / 1024).toFixed(1)}KB gz > ${(budget.jsGzBytes / 1024).toFixed(0)}KB (marketing budget)`,
    );
  }
  if (css > budget.cssGzBytes) {
    failures.push(
      `${route}: CSS ${(css / 1024).toFixed(1)}KB gz > ${(budget.cssGzBytes / 1024).toFixed(0)}KB (marketing budget)`,
    );
  }
}

if (rows.length === 0) {
  console.error("perf-budget: no storefront route chunks found in the manifest.");
  process.exit(2);
}

if (args.includes("--json")) {
  console.log(JSON.stringify({ rows, failures, warnings }, null, 2));
} else {
  for (const r of rows) {
    console.log(
      `${r.admin ? "admin " : r.marketing ? "site  " : "store "}${r.route.padEnd(56)} js ${(r.js / 1024).toFixed(1)}KB  css ${(r.css / 1024).toFixed(1)}KB (gz)`,
    );
  }
  for (const w of warnings) console.warn(`perf-budget warning: ${w}`);
}

if (failures.length) {
  console.error("\nperf-budget FAILED:");
  for (const f of failures) console.error(`  • ${f}`);
  process.exit(1);
}

console.log(
  "\nperf-budget OK — storefront routes are inside the CWV transfer budget, admin chunks are inside their ceiling, and the SEO worker is built lazily.",
);
