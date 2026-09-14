#!/usr/bin/env bun
/**
 * Tenant-Level Canary Cohorts Management CLI (Phase 7.2).
 *
 * Manages customer cohort rings:
 * - Cohort 0: Internal dogfood / platform staff
 * - Cohort 1: 10 Beta stores (trusted partners)
 * - Cohort 2: 100 Early-adopters
 * - Cohort 3: 1,000 Scaled stores
 * - Cohort 4: Global production
 *
 * Usage:
 *   bun run scripts/tenant-cohort.ts --list
 *   bun run scripts/tenant-cohort.ts --check <merchantIdOrSlug>
 *   bun run scripts/tenant-cohort.ts --assign <merchantIdOrSlug> --tier 1
 *   bun run scripts/tenant-cohort.ts --set-rollout 1
 *   bun run scripts/tenant-cohort.ts --simulate-request <merchantIdOrSlug>
 */
import {
  COHORT_DEFINITIONS,
  getActiveCohortRolloutTier,
  getTenantCohort,
  resolveTenantCanaryRoute,
  setActiveCohortRolloutTier,
  setTenantCohort,
  type CohortTier,
} from "../src/lib/tenant-canary.server";

async function main() {
  const args = process.argv.slice(2);

  const isList = args.includes("--list") || args.length === 0;
  const checkIdx = args.indexOf("--check");
  const assignIdx = args.indexOf("--assign");
  const rolloutIdx = args.indexOf("--set-rollout");
  const simIdx = args.indexOf("--simulate-request");

  if (assignIdx !== -1) {
    const tenantId = args[assignIdx + 1];
    const tierArgIdx = args.indexOf("--tier");
    if (!tenantId || tierArgIdx === -1 || !args[tierArgIdx + 1]) {
      console.error("Usage: --assign <merchantIdOrSlug> --tier <0-4>");
      process.exit(1);
    }
    const tier = parseInt(args[tierArgIdx + 1], 10) as CohortTier;
    if (tier < 0 || tier > 4) {
      console.error("Invalid tier! Must be 0, 1, 2, 3, or 4.");
      process.exit(1);
    }

    await setTenantCohort(tenantId, tier);
    console.log(`\x1b[32mAssigned '${tenantId}' to ${COHORT_DEFINITIONS[tier].name}\x1b[0m`);
    return;
  }

  if (rolloutIdx !== -1) {
    const tierStr = args[rolloutIdx + 1];
    const tier = parseInt(tierStr, 10) as CohortTier | -1;
    if (tier < -1 || tier > 4) {
      console.error("Invalid rollout tier! Must be -1 (disabled), 0, 1, 2, 3, or 4.");
      process.exit(1);
    }

    await setActiveCohortRolloutTier(tier);
    console.log("=".repeat(80));
    console.log(`Updated Active Canary Cohort Rollout Tier: ${tier}`);
    if (tier === -1) {
      console.log("No cohort canary active. All traffic routes to baseline primary.");
    } else {
      console.log(`All stores in Cohort 0 up to Cohort ${tier} will route to CANDIDATE (GREEN).`);
    }
    console.log("=".repeat(80));
    return;
  }

  if (checkIdx !== -1) {
    const tenantId = args[checkIdx + 1];
    if (!tenantId) {
      console.error("Usage: --check <merchantIdOrSlug>");
      process.exit(1);
    }
    const tier = await getTenantCohort(tenantId);
    const def = COHORT_DEFINITIONS[tier];
    const activeRollout = await getActiveCohortRolloutTier();

    console.log("=".repeat(80));
    console.log(`Tenant Canary Cohort Profile: ${tenantId}`);
    console.log("=".repeat(80));
    console.log(`Assigned Cohort Tier : ${tier} (${def.name})`);
    console.log(`Description          : ${def.description}`);
    console.log(`Active Rollout Tier  : ${activeRollout}`);
    console.log(`Target Slot Status   : ${activeRollout >= 0 && tier <= activeRollout ? "\x1b[32mGREEN (Candidate Release)\x1b[0m" : "\x1b[34mBLUE (Baseline Stable)\x1b[0m"}`);
    console.log("=".repeat(80));
    return;
  }

  if (simIdx !== -1) {
    const tenantId = args[simIdx + 1];
    if (!tenantId) {
      console.error("Usage: --simulate-request <merchantIdOrSlug>");
      process.exit(1);
    }
    const req = new Request(`https://framique.test/store/${tenantId}`, {
      headers: { "x-merchant-id": tenantId },
    });
    const decision = await resolveTenantCanaryRoute(req);

    console.log("=".repeat(80));
    console.log(`Edge Route Decision Simulation for: ${tenantId}`);
    console.log("=".repeat(80));
    console.log(`Target Slot        : ${decision.targetSlot.toUpperCase()}`);
    console.log(`Cohort Tier        : ${decision.cohortTier} (${COHORT_DEFINITIONS[decision.cohortTier].name})`);
    console.log(`Routing Reason     : ${decision.reason}`);
    console.log("Injected Headers   :");
    for (const [k, v] of Object.entries(decision.headersToInject)) {
      console.log(`  ${k}: ${v}`);
    }
    console.log("=".repeat(80));
    return;
  }

  if (isList) {
    const activeRollout = await getActiveCohortRolloutTier();

    console.log("=".repeat(80));
    console.log("Framique Tenant-Level Canary Cohorts (Phase 7.2)");
    console.log(`Current Active Rollout Tier: ${activeRollout >= 0 ? `Cohort <= ${activeRollout} receiving releases` : "Inactive (-1)"}`);
    console.log("=".repeat(80));

    for (let t = 0; t <= 4; t++) {
      const def = COHORT_DEFINITIONS[t as CohortTier];
      const isCandidate = activeRollout >= 0 && t <= activeRollout;
      console.log(`\n[Tier ${t}] ${def.name} ${isCandidate ? "\x1b[32m[ROUTED TO GREEN]\x1b[0m" : "\x1b[34m[ROUTED TO BLUE]\x1b[0m"}`);
      console.log(`  Description : ${def.description}`);
      console.log(`  Max Stores  : ${def.maxStores === Number.POSITIVE_INFINITY ? "Unlimited" : def.maxStores}`);
    }
    console.log("\n" + "=".repeat(80));
  }
}

main().catch((err) => {
  console.error(`Fatal cohort error: ${(err as Error).message}`);
  process.exit(1);
});
