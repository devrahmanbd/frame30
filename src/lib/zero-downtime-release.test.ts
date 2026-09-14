import { describe, expect, it } from "vitest";
import { executeZeroDowntimeRelease } from "../../scripts/zero-downtime-release";

describe("Phase 11.1 — Enterprise Zero-Downtime Release Orchestrator", () => {
  it("executes the full Canary Blue/Green release sequence in dry-run mode", async () => {
    const result = await executeZeroDowntimeRelease({
      gitSha: "testsha123",
      greenUrl: "http://127.0.0.1:3000",
      dryRun: true,
      skipWarmup: true,
    });

    expect(result.success).toBe(true);
    expect(result.currentStep).toBe("RETAIN_BLUE_STANDBY");
    expect(result.snapshotTag).toContain("snap_pre_deploy_testsha123");
  });

  it("creates a valid snapshot tag and honors the rollback safety standby", async () => {
    const result = await executeZeroDowntimeRelease({
      gitSha: "release99",
      greenUrl: "http://green-pod:3000",
      dryRun: true,
      skipWarmup: true,
    });

    expect(result.success).toBe(true);
    expect(result.snapshotTag).toMatch(/^snap_pre_deploy_release99_\d+$/);
  });
});
