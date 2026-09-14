import { describe, expect, it, vi, beforeEach } from "vitest";
import { checkHealth, checkMemoryHealth } from "./healthz.server";

describe("Phase 6.2 — /api/healthz Readiness & Liveness Probes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("liveness probe returns HTTP 200 without probing dependencies", async () => {
    const { statusCode, result } = await checkHealth("liveness");
    expect(statusCode).toBe(200);
    expect(result.status).toBe("healthy");
    expect(result.checks.database.status).toBe("skipped");
    expect(result.checks.redis.status).toBe("skipped");
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(result.checks.memory.status).toBe("ok");
  });

  it("readiness probe evaluates memory, database, and redis dependencies", async () => {
    const { statusCode, result } = await checkHealth("readiness");
    expect([200, 503]).toContain(statusCode);
    expect(result.checks.database).toBeDefined();
    expect(result.checks.redis).toBeDefined();
    expect(result.checks.memory).toBeDefined();
    expect(result.timestamp).toBeDefined();
  });

  it("checkMemoryHealth correctly reports memory stats in MB", () => {
    const mem = checkMemoryHealth();
    expect(mem.heapUsedMb).toBeGreaterThan(0);
    expect(mem.heapTotalMb).toBeGreaterThan(0);
    expect(mem.rssMb).toBeGreaterThan(0);
    expect(["ok", "warning", "critical"]).toContain(mem.status);
  });
});
