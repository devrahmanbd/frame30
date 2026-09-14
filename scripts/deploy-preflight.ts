#!/usr/bin/env bun
/**
 * Automated Production Release Pre-Flight CLI (Phase 6.2).
 *
 * Runs inside CI/CD to probe the candidate GREEN container before shifting traffic:
 *
 * Usage:
 *   bun run scripts/deploy-preflight.ts --target-url=http://127.0.0.1:3000
 *   bun run scripts/deploy-preflight.ts --target-url=http://green-pod:3000 --json
 */
import { runPreflightSuite } from "../src/lib/deploy-preflight.server";

async function main() {
  const args = process.argv.slice(2);
  const targetArg = args.find((a) => a.startsWith("--target-url="));
  const targetUrl = targetArg
    ? targetArg.split("=")[1]
    : process.env["GREEN_URL"] || process.env["DEPLOY_TARGET_URL"] || "http://127.0.0.1:3000";

  const isJson = args.includes("--json");
  const skipDb = args.includes("--skip-db");
  const retriesArg = args.find((a) => a.startsWith("--retries="));
  const maxRetries = retriesArg ? parseInt(retriesArg.split("=")[1], 10) : 6;
  const metricsToken = process.env["METRICS_TOKEN"];

  if (!isJson) {
    console.log("=".repeat(80));
    console.log("Framique Production Release Pre-Flight Gate (Phase 6.2)");
    console.log(`Candidate Target : GREEN (${targetUrl})`);
    console.log(`Active Production: BLUE (Warm Standby / Serving 100% Traffic)`);
    console.log("=".repeat(80));
  }

  const report = await runPreflightSuite({
    targetUrl,
    maxRetries,
    skipDbQuery: skipDb,
    metricsToken,
  });

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.passed ? 0 : 1);
  }

  // Terminal Output
  console.log("\n[TIER 1: CONTAINER READINESS]");
  if (report.readiness.passed) {
    console.log(`  ✓ HTTP /api/healthz returned ${report.readiness.statusCode} (${report.readiness.latencyMs}ms)`);
  } else {
    console.log(`  ✗ READINESS FAILED: ${report.readiness.error || `HTTP ${report.readiness.statusCode}`}`);
  }

  console.log("\n[TIER 2: HEADLESS SMOKE JOURNEYS]");
  for (const j of report.smoke.journeys) {
    const symbol = j.passed ? "✓" : "✗";
    console.log(`  ${symbol} ${j.journey.padEnd(30)} -> ${j.passed ? "PASS" : "FAIL"} (HTTP ${j.statusCode}, ${j.latencyMs}ms)`);
    if (!j.passed && j.error) {
      console.log(`    Reason: ${j.error}`);
    }
  }

  console.log("\n[TIER 3: DATABASE SCHEMA COMPATIBILITY]");
  if (report.databaseCompatibility.passed) {
    console.log(`  ✓ Schema verification passed:`);
    console.log(`    - Tables verified : ${report.databaseCompatibility.checkedTables.length} (0 missing)`);
    console.log(`    - RPCs verified   : ${report.databaseCompatibility.checkedRpcs.length} (0 missing)`);
  } else {
    console.log(`  ✗ SCHEMA COMPATIBILITY FAILED:`);
    console.log(`    ${report.databaseCompatibility.error}`);
  }

  console.log("\n" + "-".repeat(80));
  if (report.passed) {
    console.log(`FINAL VERDICT: \x1b[32m${report.verdict}\x1b[0m (Duration: ${report.durationMs}ms)`);
    console.log(`BLUE Status  : ${report.blueEnvironmentStatus} (Ready for Canary Traffic Shifting)`);
    console.log("=".repeat(80));
    process.exit(0);
  } else {
    console.log(`FINAL VERDICT: \x1b[31m${report.verdict}\x1b[0m (Duration: ${report.durationMs}ms)`);
    console.log(`BLUE Status  : \x1b[32m${report.blueEnvironmentStatus}\x1b[0m (Retaining 100% Traffic, Zero Blast Radius)`);
    console.log("\nABORT REASONS:");
    for (const reason of report.failureReasons) {
      console.log(`  • ${reason}`);
    }
    console.log("=".repeat(80));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Preflight crashed: ${(err as Error).message}`);
  process.exit(1);
});
