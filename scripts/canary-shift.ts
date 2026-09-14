#!/usr/bin/env bun
/**
 * Weighted Canary Traffic Shifting Operator CLI (Phase 7.1).
 *
 * Orchestrates progressive traffic shifting across:
 * - Stage 1:  1% (10m soak; 0 surge in 5xx)
 * - Stage 2:  5% (15m soak; checkout completion >= 99%)
 * - Stage 3: 25% (30m soak; db pool < 70%, redis overhead < 20%)
 * - Stage 4: 100% (Full promotion; BLUE warm standby 60m)
 *
 * Usage:
 *   bun run scripts/canary-shift.ts --status
 *   bun run scripts/canary-shift.ts --stage=1
 *   bun run scripts/canary-shift.ts --stage=2
 *   bun run scripts/canary-shift.ts --stage=3
 *   bun run scripts/canary-shift.ts --promote
 *   bun run scripts/canary-shift.ts --abort
 */
import { execSync } from "node:child_process";
import {
  CANARY_STAGES,
  abortCanary,
  getCanaryState,
  setCanaryStage,
  type CanaryStageId,
} from "../src/lib/canary-weights.server";

function reloadNginxIfRunning() {
  try {
    execSync("docker exec framique-edge-router nginx -s reload", { stdio: "ignore" });
    console.log("  ✓ Reloaded edge router configuration (zero TCP socket drops)");
  } catch {
    console.log("  ○ Edge router container not running locally; configuration written to disk.");
  }
}

async function main() {
  const args = process.argv.slice(2);

  const isStatus = args.includes("--status") || args.length === 0;
  const isAbort = args.includes("--abort");
  const isPromote = args.includes("--promote");
  const stageArg = args.find((a) => a.startsWith("--stage="));

  if (isAbort) {
    console.log("=".repeat(80));
    console.log("EMERGENCY CANARY ABORT — REVERTING TO 100% PRIMARY SLOT");
    console.log("=".repeat(80));
    const result = await abortCanary();
    reloadNginxIfRunning();
    console.log(`\n\x1b[33mCanary Aborted.\x1b[0m All traffic restored to: ${result.state.primarySlot.toUpperCase()}`);
    return;
  }

  if (isPromote) {
    console.log("=".repeat(80));
    console.log("STAGE 4: FULL 100% PROMOTION TO CANDIDATE SLOT");
    console.log("=".repeat(80));
    const current = await getCanaryState();
    const result = await setCanaryStage(4, {
      candidateSlot: current.candidateSlot,
      primarySlot: current.primarySlot,
    });
    reloadNginxIfRunning();
    console.log(`\n\x1b[32mCandidate ${result.state.candidateSlot.toUpperCase()} Promoted to 100%.\x1b[0m`);
    console.log(`Previous primary (${result.state.primarySlot.toUpperCase()}) retained on warm standby for 60m.`);
    return;
  }

  if (stageArg) {
    const stageNum = parseInt(stageArg.split("=")[1], 10) as CanaryStageId;
    if (stageNum < 1 || stageNum > 3) {
      console.error("Invalid stage! Use --stage=1, --stage=2, or --stage=3 (or --promote for stage 4).");
      process.exit(1);
    }

    const stageDef = CANARY_STAGES[stageNum];
    console.log("=".repeat(80));
    console.log(`SHIFTING TRAFFIC: ${stageDef.name}`);
    console.log(`Canary Weight   : ${stageDef.canaryWeight}% Candidate | ${stageDef.primaryWeight}% Primary`);
    console.log(`Soak Duration   : ${stageDef.soakDurationMs / 60000} minutes`);
    console.log("Verification Criteria:");
    for (const crit of stageDef.verificationCriteria) {
      console.log(`  • ${crit}`);
    }
    console.log("=".repeat(80));

    const result = await setCanaryStage(stageNum);
    reloadNginxIfRunning();

    console.log(`\n\x1b[32mSuccessfully shifted traffic to Stage ${stageNum}.\x1b[0m`);
    console.log(`Soak timer expires at: ${result.state.soakExpiresAt}`);
    return;
  }

  if (isStatus) {
    const state = await getCanaryState();
    const currentStageDef = CANARY_STAGES[state.stage];

    console.log("=".repeat(80));
    console.log("Framique Canary Rollout Status (Phase 7.1)");
    console.log("=".repeat(80));
    console.log(`Active Status     : ${state.active ? "\x1b[32mACTIVE CANARY\x1b[0m" : "\x1b[90mINACTIVE / PROMOTED\x1b[0m"}`);
    console.log(`Current Stage     : ${state.stage} (${currentStageDef.name})`);
    console.log(`Candidate Target  : ${state.candidateSlot.toUpperCase()} (${currentStageDef.canaryWeight}%)`);
    console.log(`Primary Target    : ${state.primarySlot.toUpperCase()} (${currentStageDef.primaryWeight}%)`);
    console.log(`Rollout State     : ${state.status.toUpperCase()}`);

    if (state.active && state.stage > 0 && state.stage < 4) {
      const minutesRemaining = Math.ceil(state.soakRemainingMs / 60000);
      console.log(`Soak Countdown    : ${minutesRemaining} min remaining (${state.isSoakComplete ? "COMPLETED" : "IN PROGRESS"})`);
      console.log(`Soak Expires At   : ${state.soakExpiresAt}`);
      console.log("\nStage Gates Required Before Next Step:");
      for (const crit of currentStageDef.verificationCriteria) {
        console.log(`  [ ] ${crit}`);
      }
    }
    console.log("=".repeat(80));
  }
}

main().catch((err) => {
  console.error(`Fatal canary error: ${(err as Error).message}`);
  process.exit(1);
});
