/**
 * Phase 7.1 — Weighted Canary Traffic Shifting Engine.
 *
 * Implements 4-stage progressive edge traffic shifting:
 * - Stage 1 (1%):  10-minute soak; verify zero surge in HTTP 5xx or Sentry errors.
 * - Stage 2 (5%):  15-minute soak; monitor checkout completion and courier booking p95.
 * - Stage 3 (25%): 30-minute soak; verify DB pool stability (<70%) and Redis memory overhead (<20%).
 * - Stage 4 (100%): Full promotion to candidate slot; retain previous slot on warm standby for 60m.
 *
 * NGINX weighted upstream rules are dynamically maintained in `ops/routing/canary-weights.conf`.
 */
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { incr, log } from "./observability.server";
import { redisCommand, redisConfigured, redisKey } from "./redis.server";
import { type TopologySlot } from "./blue-green-router.server";

export type CanaryStageId = 0 | 1 | 2 | 3 | 4;

export type CanaryStageDefinition = {
  id: CanaryStageId;
  name: string;
  canaryWeight: number;    // percentage directed to candidate slot (0 - 100)
  primaryWeight: number;   // percentage directed to primary slot (100 - 0)
  soakDurationMs: number;  // required soak duration before advancing
  verificationCriteria: string[];
};

export const CANARY_STAGES: Record<CanaryStageId, CanaryStageDefinition> = {
  0: {
    id: 0,
    name: "Inactive / Normal (0% Canary)",
    canaryWeight: 0,
    primaryWeight: 100,
    soakDurationMs: 0,
    verificationCriteria: ["Standard single-slot operation"],
  },
  1: {
    id: 1,
    name: "Stage 1 (1% - Initial Soak)",
    canaryWeight: 1,
    primaryWeight: 99,
    soakDurationMs: 10 * 60 * 1000, // 10 minutes
    verificationCriteria: [
      "Zero surge in HTTP 5xx responses",
      "Unhandled Sentry error rate < 0.05%",
      "Edge router SSL / TLS handshake stability",
    ],
  },
  2: {
    id: 2,
    name: "Stage 2 (5% - Core Journey Soak)",
    canaryWeight: 5,
    primaryWeight: 95,
    soakDurationMs: 15 * 60 * 1000, // 15 minutes
    verificationCriteria: [
      "Checkout completion rate >= 99.0%",
      "Courier booking latency p95 < 400ms",
      "Payment gateway webhook callback success > 99.5%",
    ],
  },
  3: {
    id: 3,
    name: "Stage 3 (25% - Scale Load Soak)",
    canaryWeight: 25,
    primaryWeight: 75,
    soakDurationMs: 30 * 60 * 1000, // 30 minutes
    verificationCriteria: [
      "PostgreSQL connection pool utilization < 70%",
      "Redis L2 cache memory overhead < 20%",
      "Event outbox processing lag < 500ms",
    ],
  },
  4: {
    id: 4,
    name: "Stage 4 (100% - Full Promotion)",
    canaryWeight: 100,
    primaryWeight: 0,
    soakDurationMs: 60 * 60 * 1000, // 60 minutes warm standby retention
    verificationCriteria: [
      "Full promotion to Candidate slot",
      "Retain previous slot on warm standby for 60m for instant rollback",
    ],
  },
};

export type CanaryState = {
  active: boolean;
  stage: CanaryStageId;
  candidateSlot: TopologySlot;
  primarySlot: TopologySlot;
  startedAt: string;
  stageStartedAt: string;
  soakExpiresAt: string;
  soakRemainingMs: number;
  isSoakComplete: boolean;
  status: "idle" | "soaking" | "ready_to_advance" | "promoted" | "aborted";
  updatedAt: string;
};

const CANARY_STATE_KEY = "canary:state";

// In-memory fallback for local dev or when Redis is disconnected
let localCanaryState: CanaryState = {
  active: false,
  stage: 0,
  candidateSlot: "green",
  primarySlot: "blue",
  startedAt: new Date().toISOString(),
  stageStartedAt: new Date().toISOString(),
  soakExpiresAt: new Date().toISOString(),
  soakRemainingMs: 0,
  isSoakComplete: true,
  status: "idle",
  updatedAt: new Date().toISOString(),
};

/**
 * Read current canary rollout state from Redis or local memory.
 */
export async function getCanaryState(): Promise<CanaryState> {
  let state = localCanaryState;

  if (redisConfigured()) {
    try {
      const res = await redisCommand(["GET", redisKey("platform", CANARY_STATE_KEY)]);
      if (res.ok && typeof res.value === "string") {
        state = JSON.parse(res.value) as CanaryState;
      }
    } catch {
      // Fallback to local
    }
  }

  // Calculate live soak countdown
  if (state.active && state.stage > 0 && state.stage < 4) {
    const stageDef = CANARY_STAGES[state.stage];
    const elapsed = Date.now() - new Date(state.stageStartedAt).getTime();
    const remaining = Math.max(0, stageDef.soakDurationMs - elapsed);
    state.soakRemainingMs = remaining;
    state.isSoakComplete = remaining === 0;
    if (state.isSoakComplete && state.status === "soaking") {
      state.status = "ready_to_advance";
    }
  } else if (state.stage === 4) {
    state.status = "promoted";
    state.isSoakComplete = true;
    state.soakRemainingMs = 0;
  }

  return state;
}

/**
 * Persist canary rollout state.
 */
export async function saveCanaryState(state: CanaryState): Promise<boolean> {
  state.updatedAt = new Date().toISOString();
  localCanaryState = state;

  if (redisConfigured()) {
    try {
      const res = await redisCommand([
        "SET",
        redisKey("platform", CANARY_STATE_KEY),
        JSON.stringify(state),
      ]);
      return res.ok;
    } catch {
      return false;
    }
  }
  return true;
}

export type GenerateCanaryConfigOptions = {
  stageId: CanaryStageId;
  candidateSlot: TopologySlot;
  primarySlot: TopologySlot;
  blueHost?: string;
  greenHost?: string;
  bluePort?: number;
  greenPort?: number;
  keepaliveSockets?: number;
};

/**
 * Generates production NGINX weighted upstream configuration for canary traffic splitting.
 */
export function generateCanaryNginxUpstream(opts: GenerateCanaryConfigOptions): string {
  const stage = CANARY_STAGES[opts.stageId];
  const blueHost = `${opts.blueHost || "framique-blue"}:${opts.bluePort || 3000}`;
  const greenHost = `${opts.greenHost || "framique-green"}:${opts.greenPort || 3000}`;
  const keepalive = opts.keepaliveSockets || 64;

  let upstreamServers = "";

  if (opts.stageId === 0) {
    // Inactive: 100% to primary slot, candidate on warm backup
    if (opts.primarySlot === "blue") {
      upstreamServers = `
    # Primary Active: BLUE (100% traffic)
    server ${blueHost} max_fails=3 fail_timeout=10s;

    # Warm Standby: GREEN
    server ${greenHost} backup;`;
    } else {
      upstreamServers = `
    # Primary Active: GREEN (100% traffic)
    server ${greenHost} max_fails=3 fail_timeout=10s;

    # Warm Standby: BLUE
    server ${blueHost} backup;`;
    }
  } else if (opts.stageId === 4) {
    // 100% Promotion to candidate slot, primary retained on warm backup
    const promotedHost = opts.candidateSlot === "green" ? greenHost : blueHost;
    const standbyHost = opts.candidateSlot === "green" ? blueHost : greenHost;
    upstreamServers = `
    # Promoted Active: ${opts.candidateSlot.toUpperCase()} (100% traffic)
    server ${promotedHost} max_fails=3 fail_timeout=10s;

    # Warm Standby / Rollback Target: ${opts.primarySlot.toUpperCase()} (Retained for 60m)
    server ${standbyHost} backup;`;
  } else {
    // Weighted split between primary and candidate
    const primaryHost = opts.primarySlot === "blue" ? blueHost : greenHost;
    const candidateHost = opts.candidateSlot === "green" ? greenHost : blueHost;

    upstreamServers = `
    # Primary Baseline (${opts.primarySlot.toUpperCase()}): ${stage.primaryWeight}% weight
    server ${primaryHost} weight=${stage.primaryWeight} max_fails=3 fail_timeout=10s;

    # Canary Candidate (${opts.candidateSlot.toUpperCase()}): ${stage.canaryWeight}% weight
    server ${candidateHost} weight=${stage.canaryWeight} max_fails=3 fail_timeout=10s;`;
  }

  return `# ==============================================================================
# Framique Weighted Canary Upstream Dynamic Routing Configuration
# Stage: ${stage.name}
# Candidate: ${opts.candidateSlot.toUpperCase()} (${stage.canaryWeight}%) | Primary: ${opts.primarySlot.toUpperCase()} (${stage.primaryWeight}%)
# Generated At: ${new Date().toISOString()}
# ==============================================================================

upstream framique_canary_backend {
${upstreamServers}

    # Persistent Connection Pool across weighted transitions
    keepalive ${keepalive};
}
`;
}

/**
 * Write generated canary upstream template to disk.
 */
export function writeCanaryConfigFile(
  filePath: string = resolve(process.cwd(), "ops/routing/canary-weights.conf"),
  content?: string,
  opts?: GenerateCanaryConfigOptions,
): boolean {
  try {
    const finalContent =
      content ??
      generateCanaryNginxUpstream(
        opts ?? {
          stageId: 0,
          candidateSlot: "green",
          primarySlot: "blue",
        },
      );

    const dir = resolve(filePath, "..");
    if (existsSync(dir)) {
      writeFileSync(filePath, finalContent, "utf8");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Set and transition to a specific canary stage.
 */
export async function setCanaryStage(
  targetStage: CanaryStageId,
  options: {
    candidateSlot?: TopologySlot;
    primarySlot?: TopologySlot;
    configPath?: string;
  } = {},
): Promise<{ success: boolean; state: CanaryState; config: string }> {
  const current = await getCanaryState();
  const candidateSlot = options.candidateSlot ?? current.candidateSlot;
  const primarySlot = options.primarySlot ?? current.primarySlot;
  const stageDef = CANARY_STAGES[targetStage];

  const now = new Date();
  const soakExpiresAt = new Date(now.getTime() + stageDef.soakDurationMs);

  const newState: CanaryState = {
    active: targetStage > 0 && targetStage < 4,
    stage: targetStage,
    candidateSlot,
    primarySlot,
    startedAt: current.active ? current.startedAt : now.toISOString(),
    stageStartedAt: now.toISOString(),
    soakExpiresAt: soakExpiresAt.toISOString(),
    soakRemainingMs: stageDef.soakDurationMs,
    isSoakComplete: stageDef.soakDurationMs === 0,
    status:
      targetStage === 0
        ? "idle"
        : targetStage === 4
          ? "promoted"
          : "soaking",
    updatedAt: now.toISOString(),
  };

  const config = generateCanaryNginxUpstream({
    stageId: targetStage,
    candidateSlot,
    primarySlot,
  });

  const outPath = options.configPath || resolve(process.cwd(), "ops/routing/canary-weights.conf");
  writeCanaryConfigFile(outPath, config);

  await saveCanaryState(newState);

  incr("framique_canary_shift_total", {
    stage: String(targetStage),
    candidate: candidateSlot,
    primary: primarySlot,
  });

  log("info", "canary.stage_shifted", {
    stage: targetStage,
    stageName: stageDef.name,
    canaryWeight: stageDef.canaryWeight,
    candidateSlot,
    soakDurationMs: stageDef.soakDurationMs,
  });

  return { success: true, state: newState, config };
}

/**
 * Abort active canary instantly and revert 100% traffic to primary slot.
 */
export async function abortCanary(options: { configPath?: string } = {}): Promise<{
  success: boolean;
  state: CanaryState;
}> {
  const current = await getCanaryState();
  const now = new Date();

  const abortedState: CanaryState = {
    ...current,
    active: false,
    stage: 0,
    status: "aborted",
    soakRemainingMs: 0,
    isSoakComplete: true,
    updatedAt: now.toISOString(),
  };

  const config = generateCanaryNginxUpstream({
    stageId: 0,
    candidateSlot: current.candidateSlot,
    primarySlot: current.primarySlot,
  });

  const outPath = options.configPath || resolve(process.cwd(), "ops/routing/canary-weights.conf");
  writeCanaryConfigFile(outPath, config);

  await saveCanaryState(abortedState);

  incr("framique_canary_aborted_total", {
    fromStage: String(current.stage),
    primarySlot: current.primarySlot,
  });

  log("warn", "canary.aborted", {
    previousStage: current.stage,
    revertedTo: current.primarySlot,
  });

  return { success: true, state: abortedState };
}

/**
 * Deterministic traffic split simulation helper.
 * Uses pseudo-random or hash distribution to verify mathematical weight compliance.
 */
export function simulateTrafficSplit(
  totalRequests: number,
  canaryWeightPercentage: number,
  seedFn: (i: number) => number = () => Math.random() * 100,
): { canaryCount: number; primaryCount: number; observedPercentage: number } {
  let canaryCount = 0;
  let primaryCount = 0;

  for (let i = 0; i < totalRequests; i++) {
    const roll = seedFn(i);
    if (roll < canaryWeightPercentage) {
      canaryCount++;
    } else {
      primaryCount++;
    }
  }

  const observedPercentage = (canaryCount / totalRequests) * 100;
  return { canaryCount, primaryCount, observedPercentage };
}
