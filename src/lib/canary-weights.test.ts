import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  CANARY_STAGES,
  abortCanary,
  generateCanaryNginxUpstream,
  getCanaryState,
  setCanaryStage,
  simulateTrafficSplit,
  writeCanaryConfigFile,
} from "./canary-weights.server";

describe("Phase 7.1 — Weighted Canary Traffic Shifting (1% → 5% → 25% → 100%)", () => {
  const canaryConfPath = resolve(process.cwd(), "ops/routing/canary-weights.conf");

  it("canary stages define explicit weights, soak durations, and verification gates", () => {
    // Stage 1 (1%): 10m soak
    const s1 = CANARY_STAGES[1];
    expect(s1.canaryWeight).toBe(1);
    expect(s1.primaryWeight).toBe(99);
    expect(s1.soakDurationMs).toBe(10 * 60 * 1000);
    expect(s1.verificationCriteria.some((c) => c.includes("5xx"))).toBe(true);

    // Stage 2 (5%): 15m soak
    const s2 = CANARY_STAGES[2];
    expect(s2.canaryWeight).toBe(5);
    expect(s2.primaryWeight).toBe(95);
    expect(s2.soakDurationMs).toBe(15 * 60 * 1000);
    expect(s2.verificationCriteria.some((c) => c.includes("Checkout"))).toBe(true);

    // Stage 3 (25%): 30m soak
    const s3 = CANARY_STAGES[3];
    expect(s3.canaryWeight).toBe(25);
    expect(s3.primaryWeight).toBe(75);
    expect(s3.soakDurationMs).toBe(30 * 60 * 1000);
    expect(s3.verificationCriteria.some((c) => c.includes("connection pool"))).toBe(true);

    // Stage 4 (100%): 60m warm standby retention
    const s4 = CANARY_STAGES[4];
    expect(s4.canaryWeight).toBe(100);
    expect(s4.primaryWeight).toBe(0);
    expect(s4.soakDurationMs).toBe(60 * 60 * 1000);
  });

  it("generates correct NGINX upstream template for Stage 1 (1% Canary)", () => {
    const config = generateCanaryNginxUpstream({
      stageId: 1,
      candidateSlot: "green",
      primarySlot: "blue",
    });

    expect(config).toContain("upstream framique_canary_backend {");
    expect(config).toContain("server framique-blue:3000 weight=99");
    expect(config).toContain("server framique-green:3000 weight=1");
    expect(config).toContain("keepalive 64;");
  });

  it("generates correct NGINX upstream template for Stage 2 (5% Canary)", () => {
    const config = generateCanaryNginxUpstream({
      stageId: 2,
      candidateSlot: "green",
      primarySlot: "blue",
    });

    expect(config).toContain("server framique-blue:3000 weight=95");
    expect(config).toContain("server framique-green:3000 weight=5");
  });

  it("generates correct NGINX upstream template for Stage 3 (25% Canary)", () => {
    const config = generateCanaryNginxUpstream({
      stageId: 3,
      candidateSlot: "green",
      primarySlot: "blue",
    });

    expect(config).toContain("server framique-blue:3000 weight=75");
    expect(config).toContain("server framique-green:3000 weight=25");
  });

  it("generates correct NGINX upstream template for Stage 4 (100% Promotion with warm standby)", () => {
    const config = generateCanaryNginxUpstream({
      stageId: 4,
      candidateSlot: "green",
      primarySlot: "blue",
    });

    expect(config).toContain("server framique-green:3000 max_fails=3 fail_timeout=10s;");
    expect(config).toContain("server framique-blue:3000 backup;");
    expect(config).toContain("keepalive 64;");
  });

  it("persists and advances canary rollout states cleanly", async () => {
    // Shift to Stage 1
    const shift1 = await setCanaryStage(1, { candidateSlot: "green", primarySlot: "blue" });
    expect(shift1.success).toBe(true);
    expect(shift1.state.active).toBe(true);
    expect(shift1.state.stage).toBe(1);
    expect(shift1.state.candidateSlot).toBe("green");
    expect(shift1.state.status).toBe("soaking");

    // Read back state
    const state = await getCanaryState();
    expect(state.stage).toBe(1);
    expect(state.candidateSlot).toBe("green");

    // Shift to Stage 2
    const shift2 = await setCanaryStage(2);
    expect(shift2.state.stage).toBe(2);

    // Emergency Abort
    const abortResult = await abortCanary();
    expect(abortResult.success).toBe(true);
    expect(abortResult.state.active).toBe(false);
    expect(abortResult.state.stage).toBe(0);
    expect(abortResult.state.status).toBe("aborted");
  });

  it("ops/routing/canary-weights.conf file exists and contains valid NGINX configuration", () => {
    writeCanaryConfigFile(canaryConfPath);
    expect(existsSync(canaryConfPath)).toBe(true);
    const content = readFileSync(canaryConfPath, "utf8");
    expect(content).toContain("upstream framique_canary_backend {");
    expect(content).toContain("keepalive 64;");
  });

  it("traffic split simulator satisfies mathematical probability distribution within bounds", () => {
    // 10,000 requests at 1%
    const split1 = simulateTrafficSplit(10000, 1);
    expect(split1.observedPercentage).toBeGreaterThanOrEqual(0.6);
    expect(split1.observedPercentage).toBeLessThanOrEqual(1.5);

    // 10,000 requests at 5%
    const split5 = simulateTrafficSplit(10000, 5);
    expect(split5.observedPercentage).toBeGreaterThanOrEqual(4.0);
    expect(split5.observedPercentage).toBeLessThanOrEqual(6.2);

    // 10,000 requests at 25%
    const split25 = simulateTrafficSplit(10000, 25);
    expect(split25.observedPercentage).toBeGreaterThanOrEqual(23.0);
    expect(split25.observedPercentage).toBeLessThanOrEqual(27.0);
  });
});
