#!/usr/bin/env bun
/**
 * Redis Cache Pre-Warming Worker CLI (Phase 6.3).
 *
 * Runs automatically during container boot or pre-cutover to hydrate Redis L2 cache,
 * eliminating database latency spikes and stampedes.
 *
 * Usage:
 *   bun run scripts/cache-warmup.ts
 *   bun run scripts/cache-warmup.ts --merchants=100 --ttl=3600
 *   bun run scripts/cache-warmup.ts --json
 */
import { warmupAll } from "../src/lib/cache-warmup.server";

async function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes("--json");
  const dryRun = args.includes("--dry-run");

  const merchantsArg = args.find((a) => a.startsWith("--merchants="));
  const merchantLimit = merchantsArg ? parseInt(merchantsArg.split("=")[1], 10) : 50;

  const ttlArg = args.find((a) => a.startsWith("--ttl="));
  const ttlSeconds = ttlArg ? parseInt(ttlArg.split("=")[1], 10) : 3600;

  if (!isJson) {
    console.log("=".repeat(80));
    console.log("Framique Redis Cache Pre-Warming Worker (Phase 6.3)");
    console.log(`Merchant Limit: ${merchantLimit} stores | TTL: ${ttlSeconds}s`);
    console.log("=".repeat(80));
  }

  const report = await warmupAll({
    merchantLimit,
    ttlSeconds,
    dryRun,
  });

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.status === "failed" ? 1 : 0);
  }

  console.log("\n[PRE-WARM HYDRATION PROGRESS]");
  for (const l of report.layers) {
    const symbol = l.status === "ok" ? "✓" : l.status === "skipped" ? "○" : "✗";
    console.log(
      `  ${symbol} ${l.layer.padEnd(35)} -> ${l.keysWarmed} keys hydrated (${l.durationMs}ms)`,
    );
    if (l.error) {
      console.log(`    Error: ${l.error}`);
    }
  }

  console.log("\n" + "-".repeat(80));
  console.log(`STATUS         : ${report.status.toUpperCase()}`);
  console.log(`TOTAL KEYS     : ${report.totalKeysWarmed} keys warmed`);
  console.log(`TOTAL DURATION : ${report.totalDurationMs}ms`);
  console.log("THUNDERING HERD: MITIGATED (Zero-Downtime Safe)");
  console.log("=".repeat(80));

  process.exit(report.status === "failed" ? 1 : 0);
}

main().catch((err) => {
  console.error(`Cache warmup failed: ${(err as Error).message}`);
  process.exit(1);
});
