#!/usr/bin/env node
/**
 * Phase 9.4 — the enforced contract set.
 *
 * A contract test that can be deleted is not a contract. `bun run test` only
 * runs the files that happen to exist, so a rename, a bad merge, or an
 * exasperated `rm` silently removes a guarantee and every gate stays green.
 * This script closes that hole: it holds an explicit manifest of the contract
 * files the product is required to keep, fails loudly when one is missing,
 * empty, or has been hollowed out into a placeholder, and only then hands
 * exactly that set to vitest.
 *
 * Checks per entry, before a single test runs:
 *   • the file exists;
 *   • it is not empty and not below a plausible floor of real content;
 *   • it actually declares tests (`it(` / `test(`) rather than only describes;
 *   • it contains no `.skip` / `.todo` / `xit(` escape hatches;
 *   • every `mustCover` marker the manifest names is present, so a contract
 *     cannot be quietly narrowed to its easy half.
 *
 * Usage:
 *   node scripts/contract-gate.mjs            # verify manifest, then run vitest
 *   node scripts/contract-gate.mjs --list     # print the manifest and exit
 *   node scripts/contract-gate.mjs --verify   # manifest checks only, no tests
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));

/** Minimum bytes before we call a contract file a stub rather than a contract. */
const MIN_BYTES = 1_500;

/**
 * The enforced set. `mustCover` holds identifiers or phrases that pin the
 * *scope* of each contract — the things we promised the file would check.
 */
const MANIFEST = [
  {
    file: "src/lib/seo-weight.contract.test.ts",
    why: "Phase 7 weight discipline: storefront bundles stay free of admin-only SEO code.",
    mustCover: ["seo-weight"],
  },
  {
    file: "src/lib/search-console.contract.test.ts",
    why: "Search Console ingest: token refresh, quota, backfill idempotency.",
    mustCover: ["search-console"],
  },
  {
    file: "src/lib/content-health.contract.test.ts",
    why: "Phase 6 exit gate: link graph, redirects, findings, schema audit, fingerprints.",
    mustCover: [
      "extractLinks",
      "resolveInternal",
      "orphanFindings",
      "cannibalisationFindings",
      "thinContentFindings",
      "staleContentFindings",
      "schemaFindings",
      "fingerprintOf",
      "CRAWL_POLICY",
    ],
  },
  {
    file: "src/lib/query-discipline.contract.test.ts",
    why: "Phase 9.4: every admin list, sitemap shard and dashboard card stays bounded at 50k rows.",
    mustCover: [
      "listSeoEntities",
      "listSeoBulk",
      "loadSitemapByKind",
      "loadDashboardHome",
      "largeTenantTables",
      "SITEMAP_MAX_URLS",
      "DASHBOARD_ORDER_SCAN_LIMIT",
    ],
  },
  {
    file: "src/lib/__fixtures__/large-tenant.ts",
    why: "The 50 000-row fixture the query-discipline contract is measured against.",
    kind: "fixture",
    mustCover: ["LARGE_TENANT_SHAPE", "largeTenantTables"],
  },
  {
    file: "src/lib/__fixtures__/fake-db.ts",
    why: "Records query shape (limits, ranges, rows returned) so discipline is measurable.",
    kind: "fixture",
    mustCover: ["scanned", "returned", "limit"],
  },
];

MANIFEST.push(
  {
    file: "src/lib/motion-policy.test.ts",
    why: "Phase 10.1: motion intent resolution, stagger/marquee/parallax bounds, budget and backoff maths.",
    mustCover: [
      "resolveIntent",
      "staggerSchedule",
      "marqueeDurationMs",
      "parallaxOffset",
      "magneticOffset",
      "MotionBudget",
      "backoffDelayMs",
      "formatCounterValue",
    ],
  },
  {
    file: "src/lib/motion.contract.test.ts",
    why: "Phase 10.1: lazy engine resilience (retry, timeout, breaker, degrade) and marketing motion invariants.",
    mustCover: [
      "loadMotionEngine",
      "withEngine",
      "engine.degraded",
      "one animation engine",
      "useMotionIntent",
      "prefers-reduced-motion",
      "--ring-focus",
    ],
  },
);

MANIFEST.push({
  file: "src/lib/copy-quality.contract.test.ts",
  why: "Phase 10.3: bilingual copy quality, voice rules, legal versioning and single-source NAP.",
  mustCover: [
    "auditDictionary",
    "voice.hype",
    "voice.unsupported-claim",
    "locale.placeholder-parity",
    "money.currency-token",
    "LEGAL_DOCS",
    "organizationSchema",
    "napPostalAddress",
  ],
});

MANIFEST.push({
  file: "src/lib/newsletter.contract.test.ts",
  why: "Phase 10.4: double opt-in, consent record, rate limits, enumeration resistance, outbox delivery and one-click unsubscribe.",
  mustCover: [
    "newsletter.subscribe_ip",
    "newsletter.subscribe_email",
    "CONSENT_VERSION",
    "check_inbox",
    "List-Unsubscribe-Post",
    "outboxIsDead",
    "NEWSLETTER_WEBHOOK_SECRET",
    "timingSafeEqual",
  ],
});

MANIFEST.push({
  file: "src/lib/marketing-seo.contract.test.ts",
  why: "Phase 10.5: marketing head registry, hreflang alternates, JSON-LD graph, sitemap/robots/llms.txt coverage and the internal link map.",
  mustCover: [
    "buildMarketingHead",
    "x-default",
    "validateJsonLd",
    "LocalBusiness",
    "marketingSitemapEntries",
    "renderMarketingLlmsTxt",
    "crawlDepths",
    "exactly one <h1>",
  ],
});

MANIFEST.push({
  file: "src/lib/contact.contract.test.ts",
  why: "Phase 10.6: canonical NAP, hardened contact intake, routing SLAs, privacy and durable delivery.",
  mustCover: [
    "contact.submit_ip",
    "contact.submit_email",
    "ORG_NAP",
    "napPostalAddress",
    "scoreContact",
    "CONTACT_ROUTES",
    "contact_outbox",
    "left-[-9999px]",
  ],
});

MANIFEST.push({
  file: "src/lib/semrush.contract.test.ts",
  why: "Phase 5: Semrush API token validation, live keyword tracking, competitor mapping and crawl audit.",
  mustCover: [
    "SEMRUSH_DEFAULT_API_KEY",
    "buildSemrushUrl",
    "parseSemrushTable",
    "fetchSemrushDomainRank",
    "fetchSemrushKeywords",
    "fetchSemrushCrawlAudit",
  ],
});

const failures = [];
const rows = [];

for (const entry of MANIFEST) {
  const path = join(ROOT, entry.file);
  if (!existsSync(path) || !statSync(path).isFile()) {
    failures.push(`${entry.file}: MISSING — ${entry.why}`);
    continue;
  }
  const source = readFileSync(path, "utf8");
  const bytes = Buffer.byteLength(source);
  if (bytes < MIN_BYTES) {
    failures.push(`${entry.file}: only ${bytes}B — a contract this small is a placeholder (min ${MIN_BYTES}B)`);
  }

  if (entry.kind !== "fixture") {
    const cases = (source.match(/\b(?:it|test)\s*\(/g) ?? []).length;
    if (cases === 0) failures.push(`${entry.file}: declares no test cases`);
    const skipped = source.match(/\b(?:it|test|describe)\.(?:skip|todo|only)\b|\bxit\s*\(/g);
    if (skipped) {
      failures.push(`${entry.file}: contains ${skipped.length} disabled/exclusive block(s) (${[...new Set(skipped)].join(", ")})`);
    }
    rows.push({ file: entry.file, cases, bytes });
  } else {
    rows.push({ file: entry.file, cases: 0, bytes });
  }

  for (const marker of entry.mustCover ?? []) {
    if (!source.includes(marker)) {
      failures.push(`${entry.file}: no longer covers \`${marker}\` — scope was narrowed`);
    }
  }
}

if (args.has("--list")) {
  for (const entry of MANIFEST) console.log(`${entry.file}\n  ${entry.why}`);
  process.exit(failures.length ? 1 : 0);
}

if (failures.length) {
  console.error("contract-gate FAILED — the enforced contract set is not intact:");
  for (const f of failures) console.error(`  • ${f}`);
  console.error("\nRestore the file (git history has it) or, if a contract is genuinely obsolete,");
  console.error("remove it from MANIFEST in scripts/contract-gate.mjs in the same change, with a reason.");
  process.exit(1);
}

for (const r of rows) {
  console.log(`contract ok  ${r.file.padEnd(52)} ${String(r.cases).padStart(3)} cases  ${(r.bytes / 1024).toFixed(1)}KB`);
}

if (args.has("--verify")) {
  console.log("\ncontract-gate OK — manifest intact (tests not run: --verify).");
  process.exit(0);
}

const testFiles = MANIFEST.filter((e) => e.kind !== "fixture").map((e) => e.file);
console.log(`\nrunning ${testFiles.length} contract suites…\n`);
const result = spawnSync("bunx", ["vitest", "run", ...testFiles], { stdio: "inherit", cwd: ROOT });

if (result.error) {
  console.error(`contract-gate: could not start vitest — ${result.error.message}`);
  process.exit(2);
}
if (result.status !== 0) {
  console.error("\ncontract-gate FAILED — a contract suite is red.");
  process.exit(result.status ?? 1);
}
console.log("\ncontract-gate OK — every enforced contract exists and passes.");
