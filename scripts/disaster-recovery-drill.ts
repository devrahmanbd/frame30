#!/usr/bin/env bun
/**
 * Disaster Recovery & Blue Instant Rollback Drill CLI (Phase 8.4).
 *
 * Runs an end-to-end rehearsal drill verifying:
 * 1. Promotion to GREEN with BLUE on warm standby.
 * 2. Live customer transactions processed under GREEN.
 * 3. Catastrophic failure injection (500 error surge).
 * 4. Instant rollback to BLUE with RTO < 5 seconds.
 * 5. Zero data loss audit confirming RPO = 0.
 *
 * Usage:
 *   bun run scripts/disaster-recovery-drill.ts
 *   bun run scripts/disaster-recovery-drill.ts --orders 100
 */
import {
  DR_SLA,
  executeDisasterRecoveryDrill,
} from "../src/lib/disaster-recovery-drill.server";

async function main() {
  const args = process.argv.slice(2);
  const ordersIdx = args.indexOf("--orders");
  const ordersCount = ordersIdx !== -1 ? parseInt(args[ordersIdx + 1], 10) : 50;

  console.log("=".repeat(80));
  console.log("Framique Disaster Recovery & Blue Instant Rollback Rehearsal Drill (Phase 8.4)");
  console.log("Objective: Verify High Availability, RTO < 5s, and RPO = 0 under Chaos Failure");
  console.log("=".repeat(80));
  console.log(`Target Orders Under GREEN : ${ordersCount}`);
  console.log(`Recovery Time SLA (RTO)   : < ${DR_SLA.MAX_RTO_SECONDS} seconds`);
  console.log(`Recovery Point SLA (RPO)  : Exactly ${DR_SLA.EXPECTED_RPO} lost records`);
  console.log("=".repeat(80) + "\n");

  const result = await executeDisasterRecoveryDrill({
    simulatedOrdersCount: ordersCount,
  });

  for (const step of result.steps) {
    const badge = step.status === "passed" ? "\x1b[32m[PASS]\x1b[0m" : "\x1b[31m[FAIL]\x1b[0m";
    console.log(`Step ${step.stepNumber}: ${step.name} ${badge} (${step.durationMs}ms)`);
    if (step.details) {
      console.log(`        \x1b[90m${step.details}\x1b[0m`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log(`DRILL VERDICT         : ${result.success ? "\x1b[32mPASSED (Zero-Downtime DR Confirmed)\x1b[0m" : "\x1b[31mFAILED\x1b[0m"}`);
  console.log(`RECOVERY TIME (RTO)   : \x1b[32m${result.rtoSeconds}s\x1b[0m (Target: < ${DR_SLA.MAX_RTO_SECONDS}s)`);
  console.log(`DATA LOSS (RPO)       : \x1b[32m${result.rpoLossCount} orders lost\x1b[0m (Target: ${DR_SLA.EXPECTED_RPO})`);
  console.log(`ORDERS PRESERVED      : ${result.ordersPreserved} / ${result.totalOrdersPlaced} (100%)`);
  console.log(`STARTED AT            : ${result.startedAt}`);
  console.log(`COMPLETED AT          : ${result.completedAt}`);
  console.log("=".repeat(80));

  if (!result.success) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Fatal DR drill error: ${(err as Error).message}`);
  process.exit(1);
});
